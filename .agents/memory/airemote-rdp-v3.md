---
name: AiRemote Remote Desktop v3.0.0
description: v3.0.0 features — frame dedup, 30fps, adaptive quality, permission consent, drag & drop upload, agent build flags
---

## Features added in v3.0.0

### Frame Deduplication (agent.ts)
- `computeFrameHash(buffer)` — samples 32 bytes at equal intervals for O(1) per-frame hash
- Skip sending frame if hash equals previous hash, unless it's a forced keyframe (every 60 captures)
- ~80% bandwidth saving on idle screens

### MAX_FPS 30 (screenHandler.ts)
- `MAX_FPS = 30`, `intervalMs = Math.max(33, 1000/fps)` (was 15fps / 66ms)
- ScreenViewer.tsx quality preset array includes `{ label: 'عالي الأداء', fps: 30, quality: 85 }`

### Adaptive Quality (ScreenViewer.tsx)
- `adaptiveMode` state + toggle in settings panel
- useEffect watches `latency` state (from ping-pong every 3s via `presetRef` to avoid stale closure)
- Logic: latency > 350ms → fps - 3; latency > 180ms → fps - 2; latency < 60ms → fps + 2 (cap 15)
- Auto-sends `screen:set_quality` to server on adjustment

### Permission Consent (all layers)
- `permissionState: 'idle' | 'requesting' | 'granted'` in ScreenViewer
- Shield button → sends `screen:request_control { requestId }` → server relays `server:screen_control_request` to agent
- Agent auto-grants (unattended mode) → `agent:screen_control_granted` → agentHandler routes as `screen:control_granted`
- 3s fallback timer in dashboard (catches high-latency scenarios)
- WS message types added in `packages/shared/src/types/messages.ts`

### Drag & Drop Upload (ScreenViewer.tsx)
- `ondragover` → sets `dragOver=true` overlay; `onDrop` → calls `POST /api/devices/:id/fs/upload`
- Uploads only when `controlEnabled` is true
- Path hardcoded to `/Desktop`; server multipart endpoint already existed in fsRoutes

## Agent build flags (CRITICAL)
```bash
cd packages/agent && node_modules/.bin/esbuild src/index.ts \
  --bundle --platform=node --target=node18 \
  --external:electron --external:systray2 \
  --external:cpu-features --external:*.node \
  --outfile=../../releases/agent-script/agent-v2.0.0.js
```
- `--external:cpu-features` required — ssh2 pulls in cpu-features which has a native `.node` binary
- `--external:*.node` catches any other native binaries
- Output: ~917KB

**Why:** esbuild cannot bundle native `.node` files. Without these flags the build fails with `Could not resolve "../build/Release/cpufeatures.node"`.

**How to apply:** Always use these flags for future agent script builds.
