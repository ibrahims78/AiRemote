---
name: AiRemote v3.1.0 Features
description: All 12 professional improvements shipped in this session — protocols, API endpoints, and key constraints.
---

## T001 — Screen Delta Encoding
- agent/src/agent.ts: `computeFrameHash()` (sampling 32 points); skips frame if hash matches previous
- Adaptive quality: idle frames → lower quality (min 30); motion → restore original quality
- Agent sends `keyframe: bool` + `quality: number` in `agent:screen_frame` payload
- Dashboard bandwidth meter reads frame size; `frameStats.keyframes/total` shown in settings panel

## T002 — Chunked File Upload >50MB
- New WS message type: `server:fs_write_chunk` (in shared/src/types/messages.ts)
- Protocol: server sends N chunks (512KB each, `seq`, `total`, `isLast`, `opId`, base64 `data`)
- Agent accumulates in `writeChunkBuffers` Map; writes file only on `isLast=true`
- Server: `sendFsWriteChunked()` in agentHandler.ts; `CHUNKED_THRESHOLD = 16MB` in fs.ts
- Max upload limit: 500MB (multipart + route both enforced)
- Both agent.ts (headless) and agent-desktop/main.js handle `server:fs_write_chunk`

## T003 — PTY Resize Windows Fix
- Windows: sends VT100 `\x1b[8;rows;colst` escape back to dashboard as `agent:pty_data`
- This makes xterm.js resize its viewport even though the underlying shell can't SIGWINCH
- agent-desktop/main.js: also stores `rows`/`cols` on `winPtyBufs` state for future reference
- Unix: still uses SIGWINCH on the `script` wrapper process

## T004 — Consent Dialog Security
- Env: `AGENT_UNATTENDED=true` → auto-grant immediately (for headless CI/server use)
- Env: `AGENT_CONSENT_TIMEOUT=N` → seconds before auto-grant (default 30s)
- Headless agent: no UI so always auto-grants after timeout with clear console warning
- Electron agent: sends `screen-chat` IPC to renderer — future UI can show a dialog

## T005 — Docker Capability Flag
- `detectDocker()` in both agent.ts and agent-desktop/main.js: `docker --version` with 3s timeout
- Reported in `capabilities.docker: boolean` in both `agent:register` and `agent:heartbeat`
- Server stores in registry via `updateDeviceCapabilities()`

## T006 — In-Session Text Chat
- New WS types: `agent:screen_chat`, `server:screen_chat`
- Flow: dashboard → `screen:chat` WS msg → screenHandler → `server:screen_chat` to agent → agent logs + IPC to renderer → can reply via `agent:screen_chat` → screenHandler → dashboard `screen:chat`
- Dashboard: floating chat panel (bottom-right), unread badge, auto-opens on incoming message
- Max message length: 2000 chars; max history: 100 messages per session

## T007 — Wake-on-LAN
- Endpoint: `POST /api/devices/:id/wol` body: `{ macAddress, broadcast?, port? }`
- Defaults: broadcast=255.255.255.255, port=9 (WoL standard)
- Sends IEEE 802.3 Magic Packet: 6×0xFF + 16×MAC (102 bytes total) via UDP
- MAC normalisation: strips colons/dashes/spaces/dots; rejects non-12-hex
- Requires WoL enabled in device BIOS and NIC driver

## T008 — Session Recording
- Service: `packages/server/src/services/recording.ts` (in-memory, no extra deps)
- Max 600 frames per recording (~25MB avg); circular buffer drops oldest when full
- ZIP export: hand-rolled CRC32 + ZIP format (no zlib/archiver deps)
- Routes: `GET /api/recordings`, `GET /api/recordings/:id`, `GET /api/recordings/:id/download`, `DELETE /api/recordings/:id`
- WS protocol: `screen:record_start/stop/status` from dashboard; `screen:record_status` reply
- ZIP auto-deleted after download; recordings owned by userId (admins see all)

## T009 — Agent Desktop v3.0.0
- AGENT_VERSION bumped to '3.0.0' in agent-desktop/main.js line 28
- Docker detection on every WS reconnect (once per connection, not per heartbeat)
- `screen-chat` IPC event sent to renderer when server:screen_chat arrives
- `server:fs_write_chunk` handled by `handleFsWriteChunk()` using `writeChunkBufs` Map

## T010 — Webhook Enhancement
- Platform detection: `hooks.slack.com` → Slack, `discord.com/api/webhooks` → Discord, `api.telegram.org/bot` → Telegram, else generic
- Slack: attachment with color (critical=red, warning=orange, info=green)
- Discord: embed with color int
- Telegram: sendMessage with MarkdownV2 escaping; chat_id parsed from URL query param

## T011 — Dashboard Quality Controls (ScreenViewer v3.1.0)
- Bandwidth meter: bytes/sec from frame base64 length; displayed in toolbar stats bar
- Delta stats: keyframe count / total frames shown in settings dropdown
- Server recording: Activity icon starts/stops server-side recording; Download icon when ready
- Chat panel: floating 288px wide panel, bubble UI, Enter to send, unread badge

## T012 — Code Audit Fixes
- `dgram` import at top of devices.ts (was dynamic require — TS doesn't allow)
- Server health endpoint version bumped to '3.0.0'
- `shared` built first (tsc clean), then server (tsc clean), then dashboard (vite 0 errors)
- Verified: all new WSMessageType entries in shared/src/types/messages.ts
- Verified: `setScreenFrameThrottle`, `setScreenConnectTimeout`, `getDevice`, `getDeviceCapabilities` all exist in registry.ts
