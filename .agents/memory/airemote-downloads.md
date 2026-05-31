---
name: AiRemote Downloads System
description: Release download/build endpoints, AgentDownloads UI component, and Windows GUI packaging approach
---

# AiRemote Downloads System

## API Endpoints (packages/server/src/routes/downloads.ts)
- `GET /api/downloads/list` — returns all 5 releases with `available`, `buildable`, `build_status`
- `GET /api/downloads/file/:id` — streams file; requireAuth
- `POST /api/downloads/build/:id` — triggers async build; **requireAdmin**
- `GET /api/downloads/build/:id/status` — polls build progress + log; requireAuth

## Release IDs
`win-gui`, `win-exe`, `linux-bin`, `script-js`, `script-pkg`

## Windows GUI Packaging
**Why:** `electron-builder --portable` on Linux fails at NSIS packaging step — it creates a corrupt `.nsis.7z` intermediate when killed, and subsequent runs fail to read it.

**How to apply:** Use `python3 zipfile` to zip `releases/agent-windows/win-unpacked/` → `AiRemote-Agent-v1.4.0-Windows-x64.zip`. The buildCmd for `win-gui` does exactly this. Users extract ZIP and run `AiRemote Agent.exe`.

Delete `airemote-agent-desktop-*.nsis.7z` before retrying any electron-builder run.

## Build State
- In-memory `Map<id, BuildState>` — resets on server restart
- Frontend polls `/status` every 2500ms while `status === 'building'`
- On `done`, frontend re-fetches the release list to update `available`

## Files
- `packages/server/src/routes/downloads.ts` — all logic
- `packages/dashboard/src/components/AgentDownloads.tsx` — UI with Build/Download buttons
- `packages/dashboard/src/pages/SettingsPage.tsx` — integrates AgentDownloads (already done)
- `releases/agent-windows/` — win-gui ZIP + win-unpacked dir
- `releases/agent-headless/` — win-exe + linux-bin
- `releases/agent-script/` — script-js + script-pkg zip
