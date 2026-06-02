<div align="center">

# ⚡ AiRemote

**Open-source remote access platform with a built-in AI Agent**  
**منصة وصول عن بُعد مفتوحة المصدر مع AI Agent مدمج**

[![TypeScript](https://img.shields.io/badge/TypeScript-5.4-3178C6?logo=typescript&logoColor=white)](https://typescriptlang.org)
[![Node.js](https://img.shields.io/badge/Node.js-22+-5FA04E?logo=node.js&logoColor=white)](https://nodejs.org)
[![Fastify](https://img.shields.io/badge/Fastify-4.x-000000?logo=fastify)](https://fastify.dev)
[![React](https://img.shields.io/badge/React-18-61DAFB?logo=react&logoColor=black)](https://react.dev)
[![Version](https://img.shields.io/badge/version-2.0.0-blueviolet)]()
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Self-hosted](https://img.shields.io/badge/Self--hosted-✓-brightgreen)]()

</div>

---

## What is AiRemote?

AiRemote is a **self-hosted** remote access and system management platform. It combines real-time screen sharing, full remote control (mouse + keyboard), AI-powered command execution, SSH terminal, and file management — all in one open-source solution.

It is a lean, self-hosted alternative to AnyDesk / TeamViewer, extended with an AI layer that no competing tool currently offers.

---

## ✨ Features

### Remote Control (v2.0.0)
| Feature | Description |
|---|---|
| 🖥️ **Screen Streaming** | MJPEG-over-WebSocket, up to 15 FPS, adjustable quality |
| 🖱️ **Mouse Control** | Move, click, right-click, double-click, drag, scroll |
| ⌨️ **Keyboard Control** | All keys + modifier combos (Ctrl+C, Alt+F4, etc.) |
| 📋 **Clipboard Sync** | Read/write remote clipboard, bidirectional |
| 🖥️ **Multi-monitor** | Switch between monitors in real-time |
| 🔒 **Privacy Mode** | Blank the remote screen during a session |
| 📹 **Session Recording** | Record session to WebM video download |
| 📡 **Latency Display** | RTT ping-pong — color-coded connection quality |
| ⏱️ **Idle Timeout** | Auto-warning after 5 min of inactivity |

### Platform Support
| Feature | Linux | macOS | Windows |
|---|---|---|---|
| Screen capture | scrot / ImageMagick / xwd | screencapture | PowerShell GDI |
| Mouse control | xdotool | cliclick / osascript | user32.dll |
| Keyboard control | xdotool | osascript | SendKeys |
| Clipboard | xclip / xsel | pbcopy/pbpaste | Set-Clipboard |
| Multi-monitor | xrandr | system_profiler | Screen.AllScreens |
| Privacy mode | xrandr brightness | system sleep | LockWorkStation |

### Management
| Feature | Description |
|---|---|
| 🤖 **AI Agent** | Chat in Arabic or English — executes shell commands with one click |
| 🔌 **SSH Terminal** | Full browser-based terminal with xterm.js (256-color, resize, fullscreen) |
| 📊 **Real-time Monitoring** | Live CPU / RAM / Disk / Network charts |
| 📁 **File Manager** | Browse, upload, download, rename, delete from the browser |
| 🔔 **Alert Rules** | CPU/RAM/Disk thresholds with webhook notifications |
| 👥 **Multi-user** | Role-based access: Admin / Manager / Viewer |
| 🌍 **Arabic + English** | Full bilingual UI with instant switching |
| 🔐 **2FA** | Optional TOTP-based two-factor authentication |

---

## 🏗️ Architecture

```
Browser (React Dashboard :5000)
        │  REST API + WebSocket
        ▼
AiRemote Server (Fastify :3001)
  ├── REST API   — Auth · Devices · Users · Sessions · AI · Settings · Downloads
  ├── WS /agent  — Agent relay + capabilities registry
  ├── WS /ws     — Real-time stats broadcast
  ├── WS /screen — MJPEG stream + remote control relay (v2.0.0)
  ├── WS /pty    — PTY shell sessions
  └── LibSQL DB  — users · devices · sessions · audit_log · alert_rules
        │  WebSocket (Agent Protocol)
        ▼
AiRemote Agent  (runs on each remote device)
  ├── Registers with device token + full v2.0.0 capabilities
  ├── Sends heartbeat + stats every 4s
  ├── Screen capture (MJPEG frames)
  ├── Mouse + keyboard + clipboard control
  ├── PTY shell / SSH tunnels
  └── File system operations
```

---

## 🚀 Quick Start

### Development (pnpm)

```bash
git clone https://github.com/yourusername/airemote.git
cd airemote
pnpm install

# Terminal 1 — Server
pnpm --filter @airemote/shared build && pnpm --filter @airemote/ai-engine build
cd packages/server && pnpm dev    # http://localhost:3001

# Terminal 2 — Dashboard
cd packages/dashboard && pnpm dev  # http://localhost:5000

# Terminal 3 — Agent (on remote device)
cd packages/agent && pnpm dev
```

### Docker (coming soon)
```bash
docker compose up -d
```

---

## 📦 Repository Structure

```
/
├── packages/
│   ├── server/       ← Fastify API + WebSocket relay (Node.js 22)
│   ├── dashboard/    ← React 18 + TailwindCSS SPA
│   ├── agent/        ← Cross-platform device agent (v2.0.0)
│   ├── ai-engine/    ← OpenAI / Anthropic / Google AI abstraction
│   └── shared/       ← Shared TypeScript types + message protocol
└── releases/         ← Built agent binaries
```

---

## 🤖 Installing the Agent

```bash
# 1. Create a device in the Dashboard to get a token
# 2. On the remote device:
git clone <repo> && cd airemote
pnpm install
# Set SERVER_URL and DEVICE_TOKEN in packages/agent/.env
pnpm --filter @airemote/agent dev
```

**Linux prerequisites:**
```bash
sudo apt install scrot xdotool xclip imagemagick
```

**macOS prerequisites:**
```bash
brew install cliclick   # optional — enhanced mouse control
# Grant Accessibility permissions in System Preferences
```

---

## ⚙️ Environment Variables

| Variable | Default | Description |
|---|---|---|
| `PORT` | `3001` | Server port |
| `JWT_SECRET` | *(required)* | Secret for JWT signing |
| `DATABASE_URL` | `file:./data/airemote.db` | LibSQL connection string |
| `LOG_LEVEL` | `info` | Logging level |

> **AI API keys** (OpenAI, Anthropic, Gemini) are configured per-user in the Dashboard Settings.

---

## 🛡️ Security

- JWT access tokens + rotating refresh tokens
- Passwords hashed with bcrypt (cost factor 12)
- Role-based access control on all API routes
- Agent command execution with security pattern blocklist
- All remote control events authenticated via session ticket
- Server-side session tracking with full audit log

---

## 🤝 Contributing

Pull requests are welcome. For major changes, please open an issue first.

1. Fork the repo
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes
4. Push and open a Pull Request

---

## 📄 License

[MIT](LICENSE) — Free for personal and commercial use.

---

<div align="center">
  Built with ❤️ · TypeScript · Fastify · React · WebSocket · v2.0.0
</div>
