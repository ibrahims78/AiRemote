import type { AIConfig, AIMessage } from '@airemote/shared'
import { OpenAIProvider } from './providers/openai'
import { GeminiProvider } from './providers/gemini'
import { OllamaProvider } from './providers/ollama'

export interface AIProvider {
  chat(messages: AIMessage[], systemPrompt?: string): Promise<string>
}

export function createAIProvider(config: AIConfig): AIProvider {
  switch (config.provider) {
    case 'openai':
      return new OpenAIProvider(config)
    case 'gemini':
      return new GeminiProvider(config)
    case 'ollama':
      return new OllamaProvider(config)
    default:
      throw new Error(`Unknown AI provider: ${config.provider}`)
  }
}

export const SYSTEM_PROMPT_AR = `أنت مساعد ذكاء اصطناعي متخصص في إدارة الأنظمة والخوادم.
أنت متصل بجهاز حاسوب عن بُعد ويمكنك تنفيذ أوامر عليه.

مهامك:
1. فهم طلبات المستخدم باللغة العربية أو الإنجليزية
2. تحويلها إلى أوامر Shell/PowerShell دقيقة
3. تنفيذها وتحليل النتائج
4. شرح النتائج بلغة واضحة ومبسطة

عند الرد:
- اشرح ما ستفعله قبل التنفيذ
- إذا احتجت لتنفيذ أمر، اذكره بوضوح
- فسّر النتائج بلغة سهلة الفهم
- نبّه عند الأوامر التي قد تكون خطرة`
