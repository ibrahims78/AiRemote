# AiRemote Agent — Headless (CLI / Windows Service)

نسخة بدون واجهة رسومية، مثالية للتشغيل كـ خدمة في الخلفية.

| الملف | الإصدار | الحجم |
|-------|---------|-------|
| AiRemote-Agent-Headless-v1.1.0-Windows-x64.exe | v1.1.0 | ~37 MB |

## المميزات
- لا يحتاج Node.js مثبتاً
- يعمل في الخلفية كـ Windows Service
- إعداد عبر ملف config أو CLI args أو متغيرات بيئة

## الاستخدام
```
# إعداد تفاعلي (أول تشغيل)
AiRemote-Agent-Headless-v1.1.0-Windows-x64.exe

# أو مباشرة عبر args
AiRemote-Agent-Headless-v1.1.0-Windows-x64.exe --server wss://your-server/ws --token YOUR_TOKEN
```

## ملف الإعدادات
`%APPDATA%\airemote\config.json`
```json
{
  "serverUrl": "wss://your-server.replit.app/ws",
  "token": "YOUR-DEVICE-TOKEN"
}
```
