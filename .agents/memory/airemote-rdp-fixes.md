---
name: AiRemote Remote Desktop Critical Fixes
description: Critical bugs fixed + agent-desktop UI improvements for v3.0.0 audit
---

## Bugs Fixed (RDP Engine)

### 1. DEFAULT_FPS = 5 → 20 (screenHandler.ts)
- Server was throttling all sessions to 5 fps by default — extremely choppy
- Changed to 20 fps; max remains 30

### 2. ScreenViewer default preset: 5fps → 30fps
- `useState(QUALITY_PRESETS[2])` → `QUALITY_PRESETS[4]` (عالي الأداء: 30fps, quality 85)

### 3. Keyboard keyup missing in ScreenViewer.tsx
- Only `keydown` was sent as `press` — no `keyup` at all
- Added `keyup` listener sending `type: 'up'`
- keydown now sends BOTH `type: 'down'` AND `type: 'press'`

### 4. inputControl.ts — persistent PowerShell for Windows
- Every mouse move spawned a new `powershell.exe` → massive CPU + lag at 30fps
- Added `_winPs`/`_winPsReady` persistent stdin process

### 5. inputControl.ts — Windows keybd_event for down/up
- Added `WIN_VK` table + `keybd_event` calls for `down`/`up` events

### 6. agent-desktop injectMouse: wrong coordinates (CRITICAL)
- `x,y` from ScreenViewer are relative (0.0–1.0); was using them as absolute pixels
- Fixed: multiply by `capScreenW`/`capScreenH` (updated on each `screen-frame` IPC)

### 7. agent-desktop injectMouse: click not handled
- `click` event type was silently ignored; added SetCursorPos + mouseDown + mouseUp

### 8. agent-desktop injectKey: only handled 'down' type
- `press` and `up` were silently ignored; added `WIN_VK_MAP` + `keybd_event` routing

## Agent-Desktop UI Improvements (v3.0.0 audit)

### 9. Version labels corrected in renderer
- index.html titlebar badge: `v2.0.0` → `v3.0.0`
- index.html footer: `v1.3.0` → `v3.0.0`

### 10. Frame deduplication in capture.html
- Added `computeFrameHash()`: samples ~250 pixels via `getImageData`, fast djb2-like hash
- `captureFrame()` skips sending if hash equals last frame — saves bandwidth on static screens
- `lastFrameHash` reset to 0 on `stopCapture()` and when privacy mode is toggled on

### 11. Privacy Mode — was a no-op stub, now fully implemented
- `server:screen_privacy` in main.js: forwards `set-privacy` IPC to capWin (stops frames) + sends `screen-privacy` IPC to renderer window
- capture.html: `set-privacy` IPC sets `privacyMode` flag; captureFrame returns early when set
- app.js: `onScreenPrivacy` shows/hides privacy badge + shows toast

### 12. Screen Active indicator (new UX)
- Added amber pulsing "Screen" badge in conn-strip (hidden when no sessions)
- Added "Screen sharing active" banner below conn-strip (hidden by default)
- Added purple "Privacy" badge inside banner (shown when privacy mode is on)
- `broadcastScreenSessions()` called in handleScreenStart, handleScreenStop, destroyCaptureWindow, screen-error IPC — keeps renderer in sync
- preload.js now exposes `onScreenSessions` + `onScreenPrivacy`
- app.js handles both with i18n strings (ar + en)

## IPC Channel Map (agent-desktop, complete)
- main → renderer: `init`, `state`, `log`, `stats`, `public-ip`, `screen-chat`, `screen-sessions`, `screen-privacy`
- main → capWin: `start-capture`, `stop-capture`, `set-quality`, `get-monitors`, `set-monitor`, `set-privacy`
- capWin → main: `screen-frame`, `screen-error`, `screen-monitors` (via ipcMain.on)

## Why
- These bugs collectively made remote desktop broken on Windows + agent UI showed no feedback
- Privacy mode stub meant the feature was non-functional despite being in the message protocol

## How to apply
- Mouse coordinates are always relative 0.0–1.0 — always multiply by capScreenW/H
- Persistent PS process is shared for ALL mouse+keyboard ops — never spawn new processes
- Frame dedup uses pixel sampling (not full JPEG comparison) for speed
- Any new screen session state change in main.js must call broadcastScreenSessions()
