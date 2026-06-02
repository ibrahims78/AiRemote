/**
 * inputControl.ts — v2.0.0
 * Cross-platform mouse, keyboard, and clipboard control.
 * Uses native OS tools: xdotool (Linux), PowerShell (Windows), cliclick/osascript (macOS).
 */

import { exec, execFile, spawn } from 'child_process'
import { promisify } from 'util'

const execAsync     = promisify(exec)
const execFileAsync = promisify(execFile)
const PLATFORM = process.platform as 'win32' | 'linux' | 'darwin'

// ── Tool availability cache ─────────────────────────────────────────────────
let _hasXdotool: boolean | null = null
let _hasCliclick: boolean | null = null

async function hasXdotool(): Promise<boolean> {
  if (_hasXdotool !== null) return _hasXdotool
  try { await execAsync('which xdotool'); _hasXdotool = true } catch { _hasXdotool = false }
  return _hasXdotool
}

async function hasCliclick(): Promise<boolean> {
  if (_hasCliclick !== null) return _hasCliclick
  try { await execAsync('which cliclick'); _hasCliclick = true } catch { _hasCliclick = false }
  return _hasCliclick
}

// ── Screen resolution (for absolute coordinate calculation) ─────────────────
let _screenW = 1920
let _screenH = 1080

export function setScreenResolution(w: number, h: number): void {
  _screenW = w
  _screenH = h
}

function toAbsX(relX: number): number { return Math.round(relX * _screenW) }
function toAbsY(relY: number): number { return Math.round(relY * _screenH) }

// ── Mouse button map ────────────────────────────────────────────────────────
const XDOTOOL_BUTTON: Record<number, number> = { 0: 1, 1: 2, 2: 3 }
const PS_BUTTON: Record<number, string> = {
  0: 'Left', 1: 'Middle', 2: 'Right'
}

// ── Mouse Control ────────────────────────────────────────────────────────────

export interface MouseEvent {
  type: 'move' | 'down' | 'up' | 'click' | 'dblclick' | 'scroll'
  x: number
  y: number
  button?: 0 | 1 | 2
  deltaY?: number
}

export async function controlMouse(evt: MouseEvent): Promise<void> {
  const ax = toAbsX(evt.x)
  const ay = toAbsY(evt.y)
  const btn = evt.button ?? 0

  if (PLATFORM === 'linux') {
    await controlMouseLinux(evt, ax, ay, btn)
  } else if (PLATFORM === 'win32') {
    await controlMouseWindows(evt, ax, ay, btn)
  } else if (PLATFORM === 'darwin') {
    await controlMouseMac(evt, ax, ay, btn)
  }
}

async function controlMouseLinux(evt: MouseEvent, ax: number, ay: number, btn: number): Promise<void> {
  const xb = XDOTOOL_BUTTON[btn] ?? 1
  const display = process.env.DISPLAY || ':0'
  const env = { ...process.env, DISPLAY: display }

  try {
    switch (evt.type) {
      case 'move':
        await execAsync(`xdotool mousemove ${ax} ${ay}`, { env, timeout: 1000 })
        break
      case 'down':
        await execAsync(`xdotool mousemove ${ax} ${ay} mousedown ${xb}`, { env, timeout: 1000 })
        break
      case 'up':
        await execAsync(`xdotool mousemove ${ax} ${ay} mouseup ${xb}`, { env, timeout: 1000 })
        break
      case 'click':
        await execAsync(`xdotool mousemove ${ax} ${ay} click ${xb}`, { env, timeout: 1000 })
        break
      case 'dblclick':
        await execAsync(`xdotool mousemove ${ax} ${ay} click --repeat 2 ${xb}`, { env, timeout: 1000 })
        break
      case 'scroll': {
        const dir = (evt.deltaY ?? 0) > 0 ? 5 : 4
        await execAsync(`xdotool mousemove ${ax} ${ay} click ${dir}`, { env, timeout: 1000 })
        break
      }
    }
  } catch (err) {
    // Fallback: check if xdotool isn't available
    const available = await hasXdotool()
    if (!available) {
      console.warn('[input] xdotool not available. Install with: sudo apt install xdotool')
    } else {
      console.error('[input] xdotool error:', (err as Error).message)
    }
  }
}

