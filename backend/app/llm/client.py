"""Multi-provider LLM client — OpenAI, Gemini, Claude."""

from __future__ import annotations

import json
from typing import Any

import httpx

from app.config import TOOL_FETCH_TIMEOUT_MS

DEFAULT_MODELS = {
    "gemini": "gemini-2.0-flash",
    "openai": "gpt-4o-mini",
    "claude": "claude-3-5-haiku-latest",
}


def _normalize_provider(raw: str | None) -> str:
    p = (raw or "gemini").strip().lower()
    if p in DEFAULT_MODELS:
        return p
    return "gemini"


async def _gemini_complete(
    *,
    api_key: str,
    model: str,
    system_prompt: str,
    user_prompt: str,
    temperature: float,
    max_tokens: int,
) -> str | None:
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
            return None
        body = response.json()
        parts = body.get("candidates", [{}])[0].get("content", {}).get("parts", [])
        return parts[0].get("text", "") if parts else None


async def _openai_complete(
    *,
    api_key: str,
    model: str,
    system_prompt: str,
    user_prompt: str,
    temperature: float,
    max_tokens: int,
) -> str | None:
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
            return None
        body = response.json()
        choices = body.get("choices") or []
        if not choices:
            return None
        return choices[0].get("message", {}).get("content")


async def _claude_complete(
    *,
    api_key: str,
    model: str,
    system_prompt: str,
    user_prompt: str,
    temperature: float,
    max_tokens: int,
) -> str | None:
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
            return None
        body = response.json()
        content = body.get("content") or []
        texts = [block.get("text", "") for block in content if block.get("type") == "text"]
        return "\n".join(texts) if texts else None


async def complete_json(config: dict[str, Any], system_prompt: str, user_prompt: str) -> dict[str, Any] | None:
    api_key = (config.get("apiKey") or config.get("llmApiKey") or "").strip()
    if not api_key:
        return None

    provider = _normalize_provider(config.get("llmProvider") or config.get("provider"))
    model = (config.get("model") or DEFAULT_MODELS[provider]).strip()
    temperature = float(config.get("temperature") or 0.7)
    max_tokens = int(config.get("maxTokens") or 2048)

    text: str | None = None
    if provider == "openai":
        text = await _openai_complete(
            api_key=api_key,
            model=model,
            system_prompt=system_prompt,
            user_prompt=user_prompt,
            temperature=temperature,
            max_tokens=max_tokens,
        )
    elif provider == "claude":
        text = await _claude_complete(
            api_key=api_key,
            model=model,
            system_prompt=system_prompt,
            user_prompt=user_prompt,
            temperature=temperature,
            max_tokens=max_tokens,
        )
    else:
        text = await _gemini_complete(
            api_key=api_key,
            model=model,
            system_prompt=system_prompt,
            user_prompt=user_prompt,
            temperature=temperature,
            max_tokens=max_tokens,
        )

    if not text:
        return None

    text = text.strip()
    if text.startswith("```"):
        import re

        text = re.sub(r"^```(?:json)?\s*", "", text)
        text = re.sub(r"\s*```$", "", text)
    try:
        parsed = json.loads(text)
        return parsed if isinstance(parsed, dict) else None
    except json.JSONDecodeError:
        return None
