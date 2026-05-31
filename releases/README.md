# AiRemote Agent — Releases

## الملفات المتاحة

| الملف | الإصدار | الوصف |
|-------|---------|-------|
| `agent-windows/AiRemote-Agent-v1.3.0-source.zip` | v1.3.0 | مصدر البناء (يتطلب electron-builder على Windows/macOS/CI) |
| `agent-headless/AiRemote-Agent-Headless-v1.1.0-Windows-x64.exe` | v1.1.0 | بدون واجهة — يعمل كـ service |
| `agent-script/AiRemote-Agent-Script-v1.1.0.zip` | v1.1.0 | يتطلب Node.js 18+ |

## النسخ المتاحة

| النسخة | المجلد | الوصف |
|--------|--------|-------|
| 🖥 Desktop (GUI) | `agent-windows/` | واجهة رسومية + SSH + موارد الجهاز |
| ⚙ Headless (CLI) | `agent-headless/` | بدون واجهة، يعمل كـ Windows Service |
| 📜 Script (Node.js) | `agent-script/` | يتطلب Node.js 18+ |

---

## ما الجديد في v1.3.0

### مؤشر الاتصال الاحترافي
- ✅ **شريط تفاصيل الاتصال** — يظهر أسفل بطاقة الحالة عند الاتصال: اسم الخادم · وقت الجلسة · شارة PTY
- ✅ **Titlebar محسّن** — يعرض hostname الخادم بجانب الحالة عند الاتصال/الاتصال
- ✅ **تلوين ديناميكي للـ status pill** — أخضر/أصفر/أحمر حسب الحالة
- ✅ **عداد وقت الجلسة** — يتزايد كل ثانية في شريط التفاصيل
- ✅ **شارة PTY نشط** — تُظهر أن النفق النصي مفعّل

### تبويب SSH محسّن
- ✅ **Banner توضيحي** — شرح واضح أن SSH يُنشَأ من الخادم ولا يتطلب فتح منافذ
- ✅ **حالة SSH الحية** — شريط حالة ديناميكي يعكس اتصالات الخادم مباشرةً
- ✅ **مفاتيح SSH** — توليد + عرض المفتاح العام/الخاص + نسخ بضغطة واحدة

### تحسينات عامة
- ✅ **زر Reconnect** في تبويب Connection للاتصال السريع
- ✅ **تصدير السجل** — `.txt` بالتاريخ
- ✅ **ترجمات كاملة** عربي/إنجليزي لجميع الميزات
- ✅ **رفع الإصدار**: `package.json` + `AGENT_VERSION` → `1.3.0`

---

## بناء نسخة Windows (exe)

### من المصدر — على Windows أو macOS

```bash
# فك ضغط AiRemote-Agent-v1.3.0-source.zip ثم:
cd AiRemote-Agent-v1.3.0
npm install
npx electron-builder --win --x64 --config.win.target=portable
# الناتج: dist/AiRemote-Agent-v1.3.0-Windows-x64.exe
```

### GitHub Actions (التلقائي الموصى به)

```yaml
# .github/workflows/build-agent-windows.yml
name: Build Windows Agent
on:
  push:
    tags: ['agent-v*']
jobs:
  build:
    runs-on: windows-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '20' }
      - run: npm install
        working-directory: packages/agent-desktop
      - run: npx electron-builder --win --x64 --config.win.target=portable
        working-directory: packages/agent-desktop
      - uses: actions/upload-artifact@v4
        with:
          name: AiRemote-Agent-v1.3.0-Windows
          path: releases/agent-windows/*.exe
```

### من monorepo (pnpm)

```bash
pnpm install
pnpm --filter airemote-agent-desktop build:portable
# الناتج: releases/agent-windows/AiRemote-Agent-v1.3.0-Windows-x64.exe
```

---

## رفع GitHub Release

```bash
gh release create v1.3.0 \
  "agent-windows/AiRemote-Agent-v1.3.0-Windows-x64.exe" \
  "agent-headless/AiRemote-Agent-Headless-v1.1.0-Windows-x64.exe" \
  "agent-script/AiRemote-Agent-Script-v1.1.0.zip" \
  --title "AiRemote Agent v1.3.0" \
  --notes "Professional connection status strip, enhanced SSH tab with info banner, session uptime counter, titlebar hostname display."
```

---

## تاريخ الإصدارات

| الإصدار | التاريخ | الأهم |
|---------|---------|-------|
| v1.3.0 | 2026-05 | مؤشر اتصال احترافي، SSH banner، شريط تفاصيل الجلسة |
| v1.1.0 | 2025 | قسم مفتاح SSH، IP العام، سجل مرن، قابلية الطي |
