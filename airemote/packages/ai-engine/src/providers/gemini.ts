import { GoogleGenerativeAI } from '@google/generative-ai'
import type { AIConfig, AIMessage } from '@airemote/shared'
import type { AIProvider } from '../gateway'

export class GeminiProvider implements AIProvider {
  private client: GoogleGenerativeAI

  constructor(private config: AIConfig) {
    this.client = new GoogleGenerativeAI(config.apiKey || '')
  }

  async chat(messages: AIMessage[], systemPrompt?: string): Promise<string> {
    const model = this.client.getGenerativeModel({
      model: this.config.model || 'gemini-1.5-pro',
      systemInstruction: systemPrompt
    })

    const history = messages.slice(0, -1).map(m => ({
      role: m.role === 'user' ? 'user' : 'model',
      parts: [{ text: m.content }]
    }))

    const chat = model.startChat({ history })
    const lastMessage = messages[messages.length - 1]
    const result = await chat.sendMessage(lastMessage?.content || '')
    return result.response.text()
  }
}
