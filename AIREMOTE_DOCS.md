# AiRemote — التوثيق الشامل

**الإصدار:** 1.0.0  
**التاريخ:** 2026-05-28  
**المطور:** Ibrahim  
**الترخيص:** Open Source  

---

## جدول المحتويات

1. [نظرة عامة على البرنامج](#1-نظرة-عامة-على-البرنامج)
2. [المعمارية التقنية](#2-المعمارية-التقنية)
3. [هيكل المشروع](#3-هيكل-المشروع)
4. [قاعدة البيانات](#4-قاعدة-البيانات)
5. [الخادم (Server)](#5-الخادم-server)
6. [الواجهة الأمامية (Dashboard)](#6-الواجهة-الأمامية-dashboard)
7. [Agent الجهاز](#7-agent-الجهاز)
8. [محرك الذكاء الاصطناعي (AI Engine)](#8-محرك-الذكاء-الاصطناعي-ai-engine)
9. [بروتوكول WebSocket](#9-بروتوكول-websocket)
10. [نقاط نهاية API الكاملة](#10-نقاط-نهاية-api-الكاملة)
11. [نظام المصادقة والأمان](#11-نظام-المصادقة-والأمان)
12. [تثبيت البرنامج وتشغيله](#12-تثبيت-البرنامج-وتشغيله)
13. [متغيرات البيئة](#13-متغيرات-البيئة)
14. [دليل تثبيت Agent على الأجهزة](#14-دليل-تثبيت-agent-على-الأجهزة)
15. [الميزات التفصيلية](#15-الميزات-التفصيلية)
16. [دليل المستخدم للواجهة](#16-دليل-المستخدم-للواجهة)
17. [القيود والميزات المستقبلية](#17-القيود-والميزات-المستقبلية)
18. [أمثلة على سيناريوهات الاستخدام](#18-أمثلة-على-سيناريوهات-الاستخدام)

---

## 1. نظرة عامة على البرنامج

**AiRemote** منصة إدارة خوادم بعيدة مدمجة مع الذكاء الاصطناعي، مبنية كـ monorepo بـ TypeScript وpnpm workspaces. تُمكّن المسؤولين من:

- **مراقبة** الخوادم في الوقت الفعلي (CPU / RAM / Disk / Uptime)
- **التحكم** عبر SSH Terminal تفاعلي مباشرة من المتصفح
- **إدارة الملفات** عبر SFTP (تصفح، رفع، حذف، إعادة تسمية، إنشاء مجلدات)
- **تنفيذ الأوامر** مباشرة على الأجهزة عبر Agent WebSocket بدون SSH
- **التفاعل مع AI** (GPT-4o / Gemini / Ollama) لإدارة الأنظمة بلغة طبيعية عربية وإنجليزية
- **تنفيذ أوامر AI** — يقترح AI أمراً ويُنفَّذ مباشرة على الجهاز بنقرة واحدة
- **إدارة المستخدمين** بنظام صلاحيات ثلاثي (Admin / Manager / Viewer)
- **متابعة الجلسات** التاريخية لكل جهاز

**الفلسفة:** self-hosted بالكامل، لا يعتمد على خدمات سحابية خارجية، يعمل داخل الشبكة المحلية أو عبر الإنترنت.

---

## 2. المعمارية التقنية

```
┌─────────────────────────────────────────────────────────────────┐
│                        المستخدم (Browser)                        │
│                   React Dashboard (Port 5000)                    │
└───────────────────────────┬─────────────────────────────────────┘
                            │ HTTP REST + WebSocket (ws://)
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│                      AiRemote Server (Port 3001)                 │
│  ┌──────────────┐  ┌──────────────┐  ┌────────────────────────┐ │
│  │  REST API    │  │  WebSocket   │  │   SSH/SFTP Proxy       │ │
│  │  (Fastify)   │  │  /ws handler │  │   (ssh2 library)       │ │
│  └──────────────┘  └──────────────┘  └────────────────────────┘ │
│  ┌──────────────────────────────────────────────────────────────┐ │
│  │              SQLite DB (via @libsql/client)                  │ │
│  │  users · devices · sessions · refresh_tokens                 │ │
│  │  ai_conversations · settings                                 │ │
│  └──────────────────────────────────────────────────────────────┘ │
└───────────────────────────┬─────────────────────────────────────┘
                            │ WebSocket (Agent Protocol)
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│              AiRemote Agent (يعمل على كل جهاز)                   │
│  • يُسجّل نفسه بـ Token                                          │
│  • يُرسل إحصائيات كل 5 ثوانٍ (heartbeat)                        │
│  • يستقبل أوامر shell وينفذها ويُعيد النتيجة                     │
└─────────────────────────────────────────────────────────────────┘
```

### المكدس التقني (Tech Stack)

| الطبقة | التقنية | الإصدار |
|---|---|---|
| Runtime | Node.js | 20 LTS |
| Language | TypeScript | 5.x |
| Package Manager | pnpm (workspaces) | 9.x |
| Server Framework | Fastify | 4.29.x |
| Database Client | @libsql/client | 0.x |
| Database Engine | SQLite (ملف محلي) | — |
| Authentication | JWT (15m) + Refresh Token (30d) | @fastify/jwt |
| WebSocket | ws (عبر @fastify/websocket) | — |
| SSH/SFTP | ssh2 | — |
| File Upload | @fastify/multipart v8 | 8.x |
| Frontend Framework | React | 18.x |
| Build Tool | Vite | 5.x |
| Styling | Tailwind CSS | 3.x |
| State Management | Zustand | — |
| Terminal | @xterm/xterm | — |
| Charts | Recharts | — |
| Icons | Lucide React | — |
| HTTP Client | Axios | — |
| Routing | React Router v6 | — |

---

## 3. هيكل المشروع

```
airemote/
├── package.json                    # pnpm workspace root
├── pnpm-workspace.yaml             # تعريف الـ packages
├── AIREMOTE_DOCS.md                # هذا الملف
├── .local/
│   └── BUILD_REPORT.md             # تقرير البناء الاحترافي
│
├── packages/
│   ├── shared/                     # @airemote/shared
│   │   └── src/
│   │       └── index.ts            # جميع الأنواع (Types) المشتركة
│   │
│   ├── ai-engine/                  # @airemote/ai-engine
│   │   └── src/
│   │       ├── index.ts            # createAIProvider() + SYSTEM_PROMPT_AR
│   │       ├── openai.ts           # OpenAI provider
│   │       ├── gemini.ts           # Google Gemini provider
│   │       └── ollama.ts           # Ollama (local) provider
│   │
│   ├── server/                     # @airemote/server
│   │   ├── src/
│   │   │   ├── index.ts            # نقطة دخول الخادم (port 3001)
│   │   │   ├── app.ts              # Fastify setup + route registration
│   │   │   ├── db/
│   │   │   │   ├── database.ts     # initDatabase() + migrations
│   │   │   │   ├── users.ts        # CRUD للمستخدمين
│   │   │   │   ├── devices.ts      # CRUD للأجهزة
│   │   │   │   └── sessions.ts     # قراءة الجلسات
│   │   │   ├── routes/
│   │   │   │   ├── auth.ts         # /api/auth/*
│   │   │   │   ├── devices.ts      # /api/devices/*
│   │   │   │   ├── users.ts        # /api/users/*
│   │   │   │   ├── sessions.ts     # /api/sessions/*
│   │   │   │   ├── sftp.ts         # /api/sftp/*
│   │   │   │   ├── ai.ts           # /api/ai/*
│   │   │   │   └── settings.ts     # /api/settings/*
│   │   │   ├── ws/
│   │   │   │   ├── handler.ts      # WebSocket router (/ws)
│   │   │   │   ├── registry.ts     # DeviceRegistry (الأجهزة المتصلة)
│   │   │   │   ├── agentHandler.ts # معالج رسائل Agent
│   │   │   │   ├── clientHandler.ts# معالج رسائل Dashboard
│   │   │   │   └── sshHandler.ts   # SSH proxy عبر WebSocket (/ssh)
│   │   │   └── middleware/
│   │   │       └── auth.ts         # requireAuth / requireAdmin hooks
│   │   ├── dist/                   # الكود المبني (tsc output)
│   │   └── tsconfig.json
│   │
│   ├── dashboard/                  # @airemote/dashboard
│   │   └── src/
│   │       ├── main.tsx            # نقطة دخول React
│   │       ├── App.tsx             # Router + RequireAuth + setup check
│   │       ├── index.css           # Tailwind + custom CSS
│   │       ├── layouts/
│   │       │   └── DashboardLayout.tsx  # Sidebar + Toast + WS Status
│   │       ├── pages/
│   │       │   ├── LoginPage.tsx        # تسجيل الدخول
│   │       │   ├── SetupPage.tsx        # إنشاء أول مسؤول
│   │       │   ├── OverviewPage.tsx     # الصفحة الرئيسية
│   │       │   ├── DevicesPage.tsx      # قائمة الأجهزة + Agent Install
│   │       │   ├── DeviceWorkspacePage.tsx # Workspace الجهاز (6 تبويبات)
│   │       │   ├── AiPage.tsx           # AI Chat مع اختيار جهاز
│   │       │   ├── SessionsPage.tsx     # سجل الجلسات
│   │       │   ├── UsersPage.tsx        # إدارة المستخدمين
│   │       │   └── SettingsPage.tsx     # الإعدادات
│   │       ├── components/
│   │       │   ├── SSHTerminal.tsx      # Xterm.js SSH terminal
│   │       │   ├── MonitoringCharts.tsx # Recharts CPU/RAM/Disk
│   │       │   ├── FileManager.tsx      # SFTP file manager
│   │       │   ├── AiChatPanel.tsx      # AI chat + code execution
│   │       │   ├── CommandRunner.tsx    # Agent command runner
│   │       │   └── ToastContainer.tsx   # Toast notifications
│   │       ├── store/
│   │       │   ├── authStore.ts         # Zustand: JWT + user + refreshToken
│   │       │   ├── deviceStore.ts       # Zustand: devices + stats
│   │       │   └── toastStore.ts        # Zustand: toast notifications
│   │       └── lib/
│   │           ├── api.ts              # Axios + JWT refresh interceptor
│   │           └── websocket.ts        # WS client + exponential backoff
│   │
│   └── agent/                      # @airemote/agent
│       └── src/
│           ├── index.ts            # نقطة دخول Agent
│           ├── agent.ts            # منطق التسجيل والـ heartbeat
│           └── system/             # جمع إحصائيات النظام
```

---

## 4. قاعدة البيانات

**الموقع:** `airemote/packages/server/data/airemote.db` (SQLite)  
**المكتبة:** `@libsql/client` (ضروري في بيئة Nix — `better-sqlite3` لا يعمل)

### جداول قاعدة البيانات

#### جدول `users`
```sql
CREATE TABLE users (
  id           TEXT PRIMARY KEY,          -- UUID v4
  email        TEXT UNIQUE NOT NULL,      -- البريد الإلكتروني (يُستخدم للدخول)
  name         TEXT NOT NULL,             -- الاسم الكامل
  role         TEXT NOT NULL DEFAULT 'viewer', -- admin | manager | viewer
  password_hash TEXT NOT NULL,            -- bcrypt (12 rounds)
  created_at   TEXT NOT NULL,
  updated_at   TEXT NOT NULL
);
```

#### جدول `devices`
```sql
CREATE TABLE devices (
  id             TEXT PRIMARY KEY,        -- UUID v4
  name           TEXT NOT NULL,           -- اسم الجهاز (يختاره المستخدم)
  token          TEXT UNIQUE NOT NULL,    -- رمز مصادقة Agent
  owner_id       TEXT NOT NULL,           -- FK → users.id
  info           TEXT,                    -- JSON: {hostname, platform, arch, ipLocal, ipPublic, osVersion}
  status         TEXT NOT NULL DEFAULT 'offline', -- online | offline | connecting | error
  tunnel_layer   TEXT,                    -- relay | wireguard | direct
  tunnel_address TEXT,                    -- عنوان النفق إن وُجد
  last_seen      TEXT,                    -- آخر heartbeat
  created_at     TEXT NOT NULL,
  updated_at     TEXT NOT NULL,
  FOREIGN KEY (owner_id) REFERENCES users(id)
);
```

#### جدول `sessions`
```sql
CREATE TABLE sessions (
  id           TEXT PRIMARY KEY,
  device_id    TEXT NOT NULL,   -- FK → devices.id
  user_id      TEXT NOT NULL,   -- FK → users.id
  type         TEXT NOT NULL,   -- ssh | sftp | ai | vnc | rdp
  started_at   TEXT NOT NULL,
  ended_at     TEXT,            -- NULL = جلسة نشطة
  duration_sec INTEGER,         -- المدة بالثواني عند الانتهاء
  ip_address   TEXT             -- IP المستخدم
);
```

#### جدول `refresh_tokens`
```sql
CREATE TABLE refresh_tokens (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL,      -- FK → users.id
  token_hash  TEXT UNIQUE NOT NULL, -- bcrypt hash للـ refresh token
  expires_at  TEXT NOT NULL,       -- 30 يوماً من الإنشاء
  created_at  TEXT NOT NULL
);
```

#### جدول `ai_conversations`
```sql
CREATE TABLE ai_conversations (
  id         TEXT PRIMARY KEY,  -- {userId}-{deviceId|'global'}
  device_id  TEXT NOT NULL,     -- 'global' إذا لم يكن مرتبطاً بجهاز
  user_id    TEXT NOT NULL,
  messages   TEXT NOT NULL DEFAULT '[]', -- JSON array of AIMessage
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
```

#### جدول `settings`
```sql
CREATE TABLE settings (
  key        TEXT PRIMARY KEY,  -- 'user:{userId}' أو مفاتيح النظام
  value      TEXT NOT NULL DEFAULT '{}', -- JSON
  updated_at TEXT NOT NULL
);
```

### الفهارس (Indexes)
```sql
CREATE INDEX idx_devices_owner      ON devices(owner_id);
CREATE INDEX idx_devices_token      ON devices(token);
CREATE INDEX idx_sessions_device    ON sessions(device_id);
CREATE INDEX idx_sessions_user      ON sessions(user_id);
CREATE INDEX idx_ai_conv_user       ON ai_conversations(user_id);
CREATE INDEX idx_refresh_tokens_user ON refresh_tokens(user_id);
```

---

## 5. الخادم (Server)

### التشغيل
```bash
cd airemote/packages/server
pnpm build     # tsc → dist/
node dist/index.js
# أو
pnpm dev       # ts-node-esm للتطوير
```

### Fastify Plugins المُسجَّلة
| Plugin | الغرض |
|---|---|
| `@fastify/cors` | CORS للـ Dashboard |
| `@fastify/cookie` | ملفات تعريف الارتباط |
| `@fastify/multipart@8` | رفع الملفات (500MB max) — **v8 فقط مع Fastify 4.x** |
| `@fastify/jwt` | JWT signing/verification |
| `@fastify/websocket` | WebSocket support |

### إعداد الخادم (`app.ts`)
- يُهيئ قاعدة البيانات عند الإقلاع (`initDatabase()`)
- يُنظّف refresh tokens المنتهية عند كل إقلاع
- يُسجّل جميع المسارات مع prefixes
- يُشغّل WebSocket handler على `/ws` و SSH proxy على `/ssh`

---

## 6. الواجهة الأمامية (Dashboard)

### التشغيل
```bash
cd airemote/packages/dashboard
pnpm dev   # Vite dev server على port 5000
```

### صفحات الواجهة

#### `SetupPage` — إعداد أول مسؤول
- تظهر مرة واحدة فقط عند أول تشغيل
- تُنشئ حساب Admin الرئيسي
- تتحقق من `GET /api/auth/setup-status`

#### `LoginPage` — تسجيل الدخول
- بريد إلكتروني + كلمة مرور
- يحفظ JWT + refreshToken في Zustand المُستمر

#### `OverviewPage` — الصفحة الرئيسية
- بطاقات إحصاء: متصل / غير متصل / تنبيهات / متوسط CPU
- شبكة بطاقات الأجهزة مع إحصائيات حية
- قائمة آخر الجلسات على اليمين

#### `DevicesPage` — إدارة الأجهزة
- جدول الأجهزة مع حالة الاتصال الحية
- زر "إضافة جهاز" → Modal تثبيت Agent احترافي
- حذف الجهاز مع تأكيد

#### `DeviceWorkspacePage` — مركز عمل الجهاز (6 تبويبات)
| التبويب | الوصف | المتطلب |
|---|---|---|
| نظرة عامة | معلومات الجهاز + مخططات حية | — |
| أوامر | CommandRunner عبر Agent (بدون SSH) | الجهاز متصل |
| SSH Terminal | Xterm.js terminal كامل | الجهاز متصل + SSH config |
| المراقبة | مخططات CPU/RAM/Disk التاريخية | — |
| الملفات SFTP | مدير ملفات كامل | الجهاز متصل + SSH config |
| AI | محادثة AI مع سياق الجهاز | — |

#### `AiPage` — مساعد AI
- شريط جانبي: اختيار جهاز هدف للمحادثة
- عند اختيار جهاز: AI يعمل في سياقه + زر تنفيذ الأوامر يُفعَّل

#### `SessionsPage` — سجل الجلسات
- فلاتر بالنوع (SSH/SFTP/AI/VNC)
- بطاقات إحصاء: الكل / نشطة / منتهية
- مدة الجلسة بصيغة بشرية

#### `UsersPage` — إدارة المستخدمين
- إضافة مستخدم مع اختيار الصلاحية
- تغيير الصلاحية inline (dropdown)
- تغيير كلمة المرور (modal)
- حذف المستخدم

#### `SettingsPage` — الإعدادات
- إعداد مزود AI (OpenAI/Gemini/Ollama)
- مفتاح API مع إظهار/إخفاء
- إعدادات الإشعارات (Telegram bot)
- عنوان الخادم للنسخ

### المكونات المشتركة

#### `AiChatPanel`
- يحلل ردود AI ويُميّز code blocks
- يعرض زر **"تنفيذ"** بجانب كل كود Bash
- ينفذ الكود على الجهاز المحدد عبر `/api/devices/:id/exec`
- يعرض النتيجة (stdout/stderr/exit code) مباشرة تحت الكود
- يحفظ إعدادات AI في localStorage
- يحمّل تاريخ المحادثة من قاعدة البيانات

#### `CommandRunner`
- تيرمينال خفيف يعمل عبر Agent WebSocket (لا يحتاج SSH)
- 8 أوامر سريعة جاهزة
- تاريخ الأوامر بـ ↑↓
- يعرض exit code والمدة لكل أمر
- ملوّن بحسب النجاح/الفشل

#### `SSHTerminal`
- Xterm.js مع FitAddon وWebLinksAddon
- خط JetBrains Mono / Fira Code
- resize تلقائي
- وضع fullscreen
- يعرض حالة الاتصال حية

#### `MonitoringCharts`
- Recharts: CPU (أزرق) / RAM (أخضر) / Disk (بنفسجي)
- تنبيه لوني: برتقالي >70%، أحمر >85%
- تاريخ حتى 60 نقطة بيانات (5 دقائق)

#### `FileManager`
- تصفح المجلدات مع breadcrumb
- رفع ملف (drag & drop معتمد)
- حذف مع تأكيد
- إعادة تسمية inline
- إنشاء مجلد
- شريط حالة: عدد الملفات والمجلدات

#### `ToastContainer`
- إشعارات منبثقة (success / error / warning / info)
- تختفي تلقائياً بعد 4.5 ثانية
- حد أقصى 5 إشعارات مرئية
- إشعار تلقائي عند اتصال/انقطاع جهاز

### إدارة الحالة (Zustand Stores)

#### `authStore`
```typescript
{
  token: string | null          // JWT (15 دقيقة)
  refreshToken: string | null   // Refresh token (30 يوم)
  user: User | null             // بيانات المستخدم
  setAuth(token, user, refreshToken): void
  logout(): void
}
```
مُستمر في localStorage تحت مفتاح `airemote-auth`.

#### `deviceStore`
```typescript
{
  devices: Device[]             // قائمة الأجهزة
  statsMap: Record<string, DeviceStats>  // إحصائيات حية لكل جهاز
  loading: boolean
  fetchDevices(): Promise<void>
  addDevice(name): Promise<Device>
  deleteDevice(id): Promise<void>
  updateDeviceStats(id, stats): void    // يُستدعى من WebSocket
  updateDeviceStatus(id, status): void
}
```

#### `toastStore`
```typescript
{
  toasts: Toast[]
  addToast({ type, title, message? }): void  // يختفي بعد 4.5 ثانية
  removeToast(id): void
}
// دوال مساعدة:
toast.success(title, message?)
toast.error(title, message?)
toast.warning(title, message?)
toast.info(title, message?)
```

### إدارة API (`lib/api.ts`)
- Axios instance تُرسل كل الطلبات إلى `http://localhost:3001`
- **interceptor للتجديد التلقائي:** عند 401 → `POST /api/auth/refresh` → إعادة الطلب الأصلي
- **قائمة انتظار:** الطلبات المتزامنة تُوضع في طابور أثناء التجديد
- عند فشل التجديد: تصفية localStorage + إعادة توجيه لـ `/login`

### WebSocket Client (`lib/websocket.ts`)
- يتصل بـ `ws://localhost:3001/ws`
- يُرسل `{type: 'subscribe', payload: {userId}}` عند الاتصال
- **إعادة اتصال تلقائية** بـ Exponential backoff: 2s → 3s → 4.5s → ... → 30s max
- يُحدّث `deviceStore` فور وصول إحصائيات جديدة
- `getWsState()` يُعيد `'connected' | 'connecting' | 'disconnected'`

---

## 7. Agent الجهاز

### الغرض
برنامج صغير يعمل على كل خادم تريد إدارته. يتصل بالخادم الرئيسي ويُرسل إحصائيات دورية ويستقبل الأوامر.

### كيف يعمل
```
Agent يبدأ → يتصل بـ ws://SERVER:3001/ws
           → يُرسل agent:register مع Token
           → يتلقى server:registered (تأكيد)
           → كل 5 ثوانٍ: يُرسل agent:heartbeat مع إحصائيات النظام
           → عند وصول server:command: ينفذ الأمر → يُعيد agent:command_result
```

### رسائل Agent
| النوع | الاتجاه | الوصف |
|---|---|---|
| `agent:register` | Agent → Server | التسجيل الأولي مع Token + معلومات النظام |
| `server:registered` | Server → Agent | تأكيد التسجيل |
| `agent:heartbeat` | Agent → Server | إحصائيات كل 5 ثوانٍ |
| `server:command` | Server → Agent | طلب تنفيذ أمر shell |
| `agent:command_result` | Agent → Server | نتيجة الأمر (stdout/stderr/exitCode/duration) |

### هيكل `agent:register`
```json
{
  "type": "agent:register",
  "payload": {
    "token": "device-token-from-env",
    "info": {
      "hostname": "prod-server-01",
      "platform": "linux",
      "arch": "x64",
      "osVersion": "Ubuntu 22.04 LTS",
      "ipLocal": "192.168.1.100",
      "ipPublic": "1.2.3.4"
    },
    "stats": {
      "cpuPercent": 12,
      "ramPercent": 45,
      "diskPercent": 67,
      "uptime": 3600
    }
  }
}
```

---

## 8. محرك الذكاء الاصطناعي (AI Engine)

### المزودون المدعومون

| المزود | النماذج | الملاحظة |
|---|---|---|
| **OpenAI** | gpt-4o, gpt-4o-mini, gpt-4-turbo, gpt-3.5-turbo | يحتاج API Key |
| **Google Gemini** | gemini-1.5-pro, gemini-1.5-flash, gemini-pro | يحتاج API Key |
| **Ollama** | llama3, llama3.1, mistral, codellama, phi3, qwen2 | محلي — يحتاج URL |

### System Prompt (عربي)
الـ AI مبرمج كـ **مساعد إدارة أنظمة Linux/Unix** متخصص، يعمل بالعربية والإنجليزية، مُدرَّب على:
- تشخيص مشكلات الأداء
- اقتراح أوامر shell محددة مع شرحها
- تفسير نتائج الأوامر
- اقتراح حلول للأخطاء الشائعة

### تنفيذ الأوامر من AI
عندما يُضمّن AI أمراً في code block:
```markdown
يمكنك التحقق من الذاكرة بهذا الأمر:
```bash
free -h && vmstat -s | head -10
```
```
تظهر أزرار **نسخ** و**تنفيذ** بجانبه. النقر على تنفيذ يُرسل الأمر إلى `/api/devices/:id/exec`.

### المحادثات في قاعدة البيانات
- `conversationId` = `{userId}-{deviceId|'global'}`
- محادثة لكل مستخدم لكل جهاز
- تاريخ حتى 100 رسالة (قديمها يُحذف)
- تُحمَّل تلقائياً عند فتح المحادثة

---

## 9. بروتوكول WebSocket

### اتصال Dashboard بـ `/ws`

**Client → Server:**
```json
{"type": "subscribe", "payload": {"userId": "..."}, "timestamp": 1234567890}
{"type": "device:command", "payload": {"deviceId": "...", "command": "restart_service", "args": {}}, "timestamp": ...}
```

**Server → Client (broadcast):**
```json
{"type": "device:stats", "payload": {"deviceId": "...", "stats": {"cpuPercent": 45, "ramPercent": 60, "diskPercent": 70, "uptime": 3600}}, "timestamp": ...}
{"type": "device:status", "payload": {"deviceId": "...", "status": "online"}, "timestamp": ...}
{"type": "device:offline", "payload": {"deviceId": "..."}, "timestamp": ...}
```

### اتصال SSH عبر `/ssh`

**Client → Server:**
```json
{"type": "ssh:connect", "payload": {"host": "...", "port": 22, "username": "root", "password": "...", "rows": 24, "cols": 80}}
{"type": "ssh:data", "payload": {"data": "<base64 encoded>"}}
{"type": "ssh:resize", "payload": {"rows": 30, "cols": 100}}
{"type": "ssh:disconnect", "payload": {}}
```

**Server → Client:**
```json
{"type": "ssh:connected", "payload": {}}
{"type": "ssh:data", "payload": {"data": "<base64 encoded>"}}
{"type": "ssh:error", "payload": {"message": "Connection refused"}}
{"type": "ssh:closed", "payload": {}}
```

---

## 10. نقاط نهاية API الكاملة

**Base URL:** `http://SERVER:3001`

### Authentication (`/api/auth`)

| الطريقة | المسار | الوصف | Auth |
|---|---|---|---|
| `GET` | `/api/auth/setup-status` | هل يحتاج الإعداد الأولي؟ | ❌ |
| `POST` | `/api/auth/setup` | إنشاء أول مسؤول | ❌ |
| `POST` | `/api/auth/login` | تسجيل الدخول → `{token, refreshToken, user}` | ❌ |
| `POST` | `/api/auth/refresh` | تجديد JWT بـ refreshToken | ❌ |
| `POST` | `/api/auth/logout` | إلغاء refreshToken | ✅ |

### Devices (`/api/devices`)

| الطريقة | المسار | الوصف | Auth |
|---|---|---|---|
| `GET` | `/api/devices` | قائمة الأجهزة | ✅ |
| `POST` | `/api/devices` | إضافة جهاز جديد → `{id, token, ...}` | ✅ |
| `GET` | `/api/devices/:id` | بيانات جهاز واحد | ✅ |
| `PATCH` | `/api/devices/:id` | تعديل اسم الجهاز | ✅ |
| `DELETE` | `/api/devices/:id` | حذف جهاز | 🔑 Admin |
| `POST` | `/api/devices/:id/exec` | تنفيذ أمر shell عبر Agent | ✅ |
| `GET` | `/api/devices/:id/stats` | إحصائيات حية للجهاز | ✅ |

**`POST /api/devices/:id/exec` — Body:**
```json
{
  "command": "df -h",
  "timeoutMs": 30000
}
```
**Response:**
```json
{
  "ok": true,
  "commandId": "uuid",
  "command": "df -h",
  "stdout": "Filesystem      Size  Used Avail Use% Mounted on...",
  "stderr": "",
  "exitCode": 0,
  "duration": 245
}
```

### Users (`/api/users`)

| الطريقة | المسار | الوصف | Auth |
|---|---|---|---|
| `GET` | `/api/users` | قائمة كل المستخدمين | 🔑 Admin |
| `POST` | `/api/users` | إضافة مستخدم | 🔑 Admin |
| `PATCH` | `/api/users/:id` | تعديل الاسم / الصلاحية / كلمة المرور | 🔑 Admin |
| `DELETE` | `/api/users/:id` | حذف مستخدم | 🔑 Admin |

### Sessions (`/api/sessions`)

| الطريقة | المسار | الوصف | Auth |
|---|---|---|---|
| `GET` | `/api/sessions` | جميع الجلسات (Admin) أو جلسات المستخدم | ✅ |
| `GET` | `/api/sessions/device/:deviceId` | جلسات جهاز محدد | ✅ |

### SFTP (`/api/sftp`)

| الطريقة | المسار | الوصف | Auth |
|---|---|---|---|
| `POST` | `/api/sftp/list` | قائمة محتوى مجلد | ✅ |
| `POST` | `/api/sftp/read` | قراءة ملف | ✅ |
| `POST` | `/api/sftp/upload` | رفع ملف (multipart) | ✅ |
| `POST` | `/api/sftp/delete` | حذف ملف/مجلد | ✅ |
| `POST` | `/api/sftp/rename` | إعادة تسمية/نقل | ✅ |
| `POST` | `/api/sftp/mkdir` | إنشاء مجلد | ✅ |

**Body لجميع SFTP endpoints يجب أن يتضمن:**
```json
{
  "host": "192.168.1.100",
  "port": 22,
  "username": "root",
  "password": "...",
  "path": "/home/user/files"
}
```

### AI (`/api/ai`)

| الطريقة | المسار | الوصف | Auth |
|---|---|---|---|
| `POST` | `/api/ai/chat` | إرسال رسالة إلى AI | ✅ |
| `GET` | `/api/ai/history` | تاريخ محادثة | ✅ |
| `DELETE` | `/api/ai/history` | حذف محادثة | ✅ |
| `GET` | `/api/ai/conversations` | قائمة المحادثات | ✅ |

**`POST /api/ai/chat` — Body:**
```json
{
  "message": "كيف أتحقق من استخدام الذاكرة؟",
  "deviceId": "device-uuid-optional",
  "conversationId": "optional-custom-id",
  "config": {
    "provider": "openai",
    "model": "gpt-4o",
    "apiKey": "sk-..."
  }
}
```

### Settings (`/api/settings`)

| الطريقة | المسار | الوصف | Auth |
|---|---|---|---|
| `GET` | `/api/settings` | إعدادات المستخدم الحالي | ✅ |
| `PUT` | `/api/settings` | حفظ إعدادات المستخدم | ✅ |
| `GET` | `/api/settings/system` | إعدادات النظام العامة | 🔑 Admin |

### Health

| الطريقة | المسار | الوصف |
|---|---|---|
| `GET` | `/health` | `{"status":"ok","version":"1.0.0","time":"..."}` |

---

## 11. نظام المصادقة والأمان

### دورة حياة JWT
```
تسجيل دخول
  → JWT (15 دقيقة) + Refresh Token (30 يوم)
  → JWT محفوظ في Zustand (memory)
  → Refresh Token محفوظ في Zustand المُستمر (localStorage)

JWT ينتهي → 401
  → Interceptor يُرسل POST /api/auth/refresh
  → Server يتحقق من Refresh Token بـ bcrypt
  → يُصدر JWT جديد + Refresh Token جديد (rotation)
  → الطلبات المعلّقة تُعاد تلقائياً

Refresh Token ينتهي أو يُلغى
  → يُعاد التوجيه لـ /login
```

### تخزين Refresh Token في الخادم
- لا يُخزن الـ token نفسه — يُخزن **bcrypt hash** فقط
- عند التحقق: يُقارن كل token غير منتهٍ حتى يجد المطابق
- عند التجديد: يُحذف القديم → يُنشأ جديد (rotation)
- عند تسجيل الخروج: يُحذف من قاعدة البيانات
- عند الإقلاع: تُحذف جميع الـ tokens المنتهية تلقائياً

### صلاحيات الوصول
| الإجراء | Admin | Manager | Viewer |
|---|---|---|---|
| قراءة الأجهزة | ✅ | ✅ | ✅ |
| إضافة جهاز | ✅ | ✅ | ❌ |
| حذف جهاز | ✅ | ❌ | ❌ |
| تنفيذ أوامر | ✅ | ✅ | ❌ |
| SSH/SFTP | ✅ | ✅ | ❌ |
| AI Chat | ✅ | ✅ | ✅ |
| إدارة المستخدمين | ✅ | ❌ | ❌ |
| الإعدادات | ✅ | ✅ | ❌ |

### ملاحظات الأمان
- `JWT_SECRET` يجب تغييره في الإنتاج عبر متغير البيئة
- مفاتيح AI API تُخزن في `settings` table كـ plaintext — يُنصح بتشفيرها في الإنتاج
- بيانات SSH لا تُخزن أبداً — تُرسل per-request وتُستخدم مؤقتاً
- CORS مُضبوط ليقبل فقط من `DASHBOARD_URL`

---

## 12. تثبيت البرنامج وتشغيله

### المتطلبات
- Node.js 20 LTS
- pnpm 9+
- (اختياري) Docker

### خطوات التثبيت

```bash
# 1. استنسخ المشروع
git clone https://github.com/your-repo/airemote.git
cd airemote

# 2. ثبّت الحزم
pnpm install

# 3. أنشئ ملف البيئة
cp packages/server/.env.example packages/server/.env
# عدّل: JWT_SECRET, PORT, etc.

# 4. ابنِ AI Engine (يجب أولاً)
pnpm --filter @airemote/ai-engine run build

# 5. ابنِ الخادم
pnpm --filter @airemote/server run build

# 6. شغّل الخادم
pnpm --filter @airemote/server start
# → يعمل على http://0.0.0.0:3001

# 7. في نافذة منفصلة، شغّل الـ Dashboard
pnpm --filter @airemote/dashboard run dev
# → يعمل على http://localhost:5000
```

### تشغيل في الإنتاج

```bash
# خيار 1: مباشرة
NODE_ENV=production node packages/server/dist/index.js

# خيار 2: مع pm2
pm2 start packages/server/dist/index.js --name airemote-server

# خيار 3: بناء الـ Dashboard للإنتاج
pnpm --filter @airemote/dashboard run build
# ثم خدّم dist/ عبر nginx أو Caddy
```

---

## 13. متغيرات البيئة

### الخادم (`packages/server/.env`)

| المتغير | القيمة الافتراضية | الوصف |
|---|---|---|
| `PORT` | `3001` | منفذ الخادم |
| `JWT_SECRET` | `airemote-dev-secret-change-in-production` | ⚠️ غيّره في الإنتاج |
| `DB_PATH` | `./data/airemote.db` | مسار ملف قاعدة البيانات |
| `DASHBOARD_URL` | `*` (كل المصادر) | CORS — حدده في الإنتاج |
| `LOG_LEVEL` | `info` | مستوى التسجيل: error/warn/info/debug |
| `NODE_ENV` | `development` | `production` في الإنتاج |

### Agent (`packages/agent/.env`)

| المتغير | الوصف |
|---|---|
| `AIREMOTE_TOKEN` | رمز مصادقة الجهاز (من لوحة التحكم) |
| `AIREMOTE_SERVER` | عنوان الخادم (مثال: `http://192.168.1.1:3001`) |
| `AIREMOTE_LOG_LEVEL` | مستوى التسجيل |

---

## 14. دليل تثبيت Agent على الأجهزة

### الخطوة 1: إضافة الجهاز في لوحة التحكم
1. افتح **الأجهزة** في القائمة الجانبية
2. انقر **إضافة جهاز**
3. أدخل اسماً وصفياً (مثال: "خادم الإنتاج")
4. انسخ الـ **Token** من النافذة المنبثقة

### الخطوة 2: تثبيت Agent

**Linux / macOS:**
```bash
npm install -g @airemote/agent
airemote-agent start \
  --token "YOUR_DEVICE_TOKEN" \
  --server "http://YOUR_SERVER:3001"
```

**Docker:**
```bash
docker run -d \
  --name airemote-agent \
  --restart unless-stopped \
  -e AIREMOTE_TOKEN="YOUR_DEVICE_TOKEN" \
  -e AIREMOTE_SERVER="http://YOUR_SERVER:3001" \
  ghcr.io/airemote/agent:latest
```

**ملف `.env`:**
```env
AIREMOTE_TOKEN=your-device-token-here
AIREMOTE_SERVER=http://192.168.1.100:3001
AIREMOTE_LOG_LEVEL=info
```

### الخطوة 3: التحقق
بعد تشغيل Agent، ستظهر نقطة خضراء بجانب اسم الجهاز في لوحة التحكم خلال ثوانٍ.

---

## 15. الميزات التفصيلية

### مراقبة الموارد الحية
- **التحديث:** كل 5 ثوانٍ عبر WebSocket heartbeat
- **المعلومات:** CPU% · RAM% · Disk% · Uptime
- **التنبيه:** لون برتقالي عند >70%، أحمر عند >85%
- **التاريخ:** يحتفظ بآخر 60 نقطة (5 دقائق)
- **الرسوم:** خطوط متحركة Recharts في DeviceWorkspace

### SSH Terminal
- **البروتوكول:** WebSocket → Fastify → ssh2 library → الجهاز
- **الأحرف:** UTF-8 مع base64 encoding
- **الميزات:** copy/paste · resize تلقائي · fullscreen · history
- **الخطوط:** JetBrains Mono / Fira Code / Cascadia Code
- **الثيم:** ألوان داكنة محسّنة للعمل الليلي

### SFTP File Manager
- **التصفح:** breadcrumb تفاعلي مع الرجوع للخلف
- **العمليات:** list · read · upload (500MB max) · delete · rename · mkdir
- **الأيقونات:** تصنيف تلقائي (ملف نصي · صورة · أرشيف · قابل للتنفيذ)
- **التحميل:** multipart/form-data مع شريط تقدم

### CommandRunner (Agent Commands)
- **الميزة:** تنفيذ أوامر shell بدون SSH credentials
- **المتطلب:** Agent متصل فقط
- **الحد:** 60 ثانية timeout (قابل للرفع حتى 120)
- **الناتج:** stdout + stderr + exit code + مدة التنفيذ بالمللي ثانية
- **التاريخ:** ↑ و↓ للتنقل بين الأوامر السابقة

### AI Command Execution
- **الكشف:** regex تلقائي على ` ``` ` code blocks في ردود AI
- **اللغات المدعومة للتنفيذ:** bash · sh · shell · zsh (فقط)
- **اللغات الأخرى:** python/yaml/json/etc — نسخ فقط
- **التنفيذ:** `POST /api/devices/:id/exec`
- **النتيجة:** تظهر مباشرة تحت الكود في المحادثة

---

## 16. دليل المستخدم للواجهة

### أول استخدام
1. افتح `http://SERVER:5000`
2. ستُعاد التوجيه لـ **إعداد الحساب**
3. أدخل بريدك الإلكتروني وكلمة مرور (8+ أحرف)
4. ستدخل تلقائياً للوحة التحكم

### إضافة أول جهاز
1. انقر **الأجهزة** في القائمة
2. انقر **إضافة جهاز**
3. أدخل اسم وصفي للجهاز
4. انسخ الـ Token من النافذة
5. ثبّت Agent على الجهاز (تعليمات في النافذة)
6. عد للوحة التحكم — ستظهر نقطة خضراء

### استخدام AI لإدارة جهاز
1. انقر **AI Assistant** في القائمة
2. اختر الجهاز من القائمة الجانبية اليمنى
3. اسأل بالعربية: "ما سبب ارتفاع استهلاك المعالج؟"
4. سيُقترح عليك أمر مثل `top -bn1`
5. انقر **تنفيذ** بجانب الأمر
6. ستظهر النتيجة فوراً تحت الأمر في المحادثة

### SSH من المتصفح
1. افتح الجهاز المطلوب
2. انقر تبويب **SSH Terminal**
3. أدخل IP + اسم المستخدم + كلمة المرور
4. انقر **اتصال**
5. Terminal تفاعلي كامل

---

## 17. القيود والميزات المستقبلية

### القيود الحالية
| القيد | الوصف |
|---|---|
| SSH NAT | SSH يعمل على IP مباشر — الأجهزة خلف NAT تحتاج port forwarding |
| VPN Layer | حقل `tunnelLayer` موجود في DB لكن WireGuard غير مُطبَّق |
| SFTP upload | ملف واحد في كل مرة |
| AI API Keys | مُخزَّنة plaintext في settings — يُنصح بالتشفير في الإنتاج |
| 2FA/TOTP | غير مُطبَّق |
| VNC/RDP | قيد DB و UI موجود لكن البروتوكول غير مُطبَّق |

### الميزات المستقبلية المقترحة
1. **WireGuard integration** — Agent يُنشئ tunnel تلقائي لتجاوز NAT
2. **Reverse Proxy Mode** — Agent يُعيد التوجيه للخادم بدلاً من العكس
3. **التنبيهات** — Webhook/Telegram عند ارتفاع موارد أو انقطاع اتصال
4. **Dashboard Widgets** مُخصَّصة قابلة للسحب والإفلات
5. **تشفير API Keys** في قاعدة البيانات (AES-256)
6. **2FA / TOTP** لحسابات Admin
7. **رفع ملفات متعددة** في SFTP
8. **تخزين SSH keys** مشفراً لتسجيل دخول سريع
9. **تصدير التقارير** (PDF/CSV) لاستخدام الموارد
10. **AI Command History** — حفظ الأوامر المُنفَّذة عبر AI مع نتائجها

---

## 18. أمثلة على سيناريوهات الاستخدام

### سيناريو 1: تشخيص خادم بطيء
```
1. أفتح AiPage → أختار "خادم الإنتاج"
2. أكتب: "الخادم بطيء منذ الصباح، ما السبب؟"
3. AI يقترح: top -bn1 | head -20
4. أنقر "تنفيذ" → أرى العمليات مباشرة
5. AI يحلل النتيجة: "العملية nginx تستهلك 89% CPU"
6. AI يقترح: systemctl restart nginx
7. أنقر "تنفيذ" → المشكلة تُحل
```

### سيناريو 2: إدارة الملفات على خادم بعيد
```
1. أفتح الجهاز → تبويب "الملفات SFTP"
2. أدخل بيانات SSH → أتصل
3. أتصفح /var/log/nginx/
4. أنقر على ملف → أقرأه مباشرة
5. أرفع ملف nginx.conf جديد
6. أحذف السجلات القديمة
```

### سيناريو 3: مراقبة عدة خوادم
```
1. أفتح "نظرة عامة"
2. أرى 5 أجهزة: 4 متصلة، 1 offline
3. بطاقة "خادم DB" تُظهر RAM 87% (برتقالي)
4. أنقر عليها → Workspace
5. تبويب "أوامر" → أكتب: free -h
6. أرى التفاصيل → أتخذ الإجراء المناسب
```

---

## معلومات الدعم

- **المستودع:** [GitHub](https://github.com/your-repo/airemote)
- **المطور:** Ibrahim
- **الإصدار:** 1.0.0
- **الترخيص:** MIT

---

*وثيقة AiRemote الشاملة — آخر تحديث: 2026-05-28*
