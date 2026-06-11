export type LlmProvider = 'openai' | 'gemini' | 'claude';

export const LLM_PROVIDERS: { id: LlmProvider; label: string }[] = [
  { id: 'gemini', label: 'Google Gemini' },
  { id: 'openai', label: 'OpenAI' },
  { id: 'claude', label: 'Anthropic Claude' },
];

export const LLM_MODELS: Record<LlmProvider, { id: string; label: string }[]> = {
  gemini: [
    { id: 'gemini-2.0-flash', label: 'Gemini 2.0 Flash' },
    { id: 'gemini-1.5-pro', label: 'Gemini 1.5 Pro' },
    { id: 'gemini-1.5-flash', label: 'Gemini 1.5 Flash' },
  ],
  openai: [
    { id: 'gpt-4o-mini', label: 'GPT-4o mini' },
    { id: 'gpt-4o', label: 'GPT-4o' },
    { id: 'gpt-4.1-mini', label: 'GPT-4.1 mini' },
    { id: 'gpt-4.1', label: 'GPT-4.1' },
  ],
  claude: [
    { id: 'claude-3-5-haiku-latest', label: 'Claude 3.5 Haiku' },
    { id: 'claude-sonnet-4-20250514', label: 'Claude Sonnet 4' },
    { id: 'claude-3-5-sonnet-latest', label: 'Claude 3.5 Sonnet' },
  ],
};

export const DEFAULT_LLM_PROVIDER: LlmProvider = 'gemini';

export function defaultModelForProvider(provider: LlmProvider): string {
  return LLM_MODELS[provider][0]?.id ?? 'gemini-2.0-flash';
}

export function normalizeProvider(value: string | undefined): LlmProvider {
  if (value === 'openai' || value === 'claude' || value === 'gemini') return value;
  return DEFAULT_LLM_PROVIDER;
}
