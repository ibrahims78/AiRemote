# AiRemote Agent — Windows Desktop (GUI) v3.2.0

<div align="center">

![Version](https://img.shields.io/badge/Version-v3.2.0-blue?style=for-the-badge)
![Windows](https://img.shields.io/badge/Windows-x64-0078D4?style=for-the-badge&logo=windows)
![Electron](https://img.shields.io/badge/Electron-28-47848F?style=for-the-badge&logo=electron)

**تطبيق سطح مكتب Windows كامل مع System Tray — مبني بـ Electron، لا يحتاج Node.js**

*Full Windows GUI desktop application with System Tray — Built with Electron, no Node.js required*

</div>

---

## 📦 الملفات / Files

| الملف / File | الحجم / Size | الوصف / Description |
|---|---|---|
| `AiRemote-Agent-v3.0.0-Windows-x64.zip` | ~103 MB | Full desktop app — extract ZIP and run |
| `win-unpacked/` | — | Raw unpacked Electron build |

---

## 🚀 التشغيل السريع / Quick Start

**العربية:**
1. حمّل `AiRemote-Agent-v3.0.0-Windows-x64.zip`
2. فُك الضغط إلى أي مجلد (مثل `C:\AiRemote\`)
3. شغّل `AiRemote Agent.exe`
4. أدخل **عنوان الخادم** (WebSocket) و **Device Token** من الـ Dashboard
5. اضغط **تشغيل** — يتصل الـ Agent ويظهر في شريط المهام (System Tray)

**English:**
1. Download `AiRemote-Agent-v3.0.0-Windows-x64.zip`
2. Extract to any folder (e.g. `C:\AiRemote\`)
3. Run `AiRemote Agent.exe`
4. Enter your **Server URL** (WebSocket) and **Device Token** from the dashboard
5. Click **Start** — the agent connects and appears in the System Tray

---

## ✨ المميزات / Features

| الميزة | Description |
|--------|-------------|
| **🔲 System Tray** | يعمل في الخلفية — انقر بالزر الأيمن لفتح/إغلاق |
| **🔄 Auto-Reconnect** | إعادة الاتصال تلقائياً عند الانقطاع |
| **🖥️ Screen Streaming** | بث الشاشة حتى 30 FPS مع ضغط تكيّفي |
| **⚡ ffmpeg Support** | دعم gdigrab لبث 15-30 FPS عبر ffmpeg (Windows) |
| **🖱️ Mouse & Keyboard** | تحكم كامل بالفأرة واللوحة عبر Win32 API |
| **📋 Clipboard Sync** | مزامنة الحافظة في كلا الاتجاهين |
| **🖥️ Multi-Monitor** | تبديل بين الشاشات في الوقت الفعلي |
| **💬 In-session Chat** | دردشة نصية مدمجة أثناء الجلسة |
| **💻 PTY Terminal** | PowerShell / CMD كامل من الـ Dashboard |
| **📁 File Browser** | تصفح ورفع وتنزيل الملفات |
| **🔐 SSH Access** | إعدادات SSH للاتصال من الخادم |
| **📊 Device Stats** | CPU / RAM / Disk / Network في الوقت الفعلي |
| **🌐 Wake on LAN** | إيقاظ الجهاز عن بُعد |
| **🌍 Arabic / English** | واجهة ثنائية اللغة مع RTL |
| **🌗 Dark / Light Theme** | تبديل من شريط العنوان |
| **🔐 2FA Support** | دعم المصادقة الثنائية TOTP |
| **🔒 Privacy Mode** | إخفاء الشاشة أثناء الجلسة |
| **📹 Session Recording** | تسجيل الجلسات كـ JPEG frames |
| **✅ Consent Flow** | طلب إذن المستخدم قبل التحكم |

---

## 🔧 التشغيل التلقائي مع Windows / Auto-Start

```
Win + R  →  shell:startup
```
أنشئ اختصاراً لـ `AiRemote Agent.exe` في هذا المجلد.

أو عبر Registry:
```
HKEY_CURRENT_USER\Software\Microsoft\Windows\CurrentVersion\Run
Name: AiRemoteAgent
Value: "C:\AiRemote\AiRemote Agent.exe"
```

---

## 📋 المتطلبات / Requirements

- **Windows 10 / 11** (64-bit)
- لا يحتاج Node.js — Electron مدمج / No additional runtime — Electron is bundled
- اتصال شبكة بخادم AiRemote / Network access to your AiRemote server

---

## 🔨 بناء من المصدر / Build from Source

```bash
cd packages/agent-desktop
pnpm install
CSC_IDENTITY_AUTO_DISCOVERY=false electron-builder --win --x64 --dir
# ثم:
python3 ../../scripts/zip-agent.py \
  ../../releases/agent-windows/win-unpacked \
  ../../releases/agent-windows/AiRemote-Agent-v3.0.0-Windows-x64.zip
```

أو من لوحة التحكم (Admin): **Downloads → Windows Agent (GUI) → Build Now**

---

## 📋 ما الجديد في v3.2.0

| الميزة | الوصف |
|--------|-------|
| **ffmpeg بث 15-30 FPS** | gdigrab على Windows — أسرع بـ 15-30x من PowerShell |
| **WoL — Wake on LAN** | إيقاظ الجهاز عن بُعد عبر Magic Packet |
| **Multi-viewer** | عدة مستخدمين يشاهدون نفس الشاشة في آنٍ واحد |
| **Delta Frames** | إرسال الفرق فقط بين إطارات الشاشة |
| **Adaptive Quality** | ضبط FPS تلقائياً بناءً على زمن الاستجابة (RTT) |
| **Drag & Drop Upload** | رفع الملفات بالسحب والإفلات على نافذة الشاشة |

---

## 🔗 الإصدارات الأخرى / Other Releases

| Platform | Type | File |
|----------|------|------|
| Windows | Server Desktop | `../server-windows/AiRemote-Server-v3.2.0-Windows-x64.zip` |
| Windows | Agent CLI Headless | `../agent-headless/AiRemote-Agent-v3.0.0-win-x64.exe` |
| Linux | Agent Binary | `../agent-headless/AiRemote-Agent-v3.0.0-linux-x64` |
| Any | Node.js Script | `../agent-script/agent-v3.2.0.js` |

راجع [releases/README.md](../README.md) للمصفوفة الكاملة للإصدارات.

---

## 📄 الترخيص / License

MIT License — مفتوح المصدر بالكامل / Fully open source.
