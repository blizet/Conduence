"""Tool building block.

A Tool is a small, stateless capability a user can plug into any
sub-agent (or that the orchestrator can use directly). Every tool:

- has a unique `name`
- exposes `call(**kwargs) -> dict` as its single entrypoint
- supports `simulate=True` so the whole system can run offline

Drag-and-drop mapping: each Tool class = one draggable "Tool" block
that snaps onto a SubAgent block.
"""

from __future__ import annotations

import json
import sys
import urllib.parse
import urllib.request
from abc import ABC, abstractmethod


def http_get_json(url: str, params: dict | None = None, headers: dict | None = None, timeout: float = 15) -> dict | list:
    """Shared stdlib-only HTTP helper for all tools."""
    if params:
        qs = urllib.parse.urlencode({k: v for k, v in params.items() if v is not None})
        url = f"{url}?{qs}"
    req = urllib.request.Request(url, headers={"Accept": "application/json", **(headers or {})})
    with urllib.request.urlopen(req, timeout=timeout) as res:
        return json.loads(res.read().decode())


class Tool(ABC):
    name: str = "tool"
    description: str = ""

    def __init__(self, simulate: bool = False):
        self.simulate = simulate

    @abstractmethod
    def call(self, **kwargs) -> dict:
        ...

    def _warn(self, msg: str) -> None:
        print(f"[tool:{self.name}] {msg}", file=sys.stderr)


class ToolRegistry:
    """Holds tool instances; sub-agents look tools up by name."""

    def __init__(self, tools: list[Tool] | None = None):
        self._tools: dict[str, Tool] = {}
        for t in tools or []:
            self.register(t)

    def register(self, tool: Tool) -> None:
        self._tools[tool.name] = tool

    def get(self, name: str) -> Tool:
        if name not in self._tools:
            raise KeyError(f"tool '{name}' not registered (have: {list(self._tools)})")
        return self._tools[name]

    def names(self) -> list[str]:
        return list(self._tools)
