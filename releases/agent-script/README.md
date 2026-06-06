# AiRemote Agent — Script Edition (Node.js) v3.2.0

<div align="center">

![Version](https://img.shields.io/badge/Version-v3.2.0-blue?style=for-the-badge)
![Node.js](https://img.shields.io/badge/Node.js-18%2B-339933?style=for-the-badge&logo=nodedotjs)
![Platform](https://img.shields.io/badge/Platform-Windows%20%7C%20Linux%20%7C%20macOS-lightgrey?style=for-the-badge)

**سكريبت JavaScript مُجمَّع — يعمل على أي نظام يدعم Node.js**

</div>

---

## 📥 الملفات

| الملف | الحجم | الوصف |
|-------|-------|-------|
| `agent-v3.2.0.js` | 87 KB | السكريبت المُجمَّع الحالي (bundle كامل) |
| `agent-script-v3.2.0.zip` | 23 KB | حزمة كاملة (script + start.bat + start.sh + package.json) |
| `agent-v3.0.0.js` | 97 KB | الإصدار السابق |
| `start.bat` | — | سكريبت تشغيل Windows |
| `start.sh` | — | سكريبت تشغيل Linux / macOS |
| `package.json` | — | تعريف الحزمة والمتطلبات |

> **`agent-v3.2.0.js`** و **`agent-script-v3.2.0.zip`** جاهزان للتنزيل مباشرة.

---

## 🚀 التشغيل السريع

### Windows
```cmd
set SERVER_URL=wss://your-server/ws
set DEVICE_TOKEN=YOUR-DEVICE-TOKEN
node agent-v3.2.0.js
```

أو استخدم سكريبت التشغيل المُرفق:
```cmd
set DEVICE_TOKEN=YOUR-DEVICE-TOKEN
start.bat
```

### Linux / macOS
```bash
SERVER_URL=wss://your-server/ws \
DEVICE_TOKEN=YOUR-DEVICE-TOKEN \
node agent-v3.2.0.js
```

أو استخدم سكريبت التشغيل المُرفق:
```bash
DEVICE_TOKEN=YOUR-DEVICE-TOKEN ./start.sh
```

### ملف `.env` (الأسهل)
أنشئ ملف `.env` في نفس المجلد:
```env
SERVER_URL=wss://your-server/ws
DEVICE_TOKEN=YOUR-DEVICE-TOKEN
```
ثم شغّل:
```bash
node agent-v3.2.0.js
```

---

## ⚙️ متطلبات التشغيل

- **Node.js** 18.0.0 أو أحدث
- اتصال بالإنترنت للتواصل مع الخادم

**متطلبات التحكم عن بُعد على Linux:**
```bash
sudo apt install scrot xdotool xclip imagemagick
```

**متطلبات macOS (اختيارية — تحسين التحكم بالفأرة):**
```bash
brew install cliclick
# منح صلاحيات Accessibility في System Preferences
```

للتحقق من إصدار Node.js:
```bash
node --version   # يجب أن يكون v18 أو أعلى
```

---

## 🛡️ التشغيل كـ Service

### Linux — systemd
```bash
sudo nano /etc/systemd/system/airemote-agent.service
```
```ini
[Unit]
Description=AiRemote Agent (Script) v3.2.0
After=network.target

[Service]
WorkingDirectory=/opt/airemote
ExecStart=/usr/bin/node /opt/airemote/agent-v3.2.0.js
Environment="SERVER_URL=wss://your-server/ws"
Environment="DEVICE_TOKEN=YOUR-DEVICE-TOKEN"
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
```
```bash
sudo systemctl daemon-reload
sudo systemctl enable --now airemote-agent
```

### Windows — PM2
```cmd
npm install -g pm2
pm2 start agent-v3.2.0.js --name airemote-agent
pm2 startup
pm2 save
```

---

## ✨ المميزات

| الميزة | الوصف |
|--------|-------|
| 🔌 **اتصال تلقائي** | Exponential backoff (2s → 30s) |
| 🖥️ **بث الشاشة** | MJPEG حتى 30 FPS مع ضغط تكيّفي |
| 🖱️ **تحكم الفأرة** | نقر / سحب / تمرير — xdotool / Win32 / cliclick |
| ⌨️ **تحكم اللوحة** | جميع المفاتيح + تراكيب Modifier |
| 📋 **مزامنة الحافظة** | قراءة/كتابة ثنائية الاتجاه |
| 🖥️ **تعدد الشاشات** | اكتشاف تلقائي والتبديل بينها |
| 📊 **إحصائيات النظام** | CPU / RAM / Disk / Network في الوقت الفعلي |
| 📁 **تصفح الملفات** | رفع / تنزيل / حذف / إعادة تسمية |
| 💻 **Terminal PTY** | طرفية تفاعلية كاملة |
| 🔐 **SSH Tunnel** | نفق SSH من خلال الخادم |
| ⚡ **أوامر AI** | تنفيذ أوامر الذكاء الاصطناعي |
| 🌐 **Wake on LAN** | إيقاظ الجهاز عن بُعد |

---

## 📋 ما الجديد في v3.2.0

| الميزة | الوصف |
|--------|-------|
| WoL | إيقاظ الجهاز عبر Magic Packet |
| Multi-viewer | عدة مشاهدين على نفس الشاشة في آنٍ واحد |
| Delta Frames | إرسال الفرق فقط بين الإطارات لتوفير الباندويدث |
| Adaptive Quality | خفض FPS تلقائياً عند ارتفاع RTT > 350ms |
| Drag & Drop Upload | رفع الملفات بالسحب والإفلات على نافذة الشاشة |

---

## 🔗 الإصدارات الأخرى

| المنصة | النوع | الملف |
|---------|-------|-------|
| Windows | Server Desktop | `../server-windows/AiRemote-Server-v3.2.0-Windows-x64.zip` |
| Windows | Agent GUI | `../agent-windows/AiRemote-Agent-v3.0.0-Windows-x64.zip` |
| Windows / Linux | Agent Binary | `../agent-headless/` |

راجع [releases/README.md](../README.md) للمصفوفة الكاملة للإصدارات.

---

## 📄 الترخيص

MIT License — مفتوح المصدر بالكامل.
