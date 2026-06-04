---
name: AiRemote screen-sharing bugs
description: Four interlocking bugs that caused frozen/no-update remote desktop streaming; fixes applied.
---

# Screen Sharing Bugs & Fixes

**Why:** These bugs were non-obvious because each one alone might not freeze the screen, but together they cause permanent stream failure after any quality/monitor change.

## Bug 1 — agent `stopScreenCapture` sends `agent:screen_closed` on internal restart (CRITICAL)
`handleScreenStart` called `stopScreenCapture(sessionId)` before restarting capture for a quality/monitor change. `stopScreenCapture` sent `agent:screen_closed` to the server → server removed the session from registry → all new frames were silently dropped forever.

**Fix:** Added `clearScreenTimer(sessionId)` that only clears the setInterval without sending the closed message. `handleScreenStart` now calls `clearScreenTimer`; only `stopScreenCapture` (called from `server:screen_stop`) sends `agent:screen_closed`.

## Bug 2 — Dashboard `lastSeqRef` not reset after quality/monitor change (CRITICAL)
When the agent restarts capture for a quality change, it resets `seq` to 0. But the dashboard's `lastSeqRef.current` still held the old value (e.g. 150). The seq guard `if (seq <= lastSeqRef.current && seq !== 0)` then dropped every frame with seq 1..149. Only seq=0 (which has a `seq !== 0` bypass) got through.

**Fix:** Reset `lastSeqRef.current = -1` in `applyPreset`, `selectMonitor`, and the adaptive quality effect, before sending the restart command.

## Bug 3 — `MAX_SKIP_MS = 1500` too long (SECONDARY)
Frame deduplication fallback timer was 1.5s — screen could appear frozen for 1.5 seconds on any slow motion or subtle change.

**Fix:** Reduced to `200ms` so the screen refreshes within one frame interval even if dedup hashes match.

## Bug 4 — `stopScreenCapture` was modifying `screenMonitorId` in `handleScreenStart` path (MINOR)
When `clearScreenTimer` is called, `screenMonitorId` is set correctly from the new `monitorId` param. The old code deleted it inside `stopScreenCapture`, which then had to be re-set.

**Fix:** `stopScreenCapture` still deletes `screenMonitorId` (correct for actual stop); `clearScreenTimer` does not touch it.

## Files changed
- `packages/agent/src/agent.ts` — `clearScreenTimer`, `handleScreenStart`, `stopScreenCapture`, `MAX_SKIP_MS`
- `packages/dashboard/src/components/ScreenViewer.tsx` — `applyPreset`, `selectMonitor`, adaptive quality effect
