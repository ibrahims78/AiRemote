# AiRemote

**منصة وصول عن بُعد مفتوحة المصدر مع AI Agent مدمج**

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.4-blue)](https://typescriptlang.org)
[![Node.js](https://img.shields.io/badge/Node.js-20+-green)](https://nodejs.org)

---

## ما هو AiRemote؟

AiRemote هو بديل مفتوح المصدر لـ TeamViewer وAnyDesk، يضيف ميزة لا يملكها أي منافس: **AI Agent مدمج** يفهم الأوامر بالعربية والإنجليزية وينفذها مباشرة على الأجهزة البعيدة.

### الميزات الرئيسية

| الميزة | الوصف |
|--------|-------|
| 🤖 **AI Agent** | اكتب بالعربي أو الإنجليزي — AI يترجم وينفذ |
| 🔗 **Multi-tunnel** | 5 طبقات اتصال احتياطية — لا انقطاع |
| 🖥️ **SSH Terminal** | Terminal كامل في المتصفح |
| 📊 **Real-time Monitoring** | CPU/RAM/Disk/Network لحظياً |
| 🔒 **Self-hosted** | بيانات تحت سيطرتك الكاملة |
| 🌍 **عربي + إنجليزي** | دعم كامل للغتين |

---

## البدء السريع

### 1. Self-hosted بـ Docker

```bash
git clone https://github.com/yourusername/airemote.git
cd airemote
cp docker/.env.example docker/.env
# عدّل JWT_SECRET في .env
docker compose -f docker/docker-compose.yml up -d
```

افتح المتصفح على `http://localhost` وأكمل إعداد الحساب الأول.

### 2. تثبيت Agent على الأجهزة البعيدة

```bash
# أنشئ جهازاً من Dashboard للحصول على Token
cp packages/agent/src/.env.example packages/agent/.env
# أضف DEVICE_TOKEN في .env
pnpm --filter @airemote/agent start
```

---

## للمطورين

```bash
# تثبيت الحزم
pnpm install

# تشغيل كل شيء في وضع التطوير
pnpm dev:server   # Backend على :3001
pnpm dev:dashboard # Dashboard على :5173
pnpm dev:agent    # Agent (يحتاج DEVICE_TOKEN)
```

---

## البنية التقنية

```
airemote/
├── packages/
│   ├── shared/      # Types مشتركة
│   ├── agent/       # خدمة الجهاز البعيد
│   ├── server/      # Backend + WebSocket Relay
│   ├── dashboard/   # React Web Dashboard
│   └── ai-engine/   # AI Provider Abstraction
└── docker/          # Docker Compose
```

---

## الترخيص

MIT License — مجاني للاستخدام الشخصي والتجاري.
