# @airemote/server

AiRemote Server v2.0.0 — Fastify-based management server that relays WebSocket connections between remote agents and the dashboard.

## Architecture

```
Dashboard (Browser) ←── WS /screen ──→ Server ←── WS /agent ──→ Agent (Remote Device)
                    ←── REST /api  ──→        ←── WS /pty   ──→
                    ←── WS /ws    ──→
```

## Stack

- **Runtime**: Node.js 22 + TypeScript
- **Framework**: Fastify 4.x
- **Database**: LibSQL (SQLite via @libsql/client)
- **WebSocket**: `ws` + `@fastify/websocket`
- **Auth**: JWT (`@fastify/jwt`) + bcrypt + optional TOTP (2FA)
- **AI**: `@airemote/ai-engine` (OpenAI / Anthropic / Google)

## Setup

```bash
pnpm install
cp .env.example .env  # Edit with your secrets
pnpm dev
```

### Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `JWT_SECRET` | Secret for signing JWT tokens | ✅ |
| `PORT` | Server port | Default: `3001` |
| `DATABASE_URL` | LibSQL connection string | Default: `file:./airemote.db` |
| `OPENAI_API_KEY` | OpenAI key for AI chat | Optional |
| `ANTHROPIC_API_KEY` | Anthropic key for AI chat | Optional |
| `GEMINI_API_KEY` | Google Gemini key for AI chat | Optional |

## API Reference

### Authentication
| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/auth/login` | Login with email + password |
| POST | `/api/auth/register` | Create account |
| POST | `/api/auth/2fa/verify` | Verify TOTP code |
| GET | `/api/auth/me` | Current user info |

### Devices
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/devices` | List all devices |
| POST | `/api/devices` | Register new device |
| GET | `/api/devices/:id` | Device details + capabilities |
| DELETE | `/api/devices/:id` | Remove device |
| GET | `/api/devices/:id/stats` | Stats history |
| POST | `/api/devices/:id/exec` | Execute shell command |
| POST | `/api/devices/:id/fs` | File system operations |

### Screen Sessions (v2.0.0)
Accessed over WebSocket:
```
WS /screen?deviceId=<id>&token=<jwt>&fps=5&quality=65
```
| Message | Direction | Description |
|---------|-----------|-------------|
| `screen:frame` | Server → Dashboard | MJPEG frame |
| `screen:mouse_event` | Dashboard → Server | Mouse input |
| `screen:key_event` | Dashboard → Server | Keyboard input |
| `screen:clipboard_read/write` | Dashboard → Server | Clipboard sync |
| `screen:get_monitors` | Dashboard → Server | List monitors |
| `screen:set_monitor` | Dashboard → Server | Switch monitor |
| `screen:privacy` | Dashboard → Server | Privacy mode |
| `screen:ping` / `screen:pong` | Bidirectional | RTT latency |
| `screen:set_quality` | Dashboard → Server | Change FPS/quality |

### AI Chat
| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/ai/chat` | Single-turn AI message |
| POST | `/api/ai/chat/stream` | SSE streaming AI response |

### Alerts & Notifications
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/alerts/rules` | List alert rules |
| POST | `/api/alerts/rules` | Create alert rule |
| GET | `/api/alerts/history` | Alert history |

## WebSocket Endpoints

| Path | Protocol | Description |
|------|----------|-------------|
| `/agent` | Agent WS | Agent ↔ Server relay |
| `/ws` | Client WS | Dashboard ↔ Server relay |
| `/screen` | Screen WS | Screen streaming + remote control |
| `/pty` | PTY WS | Terminal session |

## Database Schema

Tables: `users`, `devices`, `device_stats_history`, `sessions`, `audit_log`, `alert_rules`, `alert_history`, `settings`

Migrations run automatically on startup.

## Production Build

```bash
pnpm build  # TypeScript → dist/
pnpm start  # Run built server
```
