"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.OpenAIProvider = void 0;
const openai_1 = __importDefault(require("openai"));
class OpenAIProvider {
    constructor(config) {
        this.config = config;
        this.client = new openai_1.default({
            apiKey: config.apiKey,
            baseURL: config.baseUrl
        });
    }
    async chat(messages, systemPrompt) {
        const openaiMessages = [];
        if (systemPrompt) {
            openaiMessages.push({ role: 'system', content: systemPrompt });
        }
        for (const m of messages) {
            openaiMessages.push({
                role: m.role === 'assistant' ? 'assistant' : 'user',
                content: m.content
            });
        }
        const response = await this.client.chat.completions.create({
            model: this.config.model || 'gpt-4o',
            messages: openaiMessages,
            temperature: this.config.temperature ?? 0.3,
            max_tokens: this.config.maxTokens ?? 2000
        });
        return response.choices[0]?.message?.content || '';
    }
}
exports.OpenAIProvider = OpenAIProvider;
//# sourceMappingURL=openai.js.map