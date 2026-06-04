/**
 * screenCapture.ts — v3.0.0
 * Cross-platform screen capture with multi-monitor support.
 *
 * Windows: Uses a single PERSISTENT PowerShell process (loaded once, reused
 *   for every frame) to eliminate the 1-3 s .NET assembly startup cost.
 *   Effective FPS improves from ~0.5 fps → 10-20 fps.
 *
 * Linux/macOS: Uses scrot / import / xwd / screencapture as before.
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
  width:  number
  height: number
}

const PLATFORM   = process.platform as 'win32' | 'linux' | 'darwin'
const TMP_FRAME  = path.join(os.tmpdir(), `airemote_frame_${process.pid}.jpg`)

// ── Platform detection (Linux only) ─────────────────────────────────────────
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

async function detectBackend(): Promise<CaptureBackend> {
  if (detectedBackend !== null) return detectedBackend

  if (PLATFORM === 'darwin') { detectedBackend = 'screencapture'; return detectedBackend }
  if (PLATFORM === 'win32')  { detectedBackend = 'powershell';    return detectedBackend }

  if (!process.env.DISPLAY && !process.env.WAYLAND_DISPLAY) {
    console.warn('[screen] No display found — screen capture unavailable')
    detectedBackend = 'none'
    return detectedBackend
  }

  const tools: Array<{ cmd: string; backend: CaptureBackend }> = [
    { cmd: 'scrot',  backend: 'scrot'  },
    { cmd: 'import', backend: 'import' },
    { cmd: 'xwd',    backend: 'xwd'    },
  ]
  for (const { cmd, backend } of tools) {
    try { await execAsync(`which ${cmd}`); detectedBackend = backend; console.log(`[screen] backend: ${backend}`); return detectedBackend } catch {}
  }
  detectedBackend = 'none'
  return detectedBackend
}

// ── Windows: Persistent PowerShell process ───────────────────────────────────
//
// The persistent PS script loads .NET assemblies ONCE and then loops,
// reading capture commands from stdin and writing "OK" / "ERR:..." to stdout.
// This eliminates the 1-3 s per-frame PS startup penalty.
//
// Protocol (one line per message):
//   stdin  → "quality|maxWidth|monX|monY|monW|monH|outFilePath"
//   stdout ← "OK" (success) | "ERR:<message>" (failure)

const PS_LOOP_SCRIPT = `
Add-Type -AssemblyName System.Windows.Forms,System.Drawing
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
while($true) {
    $line = [Console]::In.ReadLine()
    if ($null -eq $line -or $line -eq 'EXIT') { exit 0 }
    try {
        $p = $line -split [char]124
        $quality=$p[0]; $maxW=[int]$p[1]
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
        $tg.DrawImage($bmp,0,0,$newW,$newH)
        $tg.Dispose(); $bmp.Dispose()
        $enc    = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() | Where-Object {$_.MimeType -eq 'image/jpeg'}
        $params = New-Object System.Drawing.Imaging.EncoderParameters(1)
        $params.Param[0] = New-Object System.Drawing.Imaging.EncoderParameter([System.Drawing.Imaging.Encoder]::Quality,[long]$quality)
        $thumb.Save($outFile,$enc,$params); $thumb.Dispose()
        Write-Output 'OK'
    } catch {
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

function captureWithPersistentPs(
  quality: number, maxWidth: number,
  monX: number, monY: number, monW: number, monH: number,
  outFile: string
): Promise<void> {
  return new Promise((resolve, reject) => {
    let state: PsState
    try { state = ensurePsProcess() } catch (e) { reject(e); return }

    const safeOut = outFile.replace(/\\/g, '\\\\')
    const cmd = `${quality}|${maxWidth}|${monX}|${monY}|${monW}|${monH}|${safeOut}\n`

    // Safety timeout — falls back to single-shot PS if persistent one hangs
    const timer = setTimeout(() => {
      if (state.resolve) { state.resolve = null }
      reject(new Error('[screen] persistent PS timed out'))
    }, 6000)

    state.resolve = (line: string) => {
      clearTimeout(timer)
      if (line === 'OK') resolve()
      else reject(new Error(`[screen] PS: ${line}`))
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

// ── Fallback: single-shot PowerShell (used if persistent fails) ──────────────
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
$thumb.Save("${outFile.replace(/\\/g, '\\\\')}",  $enc, $params)
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

  const mon        = monitors?.find(m => m.id === monitorId)
  const hasMultiMon = monitors && monitors.length > 1 && mon

  try {
    let jpegBuf: Buffer

    switch (backend) {

      // ── scrot (Linux) ────────────────────────────────────────────────────
      case 'scrot': {
        const envX = { ...process.env, DISPLAY: process.env.DISPLAY || ':0' }
        const cmd = hasMultiMon
          ? `scrot --quality ${quality} --silent -a ${mon.x},${mon.y},${mon.width},${mon.height} "${TMP_FRAME}"`
          : `scrot --quality ${quality} --silent "${TMP_FRAME}"`
        await withTimeout(execAsync(cmd, { env: envX }), 5000, 'scrot')
        try {
          await withTimeout(
            execAsync(`convert "${TMP_FRAME}" -resize ${maxWidth}x\\> -quality ${quality} "${TMP_FRAME}"`, { env: envX }),
            3000, 'convert'
          )
        } catch {}
        jpegBuf = await fs.readFile(TMP_FRAME)
        break
      }

      // ── ImageMagick import (Linux) ───────────────────────────────────────
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

      // ── xwd + convert (Linux fallback) ───────────────────────────────────
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

      // ── macOS screencapture ──────────────────────────────────────────────
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

      // ── Windows PowerShell (persistent process) ──────────────────────────
      case 'powershell': {
        const monX = hasMultiMon ? mon.x      : 0
        const monY = hasMultiMon ? mon.y      : 0
        const monW = hasMultiMon ? mon.width  : 0
        const monH = hasMultiMon ? mon.height : 0

        try {
          await captureWithPersistentPs(quality, maxWidth, monX, monY, monW, monH, TMP_FRAME)
        } catch (persistErr) {
          // Persistent process failed — kill it and fall back to single-shot
          console.warn('[screen] Persistent PS failed, falling back to single-shot:', (persistErr as Error).message)
          if (psState) {
            try { psState.proc.kill() } catch {}
            psState = null
          }
          await captureWithSingleShotPs(quality, maxWidth, monX, monY, monW, monH, TMP_FRAME)
        }

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
  try { require('fs').unlinkSync(TMP_FRAME) } catch {}
})
