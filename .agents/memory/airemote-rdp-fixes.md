---
name: AiRemote Remote Desktop Critical Fixes
description: 8 critical bugs that broke AnyDesk-like remote desktop experience — all fixed
---

## Bugs Fixed

### 1. DEFAULT_FPS = 5 → 20 (screenHandler.ts)
- Server was throttling all sessions to 5 fps by default — extremely choppy
- Changed to 20 fps; max remains 30

### 2. ScreenViewer default preset: 5fps → 30fps
- `useState(QUALITY_PRESETS[2])` → `QUALITY_PRESETS[4]` (عالي الأداء: 30fps, quality 85)
- Users no longer need to manually raise quality every session

### 3. Keyboard keyup missing in ScreenViewer.tsx
- Only `keydown` was sent as `press` — no `keyup` at all
- Added `keyup` listener sending `type: 'up'`
- keydown now sends BOTH `type: 'down'` (for keybd_event held-key) AND `type: 'press'` (for SendKeys text input)
- This enables: Ctrl+drag, Shift+select, held movement keys

### 4. inputControl.ts — persistent PowerShell for Windows
- Every mouse move spawned a new `powershell.exe` process → massive CPU + lag at 30fps
- Added `_winPs`/`_winPsReady` persistent stdin process (same pattern as agent-desktop)
- `sendWinCmd()` writes to stdin; queues until ready on first call

### 5. inputControl.ts — Windows keybd_event for down/up
- `SendKeys` only supported `press` (no held keys)
- Added `WIN_VK` table (virtual-key codes) and `keybd_event` calls for `down`/`up` events
- Press: still uses SendKeys (layout-aware text)
- Down/Up: uses keybd_event (enables Shift+select, Ctrl+drag, gaming keys)

### 6. agent-desktop injectMouse: wrong coordinates (CRITICAL BUG)
- `x,y` from ScreenViewer are relative (0.0–1.0)
- `xi = Math.round(x || 0)` gave absolute values of 0 or 1 pixel — mouse always at top-left!
- Fixed: `xi = Math.round(payload.x * capScreenW)`, `yi = Math.round(payload.y * capScreenH)`
- Added `capScreenW/H` global vars, updated on each `ipcMain.on('screen-frame')` from actual capture dims

### 7. agent-desktop injectMouse: click not handled
- `click` event type was silently ignored — clicks didn't work!
- Added `click` handler: SetCursorPos + mouseDown + mouseUp

### 8. agent-desktop injectKey: only handled 'down' type
- payload.type 'press' and 'up' were silently ignored
- Added `WIN_VK_MAP` + `keybd_event` for `down`/`up` events
- `press` now handled by SendKeys (was ignoring it before)

## Why
- These bugs collectively made remote desktop broken on Windows: clicks went to wrong coords,
  mouse lag was extreme (new PS per event), keyboard shortcuts didn't work, FPS was 5.

## How to apply
- Any future change to input injection on Windows must test both `press` (text) and `down`/`up` (shortcuts)
- Mouse coordinates are always relative 0.0–1.0 from ScreenViewer — always multiply by screen dims
- Persistent PS process is shared for ALL mouse+keyboard ops — do not spawn new processes
