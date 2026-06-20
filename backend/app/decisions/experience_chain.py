"""Build Signal → Belief → Trade → Outcome decision events for CoT graph."""

from __future__ import annotations

import hashlib
import re
from datetime import datetime, timezone
from typing import Any


def _slug(text: str, *, prefix: str = "", max_len: int = 48) -> str:
    base = re.sub(r"[^a-z0-9]+", "_", text.lower()).strip("_")[:max_len] or "unknown"
    return f"{prefix}{base}" if prefix else base


def signal_node_id(trade_id: str) -> str:
    return f"SIG_{trade_id}"


def belief_node_id(trade_id: str) -> str:
    return f"BLF_{trade_id}"


def outcome_node_id(trade_id: str) -> str:
    return f"OUT_{trade_id}"


def _signal_summary(signal: dict[str, Any] | None) -> str:
    if not signal:
        return ""
    parts = [
        str(signal.get("headline") or "").strip(),
        str(signal.get("summary") or "").strip(),
        str(signal.get("thesis") or "").strip(),
    ]
    return next((p for p in parts if p), "Trading signal")


def _belief_label(thesis: str, conviction: float | int | None) -> str:
    conv = conviction if conviction is not None else "?"
    snippet = (thesis or "Position belief")[:80]
    return f"Belief ({conv}/10): {snippet}"


def infer_agentic_anchors(
    signal: dict[str, Any] | None,
    *,
    graph_impacts: list[dict[str, Any]] | None = None,
    tags: list[str] | None = None,
) -> list[str]:
    """Node ids from agentic graph impacts or signal keywords."""
    anchors: list[str] = []
    for impact in graph_impacts or []:
        node_id = str(impact.get("node_id") or "").strip()
        if node_id and node_id not in anchors:
            anchors.append(node_id)
    signal = signal or {}
    for kw in signal.get("keywords") or []:
        slug = _slug(str(kw), prefix="cat_")
        if slug not in anchors:
            anchors.append(slug)
    for tag in tags or []:
        clean = str(tag).lstrip("#").strip()
        if clean:
            slug = _slug(clean, prefix="cat_")
            if slug not in anchors:
                anchors.append(slug)
    return anchors[:12]


def build_outcome_properties(
    *,
    trade_id: str,
    status: str = "pending",
    pnl_usd: float | None = None,
    pnl_pct: float | None = None,
    resolution: str | None = None,
    entry_price: float | None = None,
    exit_price: float | None = None,
    origin: str = "live",
) -> dict[str, Any]:
    props: dict[str, Any] = {
        "trade_id": trade_id,
        "status": status,
        "origin": origin,
    }
    if pnl_usd is not None:
        props["pnl_usd"] = round(float(pnl_usd), 4)
    if pnl_pct is not None:
        props["pnl_pct"] = round(float(pnl_pct), 4)
    if resolution:
        props["resolution"] = resolution
    if entry_price is not None:
        props["entry_price"] = entry_price
    if exit_price is not None:
        props["exit_price"] = exit_price
    return props


