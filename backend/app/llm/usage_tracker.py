"""Accumulate LLM token/cost records in execution-provenance shape."""

from __future__ import annotations

from typing import Any

from app.agentic.pricing import estimate_cost_usd


def empty_llm_usage() -> dict[str, Any]:
    return {
        "total_input_tokens": 0,
        "total_output_tokens": 0,
        "total_cost_usd": 0.0,
        "calls": [],
    }


def call_from_tokens(
    *,
    provider: str,
    model: str,
    agent_id: str,
    input_tokens: int,
    output_tokens: int,
) -> dict[str, Any]:
    usage = {
        "inputTokens": max(0, int(input_tokens)),
        "outputTokens": max(0, int(output_tokens)),
        "totalTokens": max(0, int(input_tokens)) + max(0, int(output_tokens)),
    }
    cost = estimate_cost_usd(provider, model, usage)  # type: ignore[arg-type]
    return {
        "provider": provider,
        "model": model,
        "agent_id": agent_id,
        "input_tokens": usage["inputTokens"],
        "output_tokens": usage["outputTokens"],
        "cost_usd": round(cost, 6),
    }


def call_from_meta(meta: dict[str, Any], *, agent_id: str) -> dict[str, Any] | None:
    usage = meta.get("usage")
    if not usage:
        return None
    provider = str(meta.get("provider") or "gemini")
    model = str(meta.get("model") or "")
    return call_from_tokens(
        provider=provider,
        model=model,
        agent_id=agent_id,
        input_tokens=int(usage.get("inputTokens") or 0),
        output_tokens=int(usage.get("outputTokens") or 0),
    )


def merge_call(accumulated: dict[str, Any] | None, call: dict[str, Any] | None) -> dict[str, Any]:
    base = dict(accumulated or empty_llm_usage())
    if not call:
        return base
    calls = list(base.get("calls") or [])
    calls.append(call)
    return {
        "total_input_tokens": int(base.get("total_input_tokens") or 0) + int(call.get("input_tokens") or 0),
        "total_output_tokens": int(base.get("total_output_tokens") or 0) + int(call.get("output_tokens") or 0),
        "total_cost_usd": round(
            float(base.get("total_cost_usd") or 0.0) + float(call.get("cost_usd") or 0.0),
            6,
        ),
        "calls": calls,
    }


def merge_usage(
    accumulated: dict[str, Any] | None,
    other: dict[str, Any] | None,
) -> dict[str, Any]:
    base = dict(accumulated or empty_llm_usage())
    if not other:
        return base
    merged = base
    for call in other.get("calls") or []:
        if isinstance(call, dict):
            merged = merge_call(merged, call)
    return merged
