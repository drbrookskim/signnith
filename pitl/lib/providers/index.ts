import type { Provider } from '@/types'
import { generateWithClaude } from './claude'
import { generateWithOpenAI } from './openai'
import { generateWithGemini } from './gemini'

export function getProvider(
  provider: Provider
): (prompt: string, apiKey: string, model: string) => Promise<ReadableStream<Uint8Array>> {
  switch (provider) {
    case 'claude': return generateWithClaude
    case 'openai': return generateWithOpenAI
    case 'gemini': return generateWithGemini
  }
}
