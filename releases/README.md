# AiRemote Agent — Releases

<div align="center">

![AiRemote](https://img.shields.io/badge/AiRemote-v1.4.0-blue?style=for-the-badge)
![License](https://img.shields.io/badge/License-MIT-green?style=for-the-badge)
![Platform](https://img.shields.io/badge/Platform-Windows%20%7C%20Linux%20%7C%20macOS-lightgrey?style=for-the-badge)

**منصة الوصول عن بُعد + AI Agent مفتوحة المصدر**

</div>

---

## 📦 الإصدارات المتاحة — v1.4.0

| النسخة | الملف | الحجم | المنصة | الوصف |
|--------|-------|-------|--------|-------|
| 🪟 **Windows GUI** | `agent-windows/AiRemote-Agent-v1.4.0-Windows-x64.zip` | ~103 MB | Windows x64 | تطبيق سطح مكتب + System Tray — فُك الضغط وشغّل |
| 🖥️ **Windows CLI** | `agent-headless/AiRemote-Agent-v1.4.0-win-x64.exe` | ~36 MB | Windows x64 | ملف تنفيذي مستقل — سطر أوامر، لا يحتاج Node.js |
| 🐧 **Linux Binary** | `agent-headless/AiRemote-Agent-v1.4.0-linux-x64` | ~45 MB | Linux x64 | ملف تنفيذي مستقل — لا يحتاج Node.js |
| 📜 **Node.js Script** | `agent-script/agent-v1.4.0.js` | ~168 KB | أي نظام | يتطلب Node.js 18+ |
| 📦 **Script ZIP** | `agent-script/agent-script-v1.4.0.zip` | ~168 KB | أي نظام | Script + start.bat + start.sh |

> 💡 **للمبتدئين على Windows:** نسخة GUI (واجهة رسومية) — فُك الضغط وشغّل مباشرة.
> 💡 **للخوادم وسطر الأوامر:** نسخة CLI لـ Windows أو Binary لـ Linux.

---

## 🚀 التشغيل السريع

### 🪟 Windows GUI (تطبيق سطح المكتب)
```
1. فُك الضغط عن AiRemote-Agent-v1.4.0-Windows-x64.zip
2. شغّل "AiRemote Agent.exe"
3. أدخل عنوان الخادم والـ Token من واجهة التطبيق
4. اضغط "تشغيل" — يظهر الـ Agent في System Tray
```

### 🖥️ Windows CLI (سطر الأوامر)
```cmd
:: 1. انسخ عنوان الخادم من لوحة التحكم > الإعدادات
:: 2. شغّل الأمر:
set SERVER_URL=wss://your-server.replit.app/ws
set DEVICE_TOKEN=توكن-جهازك-من-لوحة-التحكم
AiRemote-Agent-v1.4.0-win-x64.exe
```

### Linux / macOS (Binary)
```bash
# 1. أعط صلاحية التنفيذ
chmod +x AiRemote-Agent-v1.4.0-linux-x64

# 2. شغّل مع متغيرات البيئة
SERVER_URL=wss://your-server.replit.app/ws \
DEVICE_TOKEN=توكن-جهازك \
./AiRemote-Agent-v1.4.0-linux-x64
```

### Node.js Script (أي نظام)
```bash
# يتطلب Node.js 18+
npm install  # المرة الأولى فقط
DEVICE_TOKEN=توكن-جهازك node agent-v1.4.0.js
```

---

## ⚙️ متغيرات البيئة

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

### Windows — NSSM
```cmd
:: تحميل NSSM من https://nssm.cc
nssm install AiRemote "C:\path\to\AiRemote-Agent-v1.4.0-win-x64.exe"
nssm set AiRemote AppEnvironmentExtra ^
  "SERVER_URL=wss://your-server.replit.app/ws" ^
  "DEVICE_TOKEN=توكن-جهازك"
nssm start AiRemote
```

### Linux — systemd
```ini
# /etc/systemd/system/airemote-agent.service
[Unit]
Description=AiRemote Agent
After=network.target

[Service]
ExecStart=/opt/airemote/AiRemote-Agent-v1.4.0-linux-x64
Environment="SERVER_URL=wss://your-server.replit.app/ws"
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

## 🔨 بناء من المصدر

### بناء الـ Portable Binaries (Windows EXE + Linux Binary)
```bash
# من مجلد المشروع الرئيسي
pnpm install
cd packages/agent
node_modules/.bin/pkg ../../releases/agent-script/agent-v1.4.0.js \
  --targets node18-win-x64,node18-linux-x64 \
  --output ../../releases/agent-headless/AiRemote-Agent-v1.4.0 \
  --compress GZip
```

### بناء Agent Script (JavaScript Bundle)
```bash
cd packages/agent
pnpm build:script   # ينتج: releases/agent-script/agent-v1.4.0.js
```

---

## 📋 تاريخ الإصدارات

### v1.4.0 — 2026-05 *(الحالي)*
**ميزات جديدة:**
- ✅ **تصفح الملفات** — تصفح / رفع / تنزيل / حذف بدون SSH
- ✅ **دعم Windows الكامل** — يعرض الأقراص (C: D: ...) عند المسار `/`
- ✅ **Terminal PTY** — نفق نصي مستقر بدون `node-pty`
- ✅ **تنزيل مباشر** — أزرار تنزيل في لوحة التحكم (الإعدادات)

**إصلاحات:**
- ✅ إحصائيات الشبكة — قراءة صحيحة لـ `/proc/net/dev` على جميع توزيعات Linux
- ✅ SSH Terminal — ترميز Unicode / عربي صحيح؛ لا تراكم لـ listeners
- ✅ تبويب الملفات — `lstat` + `Promise.allSettled` لمنع التجمّد مع symlinks

### v1.3.0 — 2026-05
- مؤشر اتصال احترافي
- SSH banner قابل للتخصيص
- شريط تفاصيل الجلسة المحسّن

### v1.1.0 — 2025
- قسم مفتاح SSH
- IP العام التلقائي
- سجل مرن
- قابلية الطي في الواجهة

---

## 📄 الترخيص

MIT License — مفتوح المصدر بالكامل.
