---
name: AiRemote Agent Desktop UI
description: Agent-desktop renderer architecture — collapsible sections, IP bug fix, connection strip, v1.3.0 UI patterns, build quirks
---

## Collapsible Sections Pattern
- HTML: `.coll-sec` (container) + `.sec-hdr` (button, data-target=id) + `.sec-body` (content)
- CSS: `.coll-sec.collapsed .sec-body { max-height: 0 }` — uses max-height transition
- JS: `toggleSection(id)` reads/writes localStorage `coll-{id}`. Log section uses `#app.log-mini` class
- Defaults (COLL_DEFAULTS): info=collapsed, settings=expanded, stats=collapsed, log=expanded

## Connection Details Strip (v1.3.0)
- Element: `#conn-strip` — shown when state = connected or connecting, hidden when stopped/error
- Structure: three `.conn-strip-item` divs separated by `.conn-strip-sep` (1px vertical dividers)
- Items: Server (hostname), Session time (uptime counter), PTY badge (always green)
- JS: `startStripUptime(initial)` / `stopStripUptime()` run parallel to `startUptimeCounter()` (stats badge)
- `applyState()` shows/hides strip and updates `#strip-server` with `resolveHost(serverUrl)`

## Titlebar Status Pill (v1.3.0)
- When connected/connecting: `#title-sep` (visible) + `#title-host` shows hostname
- CSS `:has()` selector colors the pill border/bg dynamically per state (no JS needed)
- `.title-host` is capped at max-width:100px with overflow:hidden

## SSH Tab — Still Needed
- Agent sends `agent:ssh_info` on connect and on SSH settings save
- Server uses those credentials to SSH directly into the device
- Tab shows `.ssh-info-banner` (blue info box) explaining server-initiated nature
- All SSH config, key generation, and test functionality preserved

## Public IP Bug
- **Root cause**: `fetchPublicIp()` in main.js called `resolve('')` on error/timeout but did NOT call `win.webContents.send('public-ip', '')` — so renderer loading animation never cleared
- **Fix**: Both `req.on('error')` and `req.on('timeout')` must send the IPC event before resolving
- **Renderer fallback**: 9-second timeout clears loading animation if no event received

## Build Process (Working Method for Replit)
1. Download Electron Windows binary manually: `curl -L -o ~/.cache/electron/electron-v28.3.3-win32-x64.zip "https://github.com/electron/electron/releases/download/v28.3.3/electron-v28.3.3-win32-x64.zip"` (~103MB)
2. Extract with Python zipfile → creates `releases/agent-windows/win-unpacked/`
3. Copy app files (main.js, preload.js, package.json, renderer/, node_modules/ws) → `win-unpacked/resources/app/`
4. Write NSIS script `build.nsi` with: `SilentInstall silent`, `SetCompressor /SOLID lzma`, `File /r "win-unpacked\*.*"`, `ExecShell "" "$INSTDIR\electron.exe"`
5. Build exe: `nix-shell -p nsis --run "makensis build.nsi"` from `releases/agent-windows/` → produces ~76MB valid PE exe
- `wine` is blocked (bad system call). `electron-builder` hangs at NSIS step. Native `makensis` from nix-shell is the working solution.
- The NSIS `File /r` directive needs `win-unpacked\*.*` not just `win-unpacked\` for recursive inclusion

## Sections Structure (index.html v1.3.0)
- `#titlebar` → `.title-status` pill with `.title-dot`, `#title-state-lbl`, `#title-sep`, `#title-host`
- `#status-card` → `.status-dot-wrap` + `.status-info` + `#toggle-btn`
- `#conn-strip` → three strip-items (server, session, PTY badge) — hidden class toggles visibility
- `sec-info`: device info grid (host, local IP, public IP, server, device ID)
- `sec-settings`: settings inner (tab-bar + panel-conn + panel-ssh)
  - `panel-ssh`: `.ssh-info-banner` + `.ssh-status-bar` + fields + key gen section
- `sec-stats`: stats-body (CPU/RAM/Disk bars + uptime badge)
- `log-section`: log-card (log-header + log-body-wrap, toggle via #app.log-mini)

**Why:** The connection strip and titlebar hostname are new in v1.3.0 — both need the `applyState()` function to update them correctly, and the strip has its own uptime counter separate from the stats badge.
