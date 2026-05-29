# دراسة مشروع AiRemote — وثيقة النقاش التفصيلية
**تاريخ البدء:** 28 مايو 2026
**المشارك:** إبراهيم
**الحالة:** مكتملة ✅ — جاهزة للتنفيذ

---

## 1. ملخص تنفيذي للمشروع

**AiRemote** منصة وصول عن بُعد مفتوحة المصدر، تجمع بين:
- **Remote Access** احترافي (SSH / VNC / RDP / SFTP)
- **AI Agent مدمج** يفهم اللغة الطبيعية (عربي + إنجليزي) وينفذ ويشخص ويشرح
- **Multi-tunnel Engine** يضمن الاتصال عبر طبقات متعددة دون انقطاع
- **واجهة ويب حديثة** — كل التحكم من أي متصفح، بدون تثبيت

**نقطة التمايز الجوهرية:** المشروع الوحيد في السوق المفتوح الذي يدمج Remote Access + AI Agent بدعم عربي كامل، بأداة خفيفة جداً على الأجهزة البعيدة.

---

## 2. القرارات الاستراتيجية الكاملة المعتمدة ✅

| القرار | الخيار المعتمد |
|--------|----------------|
| هدف المرحلة الأولى | منتج داخلي كامل لإبراهيم وفريقه (10–50 جهاز) ثم إطلاق مفتوح |
| نوع المشروع | مفتوح المصدر (Open Source) |
| نموذج التمويل | Self-hosted مجاني دائماً / الخادم المركزي مدفوع للجميع |
| Agent على الجهاز البعيد | خدمة خلفية خفيفة + Tray Icon — بدون Electron |
| واجهة التحكم | Web Dashboard كامل في المتصفح |
| نموذج الذكاء الاصطناعي | مرن — OpenAI / Gemini / Ollama (يختار المستخدم) |
| لغة البرمجة | TypeScript موحد للكل |
| أنظمة العميل | Windows أولاً ثم Linux |
| الهوية البصرية | Dark-first + Light Mode |
| نشر الخادم | Self-hosted (Docker) + Cloud مدفوع |

---

## 3. البنية المعمارية النهائية

```
┌──────────────────────────────────────────────────────────────────────┐
│                         AiRemote System                              │
├─────────────────────┬──────────────────────┬─────────────────────────┤
│  Agent              │  Backend Server      │  Dashboard (Web)        │
│  (الجهاز البعيد)   │  (الخادم)           │  (المتحكم)             │
├─────────────────────┼──────────────────────┼─────────────────────────┤
│ • خدمة خلفية خفيفة │ • REST API           │ • SSH Terminal (xterm)  │
│ • Tray Icon فقط    │ • WebSocket Relay    │ • VNC/RDP Viewer        │
│ • Multi-tunnel      │ • Auth + JWT         │ • Real-time Monitoring  │
│ • LAN + Internet   │ • Device Registry   │ • AI Chat Interface     │
│ • SSH/VNC/RDP/SFTP │ • AI Gateway        │ • File Manager (SFTP)   │
│ • Auto-reconnect   │ • Session Logs      │ • Device Management     │
│ • حجم < 20MB       │ • Notifications     │ • Settings              │
│                     │ • Multi-AI Provider │ • Dark/Light Theme      │
└─────────────────────┴──────────────────────┴─────────────────────────┘
```

### نظام الاتصال متعدد الطبقات
```
الأولوية 1: AiRemote Relay   ← الأسرع والأكثر موثوقية
الأولوية 2: Cloudflare Tunnel ← مجاني وموثوق
الأولوية 3: ngrok             ← احتياطي
الأولوية 4: Bore.pub          ← احتياطي أخير
الأولوية 5: LAN Direct        ← الأسرع عند توفره
→ يختار تلقائياً الأفضل ويتحول عند الانقطاع
```

---

## 4. المكدس التقني الكامل المعتمد

| الطبقة | التقنية | السبب |
|--------|---------|-------|
| Agent (Windows/Linux) | Node.js Service + systray | خفيف جداً < 20MB |
| Backend Server | Node.js + TypeScript + Fastify | سريع وخفيف |
| WebSocket Relay | ws + uWebSockets.js | أداء عالٍ لآلاف الاتصالات |
| Web Dashboard | React + TypeScript + TailwindCSS | احترافي وسريع |
| SSH Terminal | xterm.js + node-pty | terminal كامل في المتصفح |
| VNC Viewer | noVNC (WebSocket) | شاشة بعيدة في المتصفح |
| AI Engine | OpenAI SDK + Google Generative AI + Ollama | مرونة كاملة |
| قاعدة البيانات | SQLite (self-hosted) / PostgreSQL (cloud) | بحسب البيئة |
| التوثيق | SSH Keys (ED25519) + JWT + Refresh Tokens | أمان عالٍ |
| الإشعارات | Telegram Bot API + Web Push | فوري ومتعدد القنوات |
| نشر الخادم | Docker Compose | بأمر واحد |
| الهيكل | pnpm Monorepo | TypeScript موحد للكل |

---

## 5. هيكل الملفات (Monorepo)

```
airemote/
├── packages/
│   ├── shared/          # Types & Utils مشتركة بين الكل
│   ├── agent/           # Node.js Service + Tray (Windows/Linux)
│   ├── server/          # Fastify Backend + WebSocket Relay + AI Gateway
│   ├── dashboard/       # React Web Dashboard (Vite)
│   ├── mobile/          # React Native (مرحلة لاحقة)
│   └── ai-engine/       # AI Provider Abstraction Layer
├── docs/                # التوثيق الكامل
├── docker/              # Docker Compose للنشر
├── .github/             # CI/CD (GitHub Actions)
└── README.md
```

---

## 6. نموذج التمويل والاستدامة

| النموذج | التفاصيل |
|---------|----------|
| **Self-hosted** | مجاني تماماً للأبد — كل الميزات |
| **Cloud (مدفوع)** | اشتراك شهري بحسب عدد الأجهزة |
| **المصدر المفتوح** | كود كامل على GitHub — مجتمع + مساهمات |

---

## 7. الرؤية التصميمية المعتمدة

| العنصر | التوجه |
|--------|--------|
| الطابع | Dark-first + Light نظيف |
| مرجعيات | Vercel + Linear + Cloudflare + Raycast |
| الألوان | Deep Navy (#0F172A) + Electric Blue (#3B82F6) + Teal (#14B8A6) |
| الخط | Inter + JetBrains Mono (Terminal) |
| الأيقونات | Lucide Icons |
| التحريك | Framer Motion |

---

## 8. معايير النجاح

| المرحلة | المعيار |
|---------|---------|
| Core Infrastructure | Agent يتصل خلال 30 ثانية عبر أي طبقة |
| Dashboard | إبراهيم يتخلى عن أدواته القديمة بالكامل |
| AI Agent | 90%+ من الأوامر الطبيعية تُنفَّذ بدقة |
| الإطلاق العلني | 500+ نجمة على GitHub في أول شهر |

---

*تاريخ الإغلاق: 28 مايو 2026 — جاهزة للتنفيذ ✅*
