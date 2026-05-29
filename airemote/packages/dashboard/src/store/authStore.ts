import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { User } from '@airemote/shared'

interface AuthState {
  token: string | null
  refreshToken: string | null
  user: Omit<User, 'passwordHash'> | null
  setAuth: (token: string, user: Omit<User, 'passwordHash'>, refreshToken?: string) => void
  logout: () => void
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      token: null,
      refreshToken: null,
      user: null,
      setAuth: (token, user, refreshToken) => set({ token, user, refreshToken: refreshToken || null }),
      logout: () => set({ token: null, user: null, refreshToken: null })
    }),
    { name: 'airemote-auth' }
  )
)
