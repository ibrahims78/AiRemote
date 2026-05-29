import type { AIConfig, AIMessage } from '@airemote/shared';
import type { AIProvider } from '../gateway';
export declare class OpenAIProvider implements AIProvider {
    private config;
    private client;
    constructor(config: AIConfig);
    chat(messages: AIMessage[], systemPrompt?: string): Promise<string>;
}
//# sourceMappingURL=openai.d.ts.map