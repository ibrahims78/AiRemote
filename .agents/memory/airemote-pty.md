---
name: AiRemote PTY Terminal
description: PTY direct terminal tunnel — architecture, constraints, and build notes for v1.2.0
---

## Rule
PTY uses `child_process.spawn` (NOT node-pty). This is intentional — node-pty requires native module rebuild which breaks `pkg` and `electron-builder`.

**Why:** node-pty is a native addon; pkg cannot bundle it portably. spawn works cross-platform and with packagers.

**How to apply:** Any future PTY enhancements must stay within child_process.spawn. If real PTY emulation is needed, node-pty would require a separate external process or bundling strategy.

## Architecture
```
Dashboard xterm.js → /pty WS (JWT auth) → Server ptyHandler → Agent WS message → spawn(shell)
```
- `/pty` endpoint is separate from `/ws` and `/ssh`
- Sessions recorded in `sessions` DB table (type='pty'); INSERT in try/catch to handle schema variations
- Agent sends capabilities `{ pty, ssh, sftp }` in register/heartbeat payloads

## Build Order Constraint
When changing `packages/shared/src/types/messages.ts`, MUST rebuild shared before server:
1. `cd packages/shared && pnpm build`
2. `cd packages/server && pnpm build`

## Release Binary
- Built with `@yao-pkg/pkg@6.14.2` at `/home/runner/workspace/.config/npm/node_global/bin/pkg`
- Target: `node18-win-x64`
- Output: `releases/agent-headless/AiRemote-Agent-Headless-v1.2.0-Windows-x64.exe` (42MB)
- Run: `cd packages/headless-agent && /home/runner/workspace/.config/npm/node_global/bin/pkg . --target node18-win-x64 --output dist/filename.exe`

## Files Tab vs Terminal Tab
- **Terminal tab** → PTYTerminal component, no SSH credentials needed
- **Files tab** → SSH/SFTP credential flow, unchanged
- `useEffect` auto-connect in DeviceWorkspacePage only triggers for `tab === 'files'`
