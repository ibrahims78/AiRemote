---
name: server-desktop complete implementation
description: Full feature parity for packages/server-desktop — Electron app serving React Dashboard via Fastify static
---

## Architecture
- **main.js**: Electron main; starts splash (renderer/index.html), calls `startServer()`, then loads `http://127.0.0.1:PORT` (React Dashboard)
- **server.js / server.bundle.js**: Complete Fastify server (~1641 lines, 75 routes, 11 DB tables, 5 WS handlers)
- **preload.js**: contextBridge exposes `window.airemote.*` (server, tunnel, devices, logs, settings, desktop, backup, system, on)
- **renderer/index.html**: Splash screen that polls `/api/health` and redirects to dashboard once ready

## Bundle-based Build (CRITICAL — replaces node_modules-in-asar approach)
- **Why**: pnpm stores packages in `.pnpm/<pkg>/node_modules/<pkg>/` with symlinks. Inside Electron's asar archive on Windows, these symlinks do NOT resolve correctly → `Cannot find module 'avvio'` (fastify's internal dep) and similar errors.
- **Fix**: esbuild bundles all JS deps into single files at build time. Only native modules stay as runtime externals.
- **Bundle script**: `packages/server-desktop/scripts/bundle.js` — calls esbuild CLI at `node_modules/.pnpm/node_modules/.bin/esbuild` to produce `*.bundle.js` files.
- **Externals**: `electron`, `better-sqlite3`, `cpu-features` (ssh2 is bundled; cpu-features is optional and gracefully skipped by ssh2 if absent).
- **main.js**: requires `./server.bundle`, `./tunnel.bundle`, `./logger.bundle`, `./backup.bundle`.
- **electron-builder config**: `"npmRebuild": false` (critical — prevents failed cross-compile attempt). `"asarUnpack": ["**/*.node"]` extracts native .node files from asar to real disk files.
- **better-sqlite3 binary**: prebuild-install downloads the Windows PE32+ DLL automatically during `pnpm install` for server-desktop. The existing `node_modules/better-sqlite3/build/Release/better_sqlite3.node` IS the correct Windows DLL — no cross-compilation needed.
- **Result**: app.asar is 18MB (bundles only), app.asar.unpacked/ has the Windows .node file. Total ZIP = 121MB.

## server.js key details
- better-sqlite3 native module — Windows DLL prebuilt by prebuild-install; do NOT rebuild with electron-rebuild from Linux
- Lazy optional deps: `getAuthenticator()`, `getQRCode()`, `getFStatic()`, `getSsh2()` — prevent startup failures
- DB token stored as `sha256(refreshToken)` (no bcrypt needed for refresh tokens)
- Stats history: saved every 3rd heartbeat, 7-day retention, per-device
- AI streaming: `reply.raw.writeHead(200, { 'Content-Type': 'text/event-stream' })` SSE format
- SFTP sessions stored in `Map<sessionId, SftpStream>`
- Screen viewer registry uses `Map<deviceId, Set<WebSocket>>`
- PTY clients registry uses `Map<sessionId, Set<WebSocket>>`
- WS ticket auth: `/api/ws/ticket` → 30s expiry random token
- `desktopCallbacks` passed from main.js to `server.start()`: getStatus, restartServer, startTunnel, stopTunnel, getLogs, getDesktopSettings, setDesktopSettings, createBackup

## IPC handlers in main.js
- `server:start`, `server:stop`, `server:restart`, `server:status`
- `desktop:status` — returns full status incl. tunnelRunning, tunnelUrl, dataDir
- `tunnel:start`, `tunnel:stop`, `tunnel:status`
- `backup:export`, `backup:import`, `backup:schedule`
- `system:getLocalIp`, `system:openBrowser`, `system:openFolder`, `system:pickFile`, `system:pickFolder`, `system:version`
- `logs:recent`, `logs:export`
- `settings:get`, `settings:set`
- `devices:list`

## Build command (from packages/server-desktop/)
```bash
node scripts/bundle.js              # generate *.bundle.js
node_modules/.bin/electron-builder --win --x64
```
Full build including dashboard + cloudflared download: `pnpm build:win`

**Why npmRebuild:false:** electron-builder detects better-sqlite3 and tries to rebuild it for Electron's ABI using prebuild-install, which fails on Linux (no cross-compile toolchain). Since prebuild-install already downloaded the correct Windows DLL during pnpm install, rebuild must be skipped.
