# AiRemote Agent — Headless (Portable Binary)

<div align="center">

![Version](https://img.shields.io/badge/Version-v1.4.0-blue)
![Windows](https://img.shields.io/badge/Windows-x64-0078D4?logo=windows)
![Linux](https://img.shields.io/badge/Linux-x64-FCC624?logo=linux&logoColor=black)

**ملف تنفيذي مستقل — لا يحتاج Node.js مثبتًا**

</div>

---

## 📥 الملفات المتاحة

| الملف | المنصة | الحجم |
|-------|--------|-------|
| `AiRemote-Agent-v1.4.0-win-x64.exe` | Windows 64-bit | ~36 MB |
| `AiRemote-Agent-v1.4.0-linux-x64` | Linux 64-bit | ~45 MB |

---

## 🚀 التشغيل السريع

### Windows
```cmd
set SERVER_URL=wss://your-server.replit.app/ws
set DEVICE_TOKEN=YOUR-DEVICE-TOKEN
AiRemote-Agent-v1.4.0-win-x64.exe
```

أو عبر ملف `.env` (في نفس مجلد الـ exe):
```env
SERVER_URL=wss://your-server.replit.app/ws
DEVICE_TOKEN=YOUR-DEVICE-TOKEN
```
ثم شغّل الـ exe مباشرة.

### Linux
```bash
chmod +x AiRemote-Agent-v1.4.0-linux-x64

SERVER_URL=wss://your-server.replit.app/ws \
DEVICE_TOKEN=YOUR-DEVICE-TOKEN \
./AiRemote-Agent-v1.4.0-linux-x64
```

---

## 🛡️ التشغيل كـ Windows Service (NSSM)

```cmd
nssm install AiRemote "C:\path\to\AiRemote-Agent-v1.4.0-win-x64.exe"
nssm set AiRemote AppEnvironmentExtra "SERVER_URL=wss://your-server.replit.app/ws" "DEVICE_TOKEN=YOUR-TOKEN"
nssm start AiRemote
```

> تحميل NSSM مجانًا من: https://nssm.cc

---

## 🛡️ التشغيل كـ Linux Service (systemd)

```bash
sudo nano /etc/systemd/system/airemote-agent.service
```

```ini
[Unit]
Description=AiRemote Agent v1.4.0
After=network.target

[Service]
ExecStart=/opt/airemote/AiRemote-Agent-v1.4.0-linux-x64
Environment="SERVER_URL=wss://your-server.replit.app/ws"
Environment="DEVICE_TOKEN=YOUR-DEVICE-TOKEN"
Restart=always
RestartSec=10
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now airemote-agent
sudo journalctl -u airemote-agent -f  # متابعة السجلات
```

---

## ✨ المميزات

| الميزة | الوصف |
|--------|-------|
| 🔌 **اتصال تلقائي** | يتصل بالخادم ويُعيد الاتصال تلقائيًا عند الانقطاع |
| 📊 **إحصائيات النظام** | CPU / RAM / Disk / Network في الوقت الفعلي |
| 📁 **تصفح الملفات** | رفع / تنزيل / حذف / إعادة تسمية عبر لوحة التحكم |
| 💻 **Terminal PTY** | طرفية تفاعلية كاملة بدون `node-pty` |
| 🔐 **SSH Tunnel** | نفق SSH من خلال الخادم |
| ⚡ **أوامر AI** | تنفيذ أوامر الذكاء الاصطناعي على الجهاز |
| 🔄 **إعادة الاتصال** | Exponential backoff تلقائي (2s → 30s) |

---

## ما الجديد في v1.4.0

- ✅ **تصفح الملفات** من الـ Dashboard بدون SSH
- ✅ **رفع وتنزيل الملفات** عبر اتصال الوكيل
- ✅ **دعم Windows كامل** — يعرض الأقراص (C:, D:, ...) عند المسار `/`
- ✅ **Terminal PTY** — نفق نصي مستقر بدون `node-pty`
- ✅ **تنزيل مباشر** — أزرار تنزيل في لوحة التحكم
- ✅ إحصائيات الشبكة — إصلاح قراءة `/proc/net/dev` على Linux
- ✅ SSH Terminal — ترميز Unicode / عربي صحيح
- ✅ تبويب الملفات — `lstat` + `Promise.allSettled` لمنع التجمّد
