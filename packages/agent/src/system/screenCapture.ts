/**
 * screenCapture.ts — v4.0.0
 * Cross-platform screen capture with multi-monitor + delta-frame support.
 *
 * Windows: Persistent PowerShell process (loaded once, reused every frame).
 *   Now includes delta-frame detection: when only a small region changed the
 *   script crops that region, saves it, and outputs "DELTA:fullW,fullH,x,y,w,h"
 *   instead of "OK", halving typical bandwidth on static / document screens.
 *
 * Linux:  scrot / import / xwd.
 *   Headless Linux (no DISPLAY): auto-starts Xvfb at :99 so screen capture
 *   works inside Docker, CI, and other display-free environments.
 *
 * macOS: native screencapture utility.
 */

import { exec, execFile, spawn, ChildProcess } from 'child_process'
import { promisify } from 'util'
import fs from 'fs/promises'
import path from 'path'
import os from 'os'
import type { MonitorInfo } from './inputControl'

const execAsync     = promisify(exec)
const execFileAsync = promisify(execFile)

export interface ScreenFrame {
  data:   Buffer
  /** Always the FULL-screen width, even for delta frames */
  width:  number
  /** Always the FULL-screen height, even for delta frames */
  height: number
  /**
   * Present only for delta frames.  x/y/w/h are in full-screen pixel space.
   * The JPEG in data covers exactly the (w × h) crop starting at (x, y).
   */
  deltaRegion?: { x: number; y: number; w: number; h: number }
}

const PLATFORM = process.platform as 'win32' | 'linux' | 'darwin'

let _captureSeq = 0
function makeTmpFrame(): string {
  return path.join(os.tmpdir(), `airemote_frame_${process.pid}_${++_captureSeq}.jpg`)
}

// ── Platform / backend detection ─────────────────────────────────────────────
type CaptureBackend = 'scrot' | 'import' | 'xwd' | 'screencapture' | 'powershell' | 'none'
let detectedBackend: CaptureBackend | null = null

function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`[screen] ${label} timed out after ${ms}ms`)), ms)
    )
  ])
}

// ── Xvfb headless support (Linux only) ───────────────────────────────────────
// Called when no DISPLAY / WAYLAND_DISPLAY is set.  Attempts to find or start
// an Xvfb virtual display so that capture tools (scrot / import) still work
// inside Docker / CI / headless cloud environments.
async function tryStartXvfb(): Promise<boolean> {
  // Check if Xvfb binary exists
  try { await execAsync('which Xvfb') } catch {
    console.warn('[screen] Xvfb not found — headless capture unavailable (install Xvfb)')
    return false
  }

  const display = ':99'

  // Maybe Xvfb is already running on :99 from a previous agent launch
  try {
    await execAsync(`DISPLAY=${display} xdpyinfo 2>/dev/null`)
    process.env.DISPLAY = display
    console.log(`[screen] Reusing existing Xvfb at ${display}`)
    return true
  } catch {}

  // Start a new Xvfb process
  try {
    const xvfb = spawn('Xvfb', [
      display, '-screen', '0', '1920x1080x24',
      '-ac', '+extension', 'GLX', '+extension', 'RANDR'
    ], { detached: true, stdio: 'ignore' })
    xvfb.unref()

    // Poll up to 2 s for Xvfb to become ready
    for (let i = 0; i < 8; i++) {
      await new Promise(r => setTimeout(r, 250))
      try {
        await execAsync(`DISPLAY=${display} xdpyinfo 2>/dev/null`)
        process.env.DISPLAY = display
        console.log(`[screen] Started Xvfb at ${display} (ready in ${(i + 1) * 250}ms)`)
        return true
      } catch {}
    }
    console.warn('[screen] Xvfb started but did not become ready within 2s')
  } catch (err) {
    console.warn('[screen] Failed to start Xvfb:', (err as Error).message)
  }
  return false
}

