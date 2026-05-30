import os from 'os'
import type { DeviceInfo } from '@airemote/shared'

export async function getDeviceInfo(): Promise<DeviceInfo> {
  const platform = process.platform === 'win32' ? 'windows'
    : process.platform === 'darwin' ? 'macos'
    : 'linux'

  const networkInterfaces = os.networkInterfaces()
  let ipLocal = '127.0.0.1'

  for (const [, ifaces] of Object.entries(networkInterfaces)) {
    if (!ifaces) continue
    for (const iface of ifaces) {
      if (!iface.internal && iface.family === 'IPv4') {
        ipLocal = iface.address
        break
      }
    }
    if (ipLocal !== '127.0.0.1') break
  }

  return {
    id: '',
    name: process.env.DEVICE_NAME || os.hostname(),
    hostname: os.hostname(),
    platform,
    arch: os.arch(),
    osVersion: `${os.type()} ${os.release()}`,
    ipLocal,
    agentVersion: '1.0.0'
  }
}
