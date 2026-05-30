---
name: AiRemote Agent Desktop UI
description: Agent-desktop renderer architecture — collapsible sections, IP bug fix, build quirks
---

## Collapsible Sections Pattern
- HTML: `.coll-sec` (container) + `.sec-hdr` (button, data-target=id) + `.sec-body` (content)
- CSS: `.coll-sec.collapsed .sec-body { max-height: 0 }` — uses max-height transition
- JS: `toggleSection(id)` reads/writes localStorage `coll-{id}`. Log section uses `#app.log-mini` class
- Defaults (COLL_DEFAULTS): info=collapsed, settings=expanded, stats=collapsed, log=expanded

## Public IP Bug
- **Root cause**: `fetchPublicIp()` in main.js called `resolve('')` on error/timeout but did NOT call `win.webContents.send('public-ip', '')` — so renderer loading animation never cleared
- **Fix**: Both `req.on('error')` and `req.on('timeout')` must send the IPC event before resolving
- **Renderer fallback**: 9-second timeout clears loading animation if no event received

## Build Process
- `electron-builder --win portable` fails with NSIS 7z error in Linux (can't create portable exe directly)
- Workaround: run `--win portable --x64` first (packaging step succeeds, updates win-unpacked/resources/app.asar), then run `--prepackaged ../../../releases/agent-windows/win-unpacked --win portable` to create the exe
- The asar update happens in the first step even when the overall build fails

## Sections Structure (index.html)
- sec-info: device info grid (host, local IP, public IP, server, device ID)
- sec-settings: settings inner (tab-bar + panel-conn + panel-ssh)
- sec-stats: stats-body (CPU/RAM/Disk bars + uptime)
- log-section: log-card (log-header + log-body-wrap, toggle via #app.log-mini)

**Why:** Without these notes, the IP bug is non-obvious (error handler silently swallows the IPC send), and the build two-step workaround gets forgotten.
