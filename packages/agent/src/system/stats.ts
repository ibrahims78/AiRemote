import os from 'os'
import fs from 'fs'
import { execSync } from 'child_process'
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
          (cpu2.times.sys  - cpu1.times.sys) +
          (cpu2.times.irq  - cpu1.times.irq) +
          idle
        totalIdle += idle
        totalTick += total
      }

      const percent = totalTick === 0 ? 0 : Math.round((1 - totalIdle / totalTick) * 100)
      resolve(Math.min(100, Math.max(0, percent)))
    }, 100)
  })
}

function getMemoryInfo() {
  const totalMb = Math.round(os.totalmem() / 1024 / 1024)
  const freeMb  = Math.round(os.freemem()  / 1024 / 1024)
  const usedMb  = totalMb - freeMb
  const percent = Math.round((usedMb / totalMb) * 100)
  return { totalMb, usedMb, freeMb, percent }
}

function getDiskInfo(): { percent: number; usedGb: number; totalGb: number } {
  try {
    if (process.platform === 'win32') {
      const out = execSync(
        'wmic logicaldisk where "DeviceID=\'C:\'" get Size,FreeSpace /value',
        { timeout: 5000, stdio: ['pipe', 'pipe', 'ignore'] }
      ).toString()
      const freeMatch = out.match(/FreeSpace=(\d+)/)
      const sizeMatch = out.match(/Size=(\d+)/)
      if (freeMatch && sizeMatch) {
        const total = parseInt(sizeMatch[1])
        const free  = parseInt(freeMatch[1])
        const used  = total - free
        return {
          totalGb: Math.round(total / 1073741824 * 10) / 10,
          usedGb:  Math.round(used  / 1073741824 * 10) / 10,
          percent: Math.round((used / total) * 100)
        }
      }
    } else {
      // Linux / macOS
      const out = execSync('df -k /', { timeout: 5000, stdio: ['pipe', 'pipe', 'ignore'] }).toString()
      const lines = out.trim().split('\n')
      // Some systems wrap long lines — look for the data line (contains digits)
      const dataLine = lines.find((l, i) => i > 0 && /\d+/.test(l))
      if (dataLine) {
        const parts = dataLine.trim().split(/\s+/)
        const totalKb = parseInt(parts[1])
        const usedKb  = parseInt(parts[2])
        const pctStr  = parts[4]?.replace('%', '')
        const percent = pctStr ? parseInt(pctStr) : Math.round((usedKb / totalKb) * 100)
        return {
          totalGb: Math.round(totalKb / 1048576 * 10) / 10,
          usedGb:  Math.round(usedKb  / 1048576 * 10) / 10,
          percent: isNaN(percent) ? 0 : percent
        }
      }
    }
  } catch {}
  return { percent: 0, usedGb: 0, totalGb: 0 }
}

function readRawNetworkBytes(): { rx: number; tx: number } {
  try {
    if (process.platform === 'linux') {
      // /proc/net/dev columns: iface rx_bytes rx_pkts ... tx_bytes (col 9) tx_pkts ...
      const content = fs.readFileSync('/proc/net/dev', 'utf8')
      const lines   = content.trim().split('\n').slice(2)
      let rx = 0, tx = 0
      for (const line of lines) {
        const parts = line.trim().split(/\s+/)
        const iface = parts[0].replace(':', '')
        if (iface === 'lo') continue
        rx += parseInt(parts[1])  || 0
        tx += parseInt(parts[9])  || 0
      }
      return { rx, tx }
    }

    if (process.platform === 'darwin') {
      // macOS: netstat -ib
      const out   = execSync('netstat -ib', { timeout: 3000, stdio: ['pipe', 'pipe', 'ignore'] }).toString()
      const lines = out.trim().split('\n').slice(1)
      let rx = 0, tx = 0
      const seen = new Set<string>()
      for (const line of lines) {
        const parts = line.trim().split(/\s+/)
        const iface = parts[0]
        if (iface.startsWith('lo') || seen.has(iface)) continue
        seen.add(iface)
        rx += parseInt(parts[6]) || 0
        tx += parseInt(parts[9]) || 0
      }
      return { rx, tx }
    }
  } catch {}
  return { rx: 0, tx: 0 }
}

function getNetworkInfo(): { downKbps: number; upKbps: number } {
  const now    = Date.now()
  const bytes  = readRawNetworkBytes()
  const elapsed = (now - lastNetworkBytes.time) / 1000

  let downKbps = 0
  let upKbps   = 0

  if (elapsed > 0 && (bytes.rx !== 0 || bytes.tx !== 0)) {
    const rxDiff = bytes.rx - lastNetworkBytes.rx
    const txDiff = bytes.tx - lastNetworkBytes.tx
    downKbps = Math.max(0, Math.round(rxDiff / elapsed / 1024))
    upKbps   = Math.max(0, Math.round(txDiff / elapsed / 1024))
  }

  lastNetworkBytes = { rx: bytes.rx, tx: bytes.tx, time: now }
  return { downKbps, upKbps }
}
