-- One row per browser that asked for notifications.
CREATE TABLE IF NOT EXISTS devices (
  id         TEXT PRIMARY KEY,
  secret     TEXT NOT NULL,
  endpoint   TEXT NOT NULL,
  p256dh     TEXT NOT NULL,
  auth       TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

-- When that device wants waking. No titles, no module names, no content:
-- `tag` is only there so a client can recognise its own rows.
CREATE TABLE IF NOT EXISTS wakes (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  device_id TEXT NOT NULL REFERENCES devices(id),
  fire_at   INTEGER NOT NULL,
  tag       TEXT
);

CREATE INDEX IF NOT EXISTS wakes_due ON wakes (fire_at);
CREATE INDEX IF NOT EXISTS wakes_device ON wakes (device_id);
