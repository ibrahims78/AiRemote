# AiRemote Agent — Windows Desktop (Electron) v3.0.0

تطبيق **Windows GUI** كامل مبني بـ Electron. يعمل في System Tray ويوفر نفس إمكانيات الـ agent مع واجهة مرئية.

---

## 🚀 تشغيل التطوير

```bash
cd packages/agent-desktop
pnpm install
pnpm start        # يشغّل Electron مباشرةً
```

---

## 📦 بناء الإصدار القابل للتوزيع

```bash
# بناء مجلد غير مضغوط (مطلوب لإنشاء ZIP)
pnpm build:dir

# بناء portable exe مباشرة
pnpm build:portable

# ثم إنشاء ZIP للتوزيع
python3 ../../scripts/zip-agent.py \
  ../../releases/agent-windows/win-unpacked \
  ../../releases/agent-windows/AiRemote-Agent-v3.0.0-Windows-x64.zip
```

أو من لوحة التحكم (Admin): **Downloads → Windows Agent (GUI) → Build Now**

---

## 🏗️ هيكل الملفات

```
packages/agent-desktop/
├── main.js          ← Electron main process (IPC + tray + window)
├── preload.js       ← Context bridge بين main وrenderer
├── renderer/        ← واجهة المستخدم HTML/CSS/JS
│   ├── index.html
│   └── app.js
├── build/
│   └── icon.ico     ← أيقونة التطبيق
└── package.json     ← إعدادات electron-builder
```

---

## 🔌 بروتوكول الاتصال

يتصل الـ agent بالسيرفر عبر **WebSocket** (`wss://server/ws`) باستخدام:
- `DEVICE_TOKEN` — رمز الجهاز الفريد من Dashboard
- `SERVER_URL` — عنوان الـ WebSocket (مثل `wss://your-server/ws`)

---

## ✨ المميزات

| الميزة | الوصف |
|--------|-------|
| **System Tray** | يعمل في الخلفية — انقر بالزر الأيمن لفتح/إغلاق |
| **Screen Streaming** | بث الشاشة حتى 30 FPS عبر PowerShell GDI |
| **Mouse Control** | Win32 `mouse_event` + `SetCursorPos` عبر PowerShell دائم |
| **Keyboard Control** | `keybd_event` + `SendKeys` لجميع المفاتيح والتراكيب |
| **Clipboard Sync** | `Get-Clipboard` / `Set-Clipboard` |
| **Multi-Monitor** | `Screen.AllScreens` مع تبديل فوري |
| **PTY Terminal** | PowerShell / CMD تفاعلي |
| **File Browser** | تصفح ورفع وتنزيل |
| **IPC Bridge** | `screen-chat` notification عند وصول رسائل جديدة |
| **Auto-Reconnect** | Exponential backoff (2s → 30s) |
| **Privacy Mode** | `LockWorkStation` لإخفاء الشاشة |

---

## ⚙️ متطلبات البناء

| الأداة | الإصدار |
|--------|---------|
| Node.js | 18+ |
| pnpm | 8+ |
| Electron | 28.x |
| electron-builder | 24.x |
| Python 3 | مطلوب لسكريبت الـ ZIP |

> **ملاحظة:** البناء يُنتج ملفاً على Windows فقط. في بيئة Linux/macOS استخدم `--dir` لبناء unpacked فقط دون الـ exe.

---

## 📋 متطلبات التشغيل على المستخدم النهائي

- Windows 10 / 11 (64-bit)
- لا يحتاج Node.js — Electron مدمج داخل ZIP
- اتصال شبكة بخادم AiRemote
