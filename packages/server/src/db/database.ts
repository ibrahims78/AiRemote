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
  const dbDir = path.dirname(dbPath)

  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true })
  }

  client = createClient({ url: `file:${dbPath}` })

  await runMigrations(client)
  console.log(`✅ Database initialized at ${dbPath}`)
}

async function runMigrations(db: Client): Promise<void> {
  // Core tables
  await db.executeMultiple(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'viewer',
      password_hash TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS devices (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      token TEXT UNIQUE NOT NULL,
      owner_id TEXT NOT NULL,
      info TEXT,
      status TEXT NOT NULL DEFAULT 'offline',
      tunnel_layer TEXT,
      tunnel_address TEXT,
      last_seen TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (owner_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      device_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      type TEXT NOT NULL,
      started_at TEXT NOT NULL DEFAULT (datetime('now')),
      ended_at TEXT,
      duration_sec INTEGER,
      ip_address TEXT,
      FOREIGN KEY (device_id) REFERENCES devices(id),
      FOREIGN KEY (user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS refresh_tokens (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      token_hash TEXT UNIQUE NOT NULL,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS ai_conversations (
      id TEXT PRIMARY KEY,
      device_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      messages TEXT NOT NULL DEFAULT '[]',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL DEFAULT '{}',
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_devices_owner ON devices(owner_id);
    CREATE INDEX IF NOT EXISTS idx_devices_token ON devices(token);
    CREATE INDEX IF NOT EXISTS idx_sessions_device ON sessions(device_id);
    CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
    CREATE INDEX IF NOT EXISTS idx_ai_conv_user ON ai_conversations(user_id);
    CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user ON refresh_tokens(user_id);
  `)

  // Clean up expired refresh tokens on startup
  await db.execute({
    sql: 'DELETE FROM refresh_tokens WHERE expires_at < ?',
    args: [new Date().toISOString()]
  })
}
