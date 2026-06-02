# خطة تطوير مشاركة الشاشة — AiRemote Screen Sharing
**التاريخ:** 2 يونيو 2026  
**المهندس:** AiRemote Agent  
**الهدف:** تحويل AiRemote إلى منصة دعم فني متكاملة تشمل مشاركة الشاشة في الوقت الفعلي  
**الإصدار:** v1.6.0

---

## 📋 تحليل المتطلبات

### ما تم بناؤه
- مشاركة شاشة الجهاز البعيد في الوقت الفعلي (streaming)
- عرض الشاشة في Dashboard بدون تأخير كبير عبر canvas
- لا يتطلب فتح منافذ على الجهاز البعيد (يعمل عبر tunnel القائم)
- يعمل على Windows وLinux وmacOS
- ضبط الجودة والـ FPS من الـ dashboard

### القيود التقنية المراعاة
- لا يمكن استخدام WebRTC peer-to-peer (يحتاج STUN/TURN + منفذ مفتوح)
- الاتصال الوحيد بين الـ agent والسيرفر هو WebSocket موجود
- لا توجد مكتبة node-pty (مشكلة compilation في Nix)
- السيرفر لا يتوسّع أفقياً (in-memory registry)

### الحل المختار: MJPEG-over-WebSocket ✅
**المبرر:**
- لا يحتاج WebRTC أو STUN servers
- يعمل عبر الـ WebSocket الموجود تماماً
- يعمل على كل المنصات (Windows/Linux/macOS) باستخدام أدوات مختلفة
- المتصفح يعرض JPEG frames مباشرة على `<canvas>` بدون decoder خاص
- قابل للضبط (FPS + quality) حسب جودة الاتصال

---

## 🏗️ هيكل التنفيذ المنجز

```
Dashboard (React)                Server (Fastify)              Agent (Node.js)
─────────────────────────────    ──────────────────────────    ────────────────────────
ScreenViewer.tsx            ←WS  /screen WS endpoint      →WS  agent.ts (handleScreenStart)
  canvas frame renderer          screenHandler.ts               screenCapture.ts
  FPS counter + stats            registry screen sessions         - Linux: scrot / import / xwd
  Quality presets (4 levels)     agentHandler.ts (routing)       - macOS: screencapture
  Fullscreen support             frame throttling                 - Windows: PowerShell
  Reconnect on error             session DB logging
DeviceWorkspacePage.tsx           
  tab 'screen' added             
  i18n: tab_screen AR/EN         
```

### بروتوكول الرسائل المضاف
```
server → agent:  server:screen_start      { sessionId, fps, quality }
agent → server:  agent:screen_frame       { sessionId, data: base64_jpeg, width, height, seq }
server → agent:  server:screen_stop       { sessionId }
agent → server:  agent:screen_closed      { sessionId }
agent → server:  agent:screen_error       { sessionId, message }
agent → server:  agent:screen_unavailable { sessionId, message }

server → dashboard WS: screen:frame      { data, width, height, seq }
server → dashboard WS: screen:error      { message }
server → dashboard WS: screen:closed     {}
server → dashboard WS: screen:unavailable { message }
```

---

## 📅 جدول التنفيذ

| الخطوة | الوصف | الحالة | الملاحظات |
|--------|-------|--------|-----------|
| 1 | Shared types — إضافة message types | ✅ مكتمل | messages.ts: 5 types جديدة |
| 2 | Registry — screen sessions | ✅ مكتمل | registry.ts: 8 دوال جديدة |
| 3 | Server screen handler | ✅ مكتمل | screenHandler.ts — ملف جديد |
| 4 | Agent handler — screen frame routing | ✅ مكتمل | agentHandler.ts: 4 cases جديدة |
| 5 | app.ts — تسجيل /screen WS route | ✅ مكتمل | GET /screen + requireAuthWs-less |
| 6 | Agent screen capture | ✅ مكتمل | screenCapture.ts — ملف جديد |
| 7 | Agent handleScreenStart/Stop | ✅ مكتمل | agent.ts: دالتان جديدتان |
| 8 | Frontend ScreenViewer component | ✅ مكتمل | ScreenViewer.tsx — ملف جديد |
| 9 | DeviceWorkspacePage — تبويب الشاشة | ✅ مكتمل | Tab 'screen' مضافة |
| 10 | i18n — tab_screen AR/EN | ✅ مكتمل | i18n.ts محدّث |
| 11 | TypeScript checks — shared + server | ✅ نظيف | tsc بدون أخطاء |
| 12 | Server restart + workflows running | ✅ يعمل | كلا الـ workflows running |

