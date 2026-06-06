---
name: server-desktop complete implementation
description: Full feature parity for packages/server-desktop — Electron app serving React Dashboard via Fastify static
---

## Architecture
- **main.js**: Electron main; starts splash (renderer/index.html), calls `startServer()`, then loads `http://127.0.0.1:PORT` (React Dashboard)
- **server.js**: Complete Fastify server (~1641 lines, 75 routes, 11 DB tables, 5 WS handlers)
- **preload.js**: contextBridge exposes `window.airemote.*` (server, tunnel, devices, logs, settings, desktop, backup, system, on)
- **renderer/index.html**: Splash screen that polls `/api/health` and redirects to dashboard once ready

## server.js key details
- better-sqlite3 native module — compiled for Electron, NOT regular Node.js; test with `electron` binary only
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

## Installation
- `pnpm install --no-frozen-lockfile` at monorepo root installs all deps including new: `otplib`, `qrcode`, `@fastify/static`, `ssh2`
- better-sqlite3 is rebuilt for Electron via `electron-builder install-app-deps` postinstall hook

**Why:** better-sqlite3 is a native module — it must match Electron's Node ABI, not system Node. Running `node server.js` directly will always fail with "bindings file not found".
