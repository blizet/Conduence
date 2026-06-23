"""
Centralized settings loading for the app.

Everyone running this locally should point ZEP_API_KEY at the same Zep
project so that the graph being built is shared across all of you,
regardless of who is running the chat at any given moment.

LLM_PROVIDER picks which model powers the chat agent's replies. Set
LLM_API_KEY to the API key for that provider. Legacy per-provider env
names (ANTHROPIC_API_KEY, OPENAI_API_KEY, GEMINI_API_KEY) are still read
as fallbacks for the active provider only.
"""
from __future__ import annotations

import os
import sys
from dataclasses import dataclass
from pathlib import Path

from dotenv import load_dotenv

_APP_DIR = Path(__file__).resolve().parent
_PROJECT_DIR = _APP_DIR.parent

load_dotenv(_PROJECT_DIR / ".env")
load_dotenv(_APP_DIR / ".env")

SUPPORTED_PROVIDERS = ("anthropic", "openai", "gemini")

DEFAULT_MODELS = {
    "anthropic": "claude-sonnet-4-6",
    "openai": "gpt-4o",
    "gemini": "gemini-2.0-flash",
}

LEGACY_KEY_BY_PROVIDER = {
    "anthropic": "ANTHROPIC_API_KEY",
    "openai": "OPENAI_API_KEY",
    "gemini": "GEMINI_API_KEY",
}


@dataclass(frozen=True)
class Settings:
    zep_api_key: str
    llm_provider: str
    model: str
    llm_api_key: str


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


def _resolve_llm_api_key(llm_provider: str) -> tuple[str, str]:
    """Return (env_var_name_for_errors, key_value)."""
    llm_api_key = (
        os.environ.get("LLM_API_KEY", "").strip()
    )
    if llm_api_key:
        return ("LLM_API_KEY", llm_api_key)

    legacy_name = LEGACY_KEY_BY_PROVIDER[llm_provider]
    legacy_value = os.environ.get(legacy_name, "").strip()
    if legacy_value:
        return (legacy_name, legacy_value)

    return ("LLM_API_KEY", "")


def load_settings_status(provider_override: str | None = None) -> SettingsStatus:
    """Load settings without exiting; missing keys are returned in `missing_keys`."""
    zep_api_key = os.environ.get("ZEP_API_KEY", "").strip()
    llm_provider = _resolve_provider(provider_override)

    missing: list[str] = []
    if not zep_api_key:
        missing.append("ZEP_API_KEY")

    required_key_name, llm_api_key = _resolve_llm_api_key(llm_provider)
    if not llm_api_key:
        missing.append(required_key_name)

    model_env_name = f"{llm_provider.upper()}_MODEL"
    model = os.environ.get(model_env_name, "").strip() or DEFAULT_MODELS[llm_provider]

    settings = Settings(
        zep_api_key=zep_api_key,
        llm_provider=llm_provider,
        model=model,
        llm_api_key=llm_api_key,
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
