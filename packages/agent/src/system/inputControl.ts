/**
 * inputControl.ts — v2.0.0
 * Cross-platform mouse, keyboard, and clipboard control.
 * Uses native OS tools: xdotool (Linux), PowerShell (Windows), cliclick/osascript (macOS).
 */

import { exec, execFile, spawn, ChildProcess } from 'child_process'
import { promisify } from 'util'

const execAsync     = promisify(exec)
const execFileAsync = promisify(execFile)
const PLATFORM = process.platform as 'win32' | 'linux' | 'darwin'

// ── Persistent PowerShell process for Windows (no spawn-per-event overhead) ─
let _winPs: ChildProcess | null = null
let _winPsReady = false

function ensureWinPs(): void {
  if (PLATFORM !== 'win32') return
  if (_winPs && !(_winPs as any).killed && _winPsReady) return
  _winPsReady = false
  _winPs = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-NoLogo', '-Command', '-'], {
    stdio: ['pipe', 'pipe', 'pipe'],
    windowsHide: true
  } as any)
  const init = `
Add-Type -TypeDefinition @'
using System;using System.Runtime.InteropServices;
public class WinIC{
  [DllImport("user32.dll")] public static extern bool SetCursorPos(int x,int y);
  [DllImport("user32.dll")] public static extern void mouse_event(uint f,int x,int y,int d,IntPtr e);
  [DllImport("user32.dll")] public static extern void keybd_event(byte vk,byte sc,uint flags,IntPtr extra);
  public const uint LD=2,LU=4,RD=8,RU=16,MD=32,MU=64,WH=2048,KEYUP=2;
}
'@ -Language CSharp
Add-Type -AssemblyName System.Windows.Forms
Write-Host 'WINIC_READY'
`
  ;(_winPs as any).stdin.write(init + '\n')
  ;(_winPs as any).stdout.on('data', (d: Buffer) => {
    if (d.toString().includes('WINIC_READY')) _winPsReady = true
  })
  ;(_winPs as any).stderr.on('data', () => {})
  ;(_winPs as any).on('exit', () => { _winPs = null; _winPsReady = false })
}

function sendWinCmd(cmd: string): void {
  ensureWinPs()
  if (_winPs && !(_winPs as any).killed && _winPsReady) {
    try { (_winPs as any).stdin.write(cmd + '\n') } catch {}
    return
  }
  // Queue until PS is ready (first call initialises it)
  const deadline = Date.now() + 5000
  const poll = setInterval(() => {
    if (_winPsReady && _winPs && !(_winPs as any).killed) {
      clearInterval(poll); try { (_winPs as any).stdin.write(cmd + '\n') } catch {}
    } else if (Date.now() > deadline) { clearInterval(poll) }
  }, 80)
}

