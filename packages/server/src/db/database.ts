import { createClient, type Client } from '@libsql/client'
import path from 'path'
import fs from 'fs'

let client: Client

export function getDb(): Client {
  if (!client) throw new Error('Database not initialized. Call initDatabase() first.')
  return client
}

export async function initDatabase(): Promise<void> {
  const dbPath = process.env.DB_PATH || path.join(process.cwd(), 'data', 'airemote.db')
  const dbDir  = path.dirname(dbPath)
  if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true })
  client = createClient({ url: `file:${dbPath}` })
  await runMigrations(client)
  console.log(`✅ Database initialized at ${dbPath}`)
}

async function runMigrations(db: Client): Promise<void> {
  // ── Core tables ──────────────────────────────────────────────────────────────
  await db.executeMultiple(`
    CREATE TABLE IF NOT EXISTS users (
      id            TEXT PRIMARY KEY,
      email         TEXT UNIQUE NOT NULL,
      name          TEXT NOT NULL,
      role          TEXT NOT NULL DEFAULT 'viewer',
      password_hash TEXT NOT NULL,
      totp_secret   TEXT,
      totp_enabled  INTEGER NOT NULL DEFAULT 0,
      created_at    TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS devices (
      id              TEXT PRIMARY KEY,
      name            TEXT NOT NULL,
      token           TEXT UNIQUE NOT NULL,
      owner_id        TEXT NOT NULL,
      info            TEXT,
      status          TEXT NOT NULL DEFAULT 'offline',
      tunnel_layer    TEXT,
      tunnel_address  TEXT,
      tags            TEXT NOT NULL DEFAULT '[]',
      last_seen       TEXT,
      created_at      TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at      TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (owner_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS sessions (
      id           TEXT PRIMARY KEY,
      device_id    TEXT NOT NULL,
      user_id      TEXT NOT NULL,
      type         TEXT NOT NULL,
      started_at   TEXT NOT NULL DEFAULT (datetime('now')),
      ended_at     TEXT,
      duration_sec INTEGER,
      ip_address   TEXT,
      FOREIGN KEY (device_id) REFERENCES devices(id),
      FOREIGN KEY (user_id)   REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS refresh_tokens (
      id          TEXT PRIMARY KEY,
      user_id     TEXT NOT NULL,
      token_hash  TEXT UNIQUE NOT NULL,
      expires_at  TEXT NOT NULL,
      created_at  TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS ai_conversations (
      id         TEXT PRIMARY KEY,
      device_id  TEXT NOT NULL,
      user_id    TEXT NOT NULL,
      messages   TEXT NOT NULL DEFAULT '[]',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS settings (
      key        TEXT PRIMARY KEY,
      value      TEXT NOT NULL DEFAULT '{}',
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- ── Phase 2: Historical stats ──────────────────────────────────────────────
    CREATE TABLE IF NOT EXISTS device_stats_history (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      device_id     TEXT NOT NULL,
      cpu_percent   INTEGER NOT NULL DEFAULT 0,
      ram_percent   INTEGER NOT NULL DEFAULT 0,
      disk_percent  INTEGER NOT NULL DEFAULT 0,
      net_up_kbps   INTEGER NOT NULL DEFAULT 0,
      net_down_kbps INTEGER NOT NULL DEFAULT 0,
      uptime_sec    INTEGER NOT NULL DEFAULT 0,
      recorded_at   TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- ── Phase 2: Audit log ────────────────────────────────────────────────────
    CREATE TABLE IF NOT EXISTS audit_log (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id     TEXT NOT NULL,
      user_email  TEXT NOT NULL,
      device_id   TEXT,
      action      TEXT NOT NULL,
      details     TEXT,
      ip_address  TEXT,
      status_code INTEGER,
      created_at  TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- ── Phase 3: Alerts & Notifications ──────────────────────────────────────
    CREATE TABLE IF NOT EXISTS alert_rules (
      id           TEXT PRIMARY KEY,
      user_id      TEXT NOT NULL,
      device_id    TEXT,
      type         TEXT NOT NULL,
      threshold    INTEGER,
      cooldown_min INTEGER NOT NULL DEFAULT 30,
      channel      TEXT NOT NULL DEFAULT 'in_app',
      webhook_url  TEXT,
      enabled      INTEGER NOT NULL DEFAULT 1,
      created_at   TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS notifications (
      id         TEXT PRIMARY KEY,
      user_id    TEXT NOT NULL,
      rule_id    TEXT,
      device_id  TEXT,
      type       TEXT NOT NULL,
      title      TEXT NOT NULL,
      message    TEXT NOT NULL,
      severity   TEXT NOT NULL DEFAULT 'info',
      read       INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id)
    );

    -- ── Phase 3: SSH Credentials ──────────────────────────────────────────────
    CREATE TABLE IF NOT EXISTS device_credentials (
      id           TEXT PRIMARY KEY,
      device_id    TEXT NOT NULL,
      user_id      TEXT NOT NULL,
      label        TEXT NOT NULL,
      ssh_host     TEXT NOT NULL,
      ssh_port     INTEGER NOT NULL DEFAULT 22,
      ssh_username TEXT NOT NULL,
      secret_type  TEXT NOT NULL,
      secret_enc   TEXT NOT NULL,
      last_used    TEXT,
      created_at   TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(device_id, user_id, label),
      FOREIGN KEY (device_id) REFERENCES devices(id),
      FOREIGN KEY (user_id)   REFERENCES users(id)
    );

    -- ── Indexes ───────────────────────────────────────────────────────────────
    CREATE INDEX IF NOT EXISTS idx_devices_owner       ON devices(owner_id);
    CREATE INDEX IF NOT EXISTS idx_devices_token       ON devices(token);
    CREATE INDEX IF NOT EXISTS idx_sessions_device     ON sessions(device_id);
    CREATE INDEX IF NOT EXISTS idx_sessions_user       ON sessions(user_id);
    CREATE INDEX IF NOT EXISTS idx_ai_conv_user        ON ai_conversations(user_id);
    CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user ON refresh_tokens(user_id);
    CREATE INDEX IF NOT EXISTS idx_stats_device_time   ON device_stats_history(device_id, recorded_at DESC);
    CREATE INDEX IF NOT EXISTS idx_audit_user_time     ON audit_log(user_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_audit_device_time   ON audit_log(device_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_notif_user_unread   ON notifications(user_id, read, created_at DESC);
  `)

  // ── Column migrations (for existing DBs that pre-date new columns) ──────────
  // SQLite doesn't support ALTER TABLE ... ADD COLUMN IF NOT EXISTS,
  // so we attempt each and ignore "duplicate column" errors.
  const colMigrations = [
    'ALTER TABLE users   ADD COLUMN totp_secret  TEXT',
    'ALTER TABLE users   ADD COLUMN totp_enabled INTEGER NOT NULL DEFAULT 0',
    'ALTER TABLE devices ADD COLUMN tags         TEXT NOT NULL DEFAULT \'[]\'',
  ]
  for (const sql of colMigrations) {
    try { await db.execute({ sql, args: [] }) } catch { /* column already exists */ }
  }

  // Cleanup expired refresh tokens on each startup
  await db.execute({ sql: 'DELETE FROM refresh_tokens WHERE expires_at < ?', args: [new Date().toISOString()] })

  // Keep stats history for 30 days only (housekeeping on startup)
  await db.execute({ sql: `DELETE FROM device_stats_history WHERE recorded_at < datetime('now', '-30 days')`, args: [] })

  // Keep audit log for 90 days only
  await db.execute({ sql: `DELETE FROM audit_log WHERE created_at < datetime('now', '-90 days')`, args: [] })
}
