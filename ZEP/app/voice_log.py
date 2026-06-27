"""Shared in-process store for voice conversation transcripts.

voice_agent.py writes turns here; server.py reads them via /api/voice/transcript.
This is a simple module-level list — safe for single-process uvicorn runs.
"""
from __future__ import annotations

from typing import Any

_turns: list[dict[str, Any]] = []


def append_turn(role: str, text: str) -> None:
    """Append one completed turn (role: 'user' | 'assistant')."""
    if text and text.strip():
        _turns.append({"role": role, "text": text.strip()})


def get_turns() -> list[dict[str, Any]]:
    return list(_turns)


def clear() -> None:
    _turns.clear()
