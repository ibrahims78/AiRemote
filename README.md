<div align="center">

# ⚡ AiRemote

**Open-source remote access platform with a built-in AI Agent**  
**منصة وصول عن بُعد مفتوحة المصدر مع AI Agent مدمج**

[![TypeScript](https://img.shields.io/badge/TypeScript-5.4-3178C6?logo=typescript&logoColor=white)](https://typescriptlang.org)
[![Node.js](https://img.shields.io/badge/Node.js-20+-5FA04E?logo=node.js&logoColor=white)](https://nodejs.org)
[![Fastify](https://img.shields.io/badge/Fastify-4.x-000000?logo=fastify)](https://fastify.dev)
[![React](https://img.shields.io/badge/React-18-61DAFB?logo=react&logoColor=black)](https://react.dev)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Self-hosted](https://img.shields.io/badge/Self--hosted-✓-brightgreen)]()

</div>

---

## What is AiRemote?

AiRemote is a **self-hosted** remote access and system management platform that combines the power of SSH terminal access, real-time monitoring, and file management — with a built-in **AI Agent** that understands commands in both **Arabic and English** and executes them directly on remote devices.

It is a lean, open-source alternative to TeamViewer / AnyDesk, extended with an AI layer that no competing tool currently offers.

---

## ✨ Features

| Feature | Description |
|---|---|
| 🤖 **AI Agent** | Chat in Arabic or English — AI translates to shell commands and executes them with one click |
| 🖥️ **SSH Terminal** | Full browser-based terminal with xterm.js (256-color, resize, fullscreen) |
| 📊 **Real-time Monitoring** | Live CPU / RAM / Disk / Network charts via WebSocket |
| 📁 **File Manager (SFTP)** | Browse, upload, download, rename, delete — all from the browser |
| 🔗 **Agent WebSocket** | Lightweight agent on each remote device — no open ports required |
| 👥 **Multi-user** | Role-based access: Admin / Manager / Viewer |
| 🌍 **Arabic + English** | Full bilingual UI with instant language switching |
| 🔒 **Self-hosted** | Your data, your server — no cloud dependency |
| 🐳 **Docker Ready** | One-command deployment with Docker Compose |

---

## 🏗️ Architecture

```
Browser (React Dashboard :5000)
        │  REST API + WebSocket
        ▼
AiRemote Server (Fastify :3001)
  ├── REST API  — Auth · Devices · Users · Sessions · SFTP · AI · Settings
  ├── WebSocket /ws  — Agent relay · Real-time stats broadcast
  ├── WebSocket /ssh — Browser-to-device SSH proxy
  └── SQLite DB  — users · devices · sessions · refresh_tokens · ai_conversations
        │  WebSocket (Agent Protocol)
        ▼
AiRemote Agent  (runs on each remote device)
  ├── Registers with device token
  ├── Sends heartbeat + stats every 10s
  └── Executes shell commands, returns results
```

---

## 🚀 Quick Start

### Option 1 — Docker (Recommended)

```bash
git clone https://github.com/yourusername/airemote.git
cd airemote

# Edit JWT_SECRET before running
cp packages/server/src/.env.example .env
docker compose -f docker/docker-compose.yml up -d
```

Open `http://localhost` in your browser and complete the first-run setup.

### Option 2 — Development (pnpm)

```bash
git clone https://github.com/yourusername/airemote.git
cd airemote

pnpm install

# Terminal 1 — Backend
pnpm dev:server        # http://localhost:3001

# Terminal 2 — Dashboard
pnpm dev:dashboard     # http://localhost:5000
```

---

## 📦 Repository Structure

```
/                            ← Project root
├── packages/
│   ├── server/              ← Fastify API + WebSocket relay
│   ├── dashboard/           ← React + TailwindCSS SPA
│   ├── agent/               ← Node.js agent with system tray
│   ├── agent-desktop/       ← Electron Windows wrapper
│   ├── ai-engine/           ← OpenAI / Gemini / Ollama abstraction
│   ├── shared/              ← Shared TypeScript types
│   ├── headless-agent/      ← Lightweight headless agent (no UI)
│   └── script-agent/        ← Minimal script-only agent (.bat / .js)
├── docker/                  ← Docker Compose & Dockerfile
└── releases/                ← Built agent binaries (Windows / Headless / Script)
```

---

## 🤖 Installing the Agent on Remote Devices

### Option A — Node.js Agent (Full, with system tray)

```bash
# 1. Create a device in the Dashboard to get a token
# 2. On the remote device:
git clone ... && cd airemote/airemote
pnpm install
cp packages/agent/src/.env.example packages/agent/.env
# Set SERVER_URL and DEVICE_TOKEN in the .env file
pnpm --filter @airemote/agent start
```

### Option B — Headless Agent (Windows / Linux, no UI)

Download the pre-built binary from `releases/agent-headless/`, or run:

```bash
cd airemote/packages/headless-agent
# Set serverUrl and token in agent.js or pass as env vars
node agent.js
```

### Option C — Script Agent (Minimal, no dependencies)

```bash
cd airemote/packages/script-agent
# Edit config.json with your serverUrl and token
node airemote-agent.js
# Windows: double-click start.bat
```

---

## ⚙️ Environment Variables

| Variable | Default | Description |
|---|---|---|
| `PORT` | `3001` | Server port |
| `HOST` | `0.0.0.0` | Server bind address |
| `JWT_SECRET` | *(required in prod)* | Secret for JWT signing |
| `DB_PATH` | `./data/airemote.db` | SQLite database file path |
| `NODE_ENV` | `development` | Environment mode |
| `LOG_LEVEL` | `info` | Logging level |

> **AI API keys** (OpenAI, Gemini) are entered per-user in the Dashboard Settings — never stored in environment variables.

---

## 🛡️ Security

- JWT access tokens (15 min expiry) + rotating refresh tokens (30 days)
- Passwords hashed with bcrypt (cost factor 12)
- Role-based access control on all API routes
- Agent command execution with security pattern blocking
- All SSH/SFTP connections are proxied server-side — credentials never reach the browser's local storage

---

## 🤝 Contributing

Pull requests are welcome. For major changes, please open an issue first to discuss what you would like to change.

1. Fork the repo
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes
4. Push and open a Pull Request

---

## 📄 License

[MIT](LICENSE) — Free for personal and commercial use.

---

<div align="center">
  Built with ❤️ · TypeScript · Fastify · React · WebSocket
</div>
