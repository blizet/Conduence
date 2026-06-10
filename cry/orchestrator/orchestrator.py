"""Orchestrator — wires mind agents, sub-agents, tools, and the graph.

Topology (mirrors the drag-and-drop canvas):

  mindAgent/cryptoNewsAgent  (standalone subprocess, NDJSON on stdout)
        │ news events
        ▼
  ┌─────────────────────────────┐
  │        Orchestrator         │◄── whaleAgent      (thread, polls Polymarket wallets)
  │  graph + decision engine    │◄── divergenceAgent (thread, polls CoinGecko vs graph)
  └─────────────────────────────┘
        │ trade suggestions
        ▼
  stdout + cry/out/suggestions.jsonl

Both diagram flows are the same code path here:
  Flow-1: whale emits trade  -> keywords -> graph -> markets+news context -> decide
  Flow-2: news emits article -> keywords -> graph -> markets+whale context -> decide
The "context from the other agent" is the decision engine's rolling
signal memory (corroboration), so whichever agent fires FIRST creates
the context the second one confirms against.
"""

from __future__ import annotations

import json
import queue
import subprocess
import sys
import threading
import time
from pathlib import Path

from graph.graph import CorrelationGraph
from orchestrator.decision import DecisionEngine
from subAgents.divergence_agent import DivergenceAgent
from subAgents.whale_agent import WhaleAgent
from tools import default_registry

CRY_ROOT = Path(__file__).resolve().parent.parent
MIND_AGENT_DIR = CRY_ROOT / "mindAgent"
OUT_FILE = CRY_ROOT / "out" / "suggestions.jsonl"
DEFAULT_MIND_AGENTS = ["cryptoNewsAgent", "arbitrageAgent"]


