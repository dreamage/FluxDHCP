// ===== PRAGMA 设置 =====
export const PRAGMA_STATEMENTS = [
  'journal_mode=WAL',
  'synchronous=NORMAL',
  'foreign_keys=ON',
];

// ===== 建表语句 =====

export const CREATE_TABLE_POOLS = `
CREATE TABLE IF NOT EXISTS pools (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT    NOT NULL,
  subnet      TEXT    NOT NULL,
  netmask     TEXT    NOT NULL,
  start_ip    TEXT    NOT NULL,
  end_ip      TEXT    NOT NULL,
  gateway     TEXT,
  dns_servers TEXT,
  lease_time  INTEGER DEFAULT 86400,
  enabled     INTEGER DEFAULT 1,
  created_at  TEXT    DEFAULT (datetime('now')),
  updated_at  TEXT    DEFAULT (datetime('now'))
)`;

export const CREATE_TABLE_RESERVATIONS = `
CREATE TABLE IF NOT EXISTS reservations (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  mac_address TEXT    NOT NULL UNIQUE,
  ip_address  TEXT    NOT NULL UNIQUE,
  hostname    TEXT,
  pool_id     INTEGER REFERENCES pools(id),
  description TEXT,
  enabled     INTEGER DEFAULT 1,
  created_at  TEXT    DEFAULT (datetime('now')),
  updated_at  TEXT    DEFAULT (datetime('now'))
)`;

export const CREATE_TABLE_DEVICE_OPTIONS = `
CREATE TABLE IF NOT EXISTS device_options (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  mac_address  TEXT    NOT NULL,
  option_code  INTEGER NOT NULL,
  option_value TEXT    NOT NULL,
  option_name  TEXT,
  created_at   TEXT    DEFAULT (datetime('now')),
  UNIQUE(mac_address, option_code)
)`;

export const CREATE_TABLE_LEASES = `
CREATE TABLE IF NOT EXISTS leases (
  ip_address   TEXT PRIMARY KEY,
  mac_address  TEXT NOT NULL,
  hostname     TEXT,
  state        TEXT NOT NULL DEFAULT 'OFFERED',
  pool_id      INTEGER REFERENCES pools(id),
  lease_start  TEXT,
  lease_end    TEXT,
  client_id    TEXT,
  vendor_class TEXT,
  requested_ip TEXT,
  xid          TEXT
)`;

export const CREATE_TABLE_DHCP_LOGS = `
CREATE TABLE IF NOT EXISTS dhcp_logs (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  timestamp       TEXT    DEFAULT (datetime('now')),
  message_type    INTEGER NOT NULL,
  client_mac      TEXT    NOT NULL,
  client_ip       TEXT,
  yiaddr          TEXT,
  siaddr          TEXT,
  giaddr          TEXT,
  requested_ip    TEXT,
  hostname        TEXT,
  client_id       TEXT,
  vendor_class    TEXT,
  xid             TEXT,
  raw_options     TEXT,
  pool_id         INTEGER,
  server_response TEXT,
  direction       TEXT    DEFAULT 'recv'
)`;

export const CREATE_TABLE_CONFIG = `
CREATE TABLE IF NOT EXISTS config (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL,
  updated_at TEXT DEFAULT (datetime('now'))
)`;

export const CREATE_TABLE_WEBHOOKS = `
CREATE TABLE IF NOT EXISTS webhooks (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT    NOT NULL,
  url         TEXT    NOT NULL,
  method      TEXT    NOT NULL DEFAULT 'POST',
  events      TEXT    NOT NULL DEFAULT '[]',
  fields      TEXT    NOT NULL DEFAULT '[]',
  body_mode   TEXT    DEFAULT 'json',
  headers     TEXT    DEFAULT '{}',
  secret      TEXT,
  enabled     INTEGER DEFAULT 1,
  created_at  TEXT    DEFAULT (datetime('now')),
  updated_at  TEXT    DEFAULT (datetime('now'))
)`;