---

## 📝 سجل التنفيذ التفصيلي

### 2 يونيو 2026 — الجلسة الأولى

#### الخطوة 1: Shared Types
**الملف:** `packages/shared/src/types/messages.ts`  
**التغييرات:**
```typescript
// أضيفت 6 أنواع جديدة:
| 'agent:screen_frame'
| 'agent:screen_closed'
| 'agent:screen_error'
| 'agent:screen_unavailable'
| 'server:screen_start'
| 'server:screen_stop'
```
**النتيجة:** `pnpm build` ناجح ✅

#### الخطوة 2: Registry — Screen Sessions
**الملف:** `packages/server/src/ws/registry.ts`  
**التغييرات:**
- إضافة interface `ScreenSession` مع: dashboardSocket, deviceId, userId, startedAt, connectTimeout, frameThrottle
- إضافة `private screenSessions = new Map<string, ScreenSession>()`
- إضافة 8 دوال: addScreenSession, getScreenSession, removeScreenSession, setScreenConnectTimeout, clearScreenConnectTimeout, setScreenFrameThrottle, getScreenSessionsForDevice, getScreenSessionIdByDashboardSocket
- تحديث `getStats()` ليشمل screenSessions count

#### الخطوة 3: Server Screen Handler (ملف جديد)
**الملف:** `packages/server/src/ws/screenHandler.ts`  
**الميزات:**
- Auth: يقبل ticket أو JWT token
- Validation: deviceId مطلوب، الجهاز يجب أن يكون online
- FPS throttling: max 15fps، يحمي الـ bandwidth
- Connect timeout: 15 ثانية
- DB logging: INSERT + UPDATE في sessions table
- Quality control: FPS 1-15، Quality 10-95
- `screen:set_quality` message لتغيير الإعدادات mid-session

#### الخطوة 4: Agent Handler Routing
**الملف:** `packages/server/src/ws/agentHandler.ts`  
**إضافات:**
- `agent:screen_frame`: يمرر الـ frame مباشرة لـ dashboardSocket مع throttle
- `agent:screen_closed`: يُعلم الـ dashboard وينظّف الجلسة
- `agent:screen_error`: يرسل رسالة الخطأ للـ dashboard وينهي الجلسة
- `agent:screen_unavailable`: يرسل رسالة "غير متاح" مع تعليمات التثبيت

#### الخطوة 5: app.ts — WS Route
```typescript
fastify.get('/screen', { websocket: true }, handleScreenWebSocket)
```
بدون `requireAuthWs` preHandler — الـ auth يتم داخل `handleScreenWebSocket` نفسه (ticket/token)

#### الخطوة 6: Agent Screen Capture (ملف جديد)
**الملف:** `packages/agent/src/system/screenCapture.ts`  
**المنصات المدعومة:**

| المنصة | الأداة المجرّبة | الملاحظات |
|--------|----------------|-----------|
| Linux | scrot → import (ImageMagick) → xwd | يجرّب بالترتيب، يتوقف عند الأول |
| macOS | screencapture -x | يجرّب convert لتصغير الحجم إن وُجد |
| Windows | PowerShell + System.Drawing | لا يحتاج برنامج إضافي |

**ميزات تقنية:**
- `detectedBackend`: يُكشف مرة واحدة ويُخزّن (cache)
- `parseJpegDimensions()`: يقرأ width/height من SOF0 marker بدون مكتبة JPEG
- `TMP_FRAME`: ملف مؤقت واحد يُعاد استخدامه لكل frame
- cleanup عند process exit

#### الخطوة 7: Agent — handleScreenStart/Stop
**الملف:** `packages/agent/src/agent.ts`  
**الإضافات:**
- `screenTimers: Map<string, NodeJS.Timeout>` — timer لكل جلسة
- `screenSeq: Map<string, number>` — عداد frames
- `handleScreenStart()`: يبدأ capture فوراً ثم interval
- `stopScreenCapture()`: ينظّف timer ويرسل agent:screen_closed
- في `stop()`: ينهي كل screen sessions عند إيقاف الـ agent
- في message handler: يتعامل مع `server:screen_start` و `server:screen_stop`

