-- One row per browser that asked for notifications.
CREATE TABLE IF NOT EXISTS devices (
  id         TEXT PRIMARY KEY,
  secret     TEXT NOT NULL,
  endpoint   TEXT NOT NULL,
  p256dh     TEXT NOT NULL,
  auth       TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

-- When that device wants waking. A device and a time, and that is the whole
-- row: no titles, no module names, no record ids, nothing to correlate.
CREATE TABLE IF NOT EXISTS wakes (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  device_id TEXT NOT NULL REFERENCES devices(id),
  fire_at   INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS wakes_due ON wakes (fire_at);
CREATE INDEX IF NOT EXISTS wakes_device ON wakes (device_id);
