"""LLM cost estimation from token usage."""

from __future__ import annotations

import re
from typing import Literal, TypedDict

LlmProvider = Literal["gemini", "openai", "claude"]

ModelPricing = TypedDict("ModelPricing", {"inputPer1M": float, "outputPer1M": float})

MODEL_PRICING: list[tuple[re.Pattern[str], ModelPricing]] = [
    (re.compile(r"gemini-2\.0-flash", re.I), {"inputPer1M": 0.1, "outputPer1M": 0.4}),
    (re.compile(r"gemini-1\.5-flash", re.I), {"inputPer1M": 0.075, "outputPer1M": 0.3}),
    (re.compile(r"gemini-1\.5-pro", re.I), {"inputPer1M": 1.25, "outputPer1M": 5.0}),
    (re.compile(r"gpt-4o-mini", re.I), {"inputPer1M": 0.15, "outputPer1M": 0.6}),
    (re.compile(r"gpt-4o(?!-mini)", re.I), {"inputPer1M": 2.5, "outputPer1M": 10.0}),
    (re.compile(r"gpt-4-turbo", re.I), {"inputPer1M": 10.0, "outputPer1M": 30.0}),
    (re.compile(r"claude-3-5-haiku", re.I), {"inputPer1M": 0.25, "outputPer1M": 1.25}),
    (re.compile(r"claude-3-5-sonnet", re.I), {"inputPer1M": 3.0, "outputPer1M": 15.0}),
    (re.compile(r"claude-3-haiku", re.I), {"inputPer1M": 0.25, "outputPer1M": 1.25}),
]

PROVIDER_DEFAULTS: dict[LlmProvider, ModelPricing] = {
    "gemini": {"inputPer1M": 0.1, "outputPer1M": 0.4},
    "openai": {"inputPer1M": 0.15, "outputPer1M": 0.6},
    "claude": {"inputPer1M": 0.25, "outputPer1M": 1.25},
}


def resolve_model_pricing(provider: LlmProvider, model: str) -> ModelPricing:
    normalized = model.strip()
    for pattern, pricing in MODEL_PRICING:
        if pattern.search(normalized):
            return pricing
    return PROVIDER_DEFAULTS.get(provider, PROVIDER_DEFAULTS["gemini"])


def estimate_cost_usd(
    provider: str,
    model: str,
    usage: dict[str, int],
) -> float:
    normalized_provider = provider if provider in PROVIDER_DEFAULTS else "gemini"
    rates = resolve_model_pricing(normalized_provider, model)  # type: ignore[arg-type]
    input_cost = (usage.get("inputTokens", 0) / 1_000_000) * rates["inputPer1M"]
    output_cost = (usage.get("outputTokens", 0) / 1_000_000) * rates["outputPer1M"]
    return input_cost + output_cost
