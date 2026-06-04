---
name: Screen sharing freeze fix
description: Root causes of "screen sharing connected but no real-time updates" bug and what was done to fix it
---

## Root Causes

### 1 — Hash-based frame deduplication (affects all platforms)
`computeFrameHash` sampled only 128 bytes out of the JPEG buffer starting at byte 300.
JPEG at a fixed quality level produces very similar byte sequences at the sampled
positions for similar frames → hash collision → frame dropped even when screen changed.
`MAX_SKIP_MS=200ms` forced one frame per 200 ms (5 fps max) but felt "frozen".

**Fix:** Removed `computeFrameHash`, `prevHash`, `framesSinceKeyframe`, `idleFrames`,
`MAX_SKIP_MS`, `KEYFRAME_EVERY` entirely from `handleScreenStart` in `agent.ts`.
Every captured frame is now forwarded. Rate limiting relies on the FPS interval +
server-side throttle only.

### 2 — PowerShell spawned per frame on Windows
Each frame called `execFileAsync('powershell.exe', ...)` which incurs 1-3 s startup
(CLR init + assembly loading). At a 33 ms capture interval the concurrency guard
(`if (capturing) return`) caused almost every tick to skip → effective FPS ≈ 0.2-0.5.

**Fix:** Persistent PowerShell process in `screenCapture.ts`.
- `PS_LOOP_SCRIPT`: PS script that loads .NET assemblies once then loops reading
  stdin commands (`quality|maxWidth|monX|monY|monW|monH|outFile`) and writes
  "OK" / "ERR:..." to stdout.
- `ensurePsProcess()`: spawns once, reuses across frames, auto-restarts on death.
- `captureWithPersistentPs()`: writes command, awaits stdout line, 6s safety timeout.
- Falls back to `captureWithSingleShotPs()` if persistent process fails.

### 3 — intervalMs could be 33 ms (too tight for slow capture tools)
`intervalMs = Math.max(33, ...)` allowed 33 ms intervals. If any capture tool takes
longer than 33 ms the concurrency guard fires continuously.

**Fix:** Floor raised to `Math.max(100, ...)` — gives capture tools breathing room
while still allowing up to 10 fps from the interval itself (actual FPS is the
minimum of interval FPS and capture tool speed).

## Files Changed
- `packages/agent/src/agent.ts` — `handleScreenStart` simplified (dedup removed)
- `packages/agent/src/system/screenCapture.ts` — persistent PS process added
- `releases/agent-script/agent-v3.0.0.js` — rebuilt with esbuild
- `releases/agent-headless/AiRemote-Agent-v3.0.0-linux-x64` — rebuilt with pkg
- `releases/agent-script/agent-script-v3.0.0.zip` — updated ZIP

**Why:** Dedup caused false "screen frozen" experience; persistent PS gives
10-20× faster frame capture on Windows.

**How to apply:** Whenever touching agent screen capture, NEVER add hash-based
dedup back without testing extensively on both platforms. Always rebuild releases
after agent changes.
