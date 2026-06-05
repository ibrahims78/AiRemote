---
name: Multi-viewer screen sharing + delta frames + Xvfb
description: Architecture decisions for multi-viewer WS registry, delta frame rendering, Linux headless support, and viewer count badge.
---

## Multi-viewer registry
- `ScreenSession.dashboardSockets` is a `Set<WebSocket>` (not a single socket).
- `deviceScreenSessions` map: `deviceId → agentSessionId` (one capture loop per device regardless of viewer count).
- `addScreenSession()` returns `{agentSessionId, isNew}` — callers use `isNew` to decide whether to send `server:screen_start` to agent.
- `sendToScreenViewers(agentSessionId, msg)` broadcasts to all sockets in the Set.
- `removeViewerFromScreenSession()` returns `true` when last viewer leaves → caller triggers cleanup.

**Why:** A single agent capture loop is started per device; new viewers join an existing session. This avoids duplicate capture loads on the agent.

## Delta frames (Windows)
- PS script in screenCapture.ts samples a 16×16 grid between frames.
- If <60% cells changed AND bounding box <60% of screen → crops changed region, saves JPEG, outputs `DELTA:fullW,fullH,dx,dy,dw,dh`.
- `ScreenFrame.width/height` = FULL screen dimensions even for deltas (so canvas size never regresses).
- `ScreenFrame.deltaRegion?` = `{x,y,w,h}` crop coords in full-screen space.
- Agent sends `deltaRegion` in `agent:screen_frame` payload; `keyframe = !deltaRegion`.
- `drawDeltaFrame(base64, delta)` in ScreenViewer.tsx stamps the JPEG at `(delta.x, delta.y)` using `ctx.drawImage(bmp, delta.x, delta.y)` — no canvas resize, no full clear.

**Why:** Saves 40–80% bandwidth on static/mostly-static screens (text editing, terminals).

## Xvfb headless Linux
- `tryStartXvfb()` in screenCapture.ts: checks if `Xvfb` binary exists, spawns `Xvfb :99 -screen 0 1920x1080x24`, polls display readiness up to 2s, sets `process.env.DISPLAY = ':99'`.
- Called at agent startup on Linux when `process.env.DISPLAY` is unset.

## Viewer count badge
- Server emits `{type:'screen:viewer_count', payload:{count}}` to all viewers whenever count changes.
- `ScreenViewer.tsx` state: `viewerCount` (reset to 1 on each new `connect()` call).
- Badge shown in toolbar only when `viewerCount > 1` (indigo pill with Eye icon).
