import { Router } from "express";
import { verifyToken } from "../auth.js";
import { many, one, run } from "../db.js";
import { requireAuth } from "../middleware.js";
import { attachDashboardStream, broadcastDashboardUpdate, detachDashboardStream } from "../realtime.js";
import { recordRuntimeError } from "../runtime-status.js";
import { notifyCoffeeConsumed } from "../services/mailer.js";

export const coffeeRouter = Router();
coffeeRouter.use((req, res, next) => {
  if (req.path === "/stream") return next();
  return requireAuth(req, res, next);
});

async function resolveStreamUser(req) {
  const fromQuery = String(req.query?.token || "").trim();
  const rawAuth = String(req.headers.authorization || "");
  const fromHeader = rawAuth.startsWith("Bearer ") ? rawAuth.slice(7).trim() : "";
  const token = fromQuery || fromHeader;
  if (!token) return null;
  const payload = verifyToken(token);
  const user = await one(
    "SELECT id, email, name, role, avatar_url, active, notify_enabled FROM users WHERE id = ?",
    payload.sub,
  );
  if (!user || !user.active) return null;
  return user;
}

coffeeRouter.get("/stream", async (req, res) => {
  try {
    const user = await resolveStreamUser(req);
    if (!user) return res.status(401).json({ error: "Unauthorized" });

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders?.();

    attachDashboardStream(res);
    const keepAlive = setInterval(() => {
      try {
        res.write(`event: ping\ndata: {"ts":${Date.now()}}\n\n`);
      } catch {
        clearInterval(keepAlive);
        detachDashboardStream(res);
      }
    }, 25000);

    req.on("close", () => {
      clearInterval(keepAlive);
      detachDashboardStream(res);
    });
  } catch (err) {
    recordRuntimeError("coffee.stream", err);
    return res.status(401).json({ error: "Unauthorized" });
  }
});

coffeeRouter.get("/status", async (req, res) => {
  try {
    const stock = await one("SELECT initial_stock, current_stock, min_stock, updated_at FROM stock_settings WHERE id = 1");
    const consumed = await one("SELECT COALESCE(SUM(delta), 0) AS consumed_total FROM coffee_logs");
    const consumedTotal = Number(consumed?.consumed_total || 0);
    const expectedCurrent = Number(stock?.initial_stock || 0) - consumedTotal;
    const manualDelta = Number(stock?.current_stock || 0) - expectedCurrent;
    const low = Number(stock?.current_stock || 0) <= Number(stock?.min_stock || 0);

    return res.json({
      stock: {
        ...stock,
        low,
        consumed_total: consumedTotal,
        expected_current: expectedCurrent,
        manual_delta: manualDelta,
      },
      user: req.user,
    });
  } catch (err) {
    recordRuntimeError("coffee.status", err);
    console.error("[coffee/status]", err?.message || err);
    return res.status(500).json({ error: "Failed to load status" });
  }
});

