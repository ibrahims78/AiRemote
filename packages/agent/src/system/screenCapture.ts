/**
 * screenCapture.ts — v2.0.0
 * Cross-platform screen capture with multi-monitor support.
 */

import { exec, execFile } from 'child_process'
import { promisify } from 'util'
import fs from 'fs/promises'
import path from 'path'
import os from 'os'
import type { MonitorInfo } from './inputControl'

const execAsync    = promisify(exec)
const execFileAsync = promisify(execFile)

export interface ScreenFrame {
  data:   Buffer   // JPEG bytes
  width:  number
  height: number
}

// ── Platform detection ───────────────────────────────────────────────────────
const PLATFORM = process.platform as 'win32' | 'linux' | 'darwin'

// ── Temp file for capture (reused across frames) ─────────────────────────────
const TMP_FRAME = path.join(os.tmpdir(), `airemote_frame_${process.pid}.jpg`)

// ── Capture backend (auto-detected once at first capture) ────────────────────
type CaptureBackend = 'scrot' | 'import' | 'xwd' | 'screencapture' | 'powershell' | 'none'
let detectedBackend: CaptureBackend | null = null

// ── Forced-timeout promise wrapper ───────────────────────────────────────────
// Some capture tools (scrot, import) hang indefinitely when no X display is
// present and ignore SIGTERM. execAsync's `timeout` option sends a signal but
// the promise never rejects if the process doesn't exit.  We wrap every shell
// invocation with our own race-based hard cutoff.
function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`[screen] ${label} timed out after ${ms}ms`)), ms)
    )
  ])
}

async function detectBackend(): Promise<CaptureBackend> {
  if (detectedBackend !== null) return detectedBackend

  if (PLATFORM === 'darwin') {
    detectedBackend = 'screencapture'
    return detectedBackend
  }

  if (PLATFORM === 'win32') {
    detectedBackend = 'powershell'
    return detectedBackend
  }

  // Linux — no display means no capture is possible at all
  if (!process.env.DISPLAY && !process.env.WAYLAND_DISPLAY) {
    console.warn('[screen] No display found (DISPLAY/WAYLAND_DISPLAY not set) — screen capture unavailable')
    detectedBackend = 'none'
    return detectedBackend
  }

  // Linux — try tools in preference order
  const tools: Array<{ cmd: string; backend: CaptureBackend }> = [
    { cmd: 'scrot',   backend: 'scrot' },
    { cmd: 'import',  backend: 'import' },   // ImageMagick
    { cmd: 'xwd',     backend: 'xwd' },
  ]

  for (const { cmd, backend } of tools) {
    try {
      await execAsync(`which ${cmd}`)
      detectedBackend = backend
      console.log(`[screen] Using backend: ${backend}`)
      return detectedBackend
    } catch {
      // tool not found, try next
    }
  }

  detectedBackend = 'none'
  console.warn('[screen] No screen capture backend found (install scrot or imagemagick)')
  return detectedBackend
}

// ── Capture quality / resolution settings ───────────────────────────────────
export interface CaptureOptions {
  quality:   number
  maxWidth:  number
  monitorId?: number
  monitors?: MonitorInfo[]
}

const DEFAULT_OPTIONS: CaptureOptions = { quality: 65, maxWidth: 1280, monitorId: 0 }

