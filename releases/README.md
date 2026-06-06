# AiRemote — Releases

<div align="center">

![AiRemote](https://img.shields.io/badge/AiRemote-v3.2.0-blue?style=for-the-badge)
![License](https://img.shields.io/badge/License-MIT-green?style=for-the-badge)
![Platform](https://img.shields.io/badge/Platform-Windows%20%7C%20Linux%20%7C%20macOS-lightgrey?style=for-the-badge)

**منصة الوصول عن بُعد + AI Agent مفتوحة المصدر**

</div>

---

## 📦 الإصدارات المتاحة — v3.2.0

### 🖥️ الخادم / Server

| النسخة | الملف | الحجم | المنصة | الوصف |
|--------|-------|-------|--------|-------|
| 🪟 **Windows Desktop** | `server-windows/AiRemote-Server-v3.2.0-Windows-x64.zip` | 120 MB | Windows x64 | خادم AiRemote كتطبيق سطح مكتب مع Cloudflare Tunnel |

### 🤖 الـ Agent / Agent

| النسخة | الملف | الحجم | المنصة | الوصف |
|--------|-------|-------|--------|-------|
| 🪟 **Windows GUI** | `agent-windows/AiRemote-Agent-v3.2.0-Windows-x64.zip` | 100 MB | Windows x64 | تطبيق سطح مكتب + System Tray — فُك الضغط وشغّل |
| 🐧 **Linux Binary** | `agent-headless/AiRemote-Agent-v3.0.0-linux-x64` | 45 MB | Linux x64 | ملف تنفيذي مستقل — لا يحتاج Node.js |
| 📜 **Node.js Script** | `agent-script/agent-v3.2.0.js` | 87 KB | أي نظام | يتطلب Node.js 18+ |
| 📦 **Script ZIP** | `agent-script/agent-script-v3.2.0.zip` | 23 KB | أي نظام | Script + start.bat + start.sh + package.json |

> 💡 **للمبتدئين على Windows:** نسخة Server Desktop — فُك الضغط وشغّل مباشرة.
> 💡 **للخوادم Linux/Docker:** استخدم Docker Compose في مجلد `docker/`.
> 💡 **للأجهزة البعيدة (Windows):** Agent GUI أو Agent CLI.
> 💡 **للأجهزة البعيدة (Linux/macOS):** Agent Binary أو Node.js Script.

---

## 🚀 التشغيل السريع

### 🪟 Windows Server Desktop
```
1. فُك الضغط عن AiRemote-Server-v3.2.0-Windows-x64.zip
2. شغّل "AiRemote Server.exe"
3. أنشئ حسابك من لوحة التحكم
4. أضف الأجهزة وحمّل الـ Agent عليها
```

### 🪟 Windows Agent GUI
```
1. فُك الضغط عن AiRemote-Agent-v3.0.0-Windows-x64.zip
2. شغّل "AiRemote Agent.exe"
3. أدخل عنوان الخادم والـ Token من لوحة التحكم
4. اضغط "تشغيل" — يظهر الـ Agent في System Tray
```

### 🐧 Linux Binary (Agent)
```bash
chmod +x AiRemote-Agent-v3.0.0-linux-x64

SERVER_URL=wss://your-server/ws \
DEVICE_TOKEN=توكن-جهازك \
./AiRemote-Agent-v3.0.0-linux-x64
```

### 📜 Node.js Script (Agent — أي نظام)
```bash
# يتطلب Node.js 18+
SERVER_URL=wss://your-server/ws \
DEVICE_TOKEN=توكن-جهازك \
node agent-v3.2.0.js
```

---

## ⚙️ متغيرات البيئة (Agent)

| المتغير | مطلوب | الوصف | المثال |
|---------|-------|-------|--------|
| `SERVER_URL` | ✅ | عنوان خادم AiRemote (WebSocket) | `wss://my-server.replit.app/ws` |
| `DEVICE_TOKEN` | ✅ | توكن الجهاز من لوحة التحكم | `abc123...` |
| `AGENT_NAME` | اختياري | اسم مخصص للجهاز | `My Server` |
| `LOG_LEVEL` | اختياري | مستوى السجلات: `info` / `debug` / `error` | `info` |

### كيف أحصل على `DEVICE_TOKEN`؟
1. افتح لوحة التحكم → **الأجهزة**
2. انقر **إضافة جهاز** → اكتب اسمًا
3. انسخ التوكن المُنشأ تلقائيًا

### كيف أحصل على `SERVER_URL`؟
- الإعدادات → **معلومات الخادم** → انسخ **عنوان WebSocket**
- يبدأ دائمًا بـ `wss://` (إنتاج) أو `ws://` (تطوير)

---

## 🛡️ التشغيل كـ Service (تلقائي عند بدء الجهاز)

### Windows — NSSM (Agent CLI)
```cmd
nssm install AiRemote "C:\path\to\AiRemote-Agent-v3.0.0-win-x64.exe"
nssm set AiRemote AppEnvironmentExtra ^
  "SERVER_URL=wss://your-server/ws" ^
  "DEVICE_TOKEN=توكن-جهازك"
nssm start AiRemote
```

### Linux — systemd (Agent Binary)
```ini
# /etc/systemd/system/airemote-agent.service
[Unit]
Description=AiRemote Agent
After=network.target

[Service]
ExecStart=/opt/airemote/AiRemote-Agent-v3.0.0-linux-x64
Environment="SERVER_URL=wss://your-server/ws"
Environment="DEVICE_TOKEN=توكن-جهازك"
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
```
```bash
sudo systemctl daemon-reload
sudo systemctl enable --now airemote-agent
sudo systemctl status airemote-agent
```

---

## 🐳 Docker (Server)

```bash
cd docker/
docker compose up -d
```

---

## 📋 تاريخ الإصدارات

### v3.2.0 — يونيو 2026 *(الحالي)*
**ميزات جديدة:**
- ✅ **Server Windows Desktop** — خادم AiRemote كتطبيق Electron مستقل لـ Windows
- ✅ **بث الشاشة ffmpeg** — دعم gdigrab لبث 15-30 FPS على Windows
- ✅ **WoL — Wake on LAN** — إيقاظ الأجهزة البعيدة عبر الشبكة المحلية
- ✅ **Multi-viewer** — عدة مستخدمين يشاهدون نفس الشاشة في آنٍ واحد
- ✅ **Delta Frames** — إرسال الفرق فقط بين إطارات الشاشة (توفير الباندويدث)
- ✅ **Zombie Sweeper** — كشف وتنظيف الاتصالات الميتة تلقائياً
- ✅ **TOTP / 2FA** — مصادقة ثنائية لجميع المستخدمين
- ✅ **سجل المراجعة** — تسجيل شامل لجميع الأحداث
- ✅ **Cloudflare Tunnel مدمج** — وصول خارجي بدون فتح منافذ Router

### v3.0.0 — 2026
**ميزات جديدة:**
- ✅ بث الشاشة 30 FPS — MJPEG-over-WebSocket مع جودة تكيّفية
- ✅ تحكم كامل — فأرة + لوحة + حافظة + تعدد شاشات
- ✅ Privacy Mode — إخفاء الشاشة أثناء الجلسة
- ✅ تسجيل الجلسات — JPEG frames → ZIP
- ✅ Consent Flow — طلب إذن المستخدم قبل التحكم
- ✅ In-session Chat — دردشة نصية مدمجة
- ✅ Adaptive Quality — ضبط FPS بناءً على RTT

### v2.0.0 — 2026
- ✅ AI Agent مدمج — تنفيذ أوامر Shell بالذكاء الاصطناعي
- ✅ SSH Terminal محسّن
- ✅ تصفح الملفات المتقدم

### v1.x — 2025
- الإصدارات الأولى — اتصال أساسي + إحصائيات النظام

---

## 📄 الترخيص

MIT License — مفتوح المصدر بالكامل.
