# @airemote/agent

AiRemote Agent v2.0.0 — cross-platform device-side service that connects to the AiRemote Server and exposes full remote access capabilities.

## Features

| Feature | Linux | macOS | Windows |
|---------|-------|-------|---------|
| Screen streaming (MJPEG/WS) | ✅ scrot/import/xwd | ✅ screencapture | ✅ PowerShell GDI |
| Mouse control | ✅ xdotool | ✅ cliclick/osascript | ✅ user32.dll |
| Keyboard control | ✅ xdotool | ✅ osascript | ✅ SendKeys |
| Clipboard sync | ✅ xclip/xsel | ✅ pbcopy/pbpaste | ✅ Set-Clipboard |
| Multi-monitor | ✅ xrandr | ✅ system_profiler | ✅ Screen.AllScreens |
| Privacy mode | ✅ xrandr brightness | ✅ system sleep | ✅ LockWorkStation |
| PTY shell | ✅ | ✅ | ✅ (PowerShell/cmd) |
| SSH tunnel | ✅ | ✅ | ✅ |
| File manager | ✅ | ✅ | ✅ |
| Command execution | ✅ | ✅ | ✅ |

## Prerequisites

### Linux
```bash
sudo apt install scrot xdotool xclip     # Debian/Ubuntu
sudo dnf install scrot xdotool xclip     # Fedora
# imagemagick is optional (resize support for scrot output)
sudo apt install imagemagick
```

### macOS
```bash
brew install cliclick  # Optional — enhanced mouse control
# pbcopy/pbpaste and screencapture are built-in
# Grant accessibility permissions in System Preferences → Security
```

### Windows
No additional installs needed — uses built-in PowerShell and Win32 APIs.

## Installation

```bash
pnpm install
```

## Development

```bash
pnpm dev    # tsx watch — hot reload
```

## Production Build

```bash
pnpm build  # TypeScript → dist/
```

## Packaged Binary (headless)

```bash
# Build headless binary for the current platform
node build.mjs --headless

# Build Windows GUI (cross-platform, creates ZIP)
node build.mjs --win-gui
```

Outputs land in `releases/`:
- `releases/agent-headless/agent-<platform>`
- `releases/agent-win-gui/AiRemote-Agent-Win.zip`

## Configuration

The agent reads from a `.env` file (or environment variables):

| Variable | Description | Default |
|----------|-------------|---------|
| `SERVER_URL` | WebSocket URL of the server | `ws://localhost:3001` |
| `DEVICE_TOKEN` | Device registration token | — |
| `LOG_LEVEL` | `debug` \| `info` \| `warn` | `info` |

## Message Protocol

The agent communicates over WebSocket with the server using a JSON message protocol defined in `@airemote/shared`.

### Agent → Server messages
| Type | Description |
|------|-------------|
| `agent:register` | Registration with token + capabilities |
| `agent:heartbeat` | Stats + full v2.0.0 capabilities every 4s |
| `agent:screen_frame` | JPEG frame (base64) |
| `agent:screen_monitors` | Monitor list response |
| `agent:screen_clipboard` | Clipboard content response |
| `agent:screen_control_ack` | Control event acknowledgement |
| `agent:pty_opened/data/closed/error` | PTY session events |
| `agent:ssh_opened/data/closed/error` | SSH tunnel events |
| `agent:fs_result` / `agent:fs_chunk` | File system responses |
| `agent:command_result` | Command execution result |

### Server → Agent messages
| Type | Description |
|------|-------------|
| `server:screen_start` | Start screen capture |
| `server:screen_stop` | Stop screen capture |
| `server:screen_mouse` | Mouse event (move/click/scroll) |
| `server:screen_key` | Keyboard event |
| `server:screen_clipboard_read` | Read clipboard |
| `server:screen_clipboard_write` | Write clipboard |
| `server:screen_get_monitors` | List monitors |
| `server:screen_set_monitor` | Switch active monitor |
| `server:screen_privacy` | Enable/disable privacy mode |

## Security

- All commands pass through a blocklist in `executor.ts` (prevents rm -rf, format, etc.)
- The agent only connects to the configured server URL
- Authentication is token-based (set in server dashboard)
- Screen capture requires an active authenticated session
