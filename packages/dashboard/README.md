# AiRemote Dashboard

**React 18 + Vite + TailwindCSS** — واجهة المستخدم الرئيسية لمنصة AiRemote.

---

## 🚀 تشغيل التطوير

```bash
cd packages/dashboard
pnpm dev          # http://localhost:5000
```

> يتطلب تشغيل **AiRemote Server** أولاً على المنفذ 3001.

---

## 🏗️ البنية التقنية

| التقنية | الدور |
|---------|-------|
| **React 18** | UI framework |
| **Vite 5** | Dev server + bundler (port 5000) |
| **TailwindCSS 3** | Utility-first styling |
| **Zustand** | Global state management |
| **React Router v6** | Client-side routing |
| **Axios** | REST API client |
| **xterm.js v5** | Browser-based terminal |
| **Recharts** | Real-time monitoring charts |
| **Lucide React** | Icon library |

---

## 📁 هيكل المصدر

```
src/
├── components/        ← مكونات قابلة لإعادة الاستخدام
│   ├── ScreenViewer.tsx   ← بث الشاشة + التحكم عن بُعد (v3.1.0)
│   ├── Terminal.tsx       ← PTY terminal (xterm.js)
│   ├── FileManager.tsx    ← متصفح الملفات
│   ├── WolModal.tsx       ← Wake-on-LAN
│   └── ...
├── pages/             ← صفحات التطبيق الرئيسية
│   ├── DevicesPage.tsx
│   ├── DashboardPage.tsx
│   ├── UsersPage.tsx
│   └── ...
├── store/             ← Zustand stores
│   ├── authStore.ts       ← حالة المصادقة + JWT
│   └── deviceStore.ts
├── lib/               ← أدوات مشتركة
│   └── api.ts             ← Axios instance
└── layouts/           ← تخطيطات الصفحات
```

---

## 🌐 WebSocket Connections

يتصل Dashboard بالسيرفر عبر WebSocket على المسارات التالية (مُوكَّل عبر Vite):

| المسار | الغرض |
|--------|--------|
| `/ws` | قناة الإحصائيات الفورية والأحداث |
| `/screen` | بث الشاشة + إرسال أحداث الفأرة/اللوحة |
| `/pty` | جلسات PTY shell |
| `/ssh` | نفق SSH terminal |

---

## ⚙️ إعداد Vite Proxy

يُوكّل Vite جميع طلبات `/api` و`/ws` إلى السيرفر (`http://localhost:3001`):

```ts
// vite.config.ts
proxy: {
  '/api':    { target: 'http://localhost:3001', changeOrigin: true },
  '/ws':     { target: 'ws://localhost:3001',   ws: true },
  '/ssh':    { target: 'ws://localhost:3001',   ws: true },
  '/pty':    { target: 'ws://localhost:3001',   ws: true },
  '/screen': { target: 'ws://localhost:3001',   ws: true },
}
```

---

## 🌍 الدعم اللغوي

الواجهة ثنائية اللغة (عربي + إنجليزي) مع دعم RTL كامل. يتم التبديل فوراً من شريط التنقل العلوي دون إعادة تحميل.

---

## 🔐 المصادقة

تُخزَّن رموز JWT في Zustand (`authStore`) وتُرسَل مع كل طلب REST عبر `Authorization: Bearer <token>`. تُستخدم **تذاكر WebSocket** أحادية الاستخدام (30 ثانية) للاتصالات المباشرة.

---

## 📦 البناء للإنتاج

```bash
pnpm build       # ينتج مجلد dist/
pnpm preview     # معاينة الـ build المُنتَج
```
