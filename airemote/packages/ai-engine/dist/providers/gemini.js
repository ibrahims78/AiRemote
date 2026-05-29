"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.GeminiProvider = void 0;
const generative_ai_1 = require("@google/generative-ai");
class GeminiProvider {
    constructor(config) {
        this.config = config;
        this.client = new generative_ai_1.GoogleGenerativeAI(config.apiKey || '');
    }
    async chat(messages, systemPrompt) {
        const model = this.client.getGenerativeModel({
            model: this.config.model || 'gemini-1.5-pro',
            systemInstruction: systemPrompt
        });
        const history = messages.slice(0, -1).map(m => ({
            role: m.role === 'user' ? 'user' : 'model',
            parts: [{ text: m.content }]
        }));
        const chat = model.startChat({ history });
        const lastMessage = messages[messages.length - 1];
        const result = await chat.sendMessage(lastMessage?.content || '');
        return result.response.text();
    }
}
exports.GeminiProvider = GeminiProvider;
//# sourceMappingURL=gemini.js.map