def build_experience_decision(
    *,
    graph_id: str,
    user_node_id: str,
    trade_id: str,
    decision_id: str,
    market_id: str,
    protocol_id: str = "Polymarket",
    action: str,
    action_label: str,
    thesis: str,
    reasoning: str,
    conviction_level: int | float,
    tags: list[str] | None = None,
    signal: dict[str, Any] | None = None,
    trade_properties: dict[str, Any] | None = None,
    market_properties: dict[str, Any] | None = None,
    market_edge_metadata: dict[str, Any] | None = None,
    outcome: dict[str, Any] | None = None,
    agentic_anchors: list[str] | None = None,
    correlated_targets: list[str] | None = None,
    provenance: dict[str, Any] | None = None,
    updated_at: str | None = None,
    origin: str = "live",
) -> dict[str, Any]:
    """Return a DecisionEvent-shaped dict with full experience chain."""
    now = updated_at or datetime.now(timezone.utc).isoformat()
    signal = signal or {}
    tags = list(tags or [])
    market_properties = dict(market_properties or {})
    trade_properties = dict(trade_properties or {})
    market_meta = dict(market_edge_metadata or {})
    outcome = outcome or build_outcome_properties(trade_id=trade_id, status="pending", origin=origin)

    sig_id = signal_node_id(trade_id)
    blf_id = belief_node_id(trade_id)
    out_id = outcome_node_id(trade_id)

    signal_summary = _signal_summary(signal)
    signal_type = str(signal.get("type") or signal.get("event_type") or origin)
    signal_agent = str(signal.get("agent") or signal.get("agent_id") or "")

    nodes: list[dict[str, Any]] = [
        {"node_id": user_node_id, "node_type": "user"},
        {"node_id": protocol_id, "node_type": "protocol"},
        {
            "node_id": sig_id,
            "node_type": "signal",
            "properties": {
                "label": signal_summary[:120] or f"Signal for {trade_id}",
                "signal_type": signal_type,
                "agent": signal_agent,
                "headline": signal.get("headline"),
                "summary": signal.get("summary"),
                "keywords": signal.get("keywords") or [],
                "strength": signal.get("strength"),
                "direction": signal.get("direction") or signal.get("sentiment"),
                "origin": origin,
            },
        },
        {
            "node_id": blf_id,
            "node_type": "belief",
            "properties": {
                "label": _belief_label(thesis, conviction_level),
                "thesis": thesis,
                "conviction_level": conviction_level,
                "tags": tags,
                "agentic_anchors": agentic_anchors or [],
                "origin": origin,
            },
        },
        {
            "node_id": market_id,
            "node_type": "market",
            "properties": market_properties,
        },
        {
            "node_id": trade_id,
            "node_type": "trade",
            "properties": {
                **trade_properties,
                "decision_id": decision_id,
                "action": action,
                "origin": origin,
                "agentic_anchors": agentic_anchors or [],
            },
        },
        {
            "node_id": out_id,
            "node_type": "outcome",
            "properties": {
                "label": f"Outcome ({outcome.get('status', 'pending')})",
                **outcome,
            },
        },
    ]

    for kal_id in correlated_targets or []:
        if not any(n["node_id"] == kal_id for n in nodes):
            nodes.append({"node_id": kal_id, "node_type": "market"})

    edges: list[dict[str, Any]] = [
        {"source": user_node_id, "target": protocol_id},
        {"source": protocol_id, "target": market_id, "metadata": {"origin": origin}},
        {
            "source": sig_id,
            "target": blf_id,
            "relationship_type": "SUPPORTS",
            "metadata": {
                "evidence": signal.get("evidence") or [],
                "reasoning": reasoning,
                "decision_id": decision_id,
            },
        },
        {
            "source": blf_id,
            "target": trade_id,
            "relationship_type": "CAUSES",
            "metadata": {
                "thesis": thesis,
                "conviction_level": conviction_level,
                "decision_id": decision_id,
            },
        },
        {
            "source": market_id,
            "target": trade_id,
            "Action": action_label,
            "metadata": {
                **market_meta,
                "thesis": thesis,
                "conviction_level": conviction_level,
                "tags": tags,
                "reasoning": reasoning,
                "timestamp": now,
                "decision_id": decision_id,
            },
        },
        {
            "source": trade_id,
            "target": out_id,
            "relationship_type": "RESULTS_IN",
            "metadata": {"decision_id": decision_id, "origin": origin},
        },
    ]

    if correlated_targets:
        edges.append(
            {
                "source": market_id,
                "targets": correlated_targets,
                "direction": "bi-directional",
                "metadata": {"relationship_type": "correlated_market"},
            }
        )

    base_provenance = dict(provenance or {})
    if agentic_anchors:
        base_provenance.setdefault("agentic_anchors", agentic_anchors)
    base_provenance.setdefault("experience_chain", ["signal", "belief", "trade", "outcome"])

    return {
        "schema_version": "1.0",
        "operation": "assert",
        "graph_id": graph_id,
        "decision_id": decision_id,
        "updated_at": now,
        "nodes": nodes,
        "edges": edges,
        "provenance": base_provenance,
    }


def experience_episode_text(decision: dict[str, Any]) -> str:
    """Compact narrative for Supermemory retrieval."""
    nodes = {n["node_id"]: n for n in decision.get("nodes") or []}
    trade = next((n for n in decision.get("nodes") or [] if n.get("node_type") == "trade"), {})
    trade_id = trade.get("node_id", "")
    sig = nodes.get(signal_node_id(trade_id), {})
    blf = nodes.get(belief_node_id(trade_id), {})
    out = nodes.get(outcome_node_id(trade_id), {})
    sig_p = sig.get("properties") or {}
    blf_p = blf.get("properties") or {}
    out_p = out.get("properties") or {}
    prov = decision.get("provenance") or {}
    execution = prov.get("execution") or {}
    lines = [
        f"decision_experience decision_id={decision.get('decision_id')}",
        f"graph_id={decision.get('graph_id')}",
        f"signal: {sig_p.get('label') or sig_p.get('summary') or '—'}",
        f"belief: {blf_p.get('thesis') or '—'} (conviction {blf_p.get('conviction_level', '?')}/10)",
        f"action: {trade.get('properties', {}).get('action', '—')}",
        f"outcome: status={out_p.get('status', 'pending')}",
    ]
    if out_p.get("pnl_pct") is not None:
        lines.append(f"pnl_pct={out_p['pnl_pct']}")
    if out_p.get("pnl_usd") is not None:
        lines.append(f"pnl_usd={out_p['pnl_usd']}")
    anchors = blf_p.get("agentic_anchors") or prov.get("agentic_anchors") or []
    if anchors:
        lines.append(f"agentic_anchors: {', '.join(anchors)}")
    if execution.get("langsmith", {}).get("url"):
        lines.append(f"langsmith={execution['langsmith']['url']}")
    return "\n".join(lines)


def episode_custom_id(decision_id: str) -> str:
    digest = hashlib.sha1(decision_id.encode()).hexdigest()[:16]
    return f"cot-experience-{digest}"
