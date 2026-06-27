"""Shared mutable state between server.py and voice_agent.py.

Kept in a separate module so neither file needs to import the other
(which would create a circular import).
"""
from __future__ import annotations

from typing import Any

last_market_lookup: dict[str, Any] | None = None
