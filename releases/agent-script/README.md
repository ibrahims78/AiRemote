# AiRemote Agent — Script (Node.js)

نسخة خفيفة تعمل مباشرة مع Node.js — مثالية للمطورين.

| الملف | الإصدار | الوصف |
|-------|---------|-------|
| `agent-v1.4.0.js` | v1.4.0 | يدعم تصفح الملفات عبر الوكيل |

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
```
SERVER_URL=wss://your-server.replit.app/ws
AGENT_TOKEN=your-device-token-here
```
ثم شغّل: `node agent-v1.4.0.js`

## ما الجديد في v1.4.0
- ✅ **تصفح الملفات عبر الوكيل** — لا يحتاج SSH أو port forwarding
- ✅ **دعم Windows** — يعرض الأقراص (C:, D:, ...) عند المسار /
- ✅ **رفع وتنزيل الملفات** مباشرة عبر اتصال الوكيل
- ✅ **عمليات كاملة**: قائمة، حذف، إعادة تسمية، إنشاء مجلد، رفع، تنزيل
