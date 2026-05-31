# AiRemote Agent — Headless (CLI / Windows Service)

نسخة بدون واجهة رسومية، مثالية للتشغيل كـ خدمة في الخلفية أو على الـ servers.

| الملف | الإصدار | الحجم |
|-------|---------|-------|
| `AiRemote-Agent-Headless-v1.4.0-Windows-x64.exe` | **v1.4.0** | ~38 MB (يُبنى من المصدر) |

## المميزات
- لا يحتاج Node.js مثبتًا على الجهاز
- يعمل في الخلفية كـ Windows Service
- إعداد عبر متغيرات بيئة أو ملف `.env`
- تصفح الملفات، رفع/تنزيل، Terminal PTY، SSH Tunnel

## الاستخدام — CMD

```cmd
set SERVER_URL=wss://your-server.replit.app/ws
set AGENT_TOKEN=YOUR-DEVICE-TOKEN
AiRemote-Agent-Headless-v1.4.0-Windows-x64.exe
```

## أو ملف .env (في نفس مجلد الـ exe)

```
SERVER_URL=wss://your-server.replit.app/ws
AGENT_TOKEN=YOUR-DEVICE-TOKEN
```
ثم شغّل الـ exe مباشرة.

## تشغيل كـ Windows Service (NSSM)

```cmd
nssm install AiRemote "C:\path\to\AiRemote-Agent-Headless-v1.4.0-Windows-x64.exe"
nssm set AiRemote AppEnvironmentExtra "SERVER_URL=wss://your-server.replit.app/ws" "AGENT_TOKEN=YOUR-TOKEN"
nssm start AiRemote
```

## بناء من المصدر

```bash
# يتطلب pkg مثبتًا: npm install -g pkg
cd packages/agent
pnpm build:headless
# الناتج: releases/agent-headless/AiRemote-Agent-Headless-v1.4.0-Windows-x64.exe
```

---

## ما الجديد في v1.4.0

### ميزات جديدة
- ✅ **تصفح الملفات** من الـ Dashboard بدون SSH
- ✅ **رفع وتنزيل الملفات** عبر اتصال الوكيل
- ✅ **دعم Windows كامل** — يعرض الأقراص (C:, D:, ...) عند المسار /
- ✅ **Terminal PTY** — نفق نصي مستقر بدون node-pty

### إصلاحات الاستقرار
- ✅ **إصلاح إحصائيات الشبكة** — قراءة صحيحة لـ `/proc/net/dev` على جميع توزيعات Linux؛ أول استدعاء لا يُظهر أرقامًا خيالية
- ✅ **إصلاح SSH Terminal** — ترميز صحيح لجميع الأحرف؛ لا تراكم لـ event listeners عند إعادة الاتصال
- ✅ **إصلاح تبويب الملفات** — `lstat` بدل `stat`، و `Promise.allSettled` لمنع التجمّد مع symlinks معطوبة
