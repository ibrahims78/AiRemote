import os from 'os'
import type { DeviceStats } from '@airemote/shared'

let lastNetworkBytes = { rx: 0, tx: 0, time: Date.now() }

export async function getDeviceStats(): Promise<DeviceStats> {
  const cpuPercent = await getCpuUsage()
  const memInfo = getMemoryInfo()
  const diskInfo = getDiskInfo()
  const networkInfo = getNetworkInfo()

  return {
    cpuPercent,
    ramPercent: memInfo.percent,
    ramUsedMb: memInfo.usedMb,
    ramTotalMb: memInfo.totalMb,
    diskPercent: diskInfo.percent,
    diskUsedGb: diskInfo.usedGb,
    diskTotalGb: diskInfo.totalGb,
    networkUpKbps: networkInfo.upKbps,
    networkDownKbps: networkInfo.downKbps,
    uptime: Math.floor(os.uptime())
  }
}

function getCpuUsage(): Promise<number> {
  return new Promise((resolve) => {
    const cpus1 = os.cpus()
    setTimeout(() => {
      const cpus2 = os.cpus()
      let totalIdle = 0
      let totalTick = 0

      for (let i = 0; i < cpus1.length; i++) {
        const cpu1 = cpus1[i]
        const cpu2 = cpus2[i]
        const idle = cpu2.times.idle - cpu1.times.idle
        const total =
          (cpu2.times.user - cpu1.times.user) +
          (cpu2.times.nice - cpu1.times.nice) +
          (cpu2.times.sys - cpu1.times.sys) +
          (cpu2.times.irq - cpu1.times.irq) +
          idle
        totalIdle += idle
        totalTick += total
      }

      const percent = totalTick === 0 ? 0 : Math.round((1 - totalIdle / totalTick) * 100)
      resolve(percent)
    }, 100)
  })
}

function getMemoryInfo() {
  const totalMb = Math.round(os.totalmem() / 1024 / 1024)
  const freeMb = Math.round(os.freemem() / 1024 / 1024)
  const usedMb = totalMb - freeMb
  const percent = Math.round((usedMb / totalMb) * 100)
  return { totalMb, usedMb, freeMb, percent }
}

function getDiskInfo() {
  return { percent: 0, usedGb: 0, totalGb: 0 }
}

function getNetworkInfo() {
  const interfaces = os.networkInterfaces()
  let rxBytes = 0
  let txBytes = 0

  for (const [, ifaces] of Object.entries(interfaces)) {
    if (!ifaces) continue
    for (const iface of ifaces) {
      if (!iface.internal) {
        rxBytes += 0
        txBytes += 0
      }
    }
  }

  const now = Date.now()
  const elapsed = (now - lastNetworkBytes.time) / 1000
  const downKbps = elapsed > 0 ? Math.round((rxBytes - lastNetworkBytes.rx) / elapsed / 1024) : 0
  const upKbps = elapsed > 0 ? Math.round((txBytes - lastNetworkBytes.tx) / elapsed / 1024) : 0

  lastNetworkBytes = { rx: rxBytes, tx: txBytes, time: now }

  return { downKbps: Math.max(0, downKbps), upKbps: Math.max(0, upKbps) }
}
