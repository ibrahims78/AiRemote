"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SYSTEM_PROMPT_AR = void 0;
exports.createAIProvider = createAIProvider;
const openai_1 = require("./providers/openai");
const gemini_1 = require("./providers/gemini");
const ollama_1 = require("./providers/ollama");
function createAIProvider(config) {
    switch (config.provider) {
        case 'openai':
            return new openai_1.OpenAIProvider(config);
        case 'gemini':
            return new gemini_1.GeminiProvider(config);
        case 'ollama':
            return new ollama_1.OllamaProvider(config);
        default:
            throw new Error(`Unknown AI provider: ${config.provider}`);
    }
}
exports.SYSTEM_PROMPT_AR = `أنت مساعد ذكاء اصطناعي متخصص في إدارة الأنظمة والخوادم.
أنت متصل بجهاز حاسوب عن بُعد ويمكنك تنفيذ أوامر عليه.

مهامك:
1. فهم طلبات المستخدم باللغة العربية أو الإنجليزية
2. تحويلها إلى أوامر Shell/PowerShell دقيقة
3. تنفيذها وتحليل النتائج
4. شرح النتائج بلغة واضحة ومبسطة

عند الرد:
- اشرح ما ستفعله قبل التنفيذ
- إذا احتجت لتنفيذ أمر، اذكره بوضوح
- فسّر النتائج بلغة سهلة الفهم
- نبّه عند الأوامر التي قد تكون خطرة`;
//# sourceMappingURL=gateway.js.map