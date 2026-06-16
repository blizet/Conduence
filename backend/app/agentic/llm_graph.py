"""Multi-provider LLM client for agentic graph chat."""

from __future__ import annotations

import json
import re
from typing import Any

import httpx

from app.agentic.config import LlmConfig
from app.agentic.graph import is_valid_node_label

SYSTEM_PROMPT = """You are a thoughtful analyst helping the user build a weighted causal graph for markets, geopolitics, and related domains.

Your job:
1. Have a natural conversation — acknowledge what they said, reflect your understanding, and ask clear follow-up questions when anything is ambiguous.
2. **CRITICAL — update the graph JSON every turn:** Any entity or relationship you mention in assistant_message MUST appear in nodes[] and/or edges[] that same turn. Never discuss nodes that are not in your JSON output.
3. Add nodes as soon as the user names an entity — even without edges yet. Orphan nodes (no edges) are valid.
4. Add directed edges (source → target) when a causal link is stated; weight can stay null until confirmed.
5. Edge weight ∈ [-1, 1]: (0,1]=direct, [-1,0)=inverse. Set expected_sign: 1 if target rises, -1 if it falls.
6. When the user gives weights, emit weight_updates using exact edge_id values from the Current graph context (e.g. oil_price_to_electric_vehicle_usage).
7. Whenever you add relationships, remind the user they can click edges on the live graph to set weights via the sidebar slider.

Always respond with JSON:
{
  "assistant_message": "Your full natural-language reply",
  "nodes": [{"id":"oil_price","label":"Oil Price","type":"market"}],
  "edges": [{"id":"oil_price_to_electric_vehicle_usage","source":"oil_price","target":"electric_vehicle_usage","label":"Oil Price → Electric Vehicle Usage","weight": null,"expected_sign": 1}],
  "weight_updates": [{"edge_id":"oil_price_to_electric_vehicle_usage","weight": -0.5}]
}

Rules:
- nodes[] and edges[] are required every turn when the user adds or discusses entities — use [] only if nothing changed.
- Use stable snake_case ids (slug of label). Reuse ids from Current graph context.
- weight_updates must reference edge_id values that exist in the graph (create the edge in edges[] first if new).
- Parse weight phrases: 8/10→0.8, strong→0.75; respect expected_sign when unsigned.
- Do not invent weights the user has not stated or clearly implied.
- Never put conversational prose, sentence fragments, or partial quotes in nodes[] — only real entities (markets, events, assets, people, policies)."""

NODE_TYPES = {"event", "asset", "market", "concept"}


def _normalize_usage(
    input_tokens: int | None,
    output_tokens: int | None,
    total: int | None = None,
) -> dict[str, int]:
    inp = input_tokens or 0
    out = output_tokens or 0
    return {"inputTokens": inp, "outputTokens": out, "totalTokens": total or inp + out}


def _normalize_raw_nodes(raw: Any) -> list[dict]:
    if not isinstance(raw, list):
        return []
    nodes: list[dict] = []
    for item in raw:
        if not isinstance(item, dict):
            continue
        label = str(item.get("label") or item.get("name") or "").strip()
        if not label or not is_valid_node_label(label):
            continue
        node_id = (
            str(item.get("id") or label)
            .strip()
            .lower()
        )
        node_id = re.sub(r"^_|_$", "", re.sub(r"[^a-z0-9]+", "_", node_id))[:48]
        type_raw = str(item.get("type") or "concept").lower()
        node_type = type_raw if type_raw in NODE_TYPES else "concept"
        nodes.append({"id": node_id or "node", "label": label, "type": node_type})
    return nodes


def _normalize_raw_edges(raw: Any) -> list[dict]:
    if not isinstance(raw, list):
        return []
    edges: list[dict] = []
    for item in raw:
        if not isinstance(item, dict):
            continue
        source = str(item.get("source") or item.get("source_id") or item.get("from") or "").strip()
        target = str(item.get("target") or item.get("target_id") or item.get("to") or "").strip()
        if not source or not target:
            continue
        label = str(item.get("label") or f"{source} → {target}").strip()
        edge_id = str(item.get("id") or f"{source}_to_{target}").strip()
        weight_raw = item.get("weight")
        weight = None if weight_raw in (None, "unset") else float(weight_raw)
        expected_sign = -1 if item.get("expected_sign") == -1 or item.get("expectedSign") == -1 else 1
        edges.append(
            {
                "id": edge_id,
                "source": source,
                "target": target,
                "label": label,
                "weight": weight,
                "expected_sign": expected_sign,
            }
        )
    return edges


def _normalize_raw_weight_updates(raw: Any) -> list[dict]:
    if not isinstance(raw, list):
        return []
    updates: list[dict] = []
    for item in raw:
        if not isinstance(item, dict):
            continue
        edge_id = str(item.get("edge_id") or item.get("edgeId") or item.get("id") or "").strip()
        try:
            weight = float(item["weight"])
        except (KeyError, TypeError, ValueError):
            continue
        if edge_id:
            updates.append({"edge_id": edge_id, "weight": weight})
    return updates