// ── Main capture function ────────────────────────────────────────────────────
export async function captureScreen(opts: Partial<CaptureOptions> = {}): Promise<ScreenFrame | null> {
  const { quality, maxWidth, monitorId = 0, monitors } = { ...DEFAULT_OPTIONS, ...opts }
  const backend = await detectBackend()
  if (backend === 'none') return null

  // Resolve monitor bounds for multi-monitor capture
  const mon = monitors?.find(m => m.id === monitorId)
  const hasMultiMon = monitors && monitors.length > 1 && mon

  try {
    let jpegBuf: Buffer

    switch (backend) {

      // ── scrot (Linux) ──────────────────────────────────────────────────────
      case 'scrot': {
        const envX = { ...process.env, DISPLAY: process.env.DISPLAY || ':0' }
        const cmd = hasMultiMon
          ? `scrot --quality ${quality} --silent -a ${mon.x},${mon.y},${mon.width},${mon.height} "${TMP_FRAME}"`
          : `scrot --quality ${quality} --silent "${TMP_FRAME}"`
        await withTimeout(execAsync(cmd, { env: envX }), 5000, 'scrot')
        // scrot doesn't resize natively — post-process with convert (ImageMagick) if available
        try {
          await withTimeout(
            execAsync(`convert "${TMP_FRAME}" -resize ${maxWidth}x\\> -quality ${quality} "${TMP_FRAME}"`, { env: envX }),
            3000, 'convert'
          )
        } catch { /* convert not installed — use full-resolution scrot output */ }
        jpegBuf = await fs.readFile(TMP_FRAME)
        break
      }

      // ── ImageMagick import (Linux with X11) ────────────────────────────────
      case 'import': {
        const envX = { ...process.env, DISPLAY: process.env.DISPLAY || ':0' }
        const cropArg = hasMultiMon
          ? `-crop ${mon.width}x${mon.height}+${mon.x}+${mon.y} +repage`
          : ''
        await withTimeout(
          execAsync(`import -window root ${cropArg} -resize ${maxWidth}x -quality ${quality} "${TMP_FRAME}"`, { env: envX }),
          5000, 'import'
        )
        jpegBuf = await fs.readFile(TMP_FRAME)
        break
      }

      // ── xwd + convert (Linux fallback) ────────────────────────────────────
      case 'xwd': {
        const { stdout } = await withTimeout(
          execAsync(
            `xwd -root -silent | convert xwd:- -resize ${maxWidth}x -quality ${quality} jpg:-`,
            { maxBuffer: 20 * 1024 * 1024, env: { ...process.env, DISPLAY: process.env.DISPLAY || ':0' } }
          ),
          8000, 'xwd'
        )
        jpegBuf = Buffer.from(stdout, 'binary')
        break
      }

      // ── macOS screencapture ───────────────────────────────────────────────
      case 'screencapture': {
        const displayArg = hasMultiMon ? `-D ${monitorId + 1}` : ''
        await withTimeout(execAsync(`screencapture -x ${displayArg} -t jpg "${TMP_FRAME}"`), 5000, 'screencapture')
        let raw = await fs.readFile(TMP_FRAME)
        try {
          await withTimeout(
            execAsync(`convert "${TMP_FRAME}" -resize ${maxWidth}x -quality ${quality} "${TMP_FRAME}"`),
            3000, 'convert'
          )
          raw = await fs.readFile(TMP_FRAME)
        } catch {}
        jpegBuf = raw
        break
      }

      // ── Windows PowerShell ────────────────────────────────────────────────
      case 'powershell': {
        const boundsCode = hasMultiMon
          ? `$bounds = New-Object System.Drawing.Rectangle(${mon.x}, ${mon.y}, ${mon.width}, ${mon.height})`
          : `$bounds = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds`

        const ps = `
Add-Type -AssemblyName System.Windows.Forms,System.Drawing
${boundsCode}
$bmp = New-Object System.Drawing.Bitmap($bounds.Width, $bounds.Height)
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.CopyFromScreen($bounds.Location, [System.Drawing.Point]::Empty, $bounds.Size)
$g.Dispose()
$newW = [Math]::Min($bounds.Width, ${maxWidth})
$ratio = $newW / $bounds.Width
$newH = [int]($bounds.Height * $ratio)
$thumb = New-Object System.Drawing.Bitmap($newW, $newH)
$tg = [System.Drawing.Graphics]::FromImage($thumb)
$tg.DrawImage($bmp, 0, 0, $newW, $newH)
$tg.Dispose()
$bmp.Dispose()
$enc = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() | Where-Object {$_.MimeType -eq 'image/jpeg'}
$params = New-Object System.Drawing.Imaging.EncoderParameters(1)
$params.Param[0] = New-Object System.Drawing.Imaging.EncoderParameter([System.Drawing.Imaging.Encoder]::Quality, [long]${quality})
$thumb.Save("${TMP_FRAME.replace(/\\/g, '\\\\')}",  $enc, $params)
$thumb.Dispose()
`.trim()

        await withTimeout(
          execFileAsync('powershell.exe', [
            '-NonInteractive', '-NoProfile', '-WindowStyle', 'Hidden', '-Command', ps
          ]),
          8000, 'powershell'
        )
        jpegBuf = await fs.readFile(TMP_FRAME)
        break
      }

      default:
        return null
    }

    const { width, height } = parseJpegDimensions(jpegBuf)
    return { data: jpegBuf, width, height }

  } catch (err) {
    console.error(`[screen] Capture failed (${backend}):`, (err as Error).message)
    return null
  }
}

// ── JPEG dimension parser ────────────────────────────────────────────────────
// Reads width/height from the SOF0/SOF2 marker without a full JPEG library.
function parseJpegDimensions(buf: Buffer): { width: number; height: number } {
  let i = 2  // skip SOI (FF D8)
  while (i < buf.length - 9) {
    if (buf[i] !== 0xFF) break
    const marker = buf[i + 1]
    const len    = buf.readUInt16BE(i + 2)
    // SOF markers: C0 (baseline), C1 (extended), C2 (progressive)
    if (marker === 0xC0 || marker === 0xC1 || marker === 0xC2) {
      const height = buf.readUInt16BE(i + 5)
      const width  = buf.readUInt16BE(i + 7)
      return { width, height }
    }
    i += 2 + len
  }
  return { width: 1280, height: 720 }
}

// ── Cleanup temp file on exit ─────────────────────────────────────────────────
process.on('exit', () => {
  try { require('fs').unlinkSync(TMP_FRAME) } catch { /* ignore */ }
})
