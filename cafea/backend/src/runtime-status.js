const startedAt = Date.now();
const lastErrors = [];
const MAX_ERRORS = 20;

export function recordRuntimeError(area, error, extra = {}) {
  const message = error?.message ? String(error.message) : String(error || "unknown_error");
  const entry = {
    at: new Date().toISOString(),
    area: String(area || "unknown"),
    message,
    extra
  };
  lastErrors.push(entry);
  if (lastErrors.length > MAX_ERRORS) {
    lastErrors.splice(0, lastErrors.length - MAX_ERRORS);
  }
}

export function getRuntimeStatus() {
  const uptimeSec = Math.floor(process.uptime());
  return {
    started_at: new Date(startedAt).toISOString(),
    now_utc: new Date().toISOString(),
    uptime_sec: uptimeSec,
    uptime_human: `${Math.floor(uptimeSec / 3600)}h ${Math.floor((uptimeSec % 3600) / 60)}m ${uptimeSec % 60}s`,
    node_version: process.version,
    pid: process.pid,
    memory: process.memoryUsage(),
    last_error: lastErrors[lastErrors.length - 1] || null,
    recent_errors: lastErrors.slice(-5)
  };
}
