# AiRemote Agent — Script Edition (Node.js)

<div align="center">

![Version](https://img.shields.io/badge/Version-v1.4.0-blue)
![Node.js](https://img.shields.io/badge/Node.js-18%2B-339933?logo=nodedotjs)
![Platform](https://img.shields.io/badge/Platform-Windows%20%7C%20Linux%20%7C%20macOS-lightgrey)

**سكريبت JavaScript مُجمَّع — يعمل على أي نظام يدعم Node.js**

</div>

---

## 📥 الملفات

| الملف | الوصف |
|-------|-------|
| `agent-v1.4.0.js` | السكريبت المُجمَّع (bundle كامل) |
| `agent-script-v1.4.0.zip` | حزمة كاملة (script + start.bat + start.sh) |
| `start.bat` | سكريبت تشغيل Windows |
| `start.sh` | سكريبت تشغيل Linux / macOS |
| `package.json` | تعريف الحزمة والمتطلبات |

---

## 🚀 التشغيل السريع

### Windows
```cmd
:: 1. تثبيت المتطلبات (مرة واحدة)
npm install

:: 2. تعيين متغيرات البيئة وتشغيل
set SERVER_URL=wss://your-server.replit.app/ws
set DEVICE_TOKEN=YOUR-DEVICE-TOKEN
node agent-v1.4.0.js
```

أو استخدم سكريبت التشغيل المُرفق:
```cmd
set DEVICE_TOKEN=YOUR-DEVICE-TOKEN
start.bat
```

### Linux / macOS
```bash
# 1. تثبيت المتطلبات (مرة واحدة)
npm install

# 2. تشغيل
SERVER_URL=wss://your-server.replit.app/ws \
DEVICE_TOKEN=YOUR-DEVICE-TOKEN \
node agent-v1.4.0.js
```

أو استخدم سكريبت التشغيل المُرفق:
```bash
DEVICE_TOKEN=YOUR-DEVICE-TOKEN ./start.sh
```

### ملف `.env` (الأسهل)
أنشئ ملف `.env` في نفس المجلد:
```env
SERVER_URL=wss://your-server.replit.app/ws
DEVICE_TOKEN=YOUR-DEVICE-TOKEN
```
ثم شغّل:
```bash
node agent-v1.4.0.js
```

---

## ⚙️ متطلبات التشغيل

- **Node.js** 18.0.0 أو أحدث
- اتصال بالإنترنت للتواصل مع الخادم

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
ExecStart=/usr/bin/node /opt/airemote/agent-v1.4.0.js
Environment="SERVER_URL=wss://your-server.replit.app/ws"
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
pm2 start agent-v1.4.0.js --name airemote-agent
pm2 startup
pm2 save
```

---

## ✨ المميزات

- 🔌 اتصال تلقائي + إعادة اتصال ذكية (Exponential backoff)
- 📊 إحصائيات النظام في الوقت الفعلي (CPU / RAM / Disk / Network)
- 📁 تصفح الملفات + رفع / تنزيل / حذف
- 💻 Terminal PTY تفاعلي
- 🔐 SSH Tunnel عبر الخادم
- ⚡ تنفيذ أوامر AI

---

## ما الجديد في v1.4.0

- ✅ تصفح الملفات من الـ Dashboard بدون SSH
- ✅ رفع وتنزيل الملفات عبر اتصال الوكيل
- ✅ دعم Windows الكامل — يعرض الأقراص (C:, D:, ...)
- ✅ Terminal PTY مستقر بدون `node-pty`
- ✅ إصلاح إحصائيات الشبكة على Linux
- ✅ إصلاح ترميز SSH Terminal (Unicode / عربي)
