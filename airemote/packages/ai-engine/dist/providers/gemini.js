"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.GeminiProvider = void 0;
const genai_1 = require("@google/genai");
class GeminiProvider {
    constructor(config) {
        this.config = config;
        this.client = new genai_1.GoogleGenAI({ apiKey: config.apiKey || '' });
    }
    async chat(messages, systemPrompt) {
        const contents = messages.map(m => ({
            role: m.role === 'user' ? 'user' : 'model',
            parts: [{ text: m.content }]
        }));
        const response = await this.client.models.generateContent({
            model: this.config.model || 'gemini-2.5-flash',
            contents,
            config: {
                ...(systemPrompt ? { systemInstruction: systemPrompt } : {}),
                temperature: this.config.temperature ?? 0.3,
                maxOutputTokens: this.config.maxTokens ?? 2000,
            }
        });
        return response.text ?? '';
    }
}
exports.GeminiProvider = GeminiProvider;
//# sourceMappingURL=gemini.js.map