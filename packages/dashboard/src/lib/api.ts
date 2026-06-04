import axios from 'axios'
import { useAuthStore } from '../store/authStore'

export const api = axios.create({
  baseURL: '',
  headers: { 'Content-Type': 'application/json' }
})

let isRefreshing = false
let refreshQueue: Array<(token: string) => void> = []

function getStoredAuth() {
  try {
    const stored = localStorage.getItem('airemote-auth')
    if (!stored) return null
    return JSON.parse(stored)
  } catch { return null }
}

api.interceptors.request.use(config => {
  const auth = getStoredAuth()
  if (auth?.state?.token) config.headers.Authorization = `Bearer ${auth.state.token}`
  return config
})

api.interceptors.response.use(
  r => r,
  async err => {
    const original = err.config
    if (err.response?.status === 401 && !original._retry) {
      original._retry = true

      const auth = getStoredAuth()
      const refreshToken = auth?.state?.refreshToken

      if (!refreshToken) {
        localStorage.removeItem('airemote-auth')
        window.location.href = '/login'
        return Promise.reject(err)
      }

      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          refreshQueue.push((token: string) => {
            original.headers.Authorization = `Bearer ${token}`
            resolve(api(original))
          })
        })
      }

      isRefreshing = true
      try {
        const res = await axios.post('/api/auth/refresh', { refreshToken })
        const { token: newToken, refreshToken: newRefresh } = res.data

        // Update the Zustand store — this also persists to localStorage via the
        // persist middleware, so useAuthStore().token is immediately up-to-date
        // everywhere (including ScreenViewer's ws-ticket fetch).
        const { user } = useAuthStore.getState()
        useAuthStore.getState().setAuth(newToken, user!, newRefresh)

        api.defaults.headers.common.Authorization = `Bearer ${newToken}`
        original.headers.Authorization = `Bearer ${newToken}`

        refreshQueue.forEach(cb => cb(newToken))
        refreshQueue = []
        isRefreshing = false

        return api(original)
      } catch {
        isRefreshing = false
        refreshQueue = []
        localStorage.removeItem('airemote-auth')
        window.location.href = '/login'
        return Promise.reject(err)
      }
    }
    return Promise.reject(err)
  }
)
