# AiRemote Server Desktop — خطة التطوير الكاملة
## النسخة 3.2.0 — تطبيق Windows Desktop متكامل

---

## 📌 نظرة عامة على التطبيق

**AiRemote Server Desktop** هو تطبيق Windows سطح مكتب مبني على Electron يجمع بين:
- **سيرفر AiRemote الكامل** (Fastify + better-sqlite3) مع جميع ميزات تطبيق الويب
- **واجهة React Dashboard** المُدمجة كـ UI رئيسية داخل التطبيق
- **ميزات حصرية لـ Windows** (Cloudflare Tunnel، Watchdog، Backup، Tray Icon، Auto-start)

### الهدف
تطبيق واحد قابل للتثبيت على Windows يحل محل تثبيت Node.js + Web Server بالكامل، مع نفس واجهة المستخدم ونفس الميزات بالضبط.

---

## 🏗️ المعمارية التقنية

```
AiRemote Server Desktop (Electron)
│
├── Main Process (main.js)
│   ├── Server Lifecycle (start/stop/restart)
│   ├── Cloudflare Tunnel
│   ├── Watchdog (health checks every 10s)
│   ├── Backup System (scheduled + manual)
│   ├── Tray Icon + Notifications
│   ├── Windows Auto-Start (Registry)
│   └── Desktop IPC Bridge
│
├── Fastify Server (server.js) — port 3001
│   ├── /api/auth       — Login, Setup, 2FA/TOTP, Refresh
│   ├── /api/users      — Users CRUD (admin only)
│   ├── /api/sessions   — Active sessions management
│   ├── /api/devices    — Devices CRUD + WoL + Stats History
│   ├── /api/ai         — Chat, Streaming, Auto-Heal, Conversations
│   ├── /api/alerts     — Alert Rules + Webhooks
│   ├── /api/credentials— SSH Credentials Store
│   ├── /api/sftp       — SFTP File Manager (via SSH2)
│   ├── /api/recordings — Screen Recordings
│   ├── /api/audit      — Audit Log
│   ├── /api/settings   — App Settings
│   ├── /api/github     — GitHub Releases Config + Publish
│   ├── /api/downloads  — Agent Downloads (via GitHub API)
│   ├── /api/desktop    — Desktop-specific Controls
│   ├── /ws             — Main Agent + Dashboard WebSocket
│   ├── /pty            — PTY Terminal WebSocket
│   ├── /ssh            — SSH Tunnel WebSocket
│   └── /screen         — Screen Sharing WebSocket
│
├── React Dashboard (static/) — served by Fastify
│   └── Built from packages/dashboard → embedded as static files
│
└── Renderer Window (renderer/index.html)
    └── Splash screen → redirects to http://localhost:PORT (Dashboard)
```

---

## ✅ قائمة الميزات الكاملة

### 🔐 المصادقة والأمان
- [x] شاشة الإعداد الأول (Admin account creation)
- [x] تسجيل الدخول بـ JWT + Refresh Token (30 يوم)
- [x] 2FA / TOTP بـ QR Code (otplib + qrcode)
- [x] WS Ticket للاتصالات الآمنة بـ WebSocket
- [x] Rate limiting على محاولات تسجيل الدخول
- [x] Audit log لكل العمليات الحساسة

### 🖥️ إدارة الأجهزة
- [x] قائمة أجهزة مع حالة real-time
- [x] إضافة / تعديل / حذف جهاز
- [x] Wake-on-LAN
- [x] Tags تصنيف الأجهزة
- [x] إحصائيات real-time (CPU / RAM / Disk / Network)
- [x] سجل إحصائيات تاريخي مع رسوم بيانية (stats_history)
- [x] قدرات الجهاز (capabilities)

### 💻 التحكم بالأجهزة البعيدة
- [x] PTY Terminal كامل (WebSocket /pty)
- [x] SSH Tunnel (WebSocket /ssh عبر ssh2)
- [x] مشاركة الشاشة Multicast (WebSocket /screen)
- [x] تحكم ماوس وكيبورد
- [x] File Manager مباشر (/api/devices/:id/fs)
- [x] SFTP عبر SSH (/api/sftp)
- [x] نقل ملفات كبيرة chunked

