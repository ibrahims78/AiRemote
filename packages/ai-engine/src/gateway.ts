import type { AIConfig, AIMessage } from '@airemote/shared'
import { OpenAIProvider } from './providers/openai'
import { GeminiProvider } from './providers/gemini'
import { OllamaProvider } from './providers/ollama'

export interface AIProvider {
  chat(messages: AIMessage[], systemPrompt?: string): Promise<string>
  chatStream(messages: AIMessage[], systemPrompt: string | undefined, onChunk: (text: string) => void): Promise<void>
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

export const SYSTEM_PROMPT_AR = `أنت مساعد ذكاء اصطناعي متخصص في إدارة الأنظمة والخوادم عن بُعد.
أنت متصل بجهاز بعيد عبر AiRemote Agent ويمكنك تنفيذ أوامر عليه.

مهامك:
1. فهم طلبات المستخدم باللغة العربية أو الإنجليزية
2. تحويلها إلى أوامر Shell/PowerShell دقيقة
3. تحليل النتائج وشرحها بلغة واضحة ومبسطة
4. استخدام معلومات الجهاز المتوفرة في سياق المحادثة

عند الرد:
- اشرح ما ستفعله قبل اقتراح الأمر
- استخدم الأوامر المناسبة لنظام التشغيل المحدد في معلومات الجهاز
- فسّر النتائج بلغة سهلة الفهم
- نبّه عند الأوامر التي قد تكون خطرة
- عند السؤال عن مواصفات الجهاز، استخدم البيانات الواردة في قسم [معلومات الجهاز] إذا كانت متوفرة`
