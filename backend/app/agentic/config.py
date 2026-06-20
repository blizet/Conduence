"""Agentic graph environment and LLM provider configuration."""

from __future__ import annotations

import os
from typing import Any, Literal, TypedDict

LlmProvider = Literal["gemini", "openai", "claude"]

LLM_PROVIDERS: list[dict[str, str]] = [
    {
        "id": "gemini",
        "label": "Google Gemini",
        "defaultModel": "gemini-2.0-flash",
        "keyPlaceholder": "AIza…",
    },
    {
        "id": "openai",
        "label": "OpenAI",
        "defaultModel": "gpt-4o-mini",
        "keyPlaceholder": "sk-…",
    },
    {
        "id": "claude",
        "label": "Anthropic Claude",
        "defaultModel": "claude-3-5-haiku-latest",
        "keyPlaceholder": "sk-ant-…",
    },
]

_PROVIDER_DEFAULTS: dict[LlmProvider, str] = {
    "gemini": "gemini-2.0-flash",
    "openai": "gpt-4o-mini",
    "claude": "claude-3-5-haiku-latest",
}


class LlmConfig(TypedDict):
    provider: LlmProvider
    apiKey: str
    model: str


def normalize_provider(raw: str | None) -> LlmProvider:
    p = (raw or "gemini").strip().lower()
    if p in _PROVIDER_DEFAULTS:
        return p  # type: ignore[return-value]
    return "gemini"


def default_model_for(provider: LlmProvider) -> str:
    return _PROVIDER_DEFAULTS.get(provider, "gemini-2.0-flash")


def env_llm_defaults() -> dict[str, str]:
    return {
        "provider": os.getenv("AGENTIC_LLM_PROVIDER", "gemini"),
        "apiKey": os.getenv("AGENTIC_LLM_API_KEY", ""),
        "model": os.getenv("AGENTIC_LLM_MODEL", "gemini-2.0-flash"),
    }


def resolve_llm_config(
    input_settings: dict[str, Any] | None,
    env: dict[str, str] | None = None,
) -> LlmConfig | None:
    env = env or env_llm_defaults()
    request_key = (input_settings or {}).get("apiKey", "")
    if isinstance(request_key, str):
        request_key = request_key.strip()
    else:
        request_key = ""

    env_key = (env.get("apiKey") or "").strip()
    api_key = request_key or env_key
    if not api_key:
        return None

    provider = normalize_provider(
        (input_settings or {}).get("provider") or env.get("provider"),
    )
    model = (
        (input_settings or {}).get("model") or env.get("model") or default_model_for(provider)
    )
    if isinstance(model, str):
        model = model.strip()
    else:
        model = default_model_for(provider)

    return {"provider": provider, "apiKey": api_key, "model": model}


def resolve_container_tag(user_slug: str | None) -> str:
    """Per-user agentic graph namespace."""
    slug = (user_slug or "").strip()
    if not slug:
        from app.agentic.shared_graph import shared_graph_container_tag

        return shared_graph_container_tag()
    from app.agentic.shared_graph import user_agentic_container_tag

    return user_agentic_container_tag(slug)
