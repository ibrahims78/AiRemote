---
name: Screen sharing freeze fix
description: Root causes of "screen sharing connected but no real-time updates" bug and what was done to fix it
---

## Root Causes (agent source v3.1.0)

### 1 — Hash-based frame deduplication
`computeFrameHash` sampled only 128 bytes — hash collisions caused frames to be dropped even when screen changed. `MAX_SKIP_MS=200ms` forced 5 fps max.

**Fix:** Removed dedup entirely from `handleScreenStart` in `agent.ts`. Every captured frame forwarded.

### 2 — PowerShell spawned per frame on Windows
Each frame called `execFileAsync('powershell.exe', ...)` — 1-3s startup per frame.

**Fix:** Persistent PowerShell process in `screenCapture.ts` (`ensurePsProcess`, `captureWithPersistentPs`).

### 3 — intervalMs too tight (33ms)
**Fix:** Floor raised to `Math.max(100, ...)`.

## Root Causes (v3.2.0 binary, server-side fixes applied)

### 4 — drawId race condition in dashboard (0fps freeze)
At 30fps, `createImageBitmap` (JPEG decode) takes longer than 33ms per frame. New frames kept incrementing `drawSeqRef` faster than decodes completed, so every decode's `drawId < drawSeqRef` check discarded the bitmap — including the `fpsCountRef.current++`. Screen froze at first frame, fps=0.

**Fix:** Added `decodingRef = useRef(false)` — 1-in-flight decode guard in all three paths (binary onmessage, `drawFrame`, `drawDeltaFrame`). If a decode is running, skip the incoming frame entirely instead of starting a stacked decode. `drawId` always equals `drawSeqRef` when the promise resolves → every decoded frame draws.

### 5 — Agent embeds stale session ID in binary frames (0fps on stream restart)
v3.2.0 binary agent stores the session ID from the FIRST `screen:start` it ever receives and never updates it on subsequent stop/start cycles. New viewer sessions get no frames because all frames carry the old session ID — dropped with "no session for X".

**Fix (server `agentHandler.ts`):** Accept optional `deviceId` param. When embedded session ID has no matching session, fall back to `deviceRegistry.getActiveScreenSessionForDevice(deviceId)` and remap silently. Log the remap as a warning.
**Fix (server `handler.ts`):** Pass `connectionId` (deviceId) to `handleAgentBinaryFrame`.

### 6 — Duplicate agent instances send competing stale frames
On reconnect a second agent socket registers for the same deviceId. The old socket is evicted from the registry but its capture loop keeps running — sending frames with its stale session ID indefinitely. Two instances × 0.5fps = 1fps combined; each stream restart creates more zombie capture loops.

**Fix (server `registry.ts` → `registerDevice`):** Before overwriting the device entry, send `screen:stop` to the existing socket if it's still open. This tells the old agent instance to halt its capture loop cleanly.

## Performance Notes
- v3.2.0 binary on Windows captures at ~0.5fps per instance via PS persistent process
- Two instances (duplicate reconnect) = ~1fps visible in dashboard
- 658ms latency observed: Replit proxy + PS capture + JPEG decode
- Bandwidth ~175KB/s at 1fps × ~176KB per 1920×1080 frame

## Files Changed (dashboard/server)
- `packages/dashboard/src/components/ScreenViewer.tsx` — decodingRef + stale watchdog
- `packages/server/src/ws/agentHandler.ts` — session ID remapping + diagnostics
- `packages/server/src/ws/handler.ts` — pass deviceId to binary frame handler
- `packages/server/src/ws/registry.ts` — screen:stop old socket on re-register

**Why:** Never add drawId stale-discard logic that also gates fps counting — count decodes, not draws. Always pass deviceId through to binary frame handlers for fallback routing.
