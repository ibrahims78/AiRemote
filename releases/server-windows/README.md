# AiRemote Server — Windows Desktop v3.2.0

<div align="center">

![Version](https://img.shields.io/badge/Version-v3.2.0-blue?style=for-the-badge)
![Windows](https://img.shields.io/badge/Windows-x64-0078D4?style=for-the-badge&logo=windows)
![Electron](https://img.shields.io/badge/Electron-28-47848F?style=for-the-badge&logo=electron)

**خادم AiRemote كتطبيق سطح مكتب Windows — مدمج مع Cloudflare Tunnel**

*AiRemote Server as a standalone Windows desktop app — with built-in Cloudflare Tunnel*

</div>

---

## 📦 الملفات / Files

| الملف / File | الحجم / Size | الوصف / Description |
|---|---|---|
| `AiRemote-Server-v3.2.0-Windows-x64.zip` | 120 MB | Full server app — extract and run |
| `win-unpacked/` | ~317 MB | Raw unpacked Electron build |

---

## 🚀 التشغيل السريع / Quick Start

**العربية:**
1. حمّل `AiRemote-Server-v3.2.0-Windows-x64.zip`
2. فُك الضغط إلى أي مجلد (مثل `C:\AiRemote-Server\`)
3. شغّل `AiRemote Server.exe`
4. سيفتح البرنامج تلقائياً على المتصفح — أنشئ حسابك وابدأ
5. أضف الأجهزة من لوحة التحكم وحمّل الـ Agent على كل جهاز

**English:**
1. Download `AiRemote-Server-v3.2.0-Windows-x64.zip`
2. Extract to any folder (e.g. `C:\AiRemote-Server\`)
3. Run `AiRemote Server.exe`
4. The app opens the dashboard in your browser automatically — create your account
5. Add devices from the dashboard and install the Agent on each remote machine

---

## ✨ المميزات / Features

| الميزة | Description |
|--------|-------------|
| **🖥️ واجهة رسومية كاملة** | لوحة تحكم بالمتصفح + System Tray |
| **☁️ Cloudflare Tunnel** | وصول عن بُعد بدون فتح منافذ Router |
| **🗄️ قاعدة بيانات مدمجة** | SQLite داخل التطبيق — لا خادم خارجي |
| **🔐 إدارة المستخدمين** | أدوار متعددة + TOTP (2FA) |
| **📡 إدارة الأجهزة** | تسجيل / تتبع / إدارة الأجهزة البعيدة |
| **🖥️ سطح مكتب بعيد** | بث الشاشة + تحكم بالفأرة واللوحة |
| **💻 Terminal** | PTY تفاعلية + SSH Tunnel |
| **📁 تصفح الملفات** | رفع / تنزيل / حذف عبر الـ Dashboard |
| **🤖 AI Agent** | دردشة AI مدمجة مع تنفيذ أوامر Shell |
| **📊 مراقبة النظام** | CPU / RAM / Disk / Network في الوقت الفعلي |
| **🔔 التنبيهات** | قواعد تنبيه قابلة للتخصيص |
| **📋 سجل المراجعة** | تتبع كامل لجميع العمليات |
| **🌐 عربي / إنجليزي** | واجهة ثنائية اللغة مع RTL |

---

## 🌐 Cloudflare Tunnel

يتضمن البرنامج `cloudflared.exe` لإنشاء نفق آمن بدون الحاجة لفتح منافذ على الـ Router.

```
الإعدادات → Cloudflare Tunnel → تشغيل
```

يُنشئ عنوان عام مثل: `https://xxxx.trycloudflare.com`

---

## 🔧 التشغيل التلقائي مع Windows

```
Win + R  →  shell:startup
```
أنشئ اختصاراً لـ `AiRemote Server.exe` في هذا المجلد.

أو عبر Registry:
```
HKEY_CURRENT_USER\Software\Microsoft\Windows\CurrentVersion\Run
Name: AiRemoteServer
Value: "C:\AiRemote-Server\AiRemote Server.exe"
```

---

## ⚙️ الإعدادات الافتراضية

| الإعداد | القيمة |
|---------|--------|
| **المنفذ** | `3001` (قابل للتغيير) |
| **قاعدة البيانات** | `%APPDATA%\AiRemote Server\airemote.db` |
| **السجلات** | `%APPDATA%\AiRemote Server\logs\` |
| **النسخ الاحتياطية** | `%APPDATA%\AiRemote Server\backups\` |

---

## 📋 المتطلبات / Requirements

- **Windows 10 / 11** (64-bit)
- لا يحتاج Node.js — Electron مدمج / No Node.js required — Electron is bundled
- لا يحتاج قاعدة بيانات خارجية — SQLite مدمج
- اتصال بالإنترنت للوصول عن بُعد عبر Cloudflare Tunnel (اختياري)

---

## 🔨 بناء من المصدر / Build from Source

```bash
# من مجلد المشروع الرئيسي
pnpm install
cd packages/server-desktop

# بناء كامل مع Dashboard + تنزيل cloudflared
pnpm build:win

# بناء بدون إعادة تنزيل cloudflared (أسرع)
pnpm build:win:nodownload
```

الناتج: `releases/server-windows/AiRemote-Server-v3.2.0-Windows-x64.zip`

---

## 📋 ما الجديد في v3.2.0

| الميزة | الوصف |
|--------|-------|
| **بث الشاشة ffmpeg** | دعم gdigrab عبر ffmpeg لبث 15-30 FPS |
| **WoL — Wake on LAN** | إيقاظ الأجهزة البعيدة عبر الشبكة |
| **Multi-viewer** | عدة مستخدمين يشاهدون نفس الشاشة في آنٍ واحد |
| **Delta Frames** | إرسال الفرق فقط بين الإطارات (توفير الباندويدث) |
| **Zombie Sweeper** | كشف وإزالة الاتصالات الميتة تلقائياً كل 12 ثانية |
| **TOTP / 2FA** | دعم المصادقة الثنائية لجميع المستخدمين |
| **سجل المراجعة** | تسجيل كامل للأحداث مع فلترة وتصدير |
| **نسخ احتياطي** | نسخ احتياطي لقاعدة البيانات من واجهة التطبيق |
| **إدارة متقدمة** | أدوار: Admin / Operator / Viewer |

---

## 🔗 الإصدارات الأخرى / Other Releases

| المنصة | النوع | الملف |
|---------|-------|-------|
| أي نظام | Node.js Script | `../agent-script/agent-v3.2.0.js` |
| Windows | Agent CLI | `../agent-headless/AiRemote-Agent-v3.0.0-win-x64.exe` |
| Linux | Agent Binary | `../agent-headless/AiRemote-Agent-v3.0.0-linux-x64` |
| Windows | Agent GUI | `../agent-windows/AiRemote-Agent-v3.0.0-Windows-x64.zip` |

راجع [releases/README.md](../README.md) للمصفوفة الكاملة للإصدارات.

---

## 📄 الترخيص / License

MIT License — مفتوح المصدر بالكامل / Fully open source.