async function detectBackend(): Promise<CaptureBackend> {
  if (detectedBackend !== null) return detectedBackend

  if (PLATFORM === 'darwin') { detectedBackend = 'screencapture'; return detectedBackend }
  if (PLATFORM === 'win32')  { detectedBackend = 'powershell';    return detectedBackend }

  // Linux: ensure we have a display
  if (!process.env.DISPLAY && !process.env.WAYLAND_DISPLAY) {
    const started = await tryStartXvfb()
    if (!started) {
      console.warn('[screen] No display found and Xvfb unavailable — screen capture disabled')
      detectedBackend = 'none'
      return detectedBackend
    }
  }

  const tools: Array<{ cmd: string; backend: CaptureBackend }> = [
    { cmd: 'scrot',  backend: 'scrot'  },
    { cmd: 'import', backend: 'import' },
    { cmd: 'xwd',    backend: 'xwd'    },
  ]
  for (const { cmd, backend } of tools) {
    try {
      await execAsync(`which ${cmd}`)
      detectedBackend = backend
      console.log(`[screen] backend: ${backend}`)
      return detectedBackend
    } catch {}
  }
  detectedBackend = 'none'
  return detectedBackend
}

// ── Windows: Persistent PowerShell with delta-frame detection ────────────────
//
// Protocol (no disk I/O — data flows entirely over stdin/stdout pipe):
//   stdin  → "quality|maxWidth|monX|monY|monW|monH"
//   stdout ← "OK:<base64jpeg>"                    full frame (inline)
//           | "DELTA:fullW,fullH,x,y,w,h:<b64>"   cropped region (inline)
//           | "ERR:<message>"                      capture failed
//
// Performance notes vs previous version:
//   • No temp-file write/read/unlink (saves ~15–30 ms per frame)
//   • Bilinear interpolation instead of HighQualityBicubic (~3× faster resize)
//   • 8×8 delta grid instead of 16×16 (64 vs 256 GetPixel calls)
const PS_LOOP_SCRIPT = `
Add-Type -AssemblyName System.Windows.Forms,System.Drawing
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$prevThumb = $null
while($true) {
    $line = [Console]::In.ReadLine()
    if ($null -eq $line -or $line -eq 'EXIT') { exit 0 }
    try {
        $p = $line -split [char]124
        $quality=[int]$p[0]; $maxW=[int]$p[1]
        $monX=[int]$p[2]; $monY=[int]$p[3]; $monW=[int]$p[4]; $monH=[int]$p[5]
        if ($monW -gt 0) {
            $bounds = New-Object System.Drawing.Rectangle($monX,$monY,$monW,$monH)
        } else {
            $bounds = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds
        }
        $bmp = New-Object System.Drawing.Bitmap($bounds.Width,$bounds.Height)
        $g   = [System.Drawing.Graphics]::FromImage($bmp)
        $g.CopyFromScreen($bounds.Location,[System.Drawing.Point]::Empty,$bounds.Size)
        $g.Dispose()
        $newW  = [Math]::Min($bounds.Width,$maxW)
        $ratio = if ($bounds.Width -gt 0) { $newW/$bounds.Width } else { 1 }
        $newH  = [Math]::Max(1,[int]($bounds.Height*$ratio))
        $thumb = New-Object System.Drawing.Bitmap($newW,$newH)
        $tg    = [System.Drawing.Graphics]::FromImage($thumb)
        $tg.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::Bilinear
        $tg.DrawImage($bmp,0,0,$newW,$newH)
        $tg.Dispose(); $bmp.Dispose()
        $enc    = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() | Where-Object {$_.MimeType -eq 'image/jpeg'}
        $params = New-Object System.Drawing.Imaging.EncoderParameters(1)
        $params.Param[0] = New-Object System.Drawing.Imaging.EncoderParameter([System.Drawing.Imaging.Encoder]::Quality,[long]$quality)
        $isDelta = $false
        if ($null -ne $prevThumb -and $prevThumb.Width -eq $newW -and $prevThumb.Height -eq $newH) {
            $gx = 8; $gy = 8
            $cw = [Math]::Max(1,[int]($newW/$gx))
            $ch = [Math]::Max(1,[int]($newH/$gy))
            $minGx = $gx; $maxGx = -1; $minGy = $gy; $maxGy = -1
            $changed = 0
            for ($iy = 0; $iy -lt $gy; $iy++) {
                for ($ix = 0; $ix -lt $gx; $ix++) {
                    $px = [Math]::Min($newW-1,$ix*$cw+[int]($cw/2))
                    $py = [Math]::Min($newH-1,$iy*$ch+[int]($ch/2))
                    $c1 = $thumb.GetPixel($px,$py)
                    $c2 = $prevThumb.GetPixel($px,$py)
                    $d  = [Math]::Abs($c1.R-$c2.R)+[Math]::Abs($c1.G-$c2.G)+[Math]::Abs($c1.B-$c2.B)
                    if ($d -gt 20) {
                        $changed++
                        if ($ix -lt $minGx) { $minGx = $ix }
                        if ($ix -gt $maxGx) { $maxGx = $ix }
                        if ($iy -lt $minGy) { $minGy = $iy }
                        if ($iy -gt $maxGy) { $maxGy = $iy }
                    }
                }
            }
            $total = $gx * $gy
            if ($changed -gt 0 -and $changed -lt [int]($total * 0.6)) {
                $pad = 1
                $dx  = [Math]::Max(0,($minGx-$pad)*$cw)
                $dy  = [Math]::Max(0,($minGy-$pad)*$ch)
                $dw  = [Math]::Min($newW-$dx,($maxGx-$minGx+2+$pad*2)*$cw)
                $dh  = [Math]::Min($newH-$dy,($maxGy-$minGy+2+$pad*2)*$ch)
                $crop = New-Object System.Drawing.Bitmap($dw,$dh)
                $cg   = [System.Drawing.Graphics]::FromImage($crop)
                $srcR = New-Object System.Drawing.Rectangle($dx,$dy,$dw,$dh)
                $dstR = New-Object System.Drawing.Rectangle(0,0,$dw,$dh)
                $cg.DrawImage($thumb,$dstR,$srcR,[System.Drawing.GraphicsUnit]::Pixel)
                $cg.Dispose()
                $ms = New-Object System.IO.MemoryStream
                $crop.Save($ms,$enc,$params)
                $crop.Dispose()
                $b64 = [Convert]::ToBase64String($ms.ToArray())
                $ms.Dispose()
                $isDelta = $true
                Write-Output "DELTA:$newW,$newH,$dx,$dy,$dw,$dh\`:$b64"
            }
        }
        if (-not $isDelta) {
            $ms = New-Object System.IO.MemoryStream
            $thumb.Save($ms,$enc,$params)
            $b64 = [Convert]::ToBase64String($ms.ToArray())
            $ms.Dispose()
            Write-Output "OK:$b64"
        }
        if ($null -ne $prevThumb) { $prevThumb.Dispose() }
        $prevThumb = $thumb
    } catch {
        if ($null -ne $thumb) { try { $thumb.Dispose() } catch {} }
        Write-Output "ERR:$($_.Exception.Message)"
    }
    [Console]::Out.Flush()
}
`.trim()

