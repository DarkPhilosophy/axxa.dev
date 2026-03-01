const dashboardClients = new Set();

function writeEvent(res, event, payload) {
  const body = JSON.stringify(payload || {});
  res.write(`event: ${event}\n`);
  res.write(`data: ${body}\n\n`);
}

export function attachDashboardStream(res) {
  dashboardClients.add(res);
  writeEvent(res, 'connected', { ok: true, ts: Date.now() });
}

export function detachDashboardStream(res) {
  dashboardClients.delete(res);
}

export function broadcastDashboardUpdate(reason = 'update', payload = {}) {
  const message = { reason, ts: Date.now(), ...payload };
  for (const res of [...dashboardClients]) {
    try {
      writeEvent(res, 'dashboard', message);
    } catch {
      dashboardClients.delete(res);
    }
  }
}
