# AiRemote Agent — Script (Node.js)

نسخة خفيفة تعمل مباشرة مع Node.js — مثالية للمطورين والـ headless servers.

| الملف | الإصدار | الوصف |
|-------|---------|-------|
| `agent-v1.4.0.js` | **v1.4.0** | أحدث إصدار — يدعم تصفح الملفات + إصلاحات الاستقرار |

## المتطلبات
- Node.js 18 أو أحدث: https://nodejs.org

## الاستخدام السريع

```bash
# 1. ثبّت المتطلبات
npm install

# 2. شغّل الوكيل
SERVER_URL=wss://your-server/ws AGENT_TOKEN=your-token node agent-v1.4.0.js
```

## Windows (cmd)
```cmd
set SERVER_URL=wss://your-server/ws
set AGENT_TOKEN=your-token
npm install
node agent-v1.4.0.js
```

## أو باستخدام ملف .env
انسخ `.env.example` إلى `.env` وعدّل القيم:
```
SERVER_URL=wss://your-server.replit.app/ws
AGENT_TOKEN=your-device-token-here
```
ثم شغّل: `node agent-v1.4.0.js`

## Linux / macOS (script)
```bash
chmod +x start.sh
./start.sh
```

## Windows (bat)
```cmd
start.bat
```

---

## ما الجديد في v1.4.0

### ميزات جديدة
- ✅ **تصفح الملفات عبر الوكيل** — لا يحتاج SSH أو port forwarding
- ✅ **دعم Windows** — يعرض الأقراص (C:, D:, ...) عند المسار /
- ✅ **رفع وتنزيل الملفات** مباشرة عبر اتصال الوكيل
- ✅ **عمليات كاملة**: قائمة، حذف، إعادة تسمية، إنشاء مجلد، رفع، تنزيل
- ✅ **Terminal PTY** — نفق نصي مستقر بدون مكتبات إضافية

### إصلاحات الاستقرار
- ✅ **إصلاح إحصائيات الشبكة** — قراءة صحيحة لـ `/proc/net/dev` على جميع توزيعات Linux (كانت تُظهر أرقامًا خيالية في أول استدعاء أو 0 دائمًا)
- ✅ **إصلاح SSH Terminal** — ترميز صحيح لجميع الأحرف (عربي، Unicode، مسافة خاصة)؛ لا تراكم لـ event listeners عند إعادة الاتصال
- ✅ **إصلاح تبويب الملفات** — استخدام `lstat` بدل `stat` لتجنب التجمّد مع symlinks أو network mounts معطوبة؛ استخدام `Promise.allSettled` حتى يكمل الطلب حتى لو فشل stat ملف واحد
