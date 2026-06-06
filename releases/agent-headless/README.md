# AiRemote Agent — Headless (Portable Binary) v3.2.0

<div align="center">

![Version](https://img.shields.io/badge/Version-v3.2.0-blue?style=for-the-badge)
![Windows](https://img.shields.io/badge/Windows-x64-0078D4?style=for-the-badge&logo=windows)
![Linux](https://img.shields.io/badge/Linux-x64-FCC624?style=for-the-badge&logo=linux&logoColor=black)

**ملف تنفيذي مستقل — لا يحتاج Node.js مثبتًا**

</div>

---

## 📥 الملفات المتاحة

| الملف | المنصة | الحجم |
|-------|--------|-------|
| `AiRemote-Agent-v3.0.0-linux-x64` | Linux 64-bit | ~45 MB |
| `AiRemote-Agent-v3.0.0-win-x64.exe` | Windows 64-bit | ~36 MB |

> **Linux:** جاهز للتنزيل مباشرةً.
> **Windows:** يُبنى عند الطلب من لوحة التحكم (**Admin → Downloads → Build Now**).

---

## 🚀 التشغيل السريع

### Windows
```cmd
set SERVER_URL=wss://your-server/ws
set DEVICE_TOKEN=YOUR-DEVICE-TOKEN
AiRemote-Agent-v3.0.0-win-x64.exe
```

أو عبر ملف `.env` (في نفس مجلد الـ exe):
```env
SERVER_URL=wss://your-server/ws
DEVICE_TOKEN=YOUR-DEVICE-TOKEN
```
ثم شغّل الـ exe مباشرة.

### Linux
```bash
chmod +x AiRemote-Agent-v3.0.0-linux-x64

SERVER_URL=wss://your-server/ws \
DEVICE_TOKEN=YOUR-DEVICE-TOKEN \
./AiRemote-Agent-v3.0.0-linux-x64
```

**متطلبات التحكم عن بُعد على Linux:**
```bash
sudo apt install scrot xdotool xclip imagemagick
```

---

## 🛡️ التشغيل كـ Windows Service (NSSM)

```cmd
nssm install AiRemote "C:\path\to\AiRemote-Agent-v3.0.0-win-x64.exe"
nssm set AiRemote AppEnvironmentExtra "SERVER_URL=wss://your-server/ws" "DEVICE_TOKEN=YOUR-TOKEN"
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
Description=AiRemote Agent v3.2.0
After=network.target

[Service]
ExecStart=/opt/airemote/AiRemote-Agent-v3.0.0-linux-x64
Environment="SERVER_URL=wss://your-server/ws"
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
sudo journalctl -u airemote-agent -f
```

---

## ✨ المميزات

| الميزة | الوصف |
|--------|-------|
| 🔌 **اتصال تلقائي** | Exponential backoff (2s → 30s) عند الانقطاع |
| 🖥️ **بث الشاشة** | MJPEG حتى 30 FPS مع ضغط تكيّفي |
| 🖱️ **تحكم الفأرة** | نقر / سحب / تمرير عبر xdotool أو Win32 API |
| ⌨️ **تحكم اللوحة** | جميع المفاتيح + تراكيب Modifier |
| 📋 **مزامنة الحافظة** | قراءة/كتابة ثنائية الاتجاه |
| 🖥️ **تعدد الشاشات** | اكتشاف تلقائي والتبديل بينها |
| 📊 **إحصائيات النظام** | CPU / RAM / Disk / Network في الوقت الفعلي |
| 📁 **تصفح الملفات** | رفع / تنزيل / حذف / إعادة تسمية |
| 💻 **Terminal PTY** | طرفية تفاعلية كاملة |
| 🔐 **SSH Tunnel** | نفق SSH من خلال الخادم |
| ⚡ **أوامر AI** | تنفيذ أوامر الذكاء الاصطناعي |
| ⚡ **ffmpeg** | بث 15-30 FPS عبر gdigrab (Windows) |
| 🌐 **Wake on LAN** | إيقاظ الجهاز عن بُعد |

---

## 📋 ما الجديد في v3.2.0

| الميزة | الوصف |
|--------|-------|
| بث ffmpeg | دعم gdigrab على Windows للبث بـ 15-30 FPS (vs 1 FPS بدونه) |
| WoL | إيقاظ الجهاز عبر Magic Packet |
| Multi-viewer | عدة مشاهدين على نفس الشاشة في آنٍ واحد |
| Delta Frames | إرسال الفرق فقط بين الإطارات لتوفير الباندويدث |
| Adaptive Quality | خفض FPS تلقائياً عند ارتفاع RTT > 350ms |

---

## 🔗 الإصدارات الأخرى

| المنصة | النوع | الملف |
|---------|-------|-------|
| Windows | Server Desktop | `../server-windows/AiRemote-Server-v3.2.0-Windows-x64.zip` |
| Windows | Agent GUI | `../agent-windows/AiRemote-Agent-v3.0.0-Windows-x64.zip` |
| أي نظام | Node.js Script | `../agent-script/agent-v3.2.0.js` |

راجع [releases/README.md](../README.md) للمصفوفة الكاملة للإصدارات.

---

## 📄 الترخيص

MIT License — مفتوح المصدر بالكامل.
