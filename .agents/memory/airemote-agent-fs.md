---
name: AiRemote Agent-proxied File System
description: How the Files tab works after migration from SFTP to agent-proxied fs/promises
---

## Architecture

The Files tab no longer uses SSH/SFTP. Instead:

1. **Dashboard** → `GET/POST /api/devices/:deviceId/fs/*` (Fastify routes in `packages/server/src/routes/fs.ts`)
2. **Server** → sends `server:fs_request` WS message to agent via `sendFsRequest()` in `agentHandler.ts`
3. **Agent** → handles with `fs/promises` in `handleFsRequest()` in `packages/agent/src/agent.ts`
4. **Agent** → replies with `agent:fs_result` WS message (correlates via `opId` UUID)
5. **Server** → resolves the pending Promise → returns HTTP response to dashboard

## API Endpoints (all under `/api/devices/:deviceId/`)

- `GET fs/list?path=/` — list directory (returns `FileEntry[]`)
- `GET fs/download?path=/foo/bar.txt` — download file (octet-stream)
- `POST fs/delete` `{ path }` — delete file or directory (recursive)
- `POST fs/rename` `{ oldPath, newPath }` — rename/move
- `POST fs/mkdir` `{ path }` — create directory (recursive)
- `POST fs/upload` — multipart form (field: `file`, field: `path`)

## Windows support

On Windows agent, path `/` returns drive list (C:, D: ...). Path `/C:/foo` is converted to `C:\foo` via `toOsPath()`.

## Key files

- `packages/shared/src/types/messages.ts` — `server:fs_request`, `agent:fs_result` message types
- `packages/server/src/routes/fs.ts` — HTTP → WS proxy routes
- `packages/server/src/ws/agentHandler.ts` — `pendingFsOps` map, `sendFsRequest()` export
- `packages/agent/src/agent.ts` — `handleFsRequest()`, `toOsPath()`, `listWindowsDrives()`
- `packages/dashboard/src/components/FileManager.tsx` — props: `{ deviceId, deviceName }`
- `packages/dashboard/src/pages/DeviceWorkspacePage.tsx` — Files tab = `<FileManager deviceId={deviceId} deviceName={device.name} />`

**Why:** Original SFTP required SSH server on device + port forwarding through server. Agent-proxy requires nothing on device except the running agent binary.

**How to apply:** When adding new FS operations, add a new `op` case in agent's `handleFsRequest` switch, add a new route in `fs.ts`, call `sendFsRequest(deviceId, 'opname', path, extraFields)`.
