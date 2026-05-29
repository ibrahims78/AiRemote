import { Ollama } from 'ollama'
import type { AIConfig, AIMessage } from '@airemote/shared'
import type { AIProvider } from '../gateway'

export class OllamaProvider implements AIProvider {
  private client: Ollama

  constructor(private config: AIConfig) {
    this.client = new Ollama({
      host: config.baseUrl || 'http://localhost:11434'
    })
  }

  async chat(messages: AIMessage[], systemPrompt?: string): Promise<string> {
    const ollamaMessages: { role: string; content: string }[] = []

    if (systemPrompt) {
      ollamaMessages.push({ role: 'system', content: systemPrompt })
    }

    for (const m of messages) {
      ollamaMessages.push({ role: m.role, content: m.content })
    }

    const response = await this.client.chat({
      model: this.config.model || 'llama3',
      messages: ollamaMessages
    })

    return response.message.content
  }
}
