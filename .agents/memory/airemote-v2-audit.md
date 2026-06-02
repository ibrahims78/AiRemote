---
name: AiRemote v2.0.0 Audit Fixes
description: 12 bugs fixed during comprehensive audit; key patterns to not repeat
---

## Critical Patterns Fixed

**Windows PowerShell from Node.js:**
Never use `execAsync(`powershell.exe -Command "${ps.replace(/"/g, '\\"')}"`)` — the `@"..."@` here-string syntax breaks with quote escaping.
Always use: `execFileAsync('powershell.exe', ['-NonInteractive', '-NoProfile', '-WindowStyle', 'Hidden', '-Command', ps])`.

**Why:** The shell escape approach replaces `"` with `\"` which corrupts the heredoc delimiter `"@` into `\"@`, breaking all multi-line PS scripts.

**Clipboard write across platforms:**
Never use `echo 'text' | xclip` — breaks with newlines, backticks, and special chars.
Use: `spawn('xclip', ['-selection', 'clipboard'])` + write to stdin.
Windows: base64-encode content → `[System.Convert]::FromBase64String(...)` in PS.

**cliclick macOS mouse button down/up:**
`kd:` and `ku:` are KEYBOARD commands in cliclick (not mouse).
Mouse button down/up = `dd:x,y` / `du:x,y`.

**scrot resize:**
scrot has no built-in resize. Add post-process: `convert "${file}" -resize ${maxWidth}x\> -quality ${q} "${file}"`.
Use `\>` geometry (shrink-only). Falls back silently if ImageMagick not installed.

**AgentCapabilities propagation:**
Both registration (agentHandler.ts caps object) AND heartbeat (agent.ts startHeartbeat) must include all v2.0.0 fields: screenControl, clipboard, multiMonitor, monitors. Missing from either breaks the dashboard capability display.

**WSMessageType completeness:**
Any message type used anywhere in the codebase must be in the shared WSMessageType union. Check broadcast:notification, screen:ping, screen:pong.

**How to apply:**
Any time you add a new Windows control feature, use execFileAsync pattern.
Any time you add a new agent capability, add to BOTH registration caps AND heartbeat payload.
Any time you add a new WS message type, add to shared/types/messages.ts union first.
