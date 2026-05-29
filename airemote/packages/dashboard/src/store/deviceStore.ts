import { create } from 'zustand'
import type { Device, DeviceStats, DeviceStatus, TunnelLayer } from '@airemote/shared'
import { api } from '../lib/api'

interface DeviceState {
  devices: Device[]
  statsMap: Record<string, DeviceStats>
  loading: boolean
  fetchDevices: () => Promise<void>
  updateDeviceStatus: (id: string, status: DeviceStatus, tunnelLayer?: TunnelLayer) => void
  updateDeviceStats: (id: string, stats: DeviceStats) => void
  addDevice: (name: string) => Promise<Device>
  deleteDevice: (id: string) => Promise<void>
}

export const useDeviceStore = create<DeviceState>((set, get) => ({
  devices: [],
  statsMap: {},
  loading: false,

  fetchDevices: async () => {
    set({ loading: true })
    try {
      const res = await api.get('/api/devices')
      set({ devices: res.data, loading: false })
    } catch {
      set({ loading: false })
    }
  },

  updateDeviceStatus: (id, status, tunnelLayer) => {
    set(state => ({
      devices: state.devices.map(d =>
        d.id === id ? { ...d, status, tunnelLayer: tunnelLayer ?? d.tunnelLayer } : d
      )
    }))
  },

  updateDeviceStats: (id, stats) => {
    set(state => ({ statsMap: { ...state.statsMap, [id]: stats } }))
  },

  addDevice: async (name: string) => {
    const res = await api.post('/api/devices', { name })
    const device = res.data as Device
    set(state => ({ devices: [...state.devices, device] }))
    return device
  },

  deleteDevice: async (id: string) => {
    await api.delete(`/api/devices/${id}`)
    set(state => ({ devices: state.devices.filter(d => d.id !== id) }))
  }
}))
