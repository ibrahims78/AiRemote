import { GoogleGenAI } from '@google/genai'
import type { AIConfig, AIMessage } from '@airemote/shared'
import type { AIProvider } from '../gateway'

export class GeminiProvider implements AIProvider {
  private client: GoogleGenAI

  constructor(private config: AIConfig) {
    this.client = new GoogleGenAI({ apiKey: config.apiKey || '' })
  }

  async chat(messages: AIMessage[], systemPrompt?: string): Promise<string> {
    const contents = messages.map(m => ({
      role: m.role === 'user' ? 'user' : 'model',
      parts: [{ text: m.content }]
    }))

    const response = await this.client.models.generateContent({
      model: this.config.model || 'gemini-2.5-flash',
      contents,
      config: {
        ...(systemPrompt ? { systemInstruction: systemPrompt } : {}),
        temperature:     this.config.temperature ?? 0.3,
        maxOutputTokens: this.config.maxTokens   ?? 2000,
      }
    })

    return response.text ?? ''
  }
}
