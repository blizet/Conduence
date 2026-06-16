import type { LlmProvider } from "./llm.js";
import type { RawTurnTokenUsage } from "./tokens.js";

/** USD per 1M tokens */
export interface ModelPricing {
  inputPer1M: number;
  outputPer1M: number;
}

const MODEL_PRICING: Array<{ match: RegExp; pricing: ModelPricing }> = [
  { match: /gemini-2\.0-flash/i, pricing: { inputPer1M: 0.1, outputPer1M: 0.4 } },
  { match: /gemini-1\.5-flash/i, pricing: { inputPer1M: 0.075, outputPer1M: 0.3 } },
  { match: /gemini-1\.5-pro/i, pricing: { inputPer1M: 1.25, outputPer1M: 5.0 } },
  { match: /gpt-4o-mini/i, pricing: { inputPer1M: 0.15, outputPer1M: 0.6 } },
  { match: /gpt-4o(?!-mini)/i, pricing: { inputPer1M: 2.5, outputPer1M: 10.0 } },
  { match: /gpt-4-turbo/i, pricing: { inputPer1M: 10.0, outputPer1M: 30.0 } },
  { match: /claude-3-5-haiku/i, pricing: { inputPer1M: 0.25, outputPer1M: 1.25 } },
  { match: /claude-3-5-sonnet/i, pricing: { inputPer1M: 3.0, outputPer1M: 15.0 } },
  { match: /claude-3-haiku/i, pricing: { inputPer1M: 0.25, outputPer1M: 1.25 } },
];

const PROVIDER_DEFAULTS: Record<LlmProvider, ModelPricing> = {
  gemini: { inputPer1M: 0.1, outputPer1M: 0.4 },
  openai: { inputPer1M: 0.15, outputPer1M: 0.6 },
  claude: { inputPer1M: 0.25, outputPer1M: 1.25 },
};

export function resolveModelPricing(provider: LlmProvider, model: string): ModelPricing {
  const normalized = model.trim();
  for (const entry of MODEL_PRICING) {
    if (entry.match.test(normalized)) return entry.pricing;
  }
  return PROVIDER_DEFAULTS[provider];
}

export function estimateCostUsd(
  provider: LlmProvider,
  model: string,
  usage: Pick<RawTurnTokenUsage, "inputTokens" | "outputTokens">,
): number {
  const rates = resolveModelPricing(provider, model);
  const inputCost = (usage.inputTokens / 1_000_000) * rates.inputPer1M;
  const outputCost = (usage.outputTokens / 1_000_000) * rates.outputPer1M;
  return inputCost + outputCost;
}

export function formatUsd(amount: number): string {
  if (amount === 0) return "$0.00";
  const fractionDigits = amount < 0.01 ? 6 : amount < 1 ? 4 : 2;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: Math.min(2, fractionDigits),
    maximumFractionDigits: fractionDigits,
  }).format(amount);
}
