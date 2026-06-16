"""Multi-provider LLM client — OpenAI, Gemini, Claude."""

from __future__ import annotations

import json
import re
from typing import Any, TypedDict

import httpx

from app.config import TOOL_FETCH_TIMEOUT_MS

DEFAULT_MODELS = {
    "gemini": "gemini-2.0-flash",
    "openai": "gpt-4o-mini",
    "claude": "claude-3-5-haiku-latest",
}


class LlmCallMeta(TypedDict):
    provider: str
    model: str
    usage: dict[str, int]


def _normalize_provider(raw: str | None) -> str:
    p = (raw or "gemini").strip().lower()
    if p in DEFAULT_MODELS:
        return p
    return "gemini"


def _normalize_usage(
    input_tokens: int | None,
    output_tokens: int | None,
    total_tokens: int | None = None,
) -> dict[str, int]:
    inp = max(0, int(input_tokens or 0))
    out = max(0, int(output_tokens or 0))
    total = max(0, int(total_tokens or 0)) if total_tokens is not None else inp + out
    return {"inputTokens": inp, "outputTokens": out, "totalTokens": total}


async def _gemini_complete(
    *,
    api_key: str,
    model: str,
    system_prompt: str,
    user_prompt: str,
    temperature: float,
    max_tokens: int,
) -> tuple[str | None, dict[str, int] | None]:
    url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"
    payload = {
        "systemInstruction": {"parts": [{"text": system_prompt}]},
        "contents": [{"role": "user", "parts": [{"text": user_prompt}]}],
        "generationConfig": {
            "temperature": temperature,
            "maxOutputTokens": max_tokens,
            "responseMimeType": "application/json",
        },
    }
    timeout = TOOL_FETCH_TIMEOUT_MS / 1000
    async with httpx.AsyncClient(timeout=timeout) as client:
        response = await client.post(url, params={"key": api_key}, json=payload)
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
        text = parts[0].get("text", "") if parts else None
        return text, usage


async def _openai_complete(
    *,
    api_key: str,
    model: str,
    system_prompt: str,
    user_prompt: str,
    temperature: float,
    max_tokens: int,
) -> tuple[str | None, dict[str, int] | None]:
    url = "https://api.openai.com/v1/chat/completions"
    payload = {
        "model": model,
        "temperature": temperature,
        "max_tokens": max_tokens,
        "response_format": {"type": "json_object"},
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ],
    }
    timeout = TOOL_FETCH_TIMEOUT_MS / 1000
    async with httpx.AsyncClient(timeout=timeout) as client:
        response = await client.post(
            url,
            headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
            json=payload,
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
        if not choices:
            return None, usage
        return choices[0].get("message", {}).get("content"), usage


async def _claude_complete(
    *,
    api_key: str,
    model: str,
    system_prompt: str,
    user_prompt: str,
    temperature: float,
    max_tokens: int,
) -> tuple[str | None, dict[str, int] | None]:
    url = "https://api.anthropic.com/v1/messages"
    payload = {
        "model": model,
        "max_tokens": max_tokens,
        "temperature": temperature,
        "system": system_prompt,
        "messages": [{"role": "user", "content": user_prompt}],
    }
    timeout = TOOL_FETCH_TIMEOUT_MS / 1000
    async with httpx.AsyncClient(timeout=timeout) as client:
        response = await client.post(
            url,
            headers={
                "x-api-key": api_key,
                "anthropic-version": "2023-06-01",
                "Content-Type": "application/json",
            },
            json=payload,
        )
        if response.status_code >= 400:
            return None, None
        body = response.json()
        usage_raw = body.get("usage") or {}
        usage = _normalize_usage(usage_raw.get("input_tokens"), usage_raw.get("output_tokens"))
        content = body.get("content") or []
        texts = [block.get("text", "") for block in content if block.get("type") == "text"]
        return ("\n".join(texts) if texts else None), usage


def _parse_json_text(text: str | None) -> dict[str, Any] | None:
    if not text:
        return None
    text = text.strip()
    if text.startswith("```"):
        text = re.sub(r"^```(?:json)?\s*", "", text)
        text = re.sub(r"\s*```$", "", text)
    try:
        parsed = json.loads(text)
        return parsed if isinstance(parsed, dict) else None
    except json.JSONDecodeError:
        return None


async def complete_json_with_usage(
    config: dict[str, Any],
    system_prompt: str,
    user_prompt: str,
) -> tuple[dict[str, Any] | None, LlmCallMeta | None]:
    api_key = (config.get("apiKey") or config.get("llmApiKey") or "").strip()
    if not api_key:
        return None, None

    provider = _normalize_provider(config.get("llmProvider") or config.get("provider"))
    model = (config.get("model") or DEFAULT_MODELS[provider]).strip()
    temperature = float(config.get("temperature") or 0.7)
    max_tokens = int(config.get("maxTokens") or 2048)

    text: str | None = None
    usage: dict[str, int] | None = None
    if provider == "openai":
        text, usage = await _openai_complete(
            api_key=api_key,
            model=model,
            system_prompt=system_prompt,
            user_prompt=user_prompt,
            temperature=temperature,
            max_tokens=max_tokens,
        )
    elif provider == "claude":
        text, usage = await _claude_complete(
            api_key=api_key,
            model=model,
            system_prompt=system_prompt,
            user_prompt=user_prompt,
            temperature=temperature,
            max_tokens=max_tokens,
        )
    else:
        text, usage = await _gemini_complete(
            api_key=api_key,
            model=model,
            system_prompt=system_prompt,
            user_prompt=user_prompt,
            temperature=temperature,
            max_tokens=max_tokens,
        )

    parsed = _parse_json_text(text)
    if not usage:
        return parsed, None
    return parsed, {"provider": provider, "model": model, "usage": usage}


async def complete_json(config: dict[str, Any], system_prompt: str, user_prompt: str) -> dict[str, Any] | None:
    parsed, _meta = await complete_json_with_usage(config, system_prompt, user_prompt)
    return parsed