coffeeRouter.post("/consume", async (req, res) => {
  try {
    const me = await one("SELECT id, max_coffees FROM users WHERE id = ?", req.user.id);
    const consumedRow = await one("SELECT COALESCE(SUM(delta), 0) AS consumed_count FROM coffee_logs WHERE user_id = ?", req.user.id);
    const consumedCount = Number(consumedRow?.consumed_count || 0);
    const maxAllowed = me?.max_coffees == null ? null : Number(me.max_coffees);
    if (Number.isInteger(maxAllowed) && maxAllowed >= 0 && consumedCount >= maxAllowed) {
      return res.status(409).json({ error: "Ai atins limita maximă de cafele" });
    }

    const stock = await one("SELECT current_stock FROM stock_settings WHERE id = 1");
    if (!stock || Number(stock.current_stock) <= 0) return res.status(409).json({ error: "Stock epuizat" });

    await run(
      "UPDATE stock_settings SET current_stock = current_stock - 1, updated_by = ?, updated_at = CURRENT_TIMESTAMP WHERE id = 1 AND current_stock > 0",
      req.user.id,
    );

    const next = await one("SELECT initial_stock, current_stock, min_stock, updated_at FROM stock_settings WHERE id = 1");
    if (!next || Number(next.current_stock) >= Number(stock.current_stock)) {
      return res.status(409).json({ error: "Stock epuizat" });
    }

    await run("INSERT INTO coffee_logs(user_id, delta) VALUES(?, 1)", req.user.id);

    const consumedAfterRow = await one("SELECT COALESCE(SUM(delta), 0) AS consumed_count FROM coffee_logs WHERE user_id = ?", req.user.id);
    const consumedAfter = Number(consumedAfterRow?.consumed_count || 0);
    const consumedTotalRow = await one("SELECT COALESCE(SUM(delta), 0) AS consumed_total FROM coffee_logs");
    const consumedTotal = Number(consumedTotalRow?.consumed_total || 0);
    const expectedCurrent = Number(next.initial_stock || 0) - consumedTotal;
    const manualDelta = Number(next.current_stock || 0) - expectedCurrent;
    const actorRemaining = me?.max_coffees == null ? null : Math.max(0, Number(me.max_coffees) - consumedAfter);

    const recipients = await many("SELECT email, name, notify_enabled FROM users WHERE active = TRUE");
    notifyCoffeeConsumed({
      actorName: req.user.name,
      actorEmail: req.user.email,
      actorAvatarUrl: req.user.avatar_url,
      recipients,
      stockCurrent: next.current_stock,
      stockInitial: next.initial_stock,
      stockMin: next.min_stock,
      stockExpectedCurrent: expectedCurrent,
      stockManualDelta: manualDelta,
      actorConsumedCount: consumedAfter,
      actorRemaining,
      consumedAt: next.updated_at,
    }).catch((err) => {
      recordRuntimeError("mail.consume_notification", err);
      console.error("[mail] consume notification failed:", err?.message || err);
    });
    broadcastDashboardUpdate("coffee.consume", { actor_id: req.user.id });

    return res.json({ ok: true, stock: { ...next, low: Number(next.current_stock) <= Number(next.min_stock) } });
  } catch (err) {
    recordRuntimeError("coffee.consume", err);
    console.error("[coffee/consume]", err?.message || err);
    return res.status(500).json({ error: "Failed to consume coffee" });
  }
});

coffeeRouter.get("/history", async (req, res) => {
  try {
    const mine = String(req.query.mine || "1") !== "0";
    const limit = Math.min(500, Math.max(1, Number(req.query.limit || 100)));

    let rows;
    if (mine) {
      rows = await many(
        `SELECT l.id, l.delta, l.consumed_at, u.id as user_id, u.name, u.email, u.avatar_url
         FROM coffee_logs l JOIN users u ON u.id = l.user_id
         WHERE l.user_id = ? ORDER BY l.consumed_at DESC, l.id DESC LIMIT ?`,
        req.user.id,
        limit,
      );
    } else {
      rows = await many(
        `SELECT l.id, l.delta, l.consumed_at, u.id as user_id, u.name, u.email, u.avatar_url
         FROM coffee_logs l JOIN users u ON u.id = l.user_id
         ORDER BY l.consumed_at DESC, l.id DESC LIMIT ?`,
        limit,
      );
    }

    return res.json({ rows });
  } catch (err) {
    recordRuntimeError("coffee.history", err);
    console.error("[coffee/history]", err?.message || err);
    return res.status(500).json({ error: "Failed to load history" });
  }
});

