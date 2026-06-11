"""LLM synthesis step — formats orchestrator context into CoT-ready decision JSON."""

from __future__ import annotations

from typing import Any

from app.llm.client import complete_json


def _fallback_decision(suggestions: list[dict[str, Any]]) -> dict[str, Any]:
    if not suggestions:
        return {
            "action": "HOLD",
            "market_id": "NONE",
            "conviction_level": 1,
            "thesis": "No trade passed confidence gates",
            "tags": [],
            "reasoning": "Insufficient corroboration or market quality.",
        }
    top = suggestions[0]
    action = "BUY_YES" if top.get("side") == "BUY YES" else "BUY_NO"
    conviction = max(1, min(10, int(round(top.get("confidence", 0.5) * 10))))
    return {
        "action": action,
        "market_id": top.get("slug") or top.get("market", "NONE"),
        "market_slug": top.get("slug", ""),
        "conviction_level": conviction,
        "thesis": top.get("thesis", ""),
        "tags": [f"#{top.get('asset', 'market')}"],
        "reasoning": "; ".join(top.get("evidence", [])[:4]),
    }


def _build_correlated(tool_results: dict[str, Any], suggestions: list[dict[str, Any]]) -> dict[str, Any]:
    gamma = tool_results.get("polymarketGamma") or {}
    markets = []
    if gamma.get("ok"):
        for m in gamma.get("data", {}).get("markets", []):
            markets.append(
                {
                    "id": m.get("slug") or m.get("conditionId"),
                    "venue": "polymarket",
                    "title": m.get("question"),
                    "slug": m.get("slug"),
                    "conditionId": m.get("conditionId"),
                }
            )
    if suggestions:
        top = suggestions[0]
        markets.insert(
            0,
            {
                "id": top.get("slug") or top.get("market"),
                "venue": "polymarket",
                "title": top.get("market"),
                "slug": top.get("slug"),
            },
        )
    return {"polymarket": markets[:8], "kalshi": [], "correlations": []}


async def synthesize_decision(
    llm_config: dict[str, Any],
    signal: dict[str, Any],
    suggestions: list[dict[str, Any]],
    tool_results: dict[str, Any],
    evidence: list[str],
) -> tuple[dict[str, Any], dict[str, Any]]:
    import json

    correlated = _build_correlated(tool_results, suggestions)
    api_key = (llm_config.get("apiKey") or llm_config.get("llmApiKey") or "").strip()

    if not api_key:
        return _fallback_decision(suggestions), correlated

    system_prompt = llm_config.get("systemPrompt") or (
        "You are a trading analyst synthesizing multi-source signals. "
        "Output ONLY valid JSON with action, market_id, conviction_level, thesis, tags, reasoning."
    )
    user_prompt = llm_config.get("userPrompt") or "Synthesize the orchestrator context into one trade decision JSON."

    context = {
        "signal": signal,
        "suggestions": suggestions,
        "evidence": evidence,
        "tool_summaries": {
            key: {
                "ok": val.get("ok"),
                "error": val.get("error"),
                "data": val.get("data"),
            }
            for key, val in tool_results.items()
        },
    }
    full_user = f"{user_prompt}\n\nContext:\n{json.dumps(context, default=str)[:12000]}"

    parsed = await complete_json(llm_config, system_prompt, full_user)
    if parsed:
        return parsed, correlated

    return _fallback_decision(suggestions), correlated