async function controlMouseWindows(evt: MouseEvent, ax: number, ay: number, btn: number): Promise<void> {
  const btnName = PS_BUTTON[btn] ?? 'Left'

  let ps = `Add-Type -AssemblyName System.Windows.Forms,System.Drawing\n`

  switch (evt.type) {
    case 'move':
      ps += `[System.Windows.Forms.Cursor]::Position = New-Object System.Drawing.Point(${ax}, ${ay})`
      break
    case 'click':
      ps += `
[System.Windows.Forms.Cursor]::Position = New-Object System.Drawing.Point(${ax}, ${ay})
Add-Type -TypeDefinition @"
using System; using System.Runtime.InteropServices;
public class Mouse { [DllImport("user32.dll")] public static extern void mouse_event(int f, int x, int y, int d, int e); }
"@
[Mouse]::mouse_event(0x${btnName === 'Left' ? '2' : btnName === 'Right' ? '8' : '20'}, 0, 0, 0, 0)
[Mouse]::mouse_event(0x${btnName === 'Left' ? '4' : btnName === 'Right' ? '10' : '40'}, 0, 0, 0, 0)
`
      break
    case 'dblclick':
      ps += `
[System.Windows.Forms.Cursor]::Position = New-Object System.Drawing.Point(${ax}, ${ay})
Add-Type -TypeDefinition @"
using System; using System.Runtime.InteropServices;
public class Mouse2 { [DllImport("user32.dll")] public static extern void mouse_event(int f, int x, int y, int d, int e); }
"@
[Mouse2]::mouse_event(0x2, 0, 0, 0, 0); [Mouse2]::mouse_event(0x4, 0, 0, 0, 0)
Start-Sleep -Milliseconds 50
[Mouse2]::mouse_event(0x2, 0, 0, 0, 0); [Mouse2]::mouse_event(0x4, 0, 0, 0, 0)
`
      break
    case 'down':
      ps += `
[System.Windows.Forms.Cursor]::Position = New-Object System.Drawing.Point(${ax}, ${ay})
Add-Type -TypeDefinition @"
using System; using System.Runtime.InteropServices;
public class MouseD { [DllImport("user32.dll")] public static extern void mouse_event(int f, int x, int y, int d, int e); }
"@
[MouseD]::mouse_event(0x${btnName === 'Left' ? '2' : '8'}, 0, 0, 0, 0)
`
      break
    case 'up':
      ps += `
[System.Windows.Forms.Cursor]::Position = New-Object System.Drawing.Point(${ax}, ${ay})
Add-Type -TypeDefinition @"
using System; using System.Runtime.InteropServices;
public class MouseU { [DllImport("user32.dll")] public static extern void mouse_event(int f, int x, int y, int d, int e); }
"@
[MouseU]::mouse_event(0x${btnName === 'Left' ? '4' : '10'}, 0, 0, 0, 0)
`
      break
    case 'scroll': {
      const delta = (evt.deltaY ?? 0) > 0 ? -120 : 120
      ps += `
[System.Windows.Forms.Cursor]::Position = New-Object System.Drawing.Point(${ax}, ${ay})
Add-Type -TypeDefinition @"
using System; using System.Runtime.InteropServices;
public class MouseS { [DllImport("user32.dll")] public static extern void mouse_event(int f, int x, int y, int d, int e); }
"@
[MouseS]::mouse_event(0x800, 0, 0, ${delta}, 0)
`
      break
    }
  }

  try {
    await execFileAsync('powershell.exe', ['-NonInteractive', '-NoProfile', '-WindowStyle', 'Hidden', '-Command', ps], { timeout: 3000 })
  } catch (err) {
    console.error('[input] PowerShell mouse error:', (err as Error).message)
  }
}

