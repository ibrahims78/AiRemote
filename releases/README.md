# AiRemote Agent — Releases

## أحدث الملفات المتاحة

| الملف | الإصدار | الوصف |
|-------|---------|-------|
| `agent-windows/AiRemote-Agent-v1.4.0-Windows-x64.exe` | v1.4.0 | واجهة رسومية كاملة (يُبنى من المصدر) |
| `agent-headless/AiRemote-Agent-Headless-v1.4.0-Windows-x64.exe` | v1.4.0 | بدون واجهة — يعمل كـ service |
| `agent-script/agent-v1.4.0.js` | v1.4.0 | يتطلب Node.js 18+ |

## النسخ المتاحة

| النسخة | المجلد | الوصف |
|--------|--------|-------|
| 🖥 Desktop (GUI) | `agent-windows/` | واجهة رسومية + SSH + موارد الجهاز |
| ⚙ Headless (CLI) | `agent-headless/` | بدون واجهة، يعمل كـ Windows Service |
| 📜 Script (Node.js) | `agent-script/` | يتطلب Node.js 18+ — أسهل للمطورين |

---

## ما الجديد في v1.4.0

### تصفح الملفات عبر الوكيل
- ✅ **تبويب Files في الـ Dashboard** — تصفح، رفع، تنزيل، حذف، إعادة تسمية بدون SSH
- ✅ **دعم Windows كامل** — يعرض الأقراص (C:, D:, ...) عند المسار /
- ✅ **Terminal PTY محسّن** — نفق نصي مستقر بدون node-pty

### إصلاحات الاستقرار (v1.4.0 patch)
- ✅ **إصلاح قراءة الشبكة** — parsing صحيح لـ `/proc/net/dev` على جميع توزيعات Linux؛ أول استدعاء لا يُظهر أرقامًا خيالية
- ✅ **إصلاح SSH Terminal** — ترميز Unicode/عربي صحيح في الطرفية؛ لا تراكم لـ listeners عند إعادة الاتصال
- ✅ **إصلاح تبويب الملفات** — يستخدم `lstat` و `Promise.allSettled` لتجنب التجمّد مع symlinks معطوبة

---

## بناء نسخة Windows Desktop (exe)

### من المصدر على Windows أو macOS
```bash
cd packages/agent-desktop
npm install
npx electron-builder --win --x64 --config.win.target=portable
# الناتج: releases/agent-windows/AiRemote-Agent-v1.4.0-Windows-x64.exe
```

### من monorepo (pnpm)
```bash
pnpm install
pnpm --filter airemote-agent-desktop build:portable
# الناتج: releases/agent-windows/AiRemote-Agent-v1.4.0-Windows-x64.exe
```

### GitHub Actions (التلقائي الموصى به)
```yaml
# .github/workflows/build-agent.yml
name: Build Agent
on:
  push:
    tags: ['agent-v*']
jobs:
  build-windows:
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
          name: AiRemote-Agent-v1.4.0-Windows
          path: releases/agent-windows/AiRemote-Agent-v1.4.0-Windows-x64.exe
```

---

## رفع GitHub Release

```bash
gh release create v1.4.0 \
  "agent-windows/AiRemote-Agent-v1.4.0-Windows-x64.exe" \
  "agent-headless/AiRemote-Agent-Headless-v1.4.0-Windows-x64.exe" \
  "agent-script/agent-v1.4.0.js" \
  --title "AiRemote Agent v1.4.0" \
  --notes "File browser via agent (no SSH), PTY terminal, network stats fix, SSH terminal Unicode fix, Files tab hang fix."
```

---

## تاريخ الإصدارات

| الإصدار | التاريخ | الأهم |
|---------|---------|-------|
| v1.4.0 | 2026-05 | تصفح الملفات، PTY محسّن، إصلاحات الشبكة/SSH/الملفات |
| v1.3.0 | 2026-05 | مؤشر اتصال احترافي، SSH banner، شريط تفاصيل الجلسة |
| v1.1.0 | 2025 | قسم مفتاح SSH، IP العام، سجل مرن، قابلية الطي |
