"""Skills registry — canvas-wired callable capabilities per workflow run."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from app.orchestrator.tools_registry import TOOL_CATEGORIES

SKILL_ALIASES: dict[str, str] = {
    "coingecko": "price_feed",
    "coinmarketcap": "price_feed",
    "polymarketGamma": "market_search",
    "polymarketWallet": "wallet_intel",
    "cryptonews": "news_research",
    "tavily": "web_research",
    "cryptoquant": "onchain_metrics",
    "defillama": "defi_tvl",
    "clob": "orderbook_execute",
    "kalshi": "kalshi_execute",
    "cotBuilder": "cot_emit",
    "newsAgent": "news_feed",
    "arbitrageAgent": "arb_scan",
}


@dataclass
class SkillSpec:
    id: str
    skill: str
    category: str
    source: str
    label: str

    def to_dict(self) -> dict[str, str]:
        return {
            "id": self.id,
            "skill": self.skill,
            "category": self.category,
            "source": self.source,
            "label": self.label,
        }


def _label_for(node_type: str) -> str:
    return node_type.replace("Agent", " agent").replace("Wallet", " wallet")


def build_skills_registry(compiled: dict[str, Any]) -> dict[str, Any]:
    """Derive per-run skills from compiled canvas wiring (multi-client safe)."""
    specs: list[SkillSpec] = []
    seen: set[str] = set()

    for tool_id in compiled.get("connected_tools") or []:
        skill = SKILL_ALIASES.get(tool_id, tool_id)
        if skill in seen:
            continue
        seen.add(skill)
        specs.append(
            SkillSpec(
                id=tool_id,
                skill=skill,
                category=TOOL_CATEGORIES.get(tool_id, "tool"),
                source="canvas_tool",
                label=_label_for(tool_id),
            )
        )

    for sub_id in compiled.get("connected_subagents") or []:
        skill = SKILL_ALIASES.get(sub_id, sub_id)
        if skill in seen:
            continue
        seen.add(skill)
        specs.append(
            SkillSpec(
                id=sub_id,
                skill=skill,
                category="subagent",
                source="canvas_subagent",
                label=_label_for(sub_id),
            )
        )

    for feed in compiled.get("feed_sources") or []:
        if feed in compiled.get("connected_subagents") or []:
            continue
        skill = SKILL_ALIASES.get(feed, feed)
        if skill in seen:
            continue
        seen.add(skill)
        specs.append(
            SkillSpec(
                id=feed,
                skill=skill,
                category="mindagent" if feed.endswith("Agent") else "feed",
                source="canvas_feed",
                label=_label_for(feed),
            )
        )

    skill_ids = [s.skill for s in specs]
    return {
        "skills": skill_ids,
        "specs": [s.to_dict() for s in specs],
        "client_id": compiled.get("client_id"),
        "workflow_id": compiled.get("workflow_id"),
    }