async function controlMouseMac(evt: MouseEvent, ax: number, ay: number, btn: number): Promise<void> {
  const available = await hasCliclick()
  if (available) {
    try {
      switch (evt.type) {
        case 'move':
          await execAsync(`cliclick m:${ax},${ay}`, { timeout: 1000 })
          break
        case 'click':
          await execAsync(`cliclick ${btn === 2 ? 'rc' : 'c'}:${ax},${ay}`, { timeout: 1000 })
          break
        case 'dblclick':
          await execAsync(`cliclick dc:${ax},${ay}`, { timeout: 1000 })
          break
        case 'down':
          await execAsync(`cliclick dd:${ax},${ay}`, { timeout: 1000 })
          break
        case 'up':
          await execAsync(`cliclick du:${ax},${ay}`, { timeout: 1000 })
          break
        case 'scroll': {
          const scrollDir = (evt.deltaY ?? 0) > 0 ? '-3' : '3'
          await execAsync(`cliclick m:${ax},${ay}`, { timeout: 1000 })
          // macOS scroll via AppleScript
          await execAsync(`osascript -e 'tell application "System Events" to scroll ${scrollDir}'`, { timeout: 1000 })
          break
        }
      }
    } catch (err) {
      console.error('[input] cliclick error:', (err as Error).message)
    }
  } else {
    // Fallback: AppleScript
    const script = `tell application "System Events" to set the mouse location to {${ax}, ${ay}}`
    try {
      await execAsync(`osascript -e '${script}'`, { timeout: 2000 })
    } catch (err) {
      console.error('[input] osascript error:', (err as Error).message)
    }
  }
}

// ── Keyboard Control ─────────────────────────────────────────────────────────

export interface KeyEvent {
  type: 'down' | 'up' | 'press'
  key: string
  modifiers?: ('ctrl' | 'alt' | 'shift' | 'meta')[]
}

// Map common key names to xdotool key names
const XDOTOOL_KEY_MAP: Record<string, string> = {
  'enter': 'Return', 'return': 'Return',
  'escape': 'Escape', 'esc': 'Escape',
  'tab': 'Tab',
  'space': 'space',
  'backspace': 'BackSpace',
  'delete': 'Delete',
  'insert': 'Insert',
  'home': 'Home',
  'end': 'End',
  'pageup': 'Page_Up',
  'pagedown': 'Page_Down',
  'arrowup': 'Up', 'up': 'Up',
  'arrowdown': 'Down', 'down': 'Down',
  'arrowleft': 'Left', 'left': 'Left',
  'arrowright': 'Right', 'right': 'Right',
  'f1': 'F1', 'f2': 'F2', 'f3': 'F3', 'f4': 'F4',
  'f5': 'F5', 'f6': 'F6', 'f7': 'F7', 'f8': 'F8',
  'f9': 'F9', 'f10': 'F10', 'f11': 'F11', 'f12': 'F12',
  'ctrl': 'ctrl', 'control': 'ctrl',
  'alt': 'alt',
  'shift': 'shift',
  'meta': 'super', 'win': 'super',
  'capslock': 'Caps_Lock',
  'numlock': 'Num_Lock',
  'printscreen': 'Print',
}

const PS_KEY_MAP: Record<string, string> = {
  'enter': '{ENTER}', 'return': '{ENTER}',
  'escape': '{ESC}', 'esc': '{ESC}',
  'tab': '{TAB}',
  'space': ' ',
  'backspace': '{BACKSPACE}',
  'delete': '{DELETE}',
  'insert': '{INSERT}',
  'home': '{HOME}',
  'end': '{END}',
  'pageup': '{PGUP}',
  'pagedown': '{PGDN}',
  'arrowup': '{UP}', 'up': '{UP}',
  'arrowdown': '{DOWN}', 'down': '{DOWN}',
  'arrowleft': '{LEFT}', 'left': '{LEFT}',
  'arrowright': '{RIGHT}', 'right': '{RIGHT}',
  'f1': '{F1}', 'f2': '{F2}', 'f3': '{F3}', 'f4': '{F4}',
  'f5': '{F5}', 'f6': '{F6}', 'f7': '{F7}', 'f8': '{F8}',
  'f9': '{F9}', 'f10': '{F10}', 'f11': '{F11}', 'f12': '{F12}',
  'capslock': '{CAPSLOCK}',
}

function buildXdotoolKeyCombo(key: string, mods: string[]): string {
  const base = XDOTOOL_KEY_MAP[key.toLowerCase()] ?? key.toLowerCase()
  const modParts: string[] = []
  if (mods.includes('ctrl'))  modParts.push('ctrl')
  if (mods.includes('alt'))   modParts.push('alt')
  if (mods.includes('shift')) modParts.push('shift')
  if (mods.includes('meta'))  modParts.push('super')
  return modParts.length > 0 ? `${modParts.join('+')}+${base}` : base
}

