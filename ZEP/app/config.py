"""
Centralized settings loading for the app.

Everyone running this locally should point ZEP_API_KEY at the same Zep
project so that the graph being built is shared across all of you,
regardless of who is running the chat at any given moment.

LLM_PROVIDER picks which model powers the chat agent's replies. This is
independent of Zep -- Zep's own extraction pipeline is unaffected by this
choice, it only changes who generates the assistant's chat text.
"""
from __future__ import annotations

import os
import sys
from dataclasses import dataclass

from dotenv import load_dotenv

load_dotenv()

SUPPORTED_PROVIDERS = ("anthropic", "openai", "gemini")

DEFAULT_MODELS = {
    "anthropic": "claude-sonnet-4-6",
    "openai": "gpt-4o",
    "gemini": "gemini-2.0-flash",
}


@dataclass(frozen=True)
class Settings:
    zep_api_key: str
    llm_provider: str
    model: str
    anthropic_api_key: str
    openai_api_key: str
    gemini_api_key: str


@dataclass(frozen=True)
class SettingsStatus:
    settings: Settings
    missing_keys: tuple[str, ...]

    @property
    def ready(self) -> bool:
        return not self.missing_keys


def _resolve_provider(provider_override: str | None) -> str:
    llm_provider = (provider_override or os.environ.get("LLM_PROVIDER", "anthropic")).strip().lower()
    if llm_provider not in SUPPORTED_PROVIDERS:
        sys.exit(
            f"Invalid LLM_PROVIDER '{llm_provider}'. Must be one of: {', '.join(SUPPORTED_PROVIDERS)}"
        )
    return llm_provider


def load_settings_status(provider_override: str | None = None) -> SettingsStatus:
    """Load settings without exiting; missing keys are returned in `missing_keys`."""
    zep_api_key = os.environ.get("ZEP_API_KEY", "").strip()
    llm_provider = _resolve_provider(provider_override)

    anthropic_api_key = os.environ.get("ANTHROPIC_API_KEY", "").strip()
    openai_api_key = os.environ.get("OPENAI_API_KEY", "").strip()
    gemini_api_key = os.environ.get("GEMINI_API_KEY", "").strip()

    missing: list[str] = []
    if not zep_api_key:
        missing.append("ZEP_API_KEY")

    key_by_provider = {
        "anthropic": ("ANTHROPIC_API_KEY", anthropic_api_key),
        "openai": ("OPENAI_API_KEY", openai_api_key),
        "gemini": ("GEMINI_API_KEY", gemini_api_key),
    }
    required_key_name, required_key_value = key_by_provider[llm_provider]
    if not required_key_value:
        missing.append(required_key_name)

    model_env_name = f"{llm_provider.upper()}_MODEL"
    model = os.environ.get(model_env_name, "").strip() or DEFAULT_MODELS[llm_provider]

    settings = Settings(
        zep_api_key=zep_api_key,
        llm_provider=llm_provider,
        model=model,
        anthropic_api_key=anthropic_api_key,
        openai_api_key=openai_api_key,
        gemini_api_key=gemini_api_key,
    )
    return SettingsStatus(settings=settings, missing_keys=tuple(missing))


def load_settings(provider_override: str | None = None) -> Settings:
    status = load_settings_status(provider_override)
    if status.missing_keys:
        sys.exit(
            "Missing required environment variable(s): "
            + ", ".join(status.missing_keys)
            + "\nCopy .env.example to .env and fill them in."
        )
    return status.settings