### 🤖 الذكاء الاصطناعي
- [x] AI Chat مع context الجهاز (OpenAI / Gemini / Ollama)
- [x] Streaming Chat بـ SSE
- [x] Auto-Heal تشخيص وإصلاح تلقائي
- [x] حفظ المحادثات في قاعدة البيانات
- [x] إعدادات AI Provider من الداشبورد

### 👥 إدارة المستخدمين
- [x] CRUD كامل للمستخدمين (admin only)
- [x] أدوار: admin / viewer / user
- [x] تغيير كلمة المرور
- [x] عرض وإنهاء الجلسات النشطة

### 🔔 التنبيهات والمراقبة
- [x] قواعد تنبيه (CPU/RAM/Disk فوق حد، device offline/online)
- [x] Webhooks (Slack / Discord / Telegram / Custom)
- [x] إشعارات داخل التطبيق
- [x] تسجيل جلسات الشاشة (Recordings)
- [x] تشغيل التسجيلات المحفوظة

### 🔑 أدوات المطورين
- [x] مخزن SSH Credentials مشفّر (AES-256-CBC)
- [x] GitHub Config (token, owner, repo)
- [x] نشر ملفات الـ Agent على GitHub Releases
- [x] Downloads Page (روابط من GitHub API)
- [x] Audit Log كامل قابل للتصفية

### 🖥️ ميزات حصرية Windows Desktop
- [x] Cloudflare Tunnel (بضغطة واحدة)
- [x] Watchdog (إعادة تشغيل تلقائية إذا توقف السيرفر)
- [x] Backup System (يدوي + مجدول)
- [x] Tray Icon + Windows Notifications
- [x] تشغيل تلقائي مع Windows (Registry)
- [x] عارض Logs داخلي
- [x] Desktop Settings panel من داخل الداشبورد

---

## 📦 التبعيات (Dependencies)

### موجودة
- `fastify`, `@fastify/cors`, `@fastify/websocket`, `@fastify/rate-limit`
- `better-sqlite3`, `bcryptjs`, `jsonwebtoken`, `uuid`, `archiver`
- `electron@28`, `electron-builder@24`

### مُضافة
- `otplib` — TOTP 2FA
- `qrcode` — توليد QR Code
- `@fastify/static` — خدمة ملفات Dashboard الـ static
- `ssh2` — SSH / SFTP client

---

## 🚀 خطوات التطوير المفصّلة

---

### الخطوة 1 — تحديث package.json وإضافة التبعيات

**الهدف:** إضافة جميع المكتبات المطلوبة

**التغييرات:**
- إضافة `otplib`, `qrcode`, `@fastify/static`, `ssh2` إلى dependencies
- إضافة script بناء الداشبورد + نسخ الملفات
- تحديث electron-builder config لتضمين `static/` directory

**الاختبار:**
```bash
cd packages/server-desktop && npm install
# يجب أن تكتمل بلا أخطاء
```

**التوثيق:** تمت إضافة 4 تبعيات جديدة، electron-builder سيبني native modules لـ Windows

---

### الخطوة 2 — توسيع قاعدة البيانات (server.js - DB Schema)

**الهدف:** إضافة جداول جديدة للميزات الجديدة

