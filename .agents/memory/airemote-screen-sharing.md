---
name: AiRemote Screen Sharing
description: v1.6.0 screen sharing implementation — MJPEG-over-WebSocket, multi-platform agent capture, /screen WS endpoint
---

## Architecture
- Protocol: MJPEG-over-WebSocket (not WebRTC — no STUN/TURN needed)
- Tunnel path: agent → WS /ws → agentHandler → registry → /screen WS → dashboard canvas

## Key Files
- `packages/agent/src/system/screenCapture.ts` — multi-platform JPEG capture
- `packages/server/src/ws/screenHandler.ts` — /screen WS endpoint, auth + throttle
- `packages/server/src/ws/registry.ts` — ScreenSession + 8 helper methods
- `packages/dashboard/src/components/ScreenViewer.tsx` — canvas renderer + controls

## Message Types (in messages.ts)
- server:screen_start, server:screen_stop (server → agent)
- agent:screen_frame, agent:screen_closed, agent:screen_error, agent:screen_unavailable (agent → server)
- screen:frame, screen:error, screen:closed, screen:unavailable (server → dashboard)

## Critical Decisions
- agentHandler routes frame by `p.sessionId` via `getScreenSession(sessionId)` — NOT by socket lookup
- /screen endpoint does NOT use requireAuthWs preHandler — auth is inside handleScreenWebSocket
- FPS throttle: max 15fps, implemented as closure stored in ScreenSession.frameThrottle
- Connect timeout: 15s — if agent doesn't respond, close session

## Platform Capture Backends (Linux preference order)
1. scrot (preferred — lightest)
2. import from ImageMagick
3. xwd + convert (fallback)
- macOS: screencapture -x (built-in)
- Windows: PowerShell + System.Drawing (no install needed)

**Why:** node-pty can't compile in Nix; no ffmpeg dependency wanted; PowerShell available everywhere on Windows.

## Tab in Dashboard
- Tab id: 'screen', icon: Tv2 (lucide), disabled when device offline
- i18n keys: tab_screen: 'الشاشة' / 'Screen'
- overflow-hidden condition includes 'screen' tab
