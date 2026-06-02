import { exec, execFile } from 'child_process'
import { promisify } from 'util'
import fs from 'fs/promises'
import path from 'path'
import os from 'os'

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
  quality:  number   // 1–100 JPEG quality
  maxWidth: number   // resize to this width if larger
}

const DEFAULT_OPTIONS: CaptureOptions = { quality: 65, maxWidth: 1280 }

// ── Main capture function ────────────────────────────────────────────────────
export async function captureScreen(opts: Partial<CaptureOptions> = {}): Promise<ScreenFrame | null> {
  const { quality, maxWidth } = { ...DEFAULT_OPTIONS, ...opts }
  const backend = await detectBackend()

  if (backend === 'none') return null

  try {
    let jpegBuf: Buffer

    switch (backend) {

      // ── scrot (Linux) ──────────────────────────────────────────────────────
      case 'scrot': {
        await execAsync(
          `scrot --quality ${quality} --silent "${TMP_FRAME}"`,
          { timeout: 5000 }
        )
        jpegBuf = await fs.readFile(TMP_FRAME)
        break
      }

      // ── ImageMagick import (Linux with X11) ────────────────────────────────
      case 'import': {
        // import → resize → write JPEG to tmp file
        await execAsync(
          `import -window root -resize ${maxWidth}x -quality ${quality} "${TMP_FRAME}"`,
          { timeout: 5000, env: { ...process.env, DISPLAY: process.env.DISPLAY || ':0' } }
        )
        jpegBuf = await fs.readFile(TMP_FRAME)
        break
      }

      // ── xwd + convert (Linux fallback) ────────────────────────────────────
      case 'xwd': {
        const { stdout } = await execAsync(
          `xwd -root -silent | convert xwd:- -resize ${maxWidth}x -quality ${quality} jpg:-`,
          {
            timeout: 8000,
            maxBuffer: 20 * 1024 * 1024,
            env: { ...process.env, DISPLAY: process.env.DISPLAY || ':0' }
          }
        )
        jpegBuf = Buffer.from(stdout, 'binary')
        break
      }

      // ── macOS screencapture ───────────────────────────────────────────────
      case 'screencapture': {
        await execAsync(`screencapture -x -t jpg "${TMP_FRAME}"`, { timeout: 5000 })
        let raw = await fs.readFile(TMP_FRAME)
        // Resize if ImageMagick available
        try {
          await execAsync(
            `convert "${TMP_FRAME}" -resize ${maxWidth}x -quality ${quality} "${TMP_FRAME}"`,
            { timeout: 3000 }
          )
          raw = await fs.readFile(TMP_FRAME)
        } catch { /* no convert — send as-is */ }
        jpegBuf = raw
        break
      }

      // ── Windows PowerShell ────────────────────────────────────────────────
      case 'powershell': {
        const ps = `
Add-Type -AssemblyName System.Windows.Forms,System.Drawing
$screen = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds
$bmp = New-Object System.Drawing.Bitmap($screen.Width, $screen.Height)
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.CopyFromScreen($screen.Location, [System.Drawing.Point]::Empty, $screen.Size)
$g.Dispose()
# Resize
$newW = [Math]::Min($screen.Width, ${maxWidth})
$ratio = $newW / $screen.Width
$newH = [int]($screen.Height * $ratio)
$thumb = New-Object System.Drawing.Bitmap($newW, $newH)
$tg = [System.Drawing.Graphics]::FromImage($thumb)
$tg.DrawImage($bmp, 0, 0, $newW, $newH)
$tg.Dispose()
$bmp.Dispose()
$enc = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() | Where-Object {$_.MimeType -eq 'image/jpeg'}
$params = New-Object System.Drawing.Imaging.EncoderParameters(1)
$params.Param[0] = New-Object System.Drawing.Imaging.EncoderParameter([System.Drawing.Imaging.Encoder]::Quality, [long]${quality})
$thumb.Save("${TMP_FRAME.replace(/\\/g, '\\\\')}${''}",  $enc, $params)
$thumb.Dispose()
`.trim()

        await execFileAsync('powershell.exe', [
          '-NonInteractive', '-NoProfile', '-WindowStyle', 'Hidden',
          '-Command', ps
        ], { timeout: 8000 })

        jpegBuf = await fs.readFile(TMP_FRAME)
        break
      }

      default:
        return null
    }

    // Parse dimensions from JPEG header (SOF0 marker)
    const { width, height } = parseJpegDimensions(jpegBuf)

    return { data: jpegBuf, width, height }

  } catch (err) {
    console.error(`[screen] Capture failed (${backend}):`, (err as Error).message)
    // Reset backend so we retry detection next time (in case X11 becomes available)
    if (backend === 'import' || backend === 'xwd' || backend === 'scrot') {
      detectedBackend = null
    }
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