class Orchestrator:
    def __init__(self, config: dict, simulate: bool = False):
        self.config = config
        self.simulate = simulate
        self.bus: queue.Queue[dict] = queue.Queue()
        self.graph = CorrelationGraph(config.get("graph_path", CRY_ROOT / "graph" / "correlation_graph.json"))
        self.tools = default_registry(simulate=simulate)
        self.engine = DecisionEngine(
            self.graph,
            self.tools,
            min_confidence=float(config.get("min_confidence", 0.55)),
            portfolio_usd=float(config.get("portfolio_usd", 10_000)),
        )
        self.sub_agents = self._build_sub_agents()
        self._mind_procs: list[subprocess.Popen] = []
        self.suggestions: list[dict] = []

    # ------------------------------------------------------------------
    def _build_sub_agents(self):
        agents = []
        wallets = self.config.get("whale_wallets", [])
        if wallets:
            agents.append(
                WhaleAgent(
                    self.tools,
                    self.bus.put,
                    wallets=wallets,
                    poll_interval_s=float(self.config.get("whale_poll_s", 30)),
                )
            )
        agents.append(
            DivergenceAgent(
                self.tools,
                self.bus.put,
                graph=self.graph,
                poll_interval_s=float(self.config.get("divergence_poll_s", 60)),
            )
        )
        return agents

    def _spawn_mind_agents(self) -> None:
        intervals = {
            "cryptoNewsAgent": self.config.get("news_poll_s", 20 if self.simulate else 60),
            "arbitrageAgent": self.config.get("arbitrage_poll_s", 15),
        }
        for name in self.config.get("mind_agents", DEFAULT_MIND_AGENTS):
            script = MIND_AGENT_DIR / name / "agent.py"
            if not script.exists():
                print(f"[orchestrator] mind agent '{name}' not found, skipping", file=sys.stderr)
                continue
            cmd = [sys.executable, "-u", str(script)]
            if self.simulate:
                cmd.append("--simulate")
            cmd += ["--interval", str(intervals.get(name, 60))]
            proc = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, text=True)
            self._mind_procs.append(proc)
            threading.Thread(
                target=self._read_mind_agent, args=(proc,), name=f"{name}-reader", daemon=True
            ).start()

    def _read_mind_agent(self, proc: subprocess.Popen) -> None:
        assert proc.stdout
        for line in proc.stdout:
            line = line.strip()
            if not line:
                continue
            try:
                event = json.loads(line)
            except json.JSONDecodeError:
                continue
            # normalize into the common signal shape
            event.setdefault("direction", event.get("sentiment", "neutral"))
            event.setdefault("strength", 0.7)
            if not event.get("summary"):
                event["summary"] = event.get("headline", "")
            self.bus.put(event)

    # ------------------------------------------------------------------
    def _publish(self, suggestion: dict) -> None:
        self.suggestions.append(suggestion)
        OUT_FILE.parent.mkdir(parents=True, exist_ok=True)
        with OUT_FILE.open("a") as f:
            f.write(json.dumps(suggestion) + "\n")

        print("\n" + "=" * 72)
        print(f"TRADE SUGGESTION  confidence={suggestion['confidence']:.0%}")
        print(f"  market : {suggestion['market']}")
        print(f"  side   : {suggestion['side']}" + (f"  @ {suggestion['entry_price']:.2f}" if suggestion.get("entry_price") is not None else ""))
        if suggestion.get("suggested_size_usd"):
            quality_txt = f"   market quality: {suggestion['market_quality']:.2f}" if suggestion.get("market_quality") is not None else ""
            print(f"  size   : ${suggestion['suggested_size_usd']:,.0f}{quality_txt}")
        if suggestion.get("hedge"):
            h = suggestion["hedge"]
            print(f"  hedge  : {h['side']} \"{h['market'][:60]}\" ${h['size_usd']:,.0f}")
        print(f"  asset  : {suggestion['asset']}   path: {' -> '.join(suggestion['graph_path'])}")
        print(f"  thesis : {suggestion['thesis']}")
        for ev in suggestion["evidence"]:
            print(f"    - {ev}")
        print("=" * 72)

    def run(self, duration_s: float | None = None, max_suggestions: int | None = None) -> list[dict]:
        print(f"[orchestrator] graph: {len(self.graph.nodes)} nodes / {len(self.graph.edges)} edges", file=sys.stderr)
        print(f"[orchestrator] mode: {'SIMULATE' if self.simulate else 'LIVE'}", file=sys.stderr)

        self._spawn_mind_agents()
        for agent in self.sub_agents:
            agent.start()

        started = time.time()
        try:
            while True:
                if duration_s and time.time() - started > duration_s:
                    break
                if max_suggestions and len(self.suggestions) >= max_suggestions:
                    break
                try:
                    signal = self.bus.get(timeout=1.0)
                except queue.Empty:
                    continue

                label = signal.get("agent", signal.get("type", "?"))
                print(f"[orchestrator] signal from {label}: {signal.get('summary', '')[:110]}", file=sys.stderr)

                if signal.get("type") == "arbitrage":
                    # market-neutral and self-verifying: publish directly,
                    # no graph corroboration needed (speed > deliberation)
                    self._publish(self._arbitrage_to_suggestion(signal))
                    continue

                for suggestion in self.engine.decide(signal):
                    self._publish(suggestion.to_dict())
        except KeyboardInterrupt:
            pass
        finally:
            self.shutdown()
        return self.suggestions

    def _arbitrage_to_suggestion(self, signal: dict) -> dict:
        opp = signal.get("opportunity", {})
        legs = signal.get("legs", {})
        return {
            "type": "trade_suggestion",
            "kind": "arbitrage",
            "market": legs.get("polymarket", {}).get("title", ""),
            "slug": legs.get("polymarket", {}).get("url", ""),
            "side": opp.get("direction", ""),
            "entry_price": opp.get("poly_ask"),
            "confidence": opp.get("match_confidence", 0.0),
            "asset": "market-neutral",
            "thesis": signal.get("summary", ""),
            "graph_path": [],
            "evidence": [
                f"polymarket leg: {legs.get('polymarket', {}).get('title', '')} ({legs.get('polymarket', {}).get('url', '')})",
                f"kalshi leg: {legs.get('kalshi', {}).get('title', '')} ({legs.get('kalshi', {}).get('url', '')})",
                f"net edge {opp.get('net_edge', 0) * 100:.1f}c/contract after fees "
                f"(gross {opp.get('gross_edge', 0) * 100:.1f}c, fees {opp.get('fees', 0) * 100:.1f}c), "
                f"max size ${opp.get('max_size_usd', 0):,.0f}",
            ] + [f"caveat: {c}" for c in signal.get("caveats", [])],
            "ts": time.time(),
        }

    def shutdown(self) -> None:
        for agent in self.sub_agents:
            agent.stop()
        for proc in self._mind_procs:
            proc.terminate()
        print(f"[orchestrator] stopped — {len(self.suggestions)} suggestion(s), log: {OUT_FILE}", file=sys.stderr)