**الجداول المضافة:**
```sql
-- 2FA secrets
CREATE TABLE IF NOT EXISTS totp_secrets (
  user_id   TEXT PRIMARY KEY,
  secret    TEXT NOT NULL,
  enabled   INTEGER NOT NULL DEFAULT 0
);

-- AI conversations
CREATE TABLE IF NOT EXISTS ai_conversations (
  id         TEXT PRIMARY KEY,
  device_id  TEXT NOT NULL,
  user_id    TEXT NOT NULL,
  messages   TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Alert rules
CREATE TABLE IF NOT EXISTS alert_rules (
  id            TEXT PRIMARY KEY,
  user_id       TEXT NOT NULL,
  device_id     TEXT,
  type          TEXT NOT NULL,
  threshold     REAL,
  cooldown_min  INTEGER NOT NULL DEFAULT 30,
  channel       TEXT NOT NULL DEFAULT 'in_app',
  webhook_url   TEXT,
  enabled       INTEGER NOT NULL DEFAULT 1,
  last_fired_at TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

-- SSH Credentials (encrypted)
CREATE TABLE IF NOT EXISTS device_credentials (
  id           TEXT PRIMARY KEY,
  user_id      TEXT NOT NULL,
  device_id    TEXT NOT NULL,
  label        TEXT NOT NULL,
  ssh_host     TEXT NOT NULL,
  ssh_port     INTEGER NOT NULL DEFAULT 22,
  ssh_username TEXT NOT NULL,
  secret_type  TEXT NOT NULL,
  secret_enc   TEXT NOT NULL,
  last_used    TEXT,
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Recordings
CREATE TABLE IF NOT EXISTS recordings (
  id          TEXT PRIMARY KEY,
  device_id   TEXT NOT NULL,
  user_id     TEXT NOT NULL,
  name        TEXT,
  started_at  TEXT NOT NULL,
  ended_at    TEXT,
  file_path   TEXT,
  size_mb     REAL,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Stats history
CREATE TABLE IF NOT EXISTS stats_history (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  device_id    TEXT NOT NULL,
  cpu_percent  REAL,
  ram_percent  REAL,
  disk_percent REAL,
  net_in_kb    REAL,
  net_out_kb   REAL,
  recorded_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_stats_device_time ON stats_history(device_id, recorded_at);
```

**الاختبار:**
```bash
# تشغيل التطبيق واختبار أن DB تُنشأ بلا أخطاء
node -e "const s = require('./server'); s.start({port:3001, jwtSecret:'test', dbPath:'./test.db', logger:{info:()=>{},error:()=>{},warn:()=>{}}})"
```

**التوثيق:** 6 جداول جديدة أُضيفت بـ migrations آمنة (CREATE IF NOT EXISTS)

---

### الخطوة 3 — مسارات المصادقة الكاملة (2FA)

**الهدف:** إضافة TOTP/2FA كامل

**Routes المضافة:**
- `POST /api/auth/2fa/setup` — توليد secret + QR Code
- `POST /api/auth/2fa/enable` — تفعيل 2FA بعد التحقق من الكود
- `POST /api/auth/2fa/disable` — تعطيل 2FA بكلمة المرور
- `POST /api/auth/login/verify-totp` — التحقق من كود TOTP عند تسجيل الدخول

**الاختبار:**
```bash
# 1. Setup: POST /api/auth/2fa/setup → يجب أن يرجع secret + qrCodeUrl
# 2. Enable: POST /api/auth/2fa/enable {code: "123456"} → يجب أن يرجع {ok: true}
# 3. Login مع 2FA: POST /api/auth/login → يجب أن يرجع {requiresTOTP: true, totpToken: "..."}
# 4. Verify: POST /api/auth/login/verify-totp {totpToken, code} → يرجع accessToken
```

**التوثيق:** 2FA يستخدم otplib (RFC 6238 TOTP). الـ QR Code يُعرض في الداشبورد.

---

### الخطوة 4 — إدارة المستخدمين والجلسات

**الهدف:** CRUD كامل للمستخدمين + إدارة الجلسات

**Routes المضافة:**
```
GET    /api/users         — قائمة المستخدمين (admin)
POST   /api/users         — إنشاء مستخدم (admin)
PATCH  /api/users/:id     — تحديث مستخدم (admin)
DELETE /api/users/:id     — حذف مستخدم (admin)
GET    /api/sessions      — الجلسات النشطة
DELETE /api/sessions/:id  — إنهاء جلسة
```

