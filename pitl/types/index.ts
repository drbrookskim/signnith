export type Provider = 'claude' | 'openai' | 'gemini'
export type WizardStep = 0 | 1 | 2 | 3
export type GenerateStep = '3c' | '4p' | 'plan'

export interface ProviderConfig {
  provider: Provider
  apiKey: string
  model: string
}

export interface WizardState extends ProviderConfig {
  step: WizardStep
  idea: string
  threeC: string
  fourP: string
  plan: string
}

export const MODELS: Record<Provider, string[]> = {
  claude: ['claude-sonnet-4-6', 'claude-opus-4-8', 'claude-haiku-4-5-20251001'],
  openai: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo'],
  gemini: ['gemini-2.0-flash', 'gemini-2.5-pro', 'gemini-1.5-pro'],
}

export interface GenerateRequest {
  provider: Provider
  apiKey: string
  model: string
  step: GenerateStep
  idea: string
  threeC?: string
  fourP?: string
}
