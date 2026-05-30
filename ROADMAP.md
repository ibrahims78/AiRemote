# AiRemote — خارطة الطريق الاحترافية

> **الإصدار:** 1.0 — تاريخ الإعداد: مايو 2026  
> **الحالة الحالية:** Production-Ready Core — جاهز للتوسّع  
> **الهدف:** تحويل AiRemote إلى منصة وصول عن بُعد + ذكاء اصطناعي مؤسسية كاملة

---

## 📌 الفهرس

1. [ملخص الحالة الراهنة](#-ملخص-الحالة-الراهنة)
2. [المرحلة 1 — الأساس الأمني](#-المرحلة-1--الأساس-الأمني-الأسبوع-1)
3. [المرحلة 2 — البيانات والتحليل](#-المرحلة-2--البيانات-والتحليل-الأسبوع-2)
4. [المرحلة 3 — تحسين التجربة](#-المرحلة-3--تحسين-التجربة-الأسبوع-3)
5. [المرحلة 4 — الميزات المتقدمة](#-المرحلة-4--الميزات-المتقدمة-الأسبوع-4)
6. [المرحلة 5 — الذكاء الاصطناعي المتقدم](#-المرحلة-5--الذكاء-الاصطناعي-المتقدم-الشهر-2)
7. [جدول الأولويات الشامل](#-جدول-الأولويات-الشامل)
8. [نتائج التدقيق الأمني](#-نتائج-التدقيق-الأمني-المكتمل)

---

## 📊 ملخص الحالة الراهنة

### ما يعمل الآن بشكل مثالي ✅

| المكوّن | الحالة | التفاصيل |
|---|---|---|
| WebSocket Agent↔Server | ✅ مثالي | بروتوكول كامل: register, heartbeat, command |
| مصادقة JWT | ✅ آمنة | Access 15min + Refresh 30d مع rotation |
| SSH Terminal | ✅ يعمل | xterm-256color, resize, stdin/stdout |
| SFTP File Manager | ✅ يعمل | list, upload, download, delete, rename, mkdir |
| AI Chat (OpenAI/Gemini/Ollama) | ✅ يعمل | محادثات محفوظة، سياق الجهاز |
| إحصائيات حية (CPU/RAM/Disk/Network) | ✅ مُصلَحة | تقرأ /proc/net/dev و df -k |
| إدارة المستخدمين | ✅ يعمل | 3 أدوار: admin/manager/viewer |
| Dark/Light Mode + AR/EN | ✅ يعمل | Zustand reactive |
| TypeScript — صفر أخطاء | ✅ | كل الـ 4 packages نظيفة |

### الإصلاحات الأمنية المكتملة ✅

| الثغرة | الخطورة | الحل المطبّق |
|---|---|---|
| /ssh WebSocket بلا مصادقة | 🔴 حرجة | requireAuthWs preHandler |
| /ws يقبل userId مزوّر | 🔴 حرجة | استخدام JWT المُتحقق منه |
| CORS مفتوح في الإنتاج | 🟡 عالية | مقيّد بـ DASHBOARD_URL |
| Heartbeat بدون تحقق Socket | 🟡 عالية | يتحقق من registry |
| stats.ts يعيد أصفاراً | 🔴 وظيفية | يقرأ /proc/net/dev و df |
| لا فحص ملكية device sessions | 🟡 عالية | يتحقق من ownerId |

---

## 🚨 المرحلة 1 — الأساس الأمني (الأسبوع 1)

### الميزة 1.1 — Rate Limiting على نقاط المصادقة

#### المشكلة
`/api/auth/login` مفتوح بالكامل — يمكن إرسال ملايين الطلبات (brute force attack) دون أي قيد.

#### الحل التقني

```bash
# تثبيت المكتبة
pnpm --filter @airemote/server add @fastify/rate-limit
```

```typescript
// packages/server/src/app.ts — إضافة بعد تسجيل jwt مباشرة

import rateLimit from '@fastify/rate-limit'

// Rate limit شامل لكل API
await app.register(rateLimit, {
  global: false,  // لا نطبّقه على الكل — فقط على auth
  max: 100,
  timeWindow: '1 minute'
})

// في authRoutes — rate limit صارم على login فقط
fastify.post('/login', {
  config: {
    rateLimit: {
      max: 5,
      timeWindow: '15 minutes',
      keyGenerator: (req) => req.ip,
      errorResponseBuilder: (_req, context) => ({
        error: 'Too many login attempts',
        retryAfter: Math.ceil(context.ttl / 1000)
      })
    }
  }
}, async (request, reply) => {
  // ... الكود الموجود
})

// rate limit أقل صرامة على /refresh
fastify.post('/refresh', {
  config: {
    rateLimit: { max: 20, timeWindow: '1 minute' }
  }
}, async (request, reply) => {
  // ... الكود الموجود
})
```

#### الاختبار

```bash
# اختبار يدوي: تجاوز الحد
for i in {1..6}; do
  curl -s -X POST http://localhost:3001/api/auth/login \
    -H "Content-Type: application/json" \
    -d '{"email":"test@test.com","password":"wrong"}' | jq .
done
# يجب أن يُرجع المحاولة الـ 6 خطأ 429

# نتيجة متوقعة للمحاولات 1-5
{"error":"بيانات الدخول غير صحيحة"}  # 401

# نتيجة المحاولة 6
{"error":"Too many login attempts","retryAfter":900}  # 429
```

#### النتيجة المرجوة
- ✅ أي IP يتجاوز 5 محاولات خاطئة يُحظر تلقائياً 15 دقيقة
- ✅ حماية كل حسابات المستخدمين من كسر كلمة المرور
- ✅ الاستجابة تُخبر العميل متى يعود (`retryAfter` بالثواني)
- ✅ لا تأثير على الاتصالات الطبيعية الصحيحة

---

### الميزة 1.2 — تسجيل الجلسات تلقائياً

#### المشكلة
جدول `sessions` وكود `createSession/endSession` موجودان في قاعدة البيانات لكنهما لا يُستدعيان — صفحة "الجلسات" تبقى فارغة إلى الأبد مهما استُخدم البرنامج.

#### الحل التقني

```typescript
// packages/server/src/ws/sshHandler.ts — إضافة session recording

import { createSession, endSession } from '../db/sessions'
import type { AuthTokenPayload } from '@airemote/shared'

export function handleSshWebSocket(socket: WebSocket, request: FastifyRequest) {
  // استخراج userId من الـ JWT المُتحقق منه
  const authUser = request.user as unknown as AuthTokenPayload
  let activeSessionId: string | null = null

  // عند الاتصال الناجح
  client.on('ready', () => {
    client.shell({ term: 'xterm-256color', ... }, async (err, stream) => {
      
      // ✨ تسجيل بداية الجلسة
      try {
        const session = await createSession(
          deviceId,          // من msg.payload.deviceId
          authUser.userId,   // من JWT
          'ssh',
          request.ip
        )
        activeSessionId = session.id
      } catch (e) {
        console.error('Failed to create session record:', e)
      }

      stream.on('close', async () => {
        // ✨ تسجيل نهاية الجلسة مع حساب المدة
        if (activeSessionId) {
          await endSession(activeSessionId).catch(() => {})
          activeSessionId = null
        }
        socket.send(JSON.stringify({ type: 'ssh:closed', payload: {} }))
        client.end()
      })
    })
  })
}

// نفس النمط في sftpRoutes لكل عملية SFTP
// ونفسه في devices.ts عند تنفيذ exec
```

```typescript
// packages/server/src/db/sessions.ts — إضافة دالة مساعدة جديدة

export async function getActiveSessionsCount(): Promise<number> {
  const db = getDb()
  const result = await db.execute({
    sql: `SELECT COUNT(*) as count FROM sessions WHERE ended_at IS NULL`,
    args: []
  })
  const row = result.rows[0] as unknown as { count: number }
  return row.count
}

export async function getSessionStats(): Promise<{
  total: number
  byType: Record<string, number>
  avgDurationSec: number
}> {
  const db = getDb()
  const result = await db.execute(`
    SELECT 
      COUNT(*) as total,
      type,
      AVG(duration_sec) as avg_duration
    FROM sessions 
    WHERE ended_at IS NOT NULL
    GROUP BY type
  `)
  // ... تجميع النتائج
}
```

#### الاختبار

```bash
# 1. اتصل بجهاز عبر SSH من الداشبورد
# 2. افصل الاتصال
# 3. تحقق من قاعدة البيانات

curl -H "Authorization: Bearer $TOKEN" \
  http://localhost:3001/api/sessions | jq .

# نتيجة متوقعة
[
  {
    "id": "uuid-xxx",
    "deviceName": "My Server",
    "userId": "user-xxx",
    "type": "ssh",
    "startedAt": "2026-05-30T10:00:00Z",
    "endedAt": "2026-05-30T10:25:00Z",
    "durationSec": 1500,
    "ipAddress": "192.168.1.100"
  }
]
```

#### النتيجة المرجوة
- ✅ صفحة "الجلسات" في الداشبورد تُظهر تاريخاً كاملاً
- ✅ كل جلسة SSH/SFTP/exec محفوظة مع المدة الدقيقة
- ✅ المدير يعرف: من اتصل، بأي جهاز، متى، وكم دامت
- ✅ أساس جاهز لنظام الـ Audit Log (الميزة 2.2)

---

## 📈 المرحلة 2 — البيانات والتحليل (الأسبوع 2)

### الميزة 2.1 — تاريخ إحصائيات الأجهزة (Historical Stats)

#### المشكلة
بيانات CPU/RAM/Disk تُعرض حية فقط — لا يمكن الإجابة على "متى ارتفع الـ CPU أمس؟" أو "كيف تغيّر استخدام الذاكرة خلال أسبوع؟"

#### الحل التقني — الجزء 1: قاعدة البيانات

```typescript
// packages/server/src/db/database.ts — إضافة في runMigrations()

await db.executeMultiple(`
  CREATE TABLE IF NOT EXISTS device_stats_history (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    device_id   TEXT NOT NULL,
    cpu_percent INTEGER NOT NULL DEFAULT 0,
    ram_percent INTEGER NOT NULL DEFAULT 0,
    disk_percent INTEGER NOT NULL DEFAULT 0,
    net_up_kbps INTEGER NOT NULL DEFAULT 0,
    net_down_kbps INTEGER NOT NULL DEFAULT 0,
    uptime      INTEGER NOT NULL DEFAULT 0,
    recorded_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  -- Index للاستعلامات السريعة جداً
  CREATE INDEX IF NOT EXISTS idx_stats_device_time 
    ON device_stats_history(device_id, recorded_at DESC);
`)
```

#### الجزء 2: حفظ البيانات عند كل heartbeat

```typescript
// packages/server/src/ws/agentHandler.ts

case 'agent:heartbeat': {
  // ... الكود الموجود ...

  // ✨ حفظ نقطة بيانات تاريخية
  const db = getDb()
  const now = new Date().toISOString()
  
  await db.execute({
    sql: `INSERT INTO device_stats_history 
          (device_id, cpu_percent, ram_percent, disk_percent, 
           net_up_kbps, net_down_kbps, uptime, recorded_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [
      payload.deviceId,
      payload.stats.cpuPercent,
      payload.stats.ramPercent,
      payload.stats.diskPercent,
      payload.stats.networkUpKbps,
      payload.stats.networkDownKbps,
      payload.stats.uptime,
      now
    ]
  })

  // ✨ تنظيف تلقائي — احتفظ بـ 30 يوماً فقط
  // يعمل في الخلفية بدون انتظار (fire-and-forget)
  db.execute({
    sql: `DELETE FROM device_stats_history 
          WHERE device_id = ? AND recorded_at < datetime('now', '-30 days')`,
    args: [payload.deviceId]
  }).catch(() => {})
}
```

#### الجزء 3: Route لجلب التاريخ

```typescript
// packages/server/src/routes/devices.ts — route جديد

fastify.get<{
  Params: { id: string }
  Querystring: { range?: '1h' | '24h' | '7d' | '30d'; metric?: string }
}>('/:id/history', async (request, reply) => {
  const user = request.user as unknown as AuthTokenPayload
  const { id } = request.params
  const { range = '24h' } = request.query

  const device = await getDeviceById(id)
  if (!device) return reply.code(404).send({ error: 'Device not found' })
  if (user.role !== 'admin' && device.ownerId !== user.userId) {
    return reply.code(403).send({ error: 'Forbidden' })
  }

  // تحويل النطاق الزمني إلى SQLite interval
  const intervals: Record<string, string> = {
    '1h': '-1 hours',
    '24h': '-24 hours',
    '7d': '-7 days',
    '30d': '-30 days'
  }
  
  // تجميع البيانات (sampling) لتقليل النقاط المُرجَعة
  // 1h → كل 30 ثانية (max 120 نقطة)
  // 24h → كل 10 دقائق (max 144 نقطة)
  // 7d → كل ساعة (max 168 نقطة)
  // 30d → كل 4 ساعات (max 180 نقطة)
  const groupBy: Record<string, string> = {
    '1h': "strftime('%Y-%m-%dT%H:%M:00Z', recorded_at)",
    '24h': "strftime('%Y-%m-%dT%H:%M:00Z', recorded_at, 'start of minute')",
    '7d': "strftime('%Y-%m-%dT%H:00:00Z', recorded_at)",
    '30d': "strftime('%Y-%m-%dT%H:00:00Z', recorded_at)"
  }

  const db = getDb()
  const result = await db.execute({
    sql: `SELECT 
            ${groupBy[range]} as time,
            ROUND(AVG(cpu_percent)) as cpu,
            ROUND(AVG(ram_percent)) as ram,
            ROUND(AVG(disk_percent)) as disk,
            ROUND(AVG(net_up_kbps)) as net_up,
            ROUND(AVG(net_down_kbps)) as net_down
          FROM device_stats_history
          WHERE device_id = ?
            AND recorded_at > datetime('now', '${intervals[range]}')
          GROUP BY ${groupBy[range]}
          ORDER BY time ASC`,
    args: [id]
  })

  return { deviceId: id, range, points: result.rows }
})
```

#### الجزء 4: الواجهة

```typescript
// packages/dashboard/src/components/MonitoringCharts.tsx
// استبدال الـ charts الحية بـ charts تاريخية قابلة للتبديل

import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'

// زر اختيار النطاق الزمني
const RANGES = ['1h', '24h', '7d', '30d'] as const

export function HistoricalCharts({ deviceId }: { deviceId: string }) {
  const [range, setRange] = useState<typeof RANGES[number]>('24h')
  const { data } = useQuery({
    queryKey: ['device-history', deviceId, range],
    queryFn: () => api.get(`/devices/${deviceId}/history?range=${range}`),
    refetchInterval: 60_000  // تحديث كل دقيقة
  })

  return (
    <div>
      {/* أزرار اختيار النطاق */}
      <div className="flex gap-2 mb-4">
        {RANGES.map(r => (
          <button key={r} onClick={() => setRange(r)}
            className={r === range ? 'btn-active' : 'btn'}>
            {r}
          </button>
        ))}
      </div>

      {/* رسم بياني للـ CPU */}
      <ResponsiveContainer width="100%" height={200}>
        <LineChart data={data?.points}>
          <XAxis dataKey="time" />
          <YAxis domain={[0, 100]} unit="%" />
          <Tooltip />
          <Line type="monotone" dataKey="cpu" stroke="#3B82F6" dot={false} />
        </LineChart>
      </ResponsiveContainer>

      {/* ... باقي الـ charts */}
    </div>
  )
}
```

#### الاختبار

```bash
# بعد 10 دقائق من اتصال agent

curl -H "Authorization: Bearer $TOKEN" \
  "http://localhost:3001/api/devices/$DEVICE_ID/history?range=1h" | jq .

# نتيجة متوقعة
{
  "deviceId": "uuid-xxx",
  "range": "1h",
  "points": [
    {"time": "2026-05-30T10:00:00Z", "cpu": 23, "ram": 45, "disk": 67},
    {"time": "2026-05-30T10:10:00Z", "cpu": 31, "ram": 46, "disk": 67},
    ...
  ]
}
```

#### النتيجة المرجوة
- ✅ رسوم بيانية تاريخية لـ CPU, RAM, Disk, Network
- ✅ اكتشاف الأنماط: "الـ CPU يرتفع كل ليلة بسبب backup"
- ✅ تتبع نمو القرص عبر الأيام لتوقع امتلائه
- ✅ لا تأثير على الأداء — حفظ في الخلفية (fire-and-forget)
- ✅ تنظيف تلقائي بعد 30 يوماً لتوفير المساحة

---

### الميزة 2.2 — Audit Log (سجل التدقيق)

#### المشكلة
لا يوجد سجل لـ"من فعل ماذا على أي جهاز ومتى". في البيئات المؤسسية هذا متطلب أمني وقانوني.

#### الحل التقني

```typescript
// packages/server/src/db/database.ts — جدول جديد في runMigrations()

await db.executeMultiple(`
  CREATE TABLE IF NOT EXISTS audit_log (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id     TEXT NOT NULL,
    user_email  TEXT NOT NULL,
    device_id   TEXT,
    action      TEXT NOT NULL,
    -- action values: login_success | login_failed | logout |
    --   device_created | device_deleted | device_renamed |
    --   exec_command | ssh_connect | ssh_disconnect |
    --   sftp_upload | sftp_download | sftp_delete |
    --   user_created | user_deleted | user_updated |
    --   ai_chat | settings_updated
    details     TEXT,  -- JSON: بيانات إضافية حسب نوع الحدث
    ip_address  TEXT,
    status_code INTEGER,
    created_at  TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_audit_user_time 
    ON audit_log(user_id, created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_audit_device_time 
    ON audit_log(device_id, created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_audit_action 
    ON audit_log(action, created_at DESC);
`)
```

```typescript
// packages/server/src/db/audit.ts — ملف جديد

import { getDb } from './database'

export interface AuditEntry {
  userId: string
  userEmail: string
  deviceId?: string
  action: string
  details?: Record<string, unknown>
  ipAddress?: string
  statusCode?: number
}

export async function logAudit(entry: AuditEntry): Promise<void> {
  try {
    const db = getDb()
    await db.execute({
      sql: `INSERT INTO audit_log 
            (user_id, user_email, device_id, action, details, ip_address, status_code)
            VALUES (?, ?, ?, ?, ?, ?, ?)`,
      args: [
        entry.userId,
        entry.userEmail,
        entry.deviceId || null,
        entry.action,
        entry.details ? JSON.stringify(entry.details) : null,
        entry.ipAddress || null,
        entry.statusCode || null
      ]
    })
  } catch (e) {
    // Audit log never crashes the main flow
    console.error('Audit log failed:', e)
  }
}

export async function getAuditLog(filters: {
  userId?: string
  deviceId?: string
  action?: string
  fromDate?: string
  toDate?: string
  limit?: number
  offset?: number
}): Promise<{ entries: unknown[]; total: number }> {
  const db = getDb()
  const conditions: string[] = []
  const args: unknown[] = []

  if (filters.userId)   { conditions.push('user_id = ?');   args.push(filters.userId) }
  if (filters.deviceId) { conditions.push('device_id = ?'); args.push(filters.deviceId) }
  if (filters.action)   { conditions.push('action = ?');    args.push(filters.action) }
  if (filters.fromDate) { conditions.push('created_at >= ?'); args.push(filters.fromDate) }
  if (filters.toDate)   { conditions.push('created_at <= ?'); args.push(filters.toDate) }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''
  const limit  = filters.limit  || 50
  const offset = filters.offset || 0

  const [dataResult, countResult] = await Promise.all([
    db.execute({
      sql: `SELECT * FROM audit_log ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
      args: [...args, limit, offset]
    }),
    db.execute({
      sql: `SELECT COUNT(*) as total FROM audit_log ${where}`,
      args
    })
  ])

  const total = (countResult.rows[0] as unknown as { total: number }).total
  return { entries: dataResult.rows, total }
}
```

```typescript
// packages/server/src/routes/audit.ts — ملف جديد

import type { FastifyInstance } from 'fastify'
import { requireAdmin } from '../middleware/auth'
import { getAuditLog } from '../db/audit'

export async function auditRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', requireAdmin)

  fastify.get<{
    Querystring: {
      userId?: string
      deviceId?: string
      action?: string
      from?: string
      to?: string
      page?: string
    }
  }>('/', async (request) => {
    const { userId, deviceId, action, from, to, page = '1' } = request.query
    const pageNum = parseInt(page)
    const limit = 50
    const offset = (pageNum - 1) * limit

    return getAuditLog({ userId, deviceId, action, fromDate: from, toDate: to, limit, offset })
  })

  // تصدير CSV للمراجعة الخارجية
  fastify.get('/export', async (request, reply) => {
    const { from, to } = request.query as { from?: string; to?: string }
    const { entries } = await getAuditLog({ fromDate: from, toDate: to, limit: 10000 })

    const csv = [
      'ID,User Email,Device ID,Action,Details,IP Address,Status,Timestamp',
      ...(entries as Record<string, unknown>[]).map(e =>
        [e.id, e.user_email, e.device_id || '', e.action,
         JSON.stringify(e.details || {}), e.ip_address || '',
         e.status_code || '', e.created_at].join(',')
      )
    ].join('\n')

    reply.header('Content-Type', 'text/csv')
    reply.header('Content-Disposition', 'attachment; filename="audit-log.csv"')
    return reply.send(csv)
  })
}
```

```typescript
// تسجيل تلقائي في auth.ts — مثال
await logAudit({
  userId: user.id,
  userEmail: user.email,
  action: 'login_success',
  ipAddress: request.ip
})

// في exec endpoint
await logAudit({
  userId: user.userId,
  userEmail: user.email,
  deviceId: id,
  action: 'exec_command',
  details: { command: command.trim(), exitCode: result.exitCode },
  ipAddress: request.ip
})
```

#### الاختبار

```bash
# تنفيذ بعض العمليات ثم:
curl -H "Authorization: Bearer $ADMIN_TOKEN" \
  "http://localhost:3001/api/audit?action=exec_command" | jq .

# نتيجة متوقعة
{
  "entries": [
    {
      "id": 42,
      "user_email": "admin@company.com",
      "device_id": "device-uuid",
      "action": "exec_command",
      "details": "{\"command\":\"df -h\",\"exitCode\":0}",
      "ip_address": "192.168.1.100",
      "created_at": "2026-05-30T10:30:00Z"
    }
  ],
  "total": 1
}
```

#### النتيجة المرجوة
- ✅ "من حذف هذا الملف؟" — إجابة فورية مع الوقت والـ IP
- ✅ "ماذا فعل المستخدم X في آخر 30 دقيقة؟" — سجل كامل
- ✅ تصدير CSV للمراجعة القانونية أو الخارجية
- ✅ الـ Admin يرى جميع العمليات؛ المستخدمون العاديون لا يصلون إليه
- ✅ لا يوقف التطبيق عند الفشل (try-catch صامت)

---

## 🛡️ المرحلة 3 — تحسين التجربة (الأسبوع 3)

### الميزة 3.1 — نظام الإشعارات (Notifications & Alerts)

#### المشكلة
لا يعلم المستخدم بانقطاع جهاز حيوي إلا إذا فتح الداشبورد يدوياً. لا تحذيرات عند ارتفاع الـ CPU أو امتلاء القرص.

#### الحل التقني

```typescript
// packages/server/src/db/database.ts — جداول جديدة

await db.executeMultiple(`
  CREATE TABLE IF NOT EXISTS alert_rules (
    id          TEXT PRIMARY KEY,
    user_id     TEXT NOT NULL,
    device_id   TEXT,          -- NULL = جميع الأجهزة
    type        TEXT NOT NULL,
    -- 'device_offline' | 'device_online' | 'cpu_high' | 'ram_high' | 'disk_high'
    threshold   INTEGER,       -- النسبة المئوية للـ cpu/ram/disk
    cooldown_min INTEGER NOT NULL DEFAULT 30,  -- لا تكرر التنبيه خلال 30 دقيقة
    channel     TEXT NOT NULL DEFAULT 'in_app',
    webhook_url TEXT,
    enabled     INTEGER NOT NULL DEFAULT 1,
    created_at  TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS notifications (
    id          TEXT PRIMARY KEY,
    user_id     TEXT NOT NULL,
    rule_id     TEXT,
    device_id   TEXT,
    type        TEXT NOT NULL,
    title       TEXT NOT NULL,
    message     TEXT NOT NULL,
    severity    TEXT NOT NULL DEFAULT 'info',
    -- 'info' | 'warning' | 'critical'
    read        INTEGER NOT NULL DEFAULT 0,
    created_at  TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id)
  );

  CREATE INDEX IF NOT EXISTS idx_notif_user_unread 
    ON notifications(user_id, read, created_at DESC);
`)
```

```typescript
// packages/server/src/services/alertEngine.ts — ملف جديد

import { getDb } from '../db/database'
import { deviceRegistry } from '../ws/registry'
import type { DeviceStats } from '@airemote/shared'

// تتبع آخر مرة أُرسل فيها تنبيه لتطبيق الـ cooldown
const lastAlertTime = new Map<string, number>() // `${ruleId}-${deviceId}` → timestamp

export async function evaluateAlerts(deviceId: string, stats: DeviceStats): Promise<void> {
  const db = getDb()
  
  // جلب قواعد التنبيه المتعلقة بهذا الجهاز
  const result = await db.execute({
    sql: `SELECT * FROM alert_rules 
          WHERE enabled = 1 AND (device_id = ? OR device_id IS NULL)`,
    args: [deviceId]
  })

  for (const rule of result.rows as unknown as AlertRule[]) {
    let triggered = false
    let title = ''
    let message = ''
    let severity: 'info' | 'warning' | 'critical' = 'warning'

    // تقييم كل نوع تنبيه
    switch (rule.type) {
      case 'cpu_high':
        if (stats.cpuPercent >= (rule.threshold || 90)) {
          triggered = true
          title = `CPU مرتفع على ${deviceId}`
          message = `استخدام المعالج وصل إلى ${stats.cpuPercent}% (الحد: ${rule.threshold}%)`
          severity = stats.cpuPercent >= 95 ? 'critical' : 'warning'
        }
        break

      case 'ram_high':
        if (stats.ramPercent >= (rule.threshold || 90)) {
          triggered = true
          title = `الذاكرة مرتفعة على ${deviceId}`
          message = `استخدام الذاكرة وصل إلى ${stats.ramPercent}%`
          severity = 'warning'
        }
        break

      case 'disk_high':
        if (stats.diskPercent >= (rule.threshold || 85)) {
          triggered = true
          title = `القرص يمتلئ على ${deviceId}`
          message = `استخدام القرص وصل إلى ${stats.diskPercent}%`
          severity = stats.diskPercent >= 95 ? 'critical' : 'warning'
        }
        break
    }

    if (!triggered) continue

    // تطبيق الـ cooldown
    const cooldownKey = `${rule.id}-${deviceId}`
    const lastTime = lastAlertTime.get(cooldownKey) || 0
    const cooldownMs = (rule.cooldown_min || 30) * 60 * 1000
    if (Date.now() - lastTime < cooldownMs) continue

    lastAlertTime.set(cooldownKey, Date.now())
    await sendAlert(rule, deviceId, title, message, severity)
  }
}

async function sendAlert(
  rule: AlertRule,
  deviceId: string,
  title: string,
  message: string,
  severity: string
): Promise<void> {
  const db = getDb()
  const { v4: uuidv4 } = await import('uuid')

  // حفظ الإشعار في قاعدة البيانات
  const notifId = uuidv4()
  await db.execute({
    sql: `INSERT INTO notifications (id, user_id, rule_id, device_id, type, title, message, severity)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [notifId, rule.user_id, rule.id, deviceId, rule.type, title, message, severity]
  })

  // بث الإشعار live إلى الداشبورد عبر WebSocket
  deviceRegistry.broadcastNotification(rule.user_id, {
    id: notifId, type: rule.type, title, message, severity,
    deviceId, createdAt: new Date().toISOString()
  })

  // Webhook (Slack/Discord/أي خدمة)
  if (rule.channel === 'webhook' && rule.webhook_url) {
    fetch(rule.webhook_url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: `🔔 *${title}*\n${message}`,
        // متوافق مع Slack وDiscord وغيرهما
      })
    }).catch(() => {})
  }
}
```

```typescript
// packages/server/src/ws/registry.ts — إضافة broadcast للإشعارات

broadcastNotification(userId: string, notification: object): void {
  const msg = JSON.stringify({
    type: 'broadcast:notification',
    payload: notification,
    timestamp: Date.now()
  })
  for (const [, client] of this.clients) {
    if (client.userId === userId && client.socket.readyState === 1) {
      try { client.socket.send(msg) } catch {}
    }
  }
}
```

#### الاختبار

```bash
# 1. إنشاء قاعدة تنبيه
curl -X POST -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  http://localhost:3001/api/alerts \
  -d '{
    "type": "cpu_high",
    "threshold": 50,
    "cooldown_min": 1
  }'

# 2. تشغيل حمل على الـ CPU
stress --cpu 4 --timeout 30s

# 3. خلال 10 ثوانٍ — تحقق من الإشعارات
curl -H "Authorization: Bearer $TOKEN" \
  http://localhost:3001/api/notifications | jq .

# نتيجة متوقعة
[{
  "id": "notif-xxx",
  "type": "cpu_high",
  "title": "CPU مرتفع على My Server",
  "message": "استخدام المعالج وصل إلى 78%",
  "severity": "warning",
  "read": false
}]
```

#### النتيجة المرجوة
- ✅ إشعار فوري في الداشبورد عند انقطاع أي جهاز
- ✅ تحذير عند وصول CPU/RAM/Disk لحدود مُخصَّصة
- ✅ Webhook لإرسال التنبيهات إلى Slack/Discord/Teams
- ✅ نظام cooldown يمنع فيضان الإشعارات المتكررة
- ✅ بيل (🔔) في شريط الداشبورد مع عدّاد الغير مقروءة

---

### الميزة 3.2 — SSH Key Management (إدارة بيانات الاتصال)

#### المشكلة
كل مرة يريد المستخدم الاتصال بجهاز عبر SSH يُدخل كلمة المرور أو المفتاح يدوياً — لا "محفظة بيانات اعتماد" آمنة.

#### الحل التقني

```typescript
// packages/server/src/db/database.ts — جدول جديد

await db.executeMultiple(`
  CREATE TABLE IF NOT EXISTS device_credentials (
    id           TEXT PRIMARY KEY,
    device_id    TEXT NOT NULL,
    user_id      TEXT NOT NULL,
    label        TEXT NOT NULL,
    ssh_host     TEXT NOT NULL,
    ssh_port     INTEGER NOT NULL DEFAULT 22,
    ssh_username TEXT NOT NULL,
    secret_type  TEXT NOT NULL,  -- 'password' | 'private_key'
    secret_enc   TEXT NOT NULL,  -- مشفّر بـ AES-256-GCM
    last_used    TEXT,
    created_at   TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(device_id, user_id, label),
    FOREIGN KEY (device_id) REFERENCES devices(id),
    FOREIGN KEY (user_id) REFERENCES users(id)
  );
`)
```

```typescript
// packages/server/src/services/crypto.ts — ملف جديد

import crypto from 'crypto'

const ALGORITHM = 'aes-256-gcm'
const KEY_LENGTH = 32  // 256 bits

function getEncryptionKey(): Buffer {
  const key = process.env.CREDENTIALS_KEY
  if (!key || key.length < 32) {
    throw new Error('CREDENTIALS_KEY must be set in .env (min 32 chars)')
  }
  return Buffer.from(key.slice(0, 32), 'utf8')
}

export function encrypt(plaintext: string): string {
  const key = getEncryptionKey()
  const iv = crypto.randomBytes(16)
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv)
  
  const encrypted = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final()
  ])
  const authTag = cipher.getAuthTag()
  
  // تخزين: iv:authTag:ciphertext (كلها hex)
  return [iv.toString('hex'), authTag.toString('hex'), encrypted.toString('hex')].join(':')
}

export function decrypt(encoded: string): string {
  const key = getEncryptionKey()
  const [ivHex, tagHex, dataHex] = encoded.split(':')
  
  const iv = Buffer.from(ivHex, 'hex')
  const tag = Buffer.from(tagHex, 'hex')
  const data = Buffer.from(dataHex, 'hex')
  
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv)
  decipher.setAuthTag(tag)
  
  return decipher.update(data) + decipher.final('utf8')
}
```

```typescript
// في واجهة SSH Terminal — إضافة قائمة منسدلة
// "اختر بيانات محفوظة" أو "اتصال جديد"

const savedCredentials = await api.get(`/credentials?deviceId=${device.id}`)
// لا يُرجع كلمات المرور — فقط الـ labels للعرض
// [{id, label, ssh_host, ssh_username}]
```

#### .env — المتغيرات المطلوبة

```env
# يجب إضافتها قبل أول استخدام
CREDENTIALS_KEY=your-32-char-minimum-secret-key-here
JWT_SECRET=another-strong-secret-for-jwt-tokens
```

#### النتيجة المرجوة
- ✅ اتصال SSH بنقرة واحدة بدل إدخال البيانات كل مرة
- ✅ كلمات المرور والمفاتيح مشفّرة في قاعدة البيانات (AES-256-GCM)
- ✅ كل مستخدم له محفظته الخاصة — لا يرى بيانات الآخرين
- ✅ الـ API لا يُرجع البيانات السرية أبداً — فقط الـ labels للعرض

---

## ⚡ المرحلة 4 — الميزات المتقدمة (الأسبوع 4)

### الميزة 4.1 — Device Groups & Tags

#### الحل التقني

```typescript
// Migration — عمود واحد فقط
ALTER TABLE devices ADD COLUMN tags TEXT NOT NULL DEFAULT '[]';
-- مثال على القيم: '["production","web-server","us-east-1"]'

// API
GET  /api/devices?tag=production    → أجهزة tag معين
POST /api/devices/:id/tags          → إضافة tag
DELETE /api/devices/:id/tags/:tag   → حذف tag
```

**النتيجة:** تصفية سريعة عند وجود 100+ جهاز.

---

### الميزة 4.2 — Bulk Command Execution

#### الحل التقني

```typescript
// packages/server/src/routes/devices.ts — route جديد

fastify.post<{
  Body: { deviceIds: string[]; command: string; timeoutMs?: number }
}>('/bulk-exec', async (request, reply) => {
  const user = request.user as unknown as AuthTokenPayload
  const { deviceIds, command, timeoutMs = 30000 } = request.body

  if (!command?.trim()) return reply.code(400).send({ error: 'Command required' })
  if (!Array.isArray(deviceIds) || deviceIds.length === 0) {
    return reply.code(400).send({ error: 'deviceIds required' })
  }
  if (deviceIds.length > 50) {
    return reply.code(400).send({ error: 'Max 50 devices per bulk command' })
  }

  // تنفيذ على الكل بالتوازي
  const results = await Promise.allSettled(
    deviceIds.map(async id => {
      const device = await getDeviceById(id)
      if (!device) return { deviceId: id, error: 'Not found' }
      if (user.role !== 'admin' && device.ownerId !== user.userId) {
        return { deviceId: id, error: 'Forbidden' }
      }
      if (!deviceRegistry.isDeviceOnline(id)) {
        return { deviceId: id, error: 'Offline' }
      }
      
      const commandId = uuidv4()
      const result = await sendCommandToAgent(id, commandId, command.trim(), timeoutMs)
      return { deviceId: id, ...result }
    })
  )

  return results.map((r, i) => ({
    deviceId: deviceIds[i],
    ...(r.status === 'fulfilled' ? r.value : { error: r.reason?.message })
  }))
})
```

**النتيجة:** تحديث 50 سيرفر بأمر واحد بدلاً من تكرار العملية يدوياً.

---

### الميزة 4.3 — 2FA / TOTP

#### الحل التقني

```bash
pnpm --filter @airemote/server add otplib qrcode
```

```typescript
// في جدول users — عمود جديد
ALTER TABLE users ADD COLUMN totp_secret TEXT;
ALTER TABLE users ADD COLUMN totp_enabled INTEGER NOT NULL DEFAULT 0;

// تفعيل الـ 2FA
import { authenticator } from 'otplib'
import QRCode from 'qrcode'

// 1. توليد secret وQR code
const secret = authenticator.generateSecret()
const otpauth = authenticator.keyuri(user.email, 'AiRemote', secret)
const qrDataUrl = await QRCode.toDataURL(otpauth)
// → إرجاع qrDataUrl للواجهة لعرض الـ QR code

// 2. تحقق من الكود عند التفعيل
const isValid = authenticator.verify({ token: userCode, secret })
if (isValid) {
  await db.execute({
    sql: 'UPDATE users SET totp_secret = ?, totp_enabled = 1 WHERE id = ?',
    args: [secret, userId]
  })
}

// 3. في نقطة /login — إضافة مرحلة ثانية
if (user.totp_enabled) {
  // إرجاع مؤقت: {requiresTotp: true, tempToken: shortLivedToken}
  // العميل يُرسل كود TOTP
  // السيرفر يتحقق ثم يُصدر JWT كامل
}
```

**النتيجة:** حتى مع كلمة مرور مسرّبة، لا يمكن الدخول بدون الهاتف.

---

## 🤖 المرحلة 5 — الذكاء الاصطناعي المتقدم (الشهر 2)

### الميزة 5.1 — AI Auto-Healing

#### الفكرة الكاملة

```
1. Alert Engine يكتشف: CPU > 90% لمدة 5 دقائق
2. يجمع السياق تلقائياً:
   - top -bn1 | head -20
   - free -h
   - df -h
   - journalctl -n 50 --no-pager
3. يُرسل للـ AI:
   "الجهاز X يعاني من CPU مرتفع. إليك البيانات: [...]
    ما المشكلة المحتملة وما الأمر المناسب للإصلاح؟"
4. AI يُحلّل ويُرجع:
   {
     "diagnosis": "الـ process nginx مُحمّل بشكل غير طبيعي",
     "suggestion": "systemctl restart nginx",
     "confidence": "high",
     "risk": "low"
   }
5. السيرفر يُرسل للمستخدم: إشعار مع الاقتراح
6. المستخدم يوافق بنقرة واحدة
7. السيرفر ينفّذ الأمر عبر الـ Agent
8. يُسجّل النتيجة في Audit Log
```

```typescript
// packages/server/src/services/autoHeal.ts

export async function triggerAutoHeal(
  deviceId: string,
  alertType: string,
  stats: DeviceStats
): Promise<void> {
  // 1. جمع السياق
  const context = await collectDiagnostics(deviceId)
  
  // 2. استشارة الـ AI
  const aiConfig = await getSystemAIConfig()
  const provider = createAIProvider(aiConfig)
  
  const prompt = buildDiagnosticPrompt(alertType, stats, context)
  const response = await provider.chat([
    { role: 'user', content: prompt, timestamp: new Date() }
  ])
  
  const suggestion = parseAISuggestion(response)
  
  // 3. إرسال اقتراح للمستخدم (لا تنفيذ تلقائي — يتطلب موافقة)
  await sendHealingSuggestion(deviceId, suggestion)
}

async function collectDiagnostics(deviceId: string): Promise<string> {
  const commands = [
    'top -bn1 | head -15',
    'free -h',
    'df -h',
    'ps aux --sort=-%cpu | head -10'
  ]
  
  const results = await Promise.allSettled(
    commands.map(cmd => sendCommandToAgent(deviceId, uuidv4(), cmd, 10000))
  )
  
  return results.map((r, i) => 
    `$ ${commands[i]}\n${r.status === 'fulfilled' ? r.value.stdout : 'Error'}`
  ).join('\n\n')
}
```

**النتيجة:** برنامج يُشخّص ويقترح الحل — يُميّز AiRemote عن كل المنافسين.

---

### الميزة 5.2 — Docker Integration

```typescript
// في agent/src/system/docker.ts — ملف جديد

import { executeCommand } from './executor'

export async function getDockerStatus(): Promise<DockerInfo> {
  const result = await executeCommand(
    'docker ps --format "{{json .}}" 2>/dev/null'
  )
  
  if (result.exitCode !== 0) return { available: false, containers: [] }
  
  const containers = result.stdout
    .split('\n')
    .filter(Boolean)
    .map(line => {
      try { return JSON.parse(line) } catch { return null }
    })
    .filter(Boolean)
  
  return { available: true, containers }
}

// إضافة للـ heartbeat payload
const dockerInfo = await getDockerStatus()
this.send({
  type: 'agent:heartbeat',
  payload: { ..., docker: dockerInfo }
})
```

```typescript
// routes جديدة في server
POST /api/devices/:id/docker/:containerId/start
POST /api/devices/:id/docker/:containerId/stop
POST /api/devices/:id/docker/:containerId/restart
GET  /api/devices/:id/docker/:containerId/logs
```

**النتيجة:** إدارة Docker كاملة بدون SSH من أي متصفح.

---

## 📅 جدول الأولويات الشامل

| الأولوية | الميزة | الصعوبة | المدة المقدّرة | التأثير |
|:---:|---|:---:|---|---|
| 🔴 1 | Rate Limiting | ⭐ | 4 ساعات | حماية من brute force |
| 🔴 2 | Session Recording | ⭐⭐ | 1 يوم | Audit trail كامل |
| 🟡 3 | Historical Stats | ⭐⭐⭐ | 2-3 أيام | رسوم بيانية تاريخية |
| 🟡 4 | Audit Log | ⭐⭐ | 2 أيام | امتثال مؤسسي |
| 🟡 5 | Notifications & Alerts | ⭐⭐⭐ | 3-4 أيام | تنبيهات فورية |
| 🟡 6 | SSH Key Management | ⭐⭐⭐ | 3 أيام | اتصال بنقرة واحدة |
| 🟢 7 | Device Groups/Tags | ⭐⭐ | 2 أيام | تنظيم الأجهزة |
| 🟢 8 | Bulk Commands | ⭐⭐ | 2 أيام | إدارة جماعية |
| 🟢 9 | 2FA / TOTP | ⭐⭐⭐ | 3 أيام | مصادقة ثنائية |
| 🔵 10 | AI Auto-Healing | ⭐⭐⭐⭐ | 1 أسبوع | تشخيص + إصلاح تلقائي |
| 🔵 11 | Docker Integration | ⭐⭐⭐ | 3-4 أيام | إدارة containers |

---

## 🔒 نتائج التدقيق الأمني (المكتمل)

### الإصلاحات المُنجزة

```
✅ /ssh WebSocket — يتطلب JWT الآن (requireAuthWs preHandler)
✅ /ws WebSocket — يستخدم userId من JWT لا من payload
✅ CORS — مقيّد بـ DASHBOARD_URL في الإنتاج
✅ Heartbeat — يتحقق من socket registry قبل القبول
✅ device_stats — تقرأ /proc/net/dev و df -k فعلياً
✅ sessions route — يتحقق من ownerId قبل إرجاع البيانات
✅ bcrypt rounds — 12 rounds موحّد في كل الكود
✅ updateUser — atomic بدون race condition
✅ JWT_SECRET — تحذير واضح عند التشغيل بدونه
```

### TypeScript — صفر أخطاء في كل الـ Packages

```bash
pnpm --filter @airemote/shared   typecheck  # ✅ 0 errors
pnpm --filter @airemote/server   typecheck  # ✅ 0 errors
pnpm --filter @airemote/agent    typecheck  # ✅ 0 errors
pnpm --filter @airemote/ai-engine typecheck # ✅ 0 errors
```

---

## 🌐 متغيرات البيئة المطلوبة

### التطوير

```env
# packages/server/.env
PORT=3001
HOST=0.0.0.0
LOG_LEVEL=info
NODE_ENV=development

# أمان — يجب تغييرها في الإنتاج
JWT_SECRET=dev-only-change-this-before-production-32chars
```

### الإنتاج (يُضاف عند تطبيق المراحل)

```env
# إلزامي
PORT=3001
NODE_ENV=production
JWT_SECRET=<random-64-char-string>        # openssl rand -hex 32
DASHBOARD_URL=https://your-domain.com

# عند تفعيل SSH Key Management (المرحلة 3.2)
CREDENTIALS_KEY=<random-32-char-string>   # openssl rand -hex 16

# عند تفعيل AI Auto-Healing (المرحلة 5.1)
OPENAI_API_KEY=sk-...
# أو
GEMINI_API_KEY=AIza...
```

---

## 📦 بنية Package لكل مرحلة

```
المرحلة 1:
  pnpm --filter @airemote/server add @fastify/rate-limit

المرحلة 3.2:
  # crypto مدمج في Node.js — لا packages إضافية

المرحلة 4.3:
  pnpm --filter @airemote/server add otplib qrcode
  pnpm --filter @airemote/server add -D @types/qrcode

المرحلة 2.1 — Dashboard:
  pnpm --filter @airemote/dashboard add recharts
```

---

*آخر تحديث: مايو 2026 — AiRemote v1.0.0*