interface PsState {
  proc:    ChildProcess
  buf:     string
  resolve: ((line: string) => void) | null
}

let psState: PsState | null = null

function ensurePsProcess(): PsState {
  if (psState && psState.proc.exitCode === null) return psState

  const proc = spawn('powershell.exe', [
    '-NonInteractive', '-NoProfile', '-WindowStyle', 'Hidden',
    '-Command', PS_LOOP_SCRIPT
  ], { stdio: ['pipe', 'pipe', 'ignore'] })

  const state: PsState = { proc, buf: '', resolve: null }
  psState = state

  proc.stdout?.on('data', (chunk: Buffer) => {
    state.buf += chunk.toString()
    const lines = state.buf.split('\n')
    state.buf = lines.pop() ?? ''
    for (const raw of lines) {
      const line = raw.trim()
      if (!line) continue
      if (state.resolve) {
        const r = state.resolve
        state.resolve = null
        r(line)
      }
    }
  })

  proc.on('close', () => {
    if (psState === state) psState = null
    if (state.resolve) {
      const r = state.resolve; state.resolve = null
      r('ERR:process_died')
    }
  })

  proc.on('error', () => {
    if (psState === state) psState = null
    if (state.resolve) {
      const r = state.resolve; state.resolve = null
      r('ERR:process_error')
    }
  })

  return state
}

