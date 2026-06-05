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
// Protocol:
//   stdin  → "quality|maxWidth|monX|monY|monW|monH|outFilePath"
//   stdout ← "OK"                              full frame saved
//           | "DELTA:fullW,fullH,x,y,w,h"      cropped region saved
//           | "ERR:<message>"                  capture failed
//
// Delta detection uses a 16×16 pixel-sample grid.  If <60 % of cells differ
// AND the bounding box covers <60 % of the full image, only the changed region
// is encoded and transmitted — cutting typical bandwidth 40–80 % on static
// content like documents, terminals, or video-in-window scenarios.
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
        $outFile=$p[6]
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
        $tg.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
        $tg.DrawImage($bmp,0,0,$newW,$newH)
        $tg.Dispose(); $bmp.Dispose()
        $enc    = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() | Where-Object {$_.MimeType -eq 'image/jpeg'}
        $params = New-Object System.Drawing.Imaging.EncoderParameters(1)
        $params.Param[0] = New-Object System.Drawing.Imaging.EncoderParameter([System.Drawing.Imaging.Encoder]::Quality,[long]$quality)
        $isDelta = $false
        if ($null -ne $prevThumb -and $prevThumb.Width -eq $newW -and $prevThumb.Height -eq $newH) {
            $gx = 16; $gy = 16
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
                $crop.Save($outFile,$enc,$params)
                $crop.Dispose()
                $isDelta = $true
                Write-Output "DELTA:$newW,$newH,$dx,$dy,$dw,$dh"
            }
        }
        if (-not $isDelta) {
            $thumb.Save($outFile,$enc,$params)
            Write-Output 'OK'
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
type PsCaptureResult =
  | { isDelta: false }
  | { isDelta: true; fullW: number; fullH: number; x: number; y: number; w: number; h: number }

function captureWithPersistentPs(
  quality: number, maxWidth: number,
  monX: number, monY: number, monW: number, monH: number,
  outFile: string
): Promise<PsCaptureResult> {
  return new Promise((resolve, reject) => {
    let state: PsState
    try { state = ensurePsProcess() } catch (e) { reject(e); return }

    const cmd = `${quality}|${maxWidth}|${monX}|${monY}|${monW}|${monH}|${outFile}\n`

    const timer = setTimeout(() => {
      if (state.resolve) { state.resolve = null }
      reject(new Error('[screen] persistent PS timed out'))
    }, 6000)

    state.resolve = (line: string) => {
      clearTimeout(timer)
      if (line === 'OK') {
        resolve({ isDelta: false })
      } else if (line.startsWith('DELTA:')) {
        const nums = line.slice(6).split(',').map(Number)
        if (nums.length === 6 && nums.every(n => !isNaN(n))) {
          resolve({ isDelta: true, fullW: nums[0], fullH: nums[1], x: nums[2], y: nums[3], w: nums[4], h: nums[5] })
        } else {
          resolve({ isDelta: false })
        }
      } else {
        reject(new Error(`[screen] PS: ${line}`))
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
        const tmpFile = makeTmpFrame()

        let psResult: PsCaptureResult
        try {
          psResult = await captureWithPersistentPs(quality, maxWidth, monX, monY, monW, monH, tmpFile)
        } catch (persistErr) {
          console.warn('[screen] Persistent PS failed, falling back to single-shot:', (persistErr as Error).message)
          if (psState) {
            try { psState.proc.kill() } catch {}
            psState = null
          }
          await captureWithSingleShotPs(quality, maxWidth, monX, monY, monW, monH, tmpFile)
          psResult = { isDelta: false }
        }

        jpegBuf = await fs.readFile(tmpFile)
        try { await fs.unlink(tmpFile) } catch {}

        if (psResult.isDelta) {
          return {
            data:   jpegBuf,
            width:  psResult.fullW,
            height: psResult.fullH,
            deltaRegion: { x: psResult.x, y: psResult.y, w: psResult.w, h: psResult.h }
          }
        }
        // Fall through to parseJpegDimensions for full frame
        const { width, height } = parseJpegDimensions(jpegBuf)
        return { data: jpegBuf, width, height }
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