**الاختبار:**
```bash
# POST /api/users {email, name, password, role:'viewer'} → {id, email, name, role}
# GET /api/users → [{id, email, name, role, created_at}]
# DELETE /api/users/:id → 204
# GET /api/sessions → [{id, device_id, user_id, type, started_at}]
```

**التوثيق:** جميع routes تتطلب admin role. كلمات المرور تُخزن كـ bcrypt hash.

---

### الخطوة 5 — سجل الإحصائيات التاريخية

**الهدف:** تخزين وعرض إحصائيات الأجهزة بمرور الوقت

**التغييرات:**
- تخزين إحصائيات كل heartbeat في stats_history (كل 30 ثانية)
- تنظيف تلقائي للسجلات أقدم من 7 أيام

**Routes المضافة:**
```
GET /api/devices/:id/stats/history?hours=24  — سجل الإحصائيات
```

**الاختبار:**
```bash
# ربط agent → انتظر 1 دقيقة → GET /api/devices/:id/stats/history
# يجب أن يرجع array من readings
```

**التوثيق:** يُنظف تلقائياً كل يوم. الاحتفاظ بآخر 7 أيام.

---

### الخطوة 6 — مسارات الذكاء الاصطناعي

**الهدف:** دعم AI Chat كامل مع OpenAI/Gemini/Ollama

**Routes المضافة:**
```
GET    /api/ai/settings         — إعدادات AI provider
PUT    /api/ai/settings         — حفظ إعدادات AI
POST   /api/ai/chat             — chat بدون streaming
POST   /api/ai/chat/stream      — streaming chat (SSE)
POST   /api/ai/auto-heal        — تحليل تلقائي للمشكلة
GET    /api/ai/conversations    — قائمة المحادثات
DELETE /api/ai/conversations/:id— حذف محادثة
```

**البروتوكول:**
- OpenAI: `fetch('https://api.openai.com/v1/chat/completions', {...})`
- Gemini: `fetch('https://generativelanguage.googleapis.com/v1beta/...')`
- Ollama: `fetch('http://localhost:11434/api/chat', {...})`
- Streaming: `text/event-stream` SSE format

**الاختبار:**
```bash
# 1. PUT /api/ai/settings {provider:'openai', apiKey:'sk-...', model:'gpt-4o-mini'}
# 2. POST /api/ai/chat {deviceId, message:'مرحبا', conversationId}
# 3. POST /api/ai/chat/stream → SSE events
# 4. POST /api/ai/auto-heal {deviceId, issue:'CPU 100%', stats:{...}}
```

**التوثيق:** يدعم 3 مزودين. المحادثات محفوظة في DB مع context الجهاز.

---

### الخطوة 7 — نظام التنبيهات

**الهدف:** قواعد تنبيه مع Webhooks

**Routes المضافة:**
```
GET    /api/alerts       — قائمة قواعد التنبيه
POST   /api/alerts       — إنشاء قاعدة
PATCH  /api/alerts/:id   — تفعيل/تعطيل
DELETE /api/alerts/:id   — حذف قاعدة
```

**أنواع التنبيهات:**
- `device_offline` / `device_online`
- `cpu_high` (threshold: %)
- `ram_high` (threshold: %)
- `disk_high` (threshold: %)

**قنوات الإرسال:**
- `in_app` — إشعار داخل التطبيق
- `webhook` — POST إلى URL مخصص (Slack/Discord/Telegram/Custom)

**الاختبار:**
```bash
# POST /api/alerts {type:'cpu_high', threshold:90, channel:'webhook', webhookUrl:'...'}
# → trigger a device with CPU > 90% → يجب أن يُرسل webhook
```

---

### الخطوة 8 — مخزن SSH Credentials

**الهدف:** حفظ بيانات SSH بشكل مشفّر

**Routes المضافة:**
```
GET    /api/credentials             — قائمة (بدون secret)
POST   /api/credentials             — حفظ credential
DELETE /api/credentials/:id         — حذف
GET    /api/credentials/:id/decrypt — فك التشفير (للاستخدام فقط)
```

