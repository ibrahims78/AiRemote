# اتفاقية العمل — AiRemote Project
**تاريخ الاتفاق:** 2 يونيو 2026  
**المشروع:** AiRemote — منصة وصول عن بعد مدعومة بالذكاء الاصطناعي

---

## 📌 مبدأ العمل الأساسي

> **أولاً: إصلاح الأخطاء والثغرات الأمنية — ثم بناء الميزات الجديدة**

تم الاتفاق على هذا الترتيب بوضوح: لا تُبنى ميزة جديدة على أساس متصدّع. كل مرحلة تُوثَّق كاملاً في ملف الخطة قبل الانتقال للتالية.

---

## 🗂️ طريقة التوثيق

### قاعدة ذهبية: ملف خطة لكل ميزة كبرى
- كل ميزة رئيسية لها ملف خطة مخصص (مثل `SCREEN_SHARING_PLAN.md`)
- الملف يُحدَّث **أولاً بأول** — عند بدء كل خطوة وعند إنجازها
- يحتوي على: التحليل + القرارات المعمارية + جدول التقدم + سجل التنفيذ التفصيلي + نتائج الاختبارات
- النتائج تُبلَّغ للمستخدم عند إنهاء كل خطوة وليس فقط في النهاية

---

## ✅ ما تم إنجازه (بالترتيب)

### المرحلة 0 — نقل البيئة إلى Replit
- `pnpm install` للمشروع كاملاً
- نقل `JWT_SECRET` إلى Replit Secrets
- تشغيل كلا الـ workflows: Server :3001 + Dashboard :5000

### المرحلة 1 — الأمان أولاً (14 بند)
| البند | التفاصيل |
|-------|---------|
| Path traversal fix | `sanitizePath()` في fs.ts — يمنع `../../../etc/passwd` |
| Upload ceiling | سقف 50MB على رفع الملفات |
| Audit masking | `maskSensitiveData()` في audit.ts تُطبَّق على exec وbulk-exec |
| WS Ticket System | `POST /api/auth/ws-ticket` → UUID أحادي الاستخدام صالح 30 ثانية |
| requireAuthWs | يقبل `?ticket=` (مفضّل) + `?token=` (legacy) |
| Agent executor | رُفعت الأنماط المحظورة من 10 إلى 17 |
| FS audit logging | تسجيل عمليات الملفات في audit trail |

### المرحلة 2 — ميزات Core
- تنفيذ أوامر AI — CommandRunner component
- سياق الجهاز في AI (device context injection)
- مودال تثبيت الـ Agent

### المرحلة 3 — 11 ميزة إضافية
- OTP/2FA (otplib v13)، Tags، Bulk exec، Alerts
- Rate limiting (@fastify/rate-limit@8)، Session recording
- GitHub Releases publishing

### المرحلة 4 — Screen Sharing v1.6.0 ✅
*(آخر ما تم — التفاصيل في SCREEN_SHARING_PLAN.md)*

---

## 🏗️ القرارات المعمارية الثابتة

### Stack التقنية
| الطبقة | التقنية | ملاحظة |
|--------|---------|--------|
| Monorepo | pnpm workspaces | 5 packages |
| Backend | Fastify 4.x + TypeScript | tsx watch في dev |
| Frontend | React 18 + Vite + Tailwind | Port 5000 |
| Database | @libsql/client (SQLite) | async فقط — better-sqlite3 لا يعمل في Nix |
| WebSocket | ws library | /ws + /pty + /ssh + /screen |
| Auth | @fastify/jwt + refresh tokens | JWT_SECRET في Replit Secrets |

### قواعد لا تُكسر
1. **لا `better-sqlite3`** — يفشل في Nix sandbox. دائماً `@libsql/client` وكل DB calls تكون async/await
2. **@fastify/multipart الإصدار 8** فقط — v9+ يسبب `FST_ERR_PLUGIN_VERSION_MISMATCH` مع Fastify 4
3. **@fastify/rate-limit الإصدار 8** فقط — لنفس السبب
4. **لا node-pty** — لا يُكمّل compilation في Nix. PTY يتم عبر `child_process.spawn`
5. **shared package يُبنى أولاً** قبل server — عند أي تعديل على types
6. **ai-engine يُبنى قبل server** — dependency مطلوبة
7. **لا virtual environments أو Docker** — Replit يدير البيئة

