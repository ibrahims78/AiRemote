# AiRemote Agent — Script Edition (Node.js) v3.0.0

<div align="center">

![Version](https://img.shields.io/badge/Version-v3.0.0-blue)
![Node.js](https://img.shields.io/badge/Node.js-18%2B-339933?logo=nodedotjs)
![Platform](https://img.shields.io/badge/Platform-Windows%20%7C%20Linux%20%7C%20macOS-lightgrey)

**سكريبت JavaScript مُجمَّع — يعمل على أي نظام يدعم Node.js**

</div>

---

## 📥 الملفات

| الملف | الوصف |
|-------|-------|
| `agent-v3.0.0.js` | السكريبت المُجمَّع (bundle كامل) |
| `agent-script-v3.0.0.zip` | حزمة كاملة (script + start.bat + start.sh) |
| `start.bat` | سكريبت تشغيل Windows |
| `start.sh` | سكريبت تشغيل Linux / macOS |
| `package.json` | تعريف الحزمة والمتطلبات |

> **`agent-v3.0.0.js`** جاهز للتنزيل. **`agent-script-v3.0.0.zip`** يُبنى عند الطلب من لوحة التحكم.

---

## 🚀 التشغيل السريع

### Windows
```cmd
set SERVER_URL=wss://your-server/ws
set DEVICE_TOKEN=YOUR-DEVICE-TOKEN
node agent-v3.0.0.js
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
node agent-v3.0.0.js
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
node agent-v3.0.0.js
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
Description=AiRemote Agent (Script)
After=network.target

[Service]
WorkingDirectory=/opt/airemote
ExecStart=/usr/bin/node /opt/airemote/agent-v3.0.0.js
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
pm2 start agent-v3.0.0.js --name airemote-agent
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

---

## ما الجديد في v3.0.0

| الميزة | الوصف |
|--------|-------|
| بث الشاشة 30 FPS | MJPEG-over-WebSocket مع إزالة التكرار وجودة تكيّفية |
| تحكم كامل عن بُعد | فأرة + لوحة + حافظة + تعدد شاشات |
| Privacy Mode | إخفاء الشاشة أثناء الجلسة |
| تسجيل الجلسات | JPEG frames → ZIP من جانب الخادم |
| Consent Flow | طلب إذن المستخدم قبل التحكم |
| In-session Chat | دردشة نصية مدمجة بين المشاهد والجهاز |
| Adaptive Quality | خفض FPS تلقائياً عند ارتفاع RTT > 350ms |
| Drag & Drop Upload | رفع الملفات بالسحب والإفلات على نافذة الشاشة |
