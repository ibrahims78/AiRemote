import { v4 as uuidv4 } from 'uuid'
import bcrypt from 'bcryptjs'
import { getDb } from './database'
import type { User, UserRow, UserRole } from '@airemote/shared'

function rowToUser(row: UserRow): User {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    role: row.role,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at)
  }
}

export async function findUserByEmail(email: string): Promise<(User & { passwordHash: string }) | null> {
  const db = getDb()
  const result = await db.execute({ sql: 'SELECT * FROM users WHERE email = ?', args: [email] })
  const row = result.rows[0] as unknown as UserRow | undefined
  if (!row) return null
  return { ...rowToUser(row), passwordHash: row.password_hash }
}

export async function findUserById(id: string): Promise<User | null> {
  const db = getDb()
  const result = await db.execute({ sql: 'SELECT * FROM users WHERE id = ?', args: [id] })
  const row = result.rows[0] as unknown as UserRow | undefined
  if (!row) return null
  return rowToUser(row)
}

export async function getAllUsers(): Promise<User[]> {
  const db = getDb()
  const result = await db.execute('SELECT * FROM users ORDER BY created_at DESC')
  return (result.rows as unknown as UserRow[]).map(rowToUser)
}

export async function createUser(
  email: string,
  name: string,
  password: string,
  role: UserRole = 'viewer'
): Promise<User> {
  const db = getDb()
  const id = uuidv4()
  const passwordHash = await bcrypt.hash(password, 12)
  const now = new Date().toISOString()

  await db.execute({
    sql: `INSERT INTO users (id, email, name, role, password_hash, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    args: [id, email, name, role, passwordHash, now, now]
  })

  return (await findUserById(id))!
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash)
}

export async function countUsers(): Promise<number> {
  const db = getDb()
  const result = await db.execute('SELECT COUNT(*) as count FROM users')
  const row = result.rows[0] as unknown as { count: number }
  return row.count
}

export async function updateUser(id: string, updates: Partial<{ name: string; role: UserRole }>): Promise<User | null> {
  const db = getDb()
  const now = new Date().toISOString()
  if (updates.name !== undefined) {
    await db.execute({ sql: 'UPDATE users SET name = ?, updated_at = ? WHERE id = ?', args: [updates.name, now, id] })
  }
  if (updates.role !== undefined) {
    await db.execute({ sql: 'UPDATE users SET role = ?, updated_at = ? WHERE id = ?', args: [updates.role, now, id] })
  }
  return findUserById(id)
}

export async function deleteUser(id: string): Promise<void> {
  const db = getDb()
  await db.execute({ sql: 'DELETE FROM users WHERE id = ?', args: [id] })
}