**التشفير:** AES-256-CBC بـ key مشتق من JWT secret (PBKDF2)

**الاختبار:**
```bash
# POST /api/credentials {deviceId, label:'SSH Admin', sshHost:'192.168.1.1', sshUsername:'root', secretType:'password', secret:'mypass'}
# → {id, label, sshHost, sshUsername, secretType} (بدون secret)
# DELETE /api/credentials/:id → 204
```

---

### الخطوة 9 — SFTP File Manager

**الهدف:** استعراض وإدارة ملفات الجهاز البعيد عبر SSH/SFTP

**Routes المضافة:**
```
POST /api/sftp/connect         — فتح session SFTP
GET  /api/sftp/:session/list   — قائمة الملفات
GET  /api/sftp/:session/download/:path — تحميل ملف
POST /api/sftp/:session/upload — رفع ملف
DELETE /api/sftp/:session/delete — حذف ملف
POST /api/sftp/:session/mkdir  — إنشاء مجلد
POST /api/sftp/:session/close  — إغلاق session
```

**التقنية:** مكتبة `ssh2` للاتصال بـ SFTP

**الاختبار:**
```bash
# POST /api/sftp/connect {host, port, username, password}
# → {sessionId}
# GET /api/sftp/:sessionId/list?path=/home/user
# → [{name, type, size, permissions, modified}]
```

---

### الخطوة 10 — FS مباشر عبر Agent

**الهدف:** File Manager مباشر عبر Agent WebSocket (بدون SSH)

**Routes المضافة:**
```
GET    /api/devices/:id/fs?path=/home    — قائمة الملفات
GET    /api/devices/:id/fs/download?path — تحميل ملف
POST   /api/devices/:id/fs/upload?path  — رفع ملف
DELETE /api/devices/:id/fs/delete?path  — حذف
POST   /api/devices/:id/fs/mkdir?path   — إنشاء مجلد
```

**البروتوكول:** يُرسل أمر fs عبر الـ agent WS ويستقبل النتيجة

---

### الخطوة 11 — WebSocket للـ Terminal (PTY)

**الهدف:** تيرمينال real-time عبر WebSocket

**البروتوكول:**
```
Client → WS /pty?deviceId=X&sessionId=Y&ticket=Z
Client sends: {type:'pty_input', data:'ls\n'}
Server forwards to agent: {type:'server:command', payload:{type:'pty_input', data, sessionId}}
Agent sends: {type:'agent:pty_output', payload:{sessionId, data:'result\n'}}
Server forwards to /pty clients: {type:'pty_output', data:'result\n'}
```

**Map:**
```javascript
const ptyClients = new Map() // sessionId → Set<WebSocket>
```

---

### الخطوة 12 — WebSocket للـ SSH

**الهدف:** SSH terminal مباشر (Server ← bridge → Remote SSH)

**البروتوكول:**
```
Client → WS /ssh?ticket=Z
Client sends: {type:'ssh_connect', host, port, username, password/key}
Server opens SSH connection via ssh2
Server relays: stdin ↔ stdout
```

---

### الخطوة 13 — WebSocket للشاشة

**الهدف:** مشاهدة الشاشة مع multicast لمشاهدين متعددين

**البروتوكول:**
```
Client → WS /screen?deviceId=X&ticket=Y
Server registers viewer in screenViewers Map
Agent sends binary frames → server forwards to all viewers for deviceId
Client sends control: {type:'screen_control', action:'mousemove', x, y}
Server forwards control to agent
```

**Map:**
```javascript
const screenViewers = new Map() // deviceId → Set<WebSocket>
```

---

### الخطوة 14 — مسارات التسجيلات

**الهدف:** إدارة تسجيلات الجلسات

**Routes المضافة:**
```
GET    /api/recordings       — قائمة التسجيلات
POST   /api/recordings       — بدء تسجيل
PATCH  /api/recordings/:id   — إيقاف التسجيل
DELETE /api/recordings/:id   — حذف
GET    /api/recordings/:id/stream — مشاهدة التسجيل
```

