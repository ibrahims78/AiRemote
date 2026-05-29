export type AIProvider = 'openai' | 'gemini' | 'ollama';
export type AIMessageRole = 'user' | 'assistant' | 'system';
export interface AIMessage {
    role: AIMessageRole;
    content: string;
    timestamp: Date;
}
export interface AIConversation {
    id: string;
    deviceId: string;
    userId: string;
    messages: AIMessage[];
    createdAt: Date;
    updatedAt: Date;
}
export interface AICommandResult {
    command: string;
    output: string;
    exitCode: number;
    explanation: string;
    executedAt: Date;
}
export interface AIConfig {
    provider: AIProvider;
    model: string;
    apiKey?: string;
    baseUrl?: string;
    temperature?: number;
    maxTokens?: number;
}
//# sourceMappingURL=ai.d.ts.map