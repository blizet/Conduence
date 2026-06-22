import type { GraphObservabilityLlmUsage } from '@/lib/observability-types';

export function formatUsd(value: number | undefined): string {
  if (value === undefined || Number.isNaN(value)) return '—';
  return `$${value.toFixed(4)}`;
}

export function formatTokens(value: number | undefined): string {
  if (value === undefined) return '—';
  return value.toLocaleString();
}

export function emptyLlmUsage(): GraphObservabilityLlmUsage {
  return {
    total_input_tokens: 0,
    total_output_tokens: 0,
    total_cost_usd: 0,
    calls: [],
  };
}

export function mergeLlmUsage(
  ...sources: Array<GraphObservabilityLlmUsage | null | undefined>
): GraphObservabilityLlmUsage {
  const merged = emptyLlmUsage();
  for (const source of sources) {
    if (!source) continue;
    merged.total_input_tokens =
      (merged.total_input_tokens ?? 0) + (source.total_input_tokens ?? 0);
    merged.total_output_tokens =
      (merged.total_output_tokens ?? 0) + (source.total_output_tokens ?? 0);
    merged.total_cost_usd = (merged.total_cost_usd ?? 0) + (source.total_cost_usd ?? 0);
    if (source.calls?.length) {
      merged.calls = [...(merged.calls ?? []), ...source.calls];
    }
  }
  return merged;
}

export function hasLlmUsage(usage: GraphObservabilityLlmUsage | null | undefined): boolean {
  if (!usage) return false;
  if ((usage.total_cost_usd ?? 0) > 0) return true;
  if ((usage.total_input_tokens ?? 0) > 0) return true;
  if ((usage.total_output_tokens ?? 0) > 0) return true;
  return Boolean(usage.calls?.length);
}
