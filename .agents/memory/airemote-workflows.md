---
name: AiRemote Workflow Setup
description: How the two Replit workflows are configured for AiRemote development
---

**Server Workflow:**
- Name: "AiRemote Server"
- Command: `cd airemote/packages/server && node dist/index.js`
- Port: 3001
- outputType: "console"
- Must rebuild (npm run build) before restarting when src files change

**Dashboard Workflow:**
- Name: "AiRemote Dashboard"  
- Command: `cd airemote/packages/dashboard && pnpm dev`
- Port: 5000 (set in both package.json script AND vite.config.ts)
- outputType: "webview"

**Vite Proxy Config** (vite.config.ts):
- `/api` → `http://localhost:3001`
- `/ws` → `ws://localhost:3001` (ws: true)
- `/ssh` → `ws://localhost:3001` (ws: true) — for SSH terminal WebSocket

**Why:** Replit webview requires port 5000 for the visible preview. The dashboard originally had port 5173 hardcoded in the npm script, overriding vite.config.ts — must change both.