#### الخطوة 8: Frontend ScreenViewer Component (ملف جديد)
**الملف:** `packages/dashboard/src/components/ScreenViewer.tsx`  
**الميزات:**
- عرض الـ frames على `<canvas>` (أسرع من `<img>` للـ animation)
- FPS counter حقيقي (1-second window counter)
- 4 مستويات جودة: أداء عالي (1fps/q40) / متوسط (3fps/q60) / جودة عالية (5fps/q75) / ممتاز (10fps/q85)
- زر ملء الشاشة (Fullscreen API)
- حالات مرئية: connecting / streaming / error / unavailable / disconnected
- رسالة "غير متاح" مع تعليمات تثبيت الأدوات للـ Linux
- إسقاط الـ frames خارج الترتيب (seq check)
- Reconnect button
- Resolution indicator (width × height)
- Frame counter (debug badge)

#### الخطوة 9: DeviceWorkspacePage
**التغييرات:**
- Import: `ScreenViewer`, `Tv2` icon
- Tab type: أضيف `'screen'`
- Tabs array: `{ id: 'screen', label: t('tab_screen'), icon: Tv2, disabled: !isOnline }`
- Content: `{tab === 'screen' && <ScreenViewer deviceId deviceName />}`
- overflow: تم إضافة `tab === 'screen'` لـ `overflow-hidden` condition

#### الخطوة 10: i18n
**الملف:** `packages/dashboard/src/lib/i18n.ts`  
```
AR: tab_screen: 'الشاشة'
EN: tab_screen: 'Screen'
```

---

## 🧪 نتائج الاختبارات

### اختبارات TypeScript Build
| Package | النتيجة |
|---------|---------|
| @airemote/shared | ✅ `tsc` — بدون أخطاء |
| @airemote/server | ✅ `tsc` — بدون أخطاء |

### اختبار الـ Workflows
| Workflow | الحالة |
|---------|--------|
| AiRemote Dashboard (:5000) | ✅ RUNNING — HMR يعمل |
| AiRemote Server (:3001) | ✅ RUNNING — restarted بعد التعديلات |

### بروتوكول الـ WebSocket الجديد
| Endpoint | Auth | الحالة |
|---------|------|--------|
| `GET /screen?token=xxx&deviceId=yyy` | JWT token | ✅ مسجّل |
| `GET /screen?ticket=xxx&deviceId=yyy` | WS ticket | ✅ مدعوم |

---

## ⚠️ متطلبات الـ Agent للشاشة

### Linux
```bash
# الخيار الأفضل:
sudo apt install scrot

# أو:
sudo apt install imagemagick

# ملاحظة: يحتاج $DISPLAY — لا يعمل في headless servers بدون X11
# لـ headless Linux: استخدم Xvfb
sudo apt install xvfb
Xvfb :1 -screen 0 1280x720x24 &
export DISPLAY=:1
```

### macOS
- `screencapture` متاح افتراضياً
- يحتاج Screen Recording permission في System Preferences > Privacy

### Windows
- PowerShell + System.Drawing (متاح افتراضياً في كل Windows)
- لا يحتاج أي برنامج إضافي ✅

---

## 🔒 الأمان

- WS endpoint `/screen` يتحقق من auth قبل أي عملية
- يدعم ticket (30-second single-use) أو JWT token
- الـ FPS محدود بـ MAX_FPS=15 لحماية الـ bandwidth
- الـ quality محدود بـ 10-95
- Connect timeout 15s لمنع الـ sessions الميتة
- كل جلسة مسجّلة في قاعدة البيانات (sessions table, type='screen')

---

## 🚀 الخطوات التالية (بعد مشاركة الشاشة)

### الميزات المقبلة بالترتيب:
1. **📚 مكتبة السكريبتس** — حفظ وتنظيم وتشغيل الأوامر المتكررة مع categories وtags
2. **🤖 AI Auto-Heal** — الـ AI يشخّص المشاكل ويقترح أوامر علاجية تلقائياً
3. **📹 Session Recording** — تسجيل جلسات PTY كـ asciicast أو video

---

*آخر تحديث: 2 يونيو 2026 — المرحلة 1 مكتملة بنجاح ✅*