// VK code map for keybd_event (Windows virtual-key codes)
const WIN_VK: Record<string, number> = {
  'backspace':0x08,'tab':0x09,'enter':0x0D,'return':0x0D,'shift':0x10,'control':0x11,'ctrl':0x11,
  'alt':0x12,'pause':0x13,'capslock':0x14,'escape':0x1B,'esc':0x1B,' ':0x20,'space':0x20,
  'pageup':0x21,'pagedown':0x22,'end':0x23,'home':0x24,
  'arrowleft':0x25,'arrowup':0x26,'arrowright':0x27,'arrowdown':0x28,
  'insert':0x2D,'delete':0x2E,
  '0':0x30,'1':0x31,'2':0x32,'3':0x33,'4':0x34,'5':0x35,'6':0x36,'7':0x37,'8':0x38,'9':0x39,
  'a':0x41,'b':0x42,'c':0x43,'d':0x44,'e':0x45,'f':0x46,'g':0x47,'h':0x48,'i':0x49,'j':0x4A,
  'k':0x4B,'l':0x4C,'m':0x4D,'n':0x4E,'o':0x4F,'p':0x50,'q':0x51,'r':0x52,'s':0x53,'t':0x54,
  'u':0x55,'v':0x56,'w':0x57,'x':0x58,'y':0x59,'z':0x5A,
  'meta':0x5B,'win':0x5B,'contextmenu':0x5D,
  'f1':0x70,'f2':0x71,'f3':0x72,'f4':0x73,'f5':0x74,'f6':0x75,
  'f7':0x76,'f8':0x77,'f9':0x78,'f10':0x79,'f11':0x7A,'f12':0x7B,
  'numlock':0x90,'scrolllock':0x91,'printscreen':0x2C,
  ';':0xBA,'=':0xBB,',':0xBC,'-':0xBD,'.':0xBE,'/':0xBF,'`':0xC0,
  '[':0xDB,'\\':0xDC,']':0xDD,"'":0xDE,
}

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
  // Use persistent PowerShell process — no spawn-per-event overhead
  switch (evt.type) {
    case 'move':
      sendWinCmd(`[WinIC]::SetCursorPos(${ax},${ay})`)
      break
    case 'click': {
      const ld = btn === 2 ? '[WinIC]::RD' : btn === 1 ? '[WinIC]::MD' : '[WinIC]::LD'
      const lu = btn === 2 ? '[WinIC]::RU' : btn === 1 ? '[WinIC]::MU' : '[WinIC]::LU'
      sendWinCmd(`[WinIC]::SetCursorPos(${ax},${ay});[WinIC]::mouse_event(${ld},0,0,0,[IntPtr]::Zero);[WinIC]::mouse_event(${lu},0,0,0,[IntPtr]::Zero)`)
      break
    }
    case 'dblclick':
      sendWinCmd(`[WinIC]::SetCursorPos(${ax},${ay});[WinIC]::mouse_event([WinIC]::LD,0,0,0,[IntPtr]::Zero);[WinIC]::mouse_event([WinIC]::LU,0,0,0,[IntPtr]::Zero);Start-Sleep -Milliseconds 40;[WinIC]::mouse_event([WinIC]::LD,0,0,0,[IntPtr]::Zero);[WinIC]::mouse_event([WinIC]::LU,0,0,0,[IntPtr]::Zero)`)
      break
    case 'down': {
      const df = btn === 2 ? '[WinIC]::RD' : btn === 1 ? '[WinIC]::MD' : '[WinIC]::LD'
      sendWinCmd(`[WinIC]::SetCursorPos(${ax},${ay});[WinIC]::mouse_event(${df},0,0,0,[IntPtr]::Zero)`)
      break
    }
    case 'up': {
      const uf = btn === 2 ? '[WinIC]::RU' : btn === 1 ? '[WinIC]::MU' : '[WinIC]::LU'
      sendWinCmd(`[WinIC]::SetCursorPos(${ax},${ay});[WinIC]::mouse_event(${uf},0,0,0,[IntPtr]::Zero)`)
      break
    }
    case 'scroll': {
      const wd = (evt.deltaY ?? 0) > 0 ? -120 : 120
      sendWinCmd(`[WinIC]::SetCursorPos(${ax},${ay});[WinIC]::mouse_event([WinIC]::WH,0,0,${wd},[IntPtr]::Zero)`)
      break
    }
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
  const keyLower = evt.key.toLowerCase()

  if (evt.type === 'press') {
    // SendKeys for text input (handles layout-aware chars, IME, etc.)
    const keyCombo = buildPsKeyCombo(evt.key, mods)
    const escaped  = keyCombo.replace(/'/g, "''")
    sendWinCmd(`[System.Windows.Forms.SendKeys]::SendWait('${escaped}')`)
    return
  }

  // 'down' / 'up' — use keybd_event for held-key support (Ctrl+drag, Shift+select, gaming)
  const vk = WIN_VK[keyLower] ?? (evt.key.length === 1 ? evt.key.toUpperCase().charCodeAt(0) : null)
  if (!vk) return

  const kflag = evt.type === 'up' ? '[WinIC]::KEYUP' : '0'

  // Press modifier keys first for 'down', release them after for 'up'
  const modVks: number[] = []
  if (mods.includes('ctrl'))  modVks.push(0x11)
  if (mods.includes('alt'))   modVks.push(0x12)
  if (mods.includes('shift')) modVks.push(0x10)
  if (mods.includes('meta'))  modVks.push(0x5B)

  const cmds: string[] = []
  if (evt.type === 'down') {
    modVks.forEach(mv => cmds.push(`[WinIC]::keybd_event(${mv},0,0,[IntPtr]::Zero)`))
    cmds.push(`[WinIC]::keybd_event(${vk},0,0,[IntPtr]::Zero)`)
  } else {
    cmds.push(`[WinIC]::keybd_event(${vk},0,${kflag},[IntPtr]::Zero)`)
    modVks.reverse().forEach(mv => cmds.push(`[WinIC]::keybd_event(${mv},0,[WinIC]::KEYUP,[IntPtr]::Zero)`))
  }
  sendWinCmd(cmds.join(';'))
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