### بنية WebSocket
```
/ws     — agents + dashboard clients (auth via first message أو ?token=)
/ssh    — SSH tunnel (requireAuthWs preHandler)
/pty    — PTY shell (requireAuthWs preHandler)
/screen — Screen sharing (auth داخل handler نفسه — ticket أو token)
```

### نظام المصادقة عبر WS
- الـ REST endpoints: Bearer JWT في Authorization header
- الـ WebSocket: إما `?ticket=` (UUID أحادي الاستخدام، 30 ثانية) أو `?token=` (JWT)
- الـ ticket يُولَّد عبر `POST /api/auth/ws-ticket` ويُستهلك مرة واحدة فقط

---

## 🖥️ بروتوكول Screen Sharing (v1.6.0)

**الأسلوب المختار:** MJPEG-over-WebSocket (لا WebRTC)  
**السبب:** لا يحتاج STUN/TURN، يعمل عبر الـ WS القائم، يعمل على Windows/Linux/macOS

```
Dashboard ←→ /screen WS ←→ Server Registry ←→ Agent /ws
                                                   ↓
                                            screenCapture.ts
                                         (scrot/import/screencapture/PowerShell)
```

**أدوات الالتقاط حسب المنصة:**
- Linux: scrot (أفضل) → ImageMagick import → xwd+convert
- macOS: screencapture -x (مدمج)
- Windows: PowerShell + System.Drawing (لا يحتاج تثبيت)

---

## 🎨 نظام الواجهة

### Theme
- وضع ليلي/نهاري: عبر `html.light` class
- CSS variables في index.css

### i18n (الترجمة)
- نظام مخصص `useT()` hook — Zustand reactive
- دعم AR/EN كامل
- كل نص جديد يُضاف في `packages/dashboard/src/lib/i18n.ts` في الكائنَين `ar` و`en` معاً

### مكونات الواجهة
- Glass morphism: class `glass`
- Brand colors: `text-brand-blue`, `text-brand-teal`
- ErrorBoundary يُلفّ كل المكونات في DeviceWorkspacePage

---

## 📋 خطة الميزات المتبقية (بالترتيب)

| الأولوية | الميزة | الملف المخطط |
|---------|--------|------------|
| 1 | ✅ مشاركة الشاشة | `SCREEN_SHARING_PLAN.md` |
| 2 | 📚 مكتبة السكريبتس | سيُنشأ عند البدء |
| 3 | 🤖 AI Auto-Heal | سيُنشأ عند البدء |
| 4 | 📹 تسجيل الجلسات | سيُنشأ عند البدء |

---

## 📁 الملفات المرجعية الرئيسية

| الملف | الغرض |
|-------|-------|
| `SCREEN_SHARING_PLAN.md` | خطة وتوثيق مشاركة الشاشة كاملاً |
| `WORKING_AGREEMENT.md` | هذا الملف — اتفاقية العمل |
| `.agents/memory/MEMORY.md` | ذاكرة الـ agent — قرارات تقنية دائمة |
| `.agents/memory/airemote-*.md` | ملفات التفاصيل لكل موضوع |

---

## 🔄 دورة العمل المتفق عليها

```
1. تحليل الطلب
      ↓
2. إنشاء/تحديث ملف الخطة
      ↓
3. تنفيذ الكود (بالتوازي حيثما أمكن)
      ↓
4. بناء والتحقق من TypeScript (بدون أخطاء)
      ↓
5. إعادة تشغيل السيرفر + التحقق من الـ workflows
      ↓
6. تحديث ملف الخطة بالنتائج
      ↓
7. تبليغ المستخدم بالنتائج أولاً بأول
```

---

## ⚙️ أوامر البناء المرجعية

```bash
# بناء shared (مطلوب أولاً)
cd packages/shared && pnpm build

# بناء server
cd packages/server && pnpm build

# بناء agent JS bundle
cd packages/agent && node_modules/.bin/esbuild src/index.ts \
  --bundle --platform=node --target=node18 --format=cjs \
  --outfile=../../releases/agent-script/agent-vX.X.X.js \
  --external:ssh2 --external:dotenv

# تشغيل dev
# Dashboard: cd packages/dashboard && pnpm dev
# Server: pnpm --filter @airemote/shared build && pnpm --filter @airemote/ai-engine build && cd packages/server && pnpm dev
```

---

*آخر تحديث: 2 يونيو 2026*
