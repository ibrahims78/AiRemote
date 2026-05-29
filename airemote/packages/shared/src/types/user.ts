export type UserRole = 'admin' | 'manager' | 'viewer'

export interface User {
  id: string
  email: string
  name: string
  role: UserRole
  passwordHash?: string
  createdAt: Date
  updatedAt: Date
}

export interface UserRow {
  id: string
  email: string
  name: string
  role: UserRole
  password_hash: string
  created_at: string
  updated_at: string
}

export interface AuthTokenPayload {
  userId: string
  email: string
  role: UserRole
}

export interface LoginRequest {
  email: string
  password: string
}

export interface LoginResponse {
  token: string
  refreshToken: string
  user: Omit<User, 'passwordHash'>
}
