# AiRemote Agent — Headless (CLI / Windows Service)

نسخة بدون واجهة رسومية، مثالية للتشغيل كـ خدمة في الخلفية.

| الملف | الإصدار | الحجم |
|-------|---------|-------|
| AiRemote-Agent-Headless-v1.4.0-Windows-x64.exe | v1.4.0 | ~38 MB |
| AiRemote-Agent-Headless-v1.1.0-Windows-x64.exe | v1.1.0 | ~37 MB (قديم) |

## المميزات
- لا يحتاج Node.js مثبتاً
- يعمل في الخلفية كـ Windows Service
- إعداد عبر متغيرات بيئة أو ملف `.env`
- **v1.4.0**: يدعم تصفح الملفات عبر الوكيل (بدون SSH)

## الاستخدام — CMD
```cmd
set SERVER_URL=wss://your-server.replit.app/ws
set AGENT_TOKEN=YOUR-DEVICE-TOKEN
AiRemote-Agent-Headless-v1.4.0-Windows-x64.exe
```

## أو ملف .env (في نفس المجلد)
```
SERVER_URL=wss://your-server.replit.app/ws
AGENT_TOKEN=YOUR-DEVICE-TOKEN
```
ثم شغّل الـ exe مباشرة.

## ما الجديد في v1.4.0
- ✅ **تصفح الملفات** من الـ Dashboard بدون SSH
- ✅ **رفع وتنزيل الملفات** عبر اتصال الوكيل
- ✅ **دعم Windows كامل** — يعرض الأقراص (C:, D:, ...) عند المسار /
- ✅ **Terminal PTY** محسّن
