"""Divergence Agent — correlation-health sub-agent.

Plugs in two tools (coingecko_price + divergence) and continuously
checks whether asset pairs are moving the way the correlation graph
says they should. Emits a `divergence` signal when they are not —
e.g. Zcash ripping while Bitcoin is flat despite a positive edge.

The orchestrator uses these signals two ways:
- as direct trade candidates (idiosyncratic momentum / mean-reversion)
- as a CAUTION flag: graph inference through a diverging node is
  temporarily unreliable, so confidence gets cut, not boosted.
"""

from __future__ import annotations

from graph.graph import CorrelationGraph
from subAgents.base import EmitFn, SubAgent
from tools.base import ToolRegistry


class DivergenceAgent(SubAgent):
    name = "divergenceAgent"
    signal_type = "divergence"

    def __init__(
        self,
        tools: ToolRegistry,
        emit: EmitFn,
        graph: CorrelationGraph,
        poll_interval_s: float = 60.0,
    ):
        super().__init__(tools, emit, poll_interval_s)
        self.graph = graph
        # asset-asset edges with a coingecko id on both ends
        self.pairs = [
            (e.source, e.target, e.weight)
            for e in graph.edges
            if graph.nodes.get(e.source) is not None
            and graph.nodes.get(e.target) is not None
            and graph.nodes[e.source].coingecko_id
            and graph.nodes[e.target].coingecko_id
        ]

    def poll(self) -> list[dict]:
        if not self.pairs:
            return []
        price_tool = self.tools.get("coingecko_price")
        div_tool = self.tools.get("divergence")

        ids = sorted({self.graph.nodes[n].coingecko_id for pair in self.pairs for n in pair[:2]})
        prices = price_tool.call(ids=ids)
        if not prices:
            return []

        signals = []
        for base_id, other_id, weight in self.pairs:
            base_cg = self.graph.nodes[base_id].coingecko_id
            other_cg = self.graph.nodes[other_id].coingecko_id
            if base_cg not in prices or other_cg not in prices:
                continue

            base_chg = prices[base_cg].get("usd_24h_change", 0.0) or 0.0
            other_chg = prices[other_cg].get("usd_24h_change", 0.0) or 0.0
            verdict = div_tool.call(
                base_change=base_chg,
                other_change=other_chg,
                expected_corr=weight,
                base_id=base_id,
                other_id=other_id,
            )
            if not verdict["diverging"]:
                continue

            direction = "bullish" if verdict["gap_pp"] > 0 else "bearish"
            strength = min(1.0, abs(verdict["gap_pp"]) / 10.0)
            signals.append(
                self.signal(
                    keywords=[other_id, base_id],
                    direction=direction,
                    strength=strength,
                    summary=verdict["note"],
                    data={"pair": [base_id, other_id], "verdict": verdict, "prices": {
                        base_cg: prices[base_cg], other_cg: prices[other_cg],
                    }},
                )
            )
        return signals
