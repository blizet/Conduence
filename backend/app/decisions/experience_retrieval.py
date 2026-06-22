"""Retrieve similar past decision experiences from a CoT graph snapshot."""

from __future__ import annotations

from typing import Any


def _tokens_from_signal(signal: dict[str, Any]) -> set[str]:
    tokens: set[str] = set()
    for kw in signal.get("keywords") or []:
        t = str(kw).lower().strip()
        if len(t) > 2:
            tokens.add(t)
    for field in ("headline", "summary", "thesis"):
        for word in str(signal.get(field) or "").lower().split():
            if len(word) > 3:
                tokens.add(word.strip(".,!?\"'"))
    for tag in signal.get("tags") or []:
        t = str(tag).lstrip("#").lower().strip()
        if len(t) > 2:
            tokens.add(t)
    return tokens


def _node_text(node: dict[str, Any]) -> str:
    node_id = str(node.get("id") or node.get("node_id") or "")
    node_type = str(node.get("type") or node.get("node_type") or "")
    props = node.get("properties") or {}
    label = node.get("label") or props.get("label") or node_id
    parts = [node_id, node_type, str(label)]
    for key in ("thesis", "summary", "headline", "tags", "graph_anchors"):
        val = props.get(key)
        if val:
            parts.append(str(val))
    return " ".join(parts).lower()


def _trade_experience_from_snapshot(
    snapshot: dict[str, Any],
    trade_node_id: str,
) -> dict[str, Any] | None:
    nodes = {str(n.get("id") or ""): n for n in snapshot.get("nodes") or []}
    trade = nodes.get(trade_node_id)
    if not trade or str(trade.get("type") or "") != "trade":
        return None

    sig_id = f"SIG_{trade_node_id}"
    blf_id = f"BLF_{trade_node_id}"
    out_id = f"OUT_{trade_node_id}"
    sig = nodes.get(sig_id, {})
    blf = nodes.get(blf_id, {})
    out = nodes.get(out_id, {})

    return {
        "trade_id": trade_node_id,
        "signal": sig.get("label") or (sig.get("properties") or {}).get("summary"),
        "belief": (blf.get("properties") or {}).get("thesis") or blf.get("label"),
        "conviction": (blf.get("properties") or {}).get("conviction_level"),
        "outcome_status": (out.get("properties") or {}).get("status", "unknown"),
        "pnl_pct": (out.get("properties") or {}).get("pnl_pct"),
        "graph_anchors": (blf.get("properties") or {}).get("graph_anchors") or [],
    }


def retrieve_similar_experiences(
    snapshot: dict[str, Any] | None,
    signal: dict[str, Any],
    *,
    limit: int = 5,
    graph_anchors: list[str] | None = None,
) -> list[dict[str, Any]]:
    """Score past trade nodes in snapshot by token overlap with current signal."""
    if not snapshot:
        return []

    tokens = _tokens_from_signal(signal)
    anchor_set = {a.lower() for a in (graph_anchors or [])}
    scored: list[tuple[float, dict[str, Any]]] = []

    for node in snapshot.get("nodes") or []:
        if str(node.get("type") or "") != "trade":
            continue
        trade_id = str(node.get("id") or "")
        if not trade_id:
            continue

        haystack = _node_text(node)
        overlap = sum(1 for t in tokens if t in haystack)
        anchor_bonus = 0.0
        exp = _trade_experience_from_snapshot(snapshot, trade_id)
        if exp and anchor_set:
            exp_anchors = {a.lower() for a in exp.get("graph_anchors") or []}
            anchor_bonus = len(anchor_set & exp_anchors) * 2.0

        outcome_bonus = 0.0
        if exp:
            status = str(exp.get("outcome_status") or "")
            if status == "win":
                outcome_bonus = 1.5
            elif status == "loss":
                outcome_bonus = 0.5
            pnl = exp.get("pnl_pct")
            if isinstance(pnl, (int, float)):
                outcome_bonus += min(abs(float(pnl)) / 100.0, 1.0)

        score = overlap + anchor_bonus + outcome_bonus
        if score <= 0 and not tokens:
            continue
        if score <= 0:
            score = 0.1

        entry = exp or {"trade_id": trade_id}
        entry["score"] = round(score, 3)
        scored.append((score, entry))

    scored.sort(key=lambda x: -x[0])
    return [item for _, item in scored[:limit]]


def enrich_rag_with_experiences(
    rag_context: dict[str, Any],
    signal: dict[str, Any],
    snapshot: dict[str, Any] | None,
    *,
    graph_impacts: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    """Add past_experiences block to orchestrator rag_context."""
    anchors = [str(i.get("node_id")) for i in (graph_impacts or []) if i.get("node_id")]
    experiences = retrieve_similar_experiences(
        snapshot,
        signal,
        graph_anchors=anchors,
    )
    enriched = dict(rag_context)
    enriched["past_experiences"] = experiences
    enriched["experience_count"] = len(experiences)
    if experiences:
        wins = sum(1 for e in experiences if e.get("outcome_status") == "win")
        enriched["past_win_rate"] = round(wins / len(experiences), 2) if experiences else None
    return enriched