async def _gemini_complete(
    config: LlmConfig,
    system_prompt: str,
    messages: list[dict[str, str]],
    temperature: float,
    max_tokens: int,
) -> tuple[str | None, dict[str, int] | None]:
    url = (
        f"https://generativelanguage.googleapis.com/v1beta/models/{config['model']}:generateContent"
    )
    contents = [
        {"role": "model" if m["role"] == "assistant" else "user", "parts": [{"text": m["content"]}]}
        for m in messages
    ]
    async with httpx.AsyncClient(timeout=120.0) as client:
        response = await client.post(
            url,
            params={"key": config["apiKey"]},
            json={
                "systemInstruction": {"parts": [{"text": system_prompt}]},
                "contents": contents,
                "generationConfig": {
                    "temperature": temperature,
                    "maxOutputTokens": max_tokens,
                    "responseMimeType": "application/json",
                },
            },
        )
        if response.status_code >= 400:
            return None, None
        body = response.json()
        meta = body.get("usageMetadata") or {}
        usage = _normalize_usage(
            meta.get("promptTokenCount"),
            meta.get("candidatesTokenCount"),
            meta.get("totalTokenCount"),
        )
        parts = body.get("candidates", [{}])[0].get("content", {}).get("parts", [])
        text = parts[0].get("text") if parts else None
        return text, usage


async def _openai_complete(
    config: LlmConfig,
    system_prompt: str,
    messages: list[dict[str, str]],
    temperature: float,
    max_tokens: int,
) -> tuple[str | None, dict[str, int] | None]:
    async with httpx.AsyncClient(timeout=120.0) as client:
        response = await client.post(
            "https://api.openai.com/v1/chat/completions",
            headers={
                "Authorization": f"Bearer {config['apiKey']}",
                "Content-Type": "application/json",
            },
            json={
                "model": config["model"],
                "temperature": temperature,
                "max_tokens": max_tokens,
                "response_format": {"type": "json_object"},
                "messages": [
                    {"role": "system", "content": system_prompt},
                    *[{"role": m["role"], "content": m["content"]} for m in messages],
                ],
            },
        )
        if response.status_code >= 400:
            return None, None
        body = response.json()
        usage_raw = body.get("usage") or {}
        usage = _normalize_usage(
            usage_raw.get("prompt_tokens"),
            usage_raw.get("completion_tokens"),
            usage_raw.get("total_tokens"),
        )
        choices = body.get("choices") or []
        text = choices[0].get("message", {}).get("content") if choices else None
        return text, usage


async def _claude_complete(
    config: LlmConfig,
    system_prompt: str,
    messages: list[dict[str, str]],
    temperature: float,
    max_tokens: int,
) -> tuple[str | None, dict[str, int] | None]:
    async with httpx.AsyncClient(timeout=120.0) as client:
        response = await client.post(
            "https://api.anthropic.com/v1/messages",
            headers={
                "x-api-key": config["apiKey"],
                "anthropic-version": "2023-06-01",
                "Content-Type": "application/json",
            },
            json={
                "model": config["model"],
                "max_tokens": max_tokens,
                "temperature": temperature,
                "system": f"{system_prompt}\n\nRespond with JSON only.",
                "messages": [{"role": m["role"], "content": m["content"]} for m in messages],
            },
        )
        if response.status_code >= 400:
            return None, None
        body = response.json()
        usage_raw = body.get("usage") or {}
        usage = _normalize_usage(usage_raw.get("input_tokens"), usage_raw.get("output_tokens"))
        texts = [
            block.get("text", "")
            for block in body.get("content") or []
            if block.get("type") == "text"
        ]
        return ("\n".join(texts) if texts else None), usage


async def call_graph_llm(
    config: LlmConfig,
    context_block: str,
    messages: list[dict[str, str]],
) -> tuple[dict[str, Any] | None, dict[str, int] | None]:
    system_prompt = (
        f"{SYSTEM_PROMPT}\n\n---\nContext for this session:\n{context_block}"
        if context_block
        else SYSTEM_PROMPT
    )
    temperature = 0.4
    max_tokens = 4096

    provider = config["provider"]
    if provider == "openai":
        text, usage = await _openai_complete(config, system_prompt, messages, temperature, max_tokens)
    elif provider == "claude":
        text, usage = await _claude_complete(config, system_prompt, messages, temperature, max_tokens)
    else:
        text, usage = await _gemini_complete(config, system_prompt, messages, temperature, max_tokens)

    if not text:
        return None, usage

    cleaned = text.strip()
    cleaned = re.sub(r"^```(?:json)?\s*", "", cleaned, flags=re.I)
    cleaned = re.sub(r"\s*```$", "", cleaned)
    try:
        parsed = json.loads(cleaned)
    except json.JSONDecodeError:
        return None, usage

    return (
        {
            "assistant_message": str(parsed.get("assistant_message") or "Updated."),
            "nodes": _normalize_raw_nodes(parsed.get("nodes")),
            "edges": _normalize_raw_edges(parsed.get("edges")),
            "weight_updates": _normalize_raw_weight_updates(parsed.get("weight_updates")),
        },
        usage,
    )
