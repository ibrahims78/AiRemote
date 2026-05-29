"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.OllamaProvider = void 0;
const ollama_1 = require("ollama");
class OllamaProvider {
    constructor(config) {
        this.config = config;
        this.client = new ollama_1.Ollama({
            host: config.baseUrl || 'http://localhost:11434'
        });
    }
    async chat(messages, systemPrompt) {
        const ollamaMessages = [];
        if (systemPrompt) {
            ollamaMessages.push({ role: 'system', content: systemPrompt });
        }
        for (const m of messages) {
            ollamaMessages.push({ role: m.role, content: m.content });
        }
        const response = await this.client.chat({
            model: this.config.model || 'llama3',
            messages: ollamaMessages
        });
        return response.message.content;
    }
}
exports.OllamaProvider = OllamaProvider;
//# sourceMappingURL=ollama.js.map