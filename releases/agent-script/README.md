# AiRemote Agent — Script (Node.js)

نسخة خفيفة تعمل مباشرة مع Node.js — مثالية للمطورين.

| الملف | الإصدار | الحجم |
|-------|---------|-------|
| AiRemote-Agent-Script-v1.1.0.zip | v1.1.0 | ~5 KB |

## المتطلبات
- Node.js 18 أو أحدث: https://nodejs.org

## الاستخدام
1. فك ضغط الملف
2. عدّل `config.json` وأدخل الـ serverUrl والـ token
3. شغّل `start.bat`

## أو من سطر الأوامر
```
node airemote-agent.js --server wss://your-server/ws --token YOUR_TOKEN
```

## التثبيت كـ Windows Service (تشغيل تلقائي)
شغّل `install-service.bat` كمسؤول (Administrator)