---

### الخطوة 15 — مسارات Audit Log

**الهدف:** سجل مراجعة كامل للعمليات

**Routes المضافة:**
```
GET /api/audit?limit=100&offset=0&userId=...&action=...
```

**التوثيق:** كل عملية حساسة تُسجّل (login، create/delete device، settings change، etc.)

---

### الخطوة 16 — مسارات GitHub

**الهدف:** نشر ملفات Agent على GitHub Releases

**Routes المضافة:**
```
GET    /api/github/config               — إعدادات GitHub (token محجوب)
POST   /api/github/config               — حفظ الإعدادات
POST   /api/github/test                 — اختبار الاتصال
GET    /api/github/releases             — قائمة ملفات الإصدار
POST   /api/github/publish/:releaseId   — نشر على GitHub
GET    /api/github/publish/:id/status   — حالة النشر
```

---

### الخطوة 17 — Downloads عبر GitHub API

**الهدف:** صفحة تحميل Agent من GitHub Releases

**Routes المضافة:**
```
GET /api/downloads/releases — جلب آخر إصدار من GitHub API
GET /api/downloads/version  — إصدار التطبيق الحالي
```

**التقنية:**
```javascript
// جلب latest release
fetch('https://api.github.com/repos/{owner}/{repo}/releases/latest')
// → assets مع أسمائها وأحجامها وروابط التحميل
```

**الاختبار:**
```bash
# GET /api/downloads/releases → [{name, size, downloadUrl, platform}]
# روابط تحميل مباشرة من GitHub (browser_download_url)
```

---

### الخطوة 18 — Desktop API Routes

**الهدف:** تحكم في الـ Electron app من داخل الداشبورد

**Routes المضافة:**
```
GET  /api/desktop/status      — حالة السيرفر + Desktop info
POST /api/desktop/server/stop — إيقاف السيرفر (يفتح splash)
POST /api/desktop/tunnel/start — تشغيل Cloudflare Tunnel
POST /api/desktop/tunnel/stop  — إيقاف Cloudflare Tunnel
GET  /api/desktop/logs         — آخر logs من Logger
POST /api/desktop/backup       — تصدير نسخة احتياطية
GET  /api/desktop/settings     — إعدادات Desktop
PUT  /api/desktop/settings     — تحديث إعدادات Desktop
```

**التقنية:** يستخدم callbacks مُمررة من main.js إلى server.js عند التشغيل

---

### الخطوة 19 — تضمين React Dashboard

**الهدف:** خدمة الداشبورد المبني كـ static files من Fastify

**الخطوات:**
1. بناء الداشبورد: `pnpm --filter @airemote/dashboard build`
2. نسخ الملفات: `cp -r packages/dashboard/dist/* packages/server-desktop/static/`
3. إضافة `@fastify/static` في server.js
4. Electron main window تحمّل `http://localhost:PORT`

**التكوين:**
```javascript
// server.js
await fastify.register(require('@fastify/static'), {
  root: path.join(__dirname, 'static'),
  prefix: '/',
  decorateReply: false,
})
// SPA fallback — كل route غير معروف يرجع index.html
fastify.setNotFoundHandler((req, reply) => {
  reply.sendFile('index.html')
})
```

**الاختبار:**
```bash
# فتح http://localhost:3001 في المتصفح → يجب أن يعرض الداشبورد
# جميع الـ /api routes تعمل
# WebSocket يتصل بنجاح
```

---

### الخطوة 20 — تحديث main.js

**الهدف:** تحميل الداشبورد كـ UI رئيسية

**التغييرات:**
- `mainWindow.loadFile('renderer/index.html')` للـ splash
- بعد بدء السيرفر: `mainWindow.loadURL('http://localhost:PORT')`
- إضافة `X-AiRemote-Desktop: true` header للتمييز
- Tray يفتح نافذة مباشرة

---