export const CREATE_TABLE_MAC_NOTES = `
CREATE TABLE IF NOT EXISTS mac_notes (
  mac_address TEXT PRIMARY KEY,
  note        TEXT NOT NULL,
  created_at  TEXT DEFAULT (datetime('now')),
  updated_at  TEXT DEFAULT (datetime('now'))
)`;

export const CREATE_TABLE_MAC_BLACKLIST = `
CREATE TABLE IF NOT EXISTS mac_blacklist (
  mac_address TEXT PRIMARY KEY,
  reason      TEXT DEFAULT '',
  enabled     INTEGER DEFAULT 1,
  created_at  TEXT DEFAULT (datetime('now')),
  updated_at  TEXT DEFAULT (datetime('now'))
)`;

export const CREATE_TABLE_DECLINED_IPS = `
CREATE TABLE IF NOT EXISTS declined_ips (
  ip_address  TEXT PRIMARY KEY,
  mac_address TEXT NOT NULL,
  declined_at TEXT DEFAULT (datetime('now')),
  expires_at  TEXT NOT NULL
)`;

export const CREATE_TABLE_WEBHOOK_DELIVERIES = `
CREATE TABLE IF NOT EXISTS webhook_deliveries (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  webhook_id  INTEGER NOT NULL,
  webhook_name TEXT NOT NULL,
  event_type  TEXT NOT NULL,
  url         TEXT NOT NULL,
  method      TEXT NOT NULL,
  request_body TEXT,
  status      TEXT NOT NULL DEFAULT 'pending',
  http_status INTEGER,
  response    TEXT,
  error       TEXT,
  attempt     INTEGER DEFAULT 1,
  max_attempts INTEGER DEFAULT 3,
  created_at  TEXT DEFAULT (datetime('now')),
  completed_at TEXT
)`;

// ===== 索引语句 =====

export const CREATE_INDEXES: string[] = [
  'CREATE INDEX IF NOT EXISTS idx_reservations_mac ON reservations(mac_address)',
  'CREATE INDEX IF NOT EXISTS idx_reservations_ip ON reservations(ip_address)',
  'CREATE INDEX IF NOT EXISTS idx_reservations_pool ON reservations(pool_id)',
  'CREATE INDEX IF NOT EXISTS idx_device_options_mac ON device_options(mac_address)',
  'CREATE INDEX IF NOT EXISTS idx_leases_mac ON leases(mac_address)',
  'CREATE INDEX IF NOT EXISTS idx_leases_state ON leases(state)',
  'CREATE INDEX IF NOT EXISTS idx_leases_end ON leases(lease_end)',
  'CREATE INDEX IF NOT EXISTS idx_leases_pool ON leases(pool_id)',
  'CREATE INDEX IF NOT EXISTS idx_dhcp_logs_timestamp ON dhcp_logs(timestamp)',
  'CREATE INDEX IF NOT EXISTS idx_dhcp_logs_mac ON dhcp_logs(client_mac)',
  'CREATE INDEX IF NOT EXISTS idx_dhcp_logs_type ON dhcp_logs(message_type)',
  'CREATE INDEX IF NOT EXISTS idx_declined_expires ON declined_ips(expires_at)',
  'CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_webhook ON webhook_deliveries(webhook_id)',
  'CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_status ON webhook_deliveries(status)',
  'CREATE INDEX IF NOT EXISTS idx_mac_blacklist_enabled ON mac_blacklist(enabled)',
  'CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_created ON webhook_deliveries(created_at)',
];

// ===== 初始配置数据 =====

export const SEED_CONFIG = `
INSERT OR IGNORE INTO config (key, value) VALUES
  ('server_ip', '0.0.0.0'),
  ('listen_interface', '0.0.0.0'),
  ('default_lease_time', '86400'),
  ('t1_ratio', '0.5'),
  ('t2_ratio', '0.875'),
  ('dhcp_enabled', '1'),
  ('web_port', '3000'),
  ('dhcp_log_retention_days', '90'),
  ('decline_blacklist_duration', '3600'),
  ('webhook_timeout', '10'),
  ('ip_allocation_order', 'sequential'),
  ('honor_requested_ip', '1')
`;
