# AiRemote Agent — Releases v1.1.0

## الملفات الجاهزة للرفع على GitHub

| الملف | الحجم | MD5 |
|-------|-------|-----|
| `agent-windows/AiRemote-Agent-v1.1.0-Windows-x64.exe` | 67 MB | d7dfb0f663f36803bc3c7df534a09648 |
| `agent-headless/AiRemote-Agent-Headless-v1.1.0-Windows-x64.exe` | 37 MB | a7f38ec5c24bae59ee063fea4a91c70a |
| `agent-script/AiRemote-Agent-Script-v1.1.0.zip` | 4.3 KB | b72816928c708dcb5d790c175fae0ab3 |

## النسخ المتاحة

| النسخة | المجلد | الحجم | الوصف |
|--------|--------|-------|-------|
| 🖥 Desktop (GUI) | `agent-windows/` | 67 MB | واجهة رسومية كاملة + SSH tab |
| ⚙ Headless (CLI) | `agent-headless/` | 37 MB | بدون واجهة، يعمل كـ service |
| 📜 Script (Node.js) | `agent-script/` | 4.3 KB | يتطلب Node.js 18+ |

## ما الجديد في v1.1.0

### إصلاحات UI (آخر بناء)
- ✅ **إصلاح IP الإنترنت** — خطأ: الحدث لا يُرسل عند timeout/error في main.js — مُصلح
- ✅ **أقسام قابلة للطي** — زر ▼ لكل قسم (معلومات الجهاز / الإعدادات / الموارد / السجل)
- ✅ **حالات افتراضية ذكية** — معلومات + موارد مطوية، إعدادات مفتوحة — تُحفظ في localStorage
- ✅ **سطر ملخص** — عند طي أي قسم يظهر ملخص (hostname · IP / CPU% RAM% Disk%)
- ✅ **السجل قابل للطي** — عند طيه تتوسع مساحة الإعدادات تلقائياً
- ✅ **توسيع الموارد تلقائياً** عند الاتصال بالخادم
- ✅ **فتح الإعدادات تلقائياً** عند محاولة التشغيل بدون تكوين

### ميزات v1.1.0 الأصلية
- ✅ عرض IP الإنترنت (العام) إلى جانب IP المحلي
- ✅ قسم مفتاح SSH التشفيري (توليد + عرض المفتاح العام والخاص + نسخ)
- ✅ زر Browse لاختيار ملف مفتاح SSH من النظام
- ✅ عرض اسم المستخدم عند اتصال الخادم عبر SSH
- ✅ سجل أحداث مرن يملأ الشاشة
- ✅ شريط أدوات السجل: بحث + فلتر + نسخ + تصدير .txt
- ✅ أزرار نسخ لكل خانة معلومات
- ✅ Toast notifications عند الاتصال/الانقطاع
- ✅ حفظ حجم النافذة وموضعها
- ✅ انتقال سلس بين تابَيْن الإعدادات

## اختر النسخة المناسبة

- **Desktop** — للاستخدام العادي مع واجهة بصرية
- **Headless** — للسيرفرات أو التشغيل التلقائي بدون واجهة
- **Script** — للمطورين أو الأجهزة التي تحمل Node.js مسبقاً

## رفع GitHub Release

```
gh release create v1.1.0 \
  "agent-windows/AiRemote-Agent-v1.1.0-Windows-x64.exe" \
  "agent-headless/AiRemote-Agent-Headless-v1.1.0-Windows-x64.exe" \
  "agent-script/AiRemote-Agent-Script-v1.1.0.zip" \
  --title "AiRemote Agent v1.1.0" \
  --notes "..."
```