### الخطوة 21 — تحديث preload.js

**الهدف:** توسيع الـ IPC bridge

**إضافات:**
- `airemote.desktop.status()` — حالة الـ Desktop
- `airemote.desktop.stopServer()` — إيقاف السيرفر
- `airemote.desktop.startTunnel()` / `stopTunnel()`
- `airemote.desktop.backup(dest)` — نسخ احتياطي
- `airemote.desktop.logs(n)` — آخر logs

---

### الخطوة 22 — بناء وتحضير الإصدار

**الهدف:** بناء الـ Windows installer/ZIP

**الخطوات:**
```bash
# 1. بناء الداشبورد
pnpm --filter @airemote/shared build
pnpm --filter @airemote/ai-engine build
pnpm --filter @airemote/dashboard build

# 2. نسخ الداشبورد
mkdir -p packages/server-desktop/static
cp -r packages/dashboard/dist/* packages/server-desktop/static/

# 3. تثبيت التبعيات
cd packages/server-desktop && npm install

# 4. تحميل cloudflared.exe
node ../../scripts/download-cloudflared.js

# 5. بناء التطبيق
npm run build:win
```

**الإخراج:** `releases/server-windows/AiRemote-Server-v3.2.0-Windows-x64.zip`

---

### الخطوة 23 — الاختبار النهائي الشامل

**الهدف:** التحقق من أن كل ميزة تعمل بشكل صحيح

#### ✅ اختبار المصادقة
```
□ الإعداد الأول: POST /api/setup/init → يُنشئ admin
□ تسجيل الدخول: POST /api/auth/login → يرجع JWT + refresh
□ Refresh Token: POST /api/auth/refresh → يرجع token جديد
□ 2FA Setup: POST /api/auth/2fa/setup → يرجع QR Code
□ 2FA Enable: POST /api/auth/2fa/enable → يرجع {ok: true}
□ 2FA Login: يطلب TOTP code قبل إكمال تسجيل الدخول
```

#### ✅ اختبار الأجهزة
```
□ إضافة جهاز: POST /api/devices → {id, token}
□ ربط Agent باستخدام token → يظهر online
□ إحصائيات real-time تُعرض في الداشبورد
□ سجل إحصائيات: GET /api/devices/:id/stats/history
□ Wake-on-LAN: POST /api/devices/:id/wol
□ حذف جهاز: DELETE /api/devices/:id
```

#### ✅ اختبار التحكم البعيد
```
□ PTY Terminal: فتح terminal → كتابة أوامر → رؤية النتيجة
□ Screen Share: مشاركة الشاشة → الصورة تظهر في الداشبورد
□ File Manager: استعراض الملفات → فتح / تحميل / رفع
□ SFTP: اتصال SSH/SFTP → استعراض الملفات
```

#### ✅ اختبار AI
```
□ حفظ إعدادات AI Provider
□ AI Chat: إرسال رسالة → رد من AI
□ Streaming: الرد يظهر تدريجياً (SSE)
□ Auto-Heal: تحليل مشكلة → اقتراحات
□ حفظ المحادثة في DB
```

#### ✅ اختبار المستخدمين
```
□ إنشاء مستخدم جديد (admin only)
□ تغيير الدور
□ حذف مستخدم
□ عرض الجلسات النشطة
□ إنهاء جلسة
```

#### ✅ اختبار التنبيهات
```
□ إنشاء قاعدة: cpu_high عند 80%
□ الـ Agent يرفع CPU > 80% → يجب أن يُطلق التنبيه
□ Webhook يُرسل الإشعار
□ تعطيل/تفعيل القاعدة
```

#### ✅ اختبار GitHub
```
□ حفظ إعدادات GitHub (token, owner, repo)
□ اختبار الاتصال → {user, repo}
□ نشر ملف Agent → يظهر على GitHub Releases
```

#### ✅ اختبار Downloads
```
□ GET /api/downloads/releases → قائمة بروابط GitHub
□ روابط التحميل تفتح مباشرة في المتصفح
```