// ── Result from the persistent PS process ────────────────────────────────────
// data is the raw JPEG buffer decoded inline from stdout (no temp file).
type PsCaptureResult =
  | { isDelta: false; data: Buffer }
  | { isDelta: true;  data: Buffer; fullW: number; fullH: number; x: number; y: number; w: number; h: number }

function captureWithPersistentPs(
  quality: number, maxWidth: number,
  monX: number, monY: number, monW: number, monH: number
): Promise<PsCaptureResult> {
  return new Promise((resolve, reject) => {
    let state: PsState
    try { state = ensurePsProcess() } catch (e) { reject(e); return }

    // 6 params — no file path (data returned inline as Base64)
    const cmd = `${quality}|${maxWidth}|${monX}|${monY}|${monW}|${monH}\n`

    const timer = setTimeout(() => {
      if (state.resolve) { state.resolve = null }
      reject(new Error('[screen] persistent PS timed out'))
    }, 6000)

    state.resolve = (line: string) => {
      clearTimeout(timer)
      if (line.startsWith('OK:')) {
        // Full frame — decode Base64 inline
        const data = Buffer.from(line.slice(3), 'base64')
        resolve({ isDelta: false, data })
      } else if (line.startsWith('DELTA:')) {
        // Partial frame — "DELTA:fullW,fullH,x,y,w,h:<base64>"
        const colonIdx = line.lastIndexOf(':')
        const meta     = line.slice(6, colonIdx).split(',').map(Number)
        if (meta.length === 6 && meta.every(n => !isNaN(n))) {
          const data = Buffer.from(line.slice(colonIdx + 1), 'base64')
          resolve({ isDelta: true, data, fullW: meta[0], fullH: meta[1], x: meta[2], y: meta[3], w: meta[4], h: meta[5] })
        } else {
          // Malformed delta — treat as error so caller falls back to single-shot
          reject(new Error(`[screen] PS: malformed DELTA line`))
        }
      } else if (line.startsWith('ERR:')) {
        reject(new Error(`[screen] PS: ${line.slice(4)}`))
      } else {
        reject(new Error(`[screen] PS: unexpected line: ${line.slice(0, 60)}`))
      }
    }

    state.proc.stdin?.write(cmd, (err) => {
      if (err) {
        clearTimeout(timer)
        if (state.resolve) { state.resolve = null }
        reject(err)
      }
    })
  })
}

async function captureWithSingleShotPs(
  quality: number, maxWidth: number,
  monX: number, monY: number, monW: number, monH: number,
  outFile: string
): Promise<void> {
  const boundsCode = monW > 0
    ? `$bounds = New-Object System.Drawing.Rectangle(${monX}, ${monY}, ${monW}, ${monH})`
    : `$bounds = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds`

  const ps = `
Add-Type -AssemblyName System.Windows.Forms,System.Drawing
${boundsCode}
$bmp = New-Object System.Drawing.Bitmap($bounds.Width, $bounds.Height)
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.CopyFromScreen($bounds.Location, [System.Drawing.Point]::Empty, $bounds.Size)
$g.Dispose()
$newW = [Math]::Min($bounds.Width, ${maxWidth})
$ratio = if ($bounds.Width -gt 0) { $newW / $bounds.Width } else { 1 }
$newH = [Math]::Max(1, [int]($bounds.Height * $ratio))
$thumb = New-Object System.Drawing.Bitmap($newW, $newH)
$tg = [System.Drawing.Graphics]::FromImage($thumb)
$tg.DrawImage($bmp, 0, 0, $newW, $newH)
$tg.Dispose(); $bmp.Dispose()
$enc = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() | Where-Object {$_.MimeType -eq 'image/jpeg'}
$params = New-Object System.Drawing.Imaging.EncoderParameters(1)
$params.Param[0] = New-Object System.Drawing.Imaging.EncoderParameter([System.Drawing.Imaging.Encoder]::Quality, [long]${quality})
$thumb.Save("${outFile}", $enc, $params)
$thumb.Dispose()
`.trim()

  await withTimeout(
    execFileAsync('powershell.exe', [
      '-NonInteractive', '-NoProfile', '-WindowStyle', 'Hidden', '-Command', ps
    ]),
    10000, 'powershell-single'
  )
}

