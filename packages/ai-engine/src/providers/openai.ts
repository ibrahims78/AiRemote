import OpenAI from 'openai'
import type { AIConfig, AIMessage } from '@airemote/shared'
import type { AIProvider } from '../gateway'

export class OpenAIProvider implements AIProvider {
  private client: OpenAI

  constructor(private config: AIConfig) {
    this.client = new OpenAI({
      apiKey: config.apiKey,
      baseURL: config.baseUrl
    })
  }

  async chat(messages: AIMessage[], systemPrompt?: string): Promise<string> {
    const openaiMessages: OpenAI.ChatCompletionMessageParam[] = []

    if (systemPrompt) {
      openaiMessages.push({ role: 'system', content: systemPrompt })
    }

    for (const m of messages) {
      openaiMessages.push({
        role: m.role === 'assistant' ? 'assistant' : 'user',
        content: m.content
      })
    }

    const response = await this.client.chat.completions.create({
      model: this.config.model || 'gpt-4o',
      messages: openaiMessages,
      temperature: this.config.temperature ?? 0.3,
      max_tokens: this.config.maxTokens ?? 2000
    })

    return response.choices[0]?.message?.content || ''
  }

  async chatStream(messages: AIMessage[], systemPrompt: string | undefined, onChunk: (text: string) => void): Promise<void> {
    const openaiMessages: OpenAI.ChatCompletionMessageParam[] = []
    if (systemPrompt) openaiMessages.push({ role: 'system', content: systemPrompt })
    for (const m of messages) {
      openaiMessages.push({ role: m.role === 'assistant' ? 'assistant' : 'user', content: m.content })
    }
    const stream = await this.client.chat.completions.create({
      model: this.config.model || 'gpt-4o',
      messages: openaiMessages,
      temperature: this.config.temperature ?? 0.3,
      max_tokens: this.config.maxTokens ?? 2000,
      stream: true,
    })
    for await (const chunk of stream) {
      const text = chunk.choices[0]?.delta?.content || ''
      if (text) onChunk(text)
    }
  }
}