#### ✅ اختبار Desktop (Electron)
```
□ Tray Icon يظهر في taskbar
□ Start/Stop Server من Tray
□ Cloudflare Tunnel يعمل ويُرجع URL
□ Watchdog: إيقاف السيرفر يداً → يُعيد تشغيله تلقائياً
□ Backup: تصدير ملف .zip → استيراده
□ Auto-start مع Windows
□ النافذة تختفي للـ tray عند الإغلاق
```

#### ✅ اختبار Dashboard UI
```
□ شاشة الإعداد الأول تظهر في أول تشغيل
□ تسجيل الدخول → الداشبورد
□ جميع الصفحات تتحمل بلا أخطاء:
  - Overview (إحصائيات عامة)
  - Devices (قائمة الأجهزة)
  - Device Workspace (terminal, screen, files, AI)
  - Users (إدارة المستخدمين)
  - Sessions (الجلسات النشطة)
  - Alerts (التنبيهات)
  - Audit Log (سجل العمليات)
  - Settings (الإعدادات)
  - Downloads (تحميل Agent)
  - Recordings (التسجيلات)
□ Dark/Light mode يعمل
□ اللغة العربية/الإنجليزية تعمل
```

#### ✅ اختبار التوافق مع Agent Desktop
```
□ نسخة Agent Desktop v3.2.0 تتصل بالسيرفر
□ الـ token يُقبل من السيرفر
□ الإحصائيات تُرسل وتُعرض في الداشبورد
□ PTY terminal يعمل مع Agent Desktop
□ مشاركة الشاشة من Agent Desktop تُعرض
```

#### ✅ اختبار الأداء
```
□ السيرفر يبدأ في أقل من 3 ثوانٍ
□ الداشبورد يتحمل في أقل من 2 ثانية
□ لا memory leaks بعد ساعة تشغيل
□ heartbeat 10s يعمل بانتظام
```

---

## 📁 بنية الملفات النهائية

```
packages/server-desktop/
├── main.js              — Electron main process (محدّث)
├── server.js            — Fastify server الكامل (~3000 سطر)
├── preload.js           — IPC bridge (محدّث)
├── tunnel.js            — Cloudflare Tunnel
├── logger.js            — نظام logging
├── backup.js            — نظام النسخ الاحتياطي
├── package.json         — (محدّث بتبعيات جديدة)
├── static/              — React Dashboard المبني (يُنسخ عند البناء)
│   ├── index.html
│   ├── assets/
│   └── ...
├── renderer/
│   └── index.html       — Splash screen بسيط
└── build/
    └── icon.ico
```

---

## 🔄 توافق الإصدارات

| المكوّن | الإصدار |
|---|---|
| AiRemote Server Desktop | v3.2.0 |
| AiRemote Web Server | v3.2.0 |
| AiRemote Agent (Desktop + Script) | v3.2.0 |
| React Dashboard | v3.2.0 |

جميع المكوّنات على نفس الإصدار مع بروتوكول WS متوافق.

---

## 🚀 طريقة تشغيل التطبيق

### للمستخدم النهائي
1. تحميل `AiRemote-Server-v3.2.0-Windows-x64.zip` من الداشبورد
2. فك الضغط في أي مجلد
3. تشغيل `AiRemote Server.exe`
4. عند أول تشغيل: إعداد حساب Admin
5. إضافة أجهزة وتثبيت Agent عليها

### للمطور
```bash
cd packages/server-desktop
npm install
npm start  # Electron بدون بناء
```

---

## 📊 ملخص التغييرات

| الملف | التغيير |
|---|---|
| `server.js` | إضافة ~2400 سطر (routes كاملة + WS handlers) |
| `main.js` | تحميل Dashboard URL بعد start |
| `preload.js` | إضافة desktop API |
| `package.json` | إضافة 4 تبعيات + build scripts |
| `static/` | React Dashboard المبني (جديد) |
| `renderer/index.html` | splash screen مبسّط |
