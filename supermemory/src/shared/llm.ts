export type LlmProvider = "gemini" | "openai" | "claude";

export interface LlmConfig {
  provider: LlmProvider;
  apiKey: string;
  model: string;
}

export interface LlmSettingsInput {
  provider?: LlmProvider;
  apiKey?: string;
  model?: string;
}

export const LLM_PROVIDERS: Array<{
  id: LlmProvider;
  label: string;
  defaultModel: string;
  keyPlaceholder: string;
}> = [
  {
    id: "gemini",
    label: "Google Gemini",
    defaultModel: "gemini-2.0-flash",
    keyPlaceholder: "AIza…",
  },
  {
    id: "openai",
    label: "OpenAI",
    defaultModel: "gpt-4o-mini",
    keyPlaceholder: "sk-…",
  },
  {
    id: "claude",
    label: "Anthropic Claude",
    defaultModel: "claude-3-5-haiku-latest",
    keyPlaceholder: "sk-ant-…",
  },
];

export function defaultModelFor(provider: LlmProvider): string {
  return LLM_PROVIDERS.find((p) => p.id === provider)?.defaultModel ?? "gemini-2.0-flash";
}

export function normalizeProvider(raw: string | undefined): LlmProvider {
  const p = (raw ?? "gemini").trim().toLowerCase();
  if (p === "openai" || p === "claude") return p;
  return "gemini";
}

export function resolveLlmConfig(
  input: LlmSettingsInput | undefined,
  env: { provider?: string; apiKey?: string; model?: string },
): LlmConfig | null {
  const requestKey = input?.apiKey?.trim();
  const envKey = env.apiKey?.trim();

  const apiKey = requestKey || envKey || "";
  if (!apiKey) return null;

  const provider = normalizeProvider(input?.provider ?? env.provider);
  const model = (input?.model?.trim() || env.model?.trim() || defaultModelFor(provider)).trim();

  return { provider, apiKey, model };
}

export const LLM_SETTINGS_STORAGE_KEY = "supermemory-graph-llm-settings";

export function loadStoredLlmSettings(): LlmSettingsInput {
  try {
    const raw = localStorage.getItem(LLM_SETTINGS_STORAGE_KEY);
    if (!raw) return { provider: "gemini", model: defaultModelFor("gemini") };
    const parsed = JSON.parse(raw) as LlmSettingsInput;
    const provider = normalizeProvider(parsed.provider);
    return {
      provider,
      apiKey: parsed.apiKey ?? "",
      model: parsed.model?.trim() || defaultModelFor(provider),
    };
  } catch {
    return { provider: "gemini", model: defaultModelFor("gemini") };
  }
}

export function saveStoredLlmSettings(settings: LlmSettingsInput): void {
  localStorage.setItem(
    LLM_SETTINGS_STORAGE_KEY,
    JSON.stringify({
      provider: normalizeProvider(settings.provider),
      apiKey: settings.apiKey ?? "",
      model: settings.model?.trim() || defaultModelFor(normalizeProvider(settings.provider)),
    }),
  );
}