// ── Capture options ──────────────────────────────────────────────────────────
export interface CaptureOptions {
  quality:    number
  maxWidth:   number
  monitorId?: number
  monitors?:  MonitorInfo[]
}

const DEFAULT_OPTIONS: CaptureOptions = { quality: 65, maxWidth: 1280, monitorId: 0 }

// ── Main capture function ────────────────────────────────────────────────────
export async function captureScreen(opts: Partial<CaptureOptions> = {}): Promise<ScreenFrame | null> {
  const { quality, maxWidth, monitorId = 0, monitors } = { ...DEFAULT_OPTIONS, ...opts }
  const backend = await detectBackend()
  if (backend === 'none') return null

  const mon         = monitors?.find(m => m.id === monitorId)
  const hasMultiMon = monitors && monitors.length > 1 && mon

  try {
    let jpegBuf: Buffer

    switch (backend) {

      case 'scrot': {
        const tmpFile = makeTmpFrame()
        const envX = { ...process.env, DISPLAY: process.env.DISPLAY || ':0' }
        const cmd = hasMultiMon
          ? `scrot --quality ${quality} --silent -a ${mon.x},${mon.y},${mon.width},${mon.height} "${tmpFile}"`
          : `scrot --quality ${quality} --silent "${tmpFile}"`
        await withTimeout(execAsync(cmd, { env: envX }), 5000, 'scrot')
        try {
          await withTimeout(
            execAsync(`convert "${tmpFile}" -resize ${maxWidth}x\\> -quality ${quality} "${tmpFile}"`, { env: envX }),
            3000, 'convert'
          )
        } catch {}
        jpegBuf = await fs.readFile(tmpFile)
        try { await fs.unlink(tmpFile) } catch {}
        break
      }

      case 'import': {
        const tmpFile = makeTmpFrame()
        const envX = { ...process.env, DISPLAY: process.env.DISPLAY || ':0' }
        const cropArg = hasMultiMon
          ? `-crop ${mon.width}x${mon.height}+${mon.x}+${mon.y} +repage`
          : ''
        await withTimeout(
          execAsync(`import -window root ${cropArg} -resize ${maxWidth}x -quality ${quality} "${tmpFile}"`, { env: envX }),
          5000, 'import'
        )
        jpegBuf = await fs.readFile(tmpFile)
        try { await fs.unlink(tmpFile) } catch {}
        break
      }

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

      case 'screencapture': {
        const tmpFile = makeTmpFrame()
        const displayArg = hasMultiMon ? `-D ${monitorId + 1}` : ''
        await withTimeout(execAsync(`screencapture -x ${displayArg} -t jpg "${tmpFile}"`), 5000, 'screencapture')
        let raw = await fs.readFile(tmpFile)
        try {
          await withTimeout(
            execAsync(`convert "${tmpFile}" -resize ${maxWidth}x -quality ${quality} "${tmpFile}"`),
            3000, 'convert'
          )
          raw = await fs.readFile(tmpFile)
        } catch {}
        jpegBuf = raw
        try { await fs.unlink(tmpFile) } catch {}
        break
      }

      case 'powershell': {
        const monX = hasMultiMon ? mon.x      : 0
        const monY = hasMultiMon ? mon.y      : 0
        const monW = hasMultiMon ? mon.width  : 0
        const monH = hasMultiMon ? mon.height : 0

        let psResult: PsCaptureResult
        try {
          // Fast path: data returned inline via stdout — no disk I/O
          psResult = await captureWithPersistentPs(quality, maxWidth, monX, monY, monW, monH)
        } catch (persistErr) {
          console.warn('[screen] Persistent PS failed, falling back to single-shot:', (persistErr as Error).message)
          if (psState) {
            try { psState.proc.kill() } catch {}
            psState = null
          }
          // Single-shot fallback still uses a temp file
          const tmpFile = makeTmpFrame()
          await captureWithSingleShotPs(quality, maxWidth, monX, monY, monW, monH, tmpFile)
          const buf = await fs.readFile(tmpFile)
          try { await fs.unlink(tmpFile) } catch {}
          const dims = parseJpegDimensions(buf)
          return { data: buf, width: dims.width, height: dims.height }
        }

        if (psResult.isDelta) {
          return {
            data:        psResult.data,
            width:       psResult.fullW,
            height:      psResult.fullH,
            deltaRegion: { x: psResult.x, y: psResult.y, w: psResult.w, h: psResult.h }
          }
        }
        const dims = parseJpegDimensions(psResult.data)
        return { data: psResult.data, width: dims.width, height: dims.height }
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

// ── JPEG dimension parser ─────────────────────────────────────────────────────
function parseJpegDimensions(buf: Buffer): { width: number; height: number } {
  let i = 2
  while (i < buf.length - 9) {
    if (buf[i] !== 0xFF) break
    const marker = buf[i + 1]
    const len    = buf.readUInt16BE(i + 2)
    if (marker === 0xC0 || marker === 0xC1 || marker === 0xC2) {
      const height = buf.readUInt16BE(i + 5)
      const width  = buf.readUInt16BE(i + 7)
      return { width, height }
    }
    i += 2 + len
  }
  return { width: 1280, height: 720 }
}

// ── Cleanup ───────────────────────────────────────────────────────────────────
process.on('exit', () => {
  if (psState) {
    try { psState.proc.stdin?.write('EXIT\n') } catch {}
    try { psState.proc.kill() } catch {}
    psState = null
  }
})

// ── Windows: ffmpeg gdigrab capture loop (15–30 fps) ─────────────────────────
//
// Uses ffmpeg's gdigrab device (standard in every Windows ffmpeg build) to
// capture the desktop at native speed and emit MJPEG frames on stdout.
//
// Performance comparison:
//   PowerShell GDI+ (.NET System.Drawing JPEG encoder)  →  ~1 fps
//   ffmpeg gdigrab  (native JPEG encoder)               →  15–30 fps
//
// User requirement: ffmpeg.exe must be on PATH.
//   Download: https://www.gyan.dev/ffmpeg/builds/ (ffmpeg-release-essentials.zip)
//   Extract and add the bin\ folder to PATH, then restart the agent.

let _ffmpegAvailable: boolean | null = null

/** Detect whether ffmpeg is available on PATH (Windows only).  Result is cached. */
export async function isFfmpegAvailable(): Promise<boolean> {
  if (_ffmpegAvailable !== null) return _ffmpegAvailable
  if (PLATFORM !== 'win32') { _ffmpegAvailable = false; return false }
  try {
    await withTimeout(execAsync('ffmpeg -version'), 4000, 'ffmpeg-detect')
    _ffmpegAvailable = true
    console.log('[screen] ✅ ffmpeg detected — switching to gdigrab capture (15–30 fps)')
  } catch {
    _ffmpegAvailable = false
    console.log('[screen] ⚠️  ffmpeg not found on PATH — using PowerShell GDI+ capture (~1 fps)')
    console.log('[screen]    Install ffmpeg for real-time streaming: https://www.gyan.dev/ffmpeg/builds/')
  }
  return _ffmpegAvailable
}

/** Map JPEG quality (0–100) to ffmpeg mjpeg -q:v scale (1=best, 31=worst) */
function qualityToFfmpegQ(quality: number): number {
  // quality=85 → q=3, quality=75 → q=5, quality=65 → q=7, quality=40 → q=12
  return Math.max(2, Math.min(15, Math.round((100 - quality) / 5)))
}

/**
 * Split a Buffer of concatenated JPEG data (ffmpeg image2pipe MJPEG output)
 * into individual JPEG frames.
 *
 * In JPEG, any 0xFF byte inside entropy-coded data is escaped as FF 00, so the
 * sequence FF D9 (End-of-Image marker) is unambiguous — no false positives.
 */
function extractJpegFrames(buf: Buffer): { frames: Buffer[]; remainder: Buffer } {
  const frames: Buffer[] = []
  let frameStart = 0
  let i = 0
  while (i < buf.length - 1) {
    if (buf[i] === 0xFF && buf[i + 1] === 0xD9) {
      const frameEnd = i + 2
      const frame    = buf.slice(frameStart, frameEnd)
      // Only keep valid-looking JPEGs (start with FF D8)
      if (frame.length >= 4 && frame[0] === 0xFF && frame[1] === 0xD8) {
        frames.push(Buffer.from(frame))  // copy to avoid dangling slice refs
      }
      frameStart = frameEnd
      i          = frameEnd
    } else {
      i++
    }
  }
  return { frames, remainder: buf.slice(frameStart) }
}

export interface FfmpegCaptureOpts {
  fps:       number
  quality:   number
  maxWidth:  number
  monitorX?: number
  monitorY?: number
  monitorW?: number
  monitorH?: number
  onFrame:   (jpeg: Buffer, width: number, height: number) => void
  onError?:  (err: Error) => void
}

/**
 * Start a continuous ffmpeg gdigrab screen-capture loop on Windows.
 *
 * Frames are delivered via `opts.onFrame` as raw JPEG buffers at up to
 * `opts.fps` frames per second — no disk I/O, no PowerShell overhead.
 *
 * Returns a stop() function.  Call it to kill ffmpeg and end the loop.
 */
export function startFfmpegCaptureLoop(opts: FfmpegCaptureOpts): () => void {
  let stopped   = false
  let proc:       ChildProcess | null = null
  let remainder   = Buffer.alloc(0)
  const q         = qualityToFfmpegQ(opts.quality)
  const hasMonitor = !!(opts.monitorW && opts.monitorH)

  function buildArgs(): string[] {
    const args: string[] = ['-loglevel', 'error']

    if (hasMonitor) {
      args.push(
        '-f',          'gdigrab',
        '-framerate',  String(Math.min(opts.fps, 30)),
        '-offset_x',   String(opts.monitorX ?? 0),
        '-offset_y',   String(opts.monitorY ?? 0),
        '-video_size', `${opts.monitorW}x${opts.monitorH}`,
        '-i',          'desktop',
      )
    } else {
      args.push(
        '-f',         'gdigrab',
        '-framerate', String(Math.min(opts.fps, 30)),
        '-i',         'desktop',
      )
    }

    args.push(
      '-vf',            `scale=${opts.maxWidth}:-2:flags=bilinear`,
      '-c:v',           'mjpeg',
      '-q:v',           String(q),
      '-f',             'image2pipe',
      '-flush_packets', '1',
      'pipe:1',
    )
    return args
  }

  function start(): void {
    if (stopped) return

    const args  = buildArgs()
    proc        = spawn('ffmpeg', args, { stdio: ['ignore', 'pipe', 'pipe'] })
    remainder   = Buffer.alloc(0)

    proc.stdout?.on('data', (chunk: Buffer) => {
      if (stopped) return
      const combined                   = Buffer.concat([remainder, chunk])
      const { frames, remainder: rem } = extractJpegFrames(combined)
      remainder                        = rem
      for (const jpeg of frames) {
        const dims = parseJpegDimensions(jpeg)
        opts.onFrame(jpeg, dims.width, dims.height)
      }
    })

    // Forward ffmpeg warnings/errors to console (suppress routine "frame=..." lines)
    let stderrBuf = ''
    proc.stderr?.on('data', (chunk: Buffer) => {
      stderrBuf += chunk.toString()
      const lines = stderrBuf.split('\n')
      stderrBuf  = lines.pop() ?? ''
      for (const line of lines) {
        const t = line.trim()
        if (t && !t.startsWith('frame=') && !t.startsWith('size=')) {
          console.warn('[ffmpeg]', t)
        }
      }
    })

    proc.on('close', (code) => {
      proc = null
      if (!stopped) {
        console.warn(`[screen] ffmpeg exited (code=${code ?? 'null'}), restarting in 2 s …`)
        setTimeout(start, 2000)
      }
    })

    proc.on('error', (err) => {
      proc = null
      if (!stopped) opts.onError?.(err)
    })

    console.log(`[screen] ffmpeg started: fps=${Math.min(opts.fps, 30)} q=${q} maxW=${opts.maxWidth}${hasMonitor ? ` mon=${opts.monitorX},${opts.monitorY} ${opts.monitorW}x${opts.monitorH}` : ''}`)
  }

  start()

  return () => {
    stopped = true
    if (proc) {
      try { proc.kill('SIGTERM') } catch {}
      proc = null
    }
  }
}
