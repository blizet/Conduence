"""SubAgent building block.

A SubAgent is a polling worker that:

- gets a set of Tools plugged in (the drag-and-drop "Tool" blocks)
- runs its own loop on a thread
- pushes signal dicts to the orchestrator via a callback

Signal contract (what every sub-agent emits):
{
  "type": "whale" | "divergence" | ...,
  "agent": str,
  "keywords": [str],
  "direction": "bullish" | "bearish" | "neutral",
  "strength": float,        # 0..1 how loud this signal is
  "summary": str,
  "data": dict,             # raw payload for evidence trail
  "ts": iso8601
}
"""

from __future__ import annotations

import sys
import threading
import time
from abc import ABC, abstractmethod
from datetime import datetime, timezone
from typing import Callable

from tools.base import ToolRegistry

EmitFn = Callable[[dict], None]


class SubAgent(ABC):
    name: str = "subagent"
    signal_type: str = "generic"

    def __init__(self, tools: ToolRegistry, emit: EmitFn, poll_interval_s: float = 30.0):
        self.tools = tools
        self.emit = emit
        self.poll_interval_s = poll_interval_s
        self._stop = threading.Event()
        self._thread: threading.Thread | None = None

    @abstractmethod
    def poll(self) -> list[dict]:
        """One poll cycle; return zero or more signals."""

    def signal(self, keywords: list[str], direction: str, strength: float, summary: str, data: dict) -> dict:
        return {
            "type": self.signal_type,
            "agent": self.name,
            "keywords": keywords,
            "direction": direction,
            "strength": round(max(0.0, min(1.0, strength)), 3),
            "summary": summary,
            "data": data,
            "ts": datetime.now(timezone.utc).isoformat(),
        }

    # ------------------------------------------------------------------
    def start(self) -> None:
        self._thread = threading.Thread(target=self._loop, name=self.name, daemon=True)
        self._thread.start()

    def stop(self) -> None:
        self._stop.set()

    def _loop(self) -> None:
        print(f"[{self.name}] started (poll every {self.poll_interval_s}s, tools={self.tools.names()})", file=sys.stderr)
        while not self._stop.is_set():
            try:
                for sig in self.poll():
                    self.emit(sig)
            except Exception as err:
                print(f"[{self.name}] poll failed: {err}", file=sys.stderr)
            self._stop.wait(self.poll_interval_s)
