# AiRemote Server Desktop — خطة البناء الكاملة
**الإصدار:** v3.2.0  
**تاريخ الإنشاء:** 2026-06-06  
**الهدف:** تطبيق Windows Desktop احترافي يشغّل سيرفر AiRemote محلياً مع واجهة رسومية كاملة.

---

## 1. المواصفات النهائية

| البند | التفصيل |
|---|---|
| التقنية | Electron 28 + Fastify 4 + better-sqlite3 + React UI |
| الإصدار | v3.2.0 (متزامن مع جميع agents) |
| النظام | Windows 10/11 x64 |
| الحجم المتوقع | ~130–140 MB (ZIP) |
| المتطلبات | لا شيء — portable ZIP، يعمل مباشرة |

---

## 2. هيكل المشروع

```
packages/server-desktop/
├── main.js              # Electron main: lifecycle, tray, IPC, orchestration
├── server.js            # Fastify server (better-sqlite3, WS, REST)
├── tunnel.js            # Cloudflare Tunnel (cloudflared.exe مدمج)
├── logger.js            # نظام تسجيل احترافي مع rotation يومي
├── backup.js            # نسخ احتياطي وتصدير/استيراد
├── preload.js           # Electron IPC bridge
├── renderer/
│   ├── index.html       # واجهة المستخدم الرئيسية
│   ├── style.css        # Dark theme احترافي
│   └── app.js           # منطق الواجهة (Vanilla JS)
├── build/
│   ├── icon.ico         # أيقونة التطبيق
│   └── icon.png
└── package.json         # Electron-builder config
```

---

## 3. الميزات المنفَّذة

### الاتصال
- [x] وضع LAN — IP المحلي تلقائي
- [x] وضع Cloudflare Tunnel — cloudflared.exe مدمج
- [x] عرض الرابط العام + زر نسخ
- [x] WebSocket Compression (permessage-deflate)

### الأمان
- [x] توليد JWT_SECRET عشوائي عند أول تشغيل
- [x] تشفير bcrypt للكلمات المرور
- [x] Rate limiting (5 محاولات/دقيقة) على تسجيل الدخول
- [x] انتهاء صلاحية Token للأجهزة (30 يوم)

### الاستقرار
- [x] Watchdog داخلي (إعادة تشغيل السيرفر إذا تعطل)
- [x] Auto-start مع Windows (اختياري)
- [x] تنظيف كامل عند الإغلاق

### السجلات
- [x] ملفات .log يومية في %APPDATA%\AiRemote-Server\logs\
- [x] Rotation تلقائي (14 يوم، حد 50 MB)
- [x] عرض مباشر في الواجهة مع فلتر
- [x] تصدير للتشخيص عن بُعد

### النسخ الاحتياطي
- [x] تصدير/استيراد يدوي (airemote.db + config.json)
- [x] جدولة تلقائية

---

## 4. مراحل البناء

### المرحلة 1 — الأساس (server.js + main.js)
- Fastify server مع better-sqlite3
- نفس WebSocket protocol للـ agents
- نفس REST API للـ dashboard
- Electron window + tray

### المرحلة 2 — الاتصال (tunnel.js)
- Cloudflare Tunnel integration
- وضع LAN تلقائي

### المرحلة 3 — الجودة (logger.js + backup.js)
- نظام logging احترافي
- نظام backup كامل

### المرحلة 4 — الواجهة (renderer/)
- Dark theme UI
- Live stats، devices list، logs viewer

### المرحلة 5 — التجميع
- electron-builder --win --x64
- تضمين cloudflared.exe كـ extraResource
- ZIP قابل للتوزيع

---

## 5. التوافق

| المكوّن | الإصدار | ملاحظة |
|---|---|---|
| server-desktop | v3.2.0 | ✅ هذا التطبيق |
| agent-desktop | v3.2.0 | ✅ محدث |
| agent (TypeScript) | v3.2.0 | ✅ محدث |
| headless-agent | v3.2.0 | ✅ محدث |
| script-agent | v3.2.0 | ✅ محدث |

---

## 6. بروتوكول WebSocket (للتوافق مع الـ Agents)

```
Agent → Server:  agent:register   { token, info, stats, tunnelLayer }
Server → Agent:  server:registered { deviceId, name }

Agent → Server:  agent:heartbeat  { deviceId, stats }
Server → Agent:  server:pong      {}

Server → Agent:  server:command   { commandId, type, command }
Agent → Server:  agent:command_result { commandId, stdout, stderr, exitCode }

Server → Agent:  server:screen_start { sessionId, fps, quality, maxWidth }
Agent → Server:  Binary frame (4-byte sessionId length prefix + sessionId + JPEG)

Server → Agent:  server:ping      {}
Agent → Server:  agent:pong       {}
```

---

## 7. قاعدة البيانات

نفس schema الـ server الأصلي:
- `users` — المستخدمون وكلمات المرور
- `devices` — الأجهزة المسجلة
- `sessions` — الجلسات النشطة/المنتهية
- `audit_log` — سجل التدقيق
- `refresh_tokens` — tokens الجلسات
- `device_stats_history` — إحصاءات الأداء
- `settings` — الإعدادات
- `notifications` — الإشعارات

---

## 8. نتيجة الاختبار

- [ ] تشغيل التطبيق من .exe بدون تنزيل أي شيء
- [ ] اتصال agent بالسيرفر
- [ ] تشغيل Cloudflare tunnel
- [ ] تصدير نسخة احتياطية
- [ ] إغلاق كامل للتطبيق
- [ ] بناء ZIP نهائي