function buildPsKeyCombo(key: string, mods: string[]): string {
  const base = PS_KEY_MAP[key.toLowerCase()] ?? key
  let combo = ''
  if (mods.includes('ctrl'))  combo += '^'
  if (mods.includes('alt'))   combo += '%'
  if (mods.includes('shift')) combo += '+'
  combo += base
  return combo
}

export async function controlKeyboard(evt: KeyEvent): Promise<void> {
  const mods = evt.modifiers ?? []

  if (PLATFORM === 'linux') {
    await controlKeyboardLinux(evt, mods)
  } else if (PLATFORM === 'win32') {
    await controlKeyboardWindows(evt, mods)
  } else if (PLATFORM === 'darwin') {
    await controlKeyboardMac(evt, mods)
  }
}

async function controlKeyboardLinux(evt: KeyEvent, mods: string[]): Promise<void> {
  const display = process.env.DISPLAY || ':0'
  const env = { ...process.env, DISPLAY: display }
  const keyCombo = buildXdotoolKeyCombo(evt.key, mods)

  try {
    switch (evt.type) {
      case 'press':
        await execAsync(`xdotool key ${keyCombo}`, { env, timeout: 1000 })
        break
      case 'down':
        await execAsync(`xdotool keydown ${keyCombo}`, { env, timeout: 1000 })
        break
      case 'up':
        await execAsync(`xdotool keyup ${keyCombo}`, { env, timeout: 1000 })
        break
    }
  } catch (err) {
    console.error('[input] xdotool key error:', (err as Error).message)
  }
}