coffeeRouter.get("/snapshot", async (req, res) => {
  try {
    const isAdmin = req.user.role === "admin";
    const limit = Math.min(500, Math.max(1, Number(req.query.limit || 100)));
    const selectedRequested = req.query.selected_user_id == null ? null : Number(req.query.selected_user_id);

    const stock = await one("SELECT initial_stock, current_stock, min_stock, updated_at FROM stock_settings WHERE id = 1");
    const consumed = await one("SELECT COALESCE(SUM(delta), 0) AS consumed_total FROM coffee_logs");
    const consumedTotal = Number(consumed?.consumed_total || 0);
    const expectedCurrent = Number(stock?.initial_stock || 0) - consumedTotal;
    const manualDelta = Number(stock?.current_stock || 0) - expectedCurrent;
    const low = Number(stock?.current_stock || 0) <= Number(stock?.min_stock || 0);

    const rows = await many(
      `SELECT l.id, l.delta, l.consumed_at, u.id as user_id, u.name, u.email, u.avatar_url
       FROM coffee_logs l JOIN users u ON u.id = l.user_id
       ORDER BY l.consumed_at DESC, l.id DESC LIMIT ?`,
      limit,
    );

    let users = [];
    let selectedUserId = null;
    let selectedUserStats = null;
    let selectedUserHistory = [];
    let userConsumption = {};

    if (isAdmin) {
      users = await many("SELECT id, email, name, role, avatar_url, active, max_coffees, notify_enabled, created_at FROM users ORDER BY created_at DESC");
      const aggregate = await many(
        `SELECT u.id AS user_id, COALESCE(SUM(l.delta),0) AS consumed_count
         FROM users u
         LEFT JOIN coffee_logs l ON l.user_id = u.id
         GROUP BY u.id`,
      );

      const usersById = new Map(users.map((u) => [Number(u.id), u]));
      userConsumption = Object.fromEntries(
        aggregate.map((a) => {
          const user = usersById.get(Number(a.user_id));
          const consumedCount = Number(a?.consumed_count || 0);
          const maxCoffees = user?.max_coffees == null ? null : Number(user.max_coffees);
          const remaining = maxCoffees == null ? null : Math.max(0, maxCoffees - consumedCount);
          return [String(a.user_id), { consumed_count: consumedCount, remaining }];
        }),
      );

      const selectedExists = Number.isInteger(selectedRequested) && users.some((u) => Number(u.id) === Number(selectedRequested));
      selectedUserId = selectedExists ? Number(selectedRequested) : users[0] ? Number(users[0].id) : null;

      if (selectedUserId != null) {
        const user = await one(
          "SELECT id, email, name, role, avatar_url, active, max_coffees, notify_enabled, created_at FROM users WHERE id = ?",
          selectedUserId,
        );
        if (user) {
          const agg = await one(
            "SELECT COALESCE(SUM(delta),0) AS consumed_count, MAX(consumed_at) AS last_consumed_at FROM coffee_logs WHERE user_id = ?",
            selectedUserId,
          );
          const consumedCount = Number(agg?.consumed_count || 0);
          const maxCoffees = user.max_coffees == null ? null : Number(user.max_coffees);
          const remaining = maxCoffees == null ? null : Math.max(0, maxCoffees - consumedCount);
          selectedUserStats = {
            consumed_count: consumedCount,
            max_coffees: maxCoffees,
            remaining,
            last_consumed_at: agg?.last_consumed_at || null,
          };
          selectedUserHistory = await many(
            "SELECT id, user_id, delta, consumed_at FROM coffee_logs WHERE user_id = ? ORDER BY consumed_at DESC, id DESC LIMIT 200",
            selectedUserId,
          );
        }
      }
    } else {
      users = await many(
        "SELECT id, email, name, role, avatar_url, active, max_coffees, notify_enabled, created_at FROM users WHERE active = TRUE ORDER BY name ASC, created_at DESC",
      );
    }

    return res.json({
      stock: {
        ...stock,
        low,
        consumed_total: consumedTotal,
        expected_current: expectedCurrent,
        manual_delta: manualDelta,
      },
      user: req.user,
      rows,
      users,
      user_consumption: userConsumption,
      selected_user_id: selectedUserId,
      selected_user_stats: selectedUserStats,
      selected_user_history: selectedUserHistory,
    });
  } catch (err) {
    recordRuntimeError("coffee.snapshot", err);
    console.error("[coffee/snapshot]", err?.message || err);
    return res.status(500).json({ error: "Failed to load snapshot" });
  }
});
