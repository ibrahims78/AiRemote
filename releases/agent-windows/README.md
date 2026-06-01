# AiRemote Agent — Windows Desktop (GUI)

تطبيق سطح مكتب Windows كامل مع System Tray. مبني بـ Electron — لا يحتاج Node.js.

A full **Windows GUI desktop application** with System Tray integration. Built with Electron — no Node.js required.

---

## 📦 الملفات / Files

| الملف / File | الحجم / Size | الوصف / Description |
|---|---|---|
| `AiRemote-Agent-v1.4.0-Windows-x64.zip` | ~103 MB | Full desktop app — extract ZIP and run |
| `win-unpacked/` | — | Raw unpacked Electron build |

---

## 🚀 التشغيل السريع / Quick Start

**العربية:**
1. حمّل `AiRemote-Agent-v1.4.0-Windows-x64.zip`
2. فُك الضغط إلى أي مجلد (مثل `C:\AiRemote\`)
3. شغّل `AiRemote Agent.exe`
4. أدخل **عنوان الخادم** (WebSocket) و **Device Token** من الـ Dashboard
5. اضغط **تشغيل** — يتصل الـ Agent ويظهر في شريط المهام (System Tray)

**English:**
1. Download `AiRemote-Agent-v1.4.0-Windows-x64.zip`
2. Extract to any folder (e.g. `C:\AiRemote\`)
3. Run `AiRemote Agent.exe`
4. Enter your **Server URL** (WebSocket) and **Device Token** from the dashboard
5. Click **Start** — the agent connects and appears in the System Tray

---

## ✨ المميزات / Features

| الميزة | Description |
|--------|-------------|
| **System Tray** | يعمل في الخلفية — انقر بالزر الأيمن لفتح/إغلاق |
| **Auto-Start** | إعادة الاتصال تلقائياً عند فتح البرنامج |
| **PTY Terminal** | PowerShell / CMD كامل من الـ Dashboard |
| **File Browser** | تصفح ورفع وتنزيل الملفات |
| **SSH Access** | إعدادات SSH للاتصال من الخادم |
| **Device Stats** | CPU / RAM / Disk في الوقت الفعلي |
| **Arabic / English** | واجهة ثنائية اللغة مع RTL |
| **Dark / Light Theme** | تبديل من شريط العنوان |

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

## 🔨 بناء من المصدر / Build from Source

```bash
cd packages/agent-desktop
pnpm install
CSC_IDENTITY_AUTO_DISCOVERY=false electron-builder --win --x64 --dir
# ثم:
python3 -c "
import zipfile, os
src = '../../releases/agent-windows/win-unpacked'
dst = '../../releases/agent-windows/AiRemote-Agent-v1.4.0-Windows-x64.zip'
with zipfile.ZipFile(dst, 'w', zipfile.ZIP_DEFLATED) as zf:
    for r, d, files in os.walk(src):
        for f in files:
            fp = os.path.join(r, f)
            zf.write(fp, os.path.relpath(fp, src))
print('Done:', os.path.getsize(dst), 'bytes')
"
```

---

## 📋 المتطلبات / Requirements

- Windows 10 / 11 (64-bit)
- لا يحتاج Node.js — Electron مدمج / No additional runtime — Electron is bundled
- اتصال شبكة بخادم AiRemote / Network access to your AiRemote server

---

## ما الجديد في v1.5.0

| الميزة | الوصف |
|--------|-------|
| إحصائيات الشبكة | Upload/Download عبر netstat-e + WMI fallback |
| Terminal PTY محسّن | Software PTY: echo تلقائي، backspace يعمل، cd يُحدّث الـ prompt |
| Shell Wrapper | PowerShell يقرأ الأوامر ويُظهر `PS C:\path> ` بعد كل أمر |
| تصفح الملفات | من الـ Dashboard بدون SSH |
| رفع وتنزيل الملفات | عبر اتصال الوكيل |

---

## 🔗 الإصدارات الأخرى / Other Releases

| Platform | Type | File |
|----------|------|------|
| Windows | CLI Headless | `../agent-headless/AiRemote-Agent-v1.5.0-win-x64.exe` |
| Linux | CLI Headless | `../agent-headless/AiRemote-Agent-v1.5.0-linux-x64` |
| Any | Node.js Script | `../agent-script/agent-v1.5.0.js` |
| Any | Script ZIP | `../agent-script/agent-script-v1.5.0.zip` |

See [releases/README.md](../README.md) for the full release matrix.