async function controlKeyboardWindows(evt: KeyEvent, mods: string[]): Promise<void> {
  if (evt.type !== 'press') return // SendKeys only supports press

  const keyCombo = buildPsKeyCombo(evt.key, mods)
  const escaped = keyCombo.replace(/'/g, "''")
  const ps = `
Add-Type -AssemblyName System.Windows.Forms
[System.Windows.Forms.SendKeys]::SendWait('${escaped}')
`
  try {
    await execFileAsync('powershell.exe', ['-NonInteractive', '-NoProfile', '-WindowStyle', 'Hidden', '-Command', ps], { timeout: 3000 })
  } catch (err) {
    console.error('[input] PowerShell key error:', (err as Error).message)
  }
}

async function controlKeyboardMac(evt: KeyEvent, mods: string[]): Promise<void> {
  if (evt.type !== 'press') return

  const keyName = XDOTOOL_KEY_MAP[evt.key.toLowerCase()] ?? evt.key
  let script = ''

  if (mods.length > 0) {
    const modNames = mods.map(m => {
      if (m === 'ctrl') return 'control down'
      if (m === 'alt')  return 'option down'
      if (m === 'shift') return 'shift down'
      if (m === 'meta') return 'command down'
      return m
    })
    const modEnd = mods.map(m => {
      if (m === 'ctrl') return 'control up'
      if (m === 'alt')  return 'option up'
      if (m === 'shift') return 'shift up'
      if (m === 'meta') return 'command up'
      return m
    })
    script = `tell application "System Events" to key code 0 using {${modNames.join(', ')}, ${modEnd.join(', ')}}`
  } else {
    script = `tell application "System Events" to keystroke "${keyName}"`
  }

  try {
    await execAsync(`osascript -e '${script}'`, { timeout: 2000 })
  } catch (err) {
    console.error('[input] osascript key error:', (err as Error).message)
  }
}

// ── Clipboard Control ────────────────────────────────────────────────────────

export async function readClipboard(): Promise<string> {
  try {
    if (PLATFORM === 'linux') {
      const display = process.env.DISPLAY || ':0'
      const env = { ...process.env, DISPLAY: display }
      // Try xclip first, then xsel
      try {
        const { stdout } = await execAsync('xclip -selection clipboard -o', { env, timeout: 3000 })
        return stdout
      } catch {
        const { stdout } = await execAsync('xsel --clipboard --output', { env, timeout: 3000 })
        return stdout
      }
    } else if (PLATFORM === 'win32') {
      const ps = `Get-Clipboard`
      const { stdout } = await execAsync(
        `powershell.exe -NonInteractive -NoProfile -Command "${ps}"`,
        { timeout: 3000 }
      )
      return stdout.trim()
    } else if (PLATFORM === 'darwin') {
      const { stdout } = await execAsync('pbpaste', { timeout: 3000 })
      return stdout
    }
  } catch (err) {
    console.error('[clipboard] read error:', (err as Error).message)
  }
  return ''
}

export async function writeClipboard(text: string): Promise<void> {
  try {
    const buf = Buffer.from(text, 'utf8')
    if (PLATFORM === 'linux') {
      const display = process.env.DISPLAY || ':0'
      const env = { ...process.env, DISPLAY: display }
      await new Promise<void>((resolve) => {
        const proc = spawn('xclip', ['-selection', 'clipboard'], { env })
        proc.stdin.write(buf)
        proc.stdin.end()
        proc.on('close', () => resolve())
        proc.on('error', () => {
          // xclip not found — try xsel
          const proc2 = spawn('xsel', ['--clipboard', '--input'], { env })
          proc2.stdin.write(buf)
          proc2.stdin.end()
          proc2.on('close', () => resolve())
          proc2.on('error', () => resolve())
        })
      })
    } else if (PLATFORM === 'darwin') {
      await new Promise<void>((resolve) => {
        const proc = spawn('pbcopy', [])
        proc.stdin.write(buf)
        proc.stdin.end()
        proc.on('close', () => resolve())
        proc.on('error', () => resolve())
      })
    } else if (PLATFORM === 'win32') {
      // Base64-encode to avoid any quoting/escaping issues with arbitrary clipboard content
      const b64 = buf.toString('base64')
      const ps  = `$t=[System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String('${b64}'));Set-Clipboard -Value $t`
      await execFileAsync('powershell.exe', ['-NonInteractive', '-NoProfile', '-Command', ps], { timeout: 3000 })
    }
  } catch (err) {
    console.error('[clipboard] write error:', (err as Error).message)
  }
}

// ── Privacy Mode ─────────────────────────────────────────────────────────────


export async function enablePrivacyMode(): Promise<void> {
  try {
    if (PLATFORM === 'linux') {
      const display = process.env.DISPLAY || ':0'
      const env = { ...process.env, DISPLAY: display }
      // Create a black fullscreen window using Python/Xlib or xrandr brightness
      try {
        await execAsync(`xrandr --output $(xrandr | grep " connected" | head -1 | cut -d" " -f1) --brightness 0`, { env, timeout: 3000 })
      } catch {
        // Fallback: use xset
        await execAsync('xset dpms force off', { env, timeout: 2000 })
      }
    } else if (PLATFORM === 'win32') {
      const ps = `
Add-Type -TypeDefinition @"
using System; using System.Runtime.InteropServices;
public class WinAPI {
  [DllImport("user32.dll")] public static extern bool LockWorkStation();
}
"@
[WinAPI]::LockWorkStation()
`
      await execFileAsync('powershell.exe', ['-NonInteractive', '-NoProfile', '-WindowStyle', 'Hidden', '-Command', ps], { timeout: 3000 })
    } else if (PLATFORM === 'darwin') {
      await execAsync(`osascript -e 'tell application "System Events" to sleep'`, { timeout: 3000 })
    }
    console.log('[privacy] Privacy mode ENABLED')
  } catch (err) {
    console.error('[privacy] enable error:', (err as Error).message)
  }
}

export async function disablePrivacyMode(): Promise<void> {
  try {
    if (PLATFORM === 'linux') {
      const display = process.env.DISPLAY || ':0'
      const env = { ...process.env, DISPLAY: display }
      try {
        await execAsync(`xrandr --output $(xrandr | grep " connected" | head -1 | cut -d" " -f1) --brightness 1`, { env, timeout: 3000 })
      } catch {
        await execAsync('xset dpms force on', { env, timeout: 2000 })
      }
    } else if (PLATFORM === 'win32') {
      // Can't programmatically unlock Windows after LockWorkStation — by design
    } else if (PLATFORM === 'darwin') {
      // Wake up
      await execAsync(`caffeinate -u -t 1`, { timeout: 3000 })
    }
    console.log('[privacy] Privacy mode DISABLED')
  } catch (err) {
    console.error('[privacy] disable error:', (err as Error).message)
  }
}

// ── Monitor Enumeration ──────────────────────────────────────────────────────

export interface MonitorInfo {
  id: number
  x: number
  y: number
  width: number
  height: number
  primary: boolean
  name: string
}

export async function listMonitors(): Promise<MonitorInfo[]> {
  try {
    if (PLATFORM === 'linux') {
      return await listMonitorsLinux()
    } else if (PLATFORM === 'win32') {
      return await listMonitorsWindows()
    } else if (PLATFORM === 'darwin') {
      return await listMonitorsMac()
    }
  } catch (err) {
    console.error('[monitors] list error:', (err as Error).message)
  }
  return [{ id: 0, x: 0, y: 0, width: _screenW, height: _screenH, primary: true, name: 'Primary' }]
}

async function listMonitorsLinux(): Promise<MonitorInfo[]> {
  const display = process.env.DISPLAY || ':0'
  const env = { ...process.env, DISPLAY: display }
  const { stdout } = await execAsync('xrandr --query', { env, timeout: 5000 })
  const monitors: MonitorInfo[] = []
  let id = 0

  const lines = stdout.split('\n')
  for (const line of lines) {
    // Match lines like: HDMI-1 connected 1920x1080+0+0 (normal left inverted right x axis y axis) 531mm x 299mm
    const m = line.match(/^(\S+)\s+connected\s+(?:primary\s+)?(\d+)x(\d+)\+(\d+)\+(\d+)/)
    if (m) {
      monitors.push({
        id: id++,
        name: m[1],
        width: parseInt(m[2]),
        height: parseInt(m[3]),
        x: parseInt(m[4]),
        y: parseInt(m[5]),
        primary: line.includes(' primary ')
      })
    }
  }

  return monitors.length > 0
    ? monitors
    : [{ id: 0, x: 0, y: 0, width: _screenW, height: _screenH, primary: true, name: 'Primary' }]
}

async function listMonitorsWindows(): Promise<MonitorInfo[]> {
  const ps = `
Add-Type -AssemblyName System.Windows.Forms
$screens = [System.Windows.Forms.Screen]::AllScreens
$result = $screens | ForEach-Object {
  "$($_.Bounds.X),$($_.Bounds.Y),$($_.Bounds.Width),$($_.Bounds.Height),$($_.Primary),$($_.DeviceName)"
}
$result -join "|"
`
  const { stdout } = await execFileAsync('powershell.exe', ['-NonInteractive', '-NoProfile', '-Command', ps], { timeout: 5000 })
  const monitors: MonitorInfo[] = []
  stdout.trim().split('|').forEach((part, idx) => {
    const [x, y, w, h, primary, name] = part.split(',')
    monitors.push({
      id: idx,
      x: parseInt(x), y: parseInt(y),
      width: parseInt(w), height: parseInt(h),
      primary: primary?.toLowerCase() === 'true',
      name: name?.replace('\\\\.\\', '').trim() || `Monitor ${idx + 1}`
    })
  })
  return monitors.length > 0
    ? monitors
    : [{ id: 0, x: 0, y: 0, width: _screenW, height: _screenH, primary: true, name: 'Primary' }]
}

async function listMonitorsMac(): Promise<MonitorInfo[]> {
  try {
    const script = `
system_profiler SPDisplaysDataType | grep Resolution
`
    const { stdout } = await execAsync(script, { timeout: 5000 })
    const monitors: MonitorInfo[] = []
    let id = 0
    const lines = stdout.split('\n').filter(l => l.includes('Resolution'))
    for (const line of lines) {
      const m = line.match(/(\d+)\s*x\s*(\d+)/)
      if (m) {
        monitors.push({
          id: id++,
          x: 0, y: 0,
          width: parseInt(m[1]),
          height: parseInt(m[2]),
          primary: id === 1,
          name: `Display ${id}`
        })
      }
    }
    return monitors.length > 0 ? monitors : [{ id: 0, x: 0, y: 0, width: _screenW, height: _screenH, primary: true, name: 'Primary' }]
  } catch {
    return [{ id: 0, x: 0, y: 0, width: _screenW, height: _screenH, primary: true, name: 'Primary' }]
  }
}

// ── Control availability check ───────────────────────────────────────────────

export async function isControlAvailable(): Promise<boolean> {
  if (PLATFORM === 'linux') return await hasXdotool()
  if (PLATFORM === 'win32') return true   // PowerShell always available
  if (PLATFORM === 'darwin') return true  // osascript always available
  return false
}
