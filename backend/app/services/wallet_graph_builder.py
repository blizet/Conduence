"""Build agentic + CoT graph previews from Polymarket / Kalshi wallet trade history."""

from __future__ import annotations

import hashlib
import re
from collections import defaultdict
from datetime import datetime, timezone
from itertools import combinations
from typing import Any, Literal

import httpx

from app.agentic.graph import sanitize_graph
from app.agentic.weight import clamp_weight
from app.config import TOOL_FETCH_TIMEOUT_MS
from app.tools.endpoints import DATA_BASE
from app.tools.kalshi import KALSHI_BASE, _kalshi_auth_headers
from app.tools.wallet_monitor import CATEGORY_KEYWORDS, _format_polymarket_trade

Origin = Literal["extracted", "inferred"]


def _slugify(text: str, *, prefix: str = "", max_len: int = 48) -> str:
    base = re.sub(r"[^a-z0-9]+", "_", text.lower()).strip("_")[:max_len] or "unknown"
    if prefix:
        return f"{prefix}{base}"
    return base


def wallet_user_slug(wallet: str) -> str:
    cleaned = wallet.strip().lower()
    if cleaned.startswith("0x") and len(cleaned) >= 10:
        return f"user_{cleaned[-8:]}"
    digest = hashlib.sha1(cleaned.encode()).hexdigest()[:8]
    return f"user_{digest}"


def combined_graph_id(wallet: str) -> str:
    return f"{wallet_user_slug(wallet)}.combined.v1"


def _normalize_side_outcome(side: str, outcome: str) -> tuple[str, str]:
    side_u = (side or "BUY").upper()
    outcome_u = (outcome or "YES").upper()
    if outcome_u in {"Y", "YES", "LONG"}:
        outcome_u = "YES"
    elif outcome_u in {"N", "NO", "SHORT"}:
        outcome_u = "NO"
    if side_u not in {"BUY", "SELL"}:
        side_u = "BUY"
    return side_u, outcome_u


def _trade_action(side: str, outcome: str) -> str:
    side_u, outcome_u = _normalize_side_outcome(side, outcome)
    if side_u == "BUY" and outcome_u == "YES":
        return "BUY_YES"
    if side_u == "BUY" and outcome_u == "NO":
        return "BUY_NO"
    if side_u == "SELL" and outcome_u == "YES":
        return "SELL_YES"
    return "SELL_NO"


def _edge_type_for_action(action: str) -> str:
    mapping = {
        "BUY_YES": "OPEN_YES",
        "BUY_NO": "OPEN_NO",
        "SELL_YES": "CLOSE_YES",
        "SELL_NO": "CLOSE_NO",
    }
    return mapping.get(action, "OPEN_YES")


def _action_label(action: str) -> str:
    return action.replace("_", " ").title()


def _infer_categories(title: str) -> list[str]:
    blob = title.lower()
    hits: list[str] = []
    for category, keywords in CATEGORY_KEYWORDS.items():
        if any(kw in blob for kw in keywords):
            hits.append(category)
    return hits


def _dominant_sign(trades: list[dict[str, Any]]) -> int:
    score = 0
    for trade in trades:
        _, outcome = _normalize_side_outcome(trade.get("side", ""), trade.get("outcome", ""))
        score += 1 if outcome == "YES" else -1
    if score == 0:
        return 1
    return 1 if score > 0 else -1


def _float_or_zero(value: Any) -> float:
    try:
        return float(value or 0)
    except (TypeError, ValueError):
        return 0.0


def _index_markets_from_trades(
    trades: list[dict[str, Any]],
) -> tuple[dict[str, dict[str, Any]], dict[str, list[dict[str, Any]]], dict[int, str]]:
    """Return market_nodes, market_trades, trade_index -> market_id."""
    market_nodes: dict[str, dict[str, Any]] = {}
    market_trades: dict[str, list[dict[str, Any]]] = defaultdict(list)
    trade_market_ids: dict[int, str] = {}

    for idx, trade in enumerate(trades):
        platform = str(trade.get("platform") or "polymarket")
        title = str(trade.get("title") or "").strip()
        if not title:
            continue
        market_id = _slugify(title, prefix=f"{platform[:2]}_")
        trade_market_ids[idx] = market_id
        if market_id not in market_nodes:
            market_nodes[market_id] = {
                "id": market_id,
                "label": title,
                "platform": platform,
                "type": "market",
                "origin": "extracted",
            }
        market_trades[market_id].append(trade)

    return market_nodes, market_trades, trade_market_ids


def _compute_market_correlations(
    market_trades: dict[str, list[dict[str, Any]]],
    market_nodes: dict[str, dict[str, Any]],
    trades: list[dict[str, Any]],
    trade_market_ids: dict[int, str],
) -> list[dict[str, Any]]:
    """Pairwise market links from co-traded markets (same logic as agentic inferred edges)."""
    market_ids = list(market_trades.keys())
    trade_sets: dict[str, set[int]] = defaultdict(set)
    for idx, market_id in trade_market_ids.items():
        trade_sets[market_id].add(idx)

    pair_counts: dict[tuple[str, str], int] = defaultdict(int)
    for left, right in combinations(market_ids, 2):
        shared = trade_sets.get(left, set()) & trade_sets.get(right, set())
        if not shared:
            continue
        pair = (left, right) if left < right else (right, left)
        pair_counts[pair] += max(1, len(shared))

    if not pair_counts:
        return []

    max_count = max(pair_counts.values())
    correlations: list[dict[str, Any]] = []
    for (left, right), count in pair_counts.items():
        left_sign = _dominant_sign(market_trades[left])
        right_sign = _dominant_sign(market_trades[right])
        same_sign = left_sign == right_sign
        raw_weight = 0.35 + 0.65 * (count / max_count)
        weight = clamp_weight(raw_weight if same_sign else -raw_weight)
        left_label = market_nodes[left]["label"]
        right_label = market_nodes[right]["label"]
        correlations.append(
            {
                "id": f"{left}_corr_{right}",
                "source": left,
                "target": right,
                "label": f"{left_label} ↔ {right_label}",
                "weight": weight,
                "expectedSign": 1 if weight >= 0 else -1,
                "origin": "inferred",
                "coTradeCount": count,
            }
        )
    return correlations


async def fetch_polymarket_trades(wallet: str, limit: int) -> list[dict[str, Any]]:
    timeout = TOOL_FETCH_TIMEOUT_MS / 1000
    async with httpx.AsyncClient(timeout=timeout) as client:
        response = await client.get(f"{DATA_BASE}/trades", params={"user": wallet, "limit": limit})
        if response.status_code >= 400:
            detail = response.text.strip()[:200] or f"HTTP {response.status_code}"
            raise RuntimeError(f"Polymarket trades failed ({response.status_code}): {detail}")
        payload = response.json()
    rows = payload if isinstance(payload, list) else []
    return [_format_polymarket_trade(row, wallet) for row in rows if isinstance(row, dict)]


async def fetch_kalshi_trades(
    *,
    api_key_id: str,
    private_key_pem: str,
    limit: int,
) -> list[dict[str, Any]]:
    timeout = TOOL_FETCH_TIMEOUT_MS / 1000
    path = "/trade-api/v2/portfolio/fills"
    url = f"{KALSHI_BASE}/portfolio/fills"
    headers = _kalshi_auth_headers(api_key_id, private_key_pem, "GET", path)
    async with httpx.AsyncClient(timeout=timeout) as client:
        response = await client.get(url, headers=headers, params={"limit": limit})
        if response.status_code >= 400:
            detail = response.text.strip()[:200] or f"HTTP {response.status_code}"
            raise RuntimeError(f"Kalshi fills failed ({response.status_code}): {detail}")
        payload = response.json() if response.content else {}
    fills = payload.get("fills") if isinstance(payload, dict) else []
    if not isinstance(fills, list):
        return []
    formatted: list[dict[str, Any]] = []
    for fill in fills:
        if not isinstance(fill, dict):
            continue
        ticker = fill.get("ticker") or fill.get("market_ticker") or ""
        formatted.append(
            {
                "platform": "kalshi",
                "wallet": api_key_id,
                "title": ticker,
                "side": fill.get("side", "") or fill.get("action", ""),
                "outcome": "YES" if fill.get("yes_price") else "NO",
                "size": fill.get("count"),
                "price": fill.get("yes_price") or fill.get("no_price"),
                "usd": None,
                "timestamp": fill.get("created_time") or fill.get("ts"),
                "txHash": "",
            }
        )
    return formatted


def build_agentic_graph(trades: list[dict[str, Any]]) -> dict[str, Any]:
    """Weighted correlation graph — extracted market nodes + inferred relationships."""
    market_nodes, market_trades, trade_market_ids = _index_markets_from_trades(trades)
    concept_nodes: dict[str, dict[str, Any]] = {}
    theme_edges: dict[str, dict[str, Any]] = {}

    for trade in trades:
        platform = str(trade.get("platform") or "polymarket")
        title = str(trade.get("title") or "").strip()
        if not title:
            continue
        market_id = _slugify(title, prefix=f"{platform[:2]}_")

        for category in _infer_categories(title):
            concept_id = _slugify(category, prefix="cat_")
            if concept_id not in concept_nodes:
                concept_nodes[concept_id] = {
                    "id": concept_id,
                    "label": category.replace("-", " ").title(),
                    "type": "concept",
                    "origin": "inferred",
                }
            edge_id = f"{market_id}_theme_{concept_id}"
            if edge_id in theme_edges:
                continue
            theme_edges[edge_id] = {
                "id": edge_id,
                "source": market_id,
                "target": concept_id,
                "label": f"{title} → {concept_nodes[concept_id]['label']}",
                "weight": 0.85,
                "expectedSign": 1,
                "origin": "inferred",
            }

    extracted_edges = list(theme_edges.values())
    inferred_edges = _compute_market_correlations(
        market_trades, market_nodes, trades, trade_market_ids
    )

    nodes = [*market_nodes.values(), *concept_nodes.values()]
    edges = [*extracted_edges, *inferred_edges]
    graph = sanitize_graph({"nodes": nodes, "edges": edges})
    return {
        **graph,
        "stats": {
            "marketNodes": len(market_nodes),
            "conceptNodes": len(concept_nodes),
            "extractedEdges": len(extracted_edges),
            "inferredEdges": len(inferred_edges),
        },
    }


def _decision_from_trade(
    trade: dict[str, Any],
    *,
    wallet: str,
    graph_id: str,
    user_node_id: str,
    trade_index: int,
) -> dict[str, Any]:
    platform = str(trade.get("platform") or "polymarket")
    protocol_id = "Polymarket" if platform == "polymarket" else "Kalshi"
    title = str(trade.get("title") or "").strip() or f"market_{trade_index}"
    market_id = _slugify(title, prefix=f"{platform[:2]}_")
    trade_id = f"TRD_HIST_{trade_index:04d}"
    decision_id = f"dec-{trade_id.lower()}"
    action = _trade_action(str(trade.get("side", "")), str(trade.get("outcome", "")))
    now = datetime.now(timezone.utc).isoformat()
    timestamp = trade.get("timestamp") or now
    thesis = (
        f"Historical {platform} trade: {_action_label(action)} on «{title}» "
        f"(origin=extracted, wallet={wallet[:10]}…)"
    )

    nodes = [
        {"node_id": user_node_id, "node_type": "user"},
        {"node_id": protocol_id, "node_type": "protocol"},
        {"node_id": market_id, "node_type": "market", "properties": {"label": title, "origin": "extracted"}},
        {"node_id": trade_id, "node_type": "trade", "properties": {
            "origin": "extracted",
            "market_id": market_id,
            "market_label": title,
            "platform": platform,
            "action": action,
            "side": trade.get("side"),
            "outcome": trade.get("outcome"),
            "price": trade.get("price"),
            "size": trade.get("size"),
            "usd": trade.get("usd"),
            "volume": trade.get("size"),
            "capital": trade.get("usd"),
            "timestamp": timestamp,
            "tx_hash": trade.get("txHash"),
        }},
        {"node_id": f"FB_{trade_id}", "node_type": "feedback"},
    ]
    edges = [
        {"source": user_node_id, "target": protocol_id},
        {
            "source": protocol_id,
            "target": market_id,
            "metadata": {"platform": platform, "origin": "extracted"},
        },
        {
            "source": market_id,
            "target": trade_id,
            "Action": _action_label(action),
            "metadata": {
                "thesis": thesis,
                "origin": "extracted",
                "timestamp": timestamp,
                "decision_id": decision_id,
                "price": trade.get("price"),
                "size": trade.get("size"),
                "usd": trade.get("usd"),
                "side": trade.get("side"),
                "outcome": trade.get("outcome"),
            },
        },
        {"source": trade_id, "target": f"FB_{trade_id}"},
    ]

    return {
        "schema_version": "1.0",
        "operation": "assert",
        "graph_id": graph_id,
        "decision_id": decision_id,
        "updated_at": now,
        "nodes": nodes,
        "edges": edges,
        "provenance": {
            "origin": "extracted",
            "source": platform,
            "wallet": wallet,
            "tx_hash": trade.get("txHash"),
        },
    }


def build_node_details(
    *,
    wallet: str,
    user_node_id: str,
    trades: list[dict[str, Any]],
    decisions: list[dict[str, Any]],
    market_nodes: dict[str, dict[str, Any]],
    market_trades: dict[str, list[dict[str, Any]]],
) -> dict[str, Any]:
    """Rich inspector payload keyed by node id."""
    details: dict[str, Any] = {}

    total_capital = sum(_float_or_zero(t.get("usd")) for t in trades)
    total_volume = sum(_float_or_zero(t.get("size")) for t in trades)
    details[user_node_id] = {
        "nodeType": "user",
        "wallet": wallet,
        "tradeCount": len(trades),
        "totalCapital": round(total_capital, 4),
        "totalVolume": round(total_volume, 4),
        "platforms": sorted({str(t.get("platform") or "polymarket") for t in trades}),
        "origin": "extracted",
    }

    for protocol in ("Polymarket", "Kalshi"):
        platform_trades = [t for t in trades if (t.get("platform") or "polymarket").lower() == protocol.lower()]
        if not platform_trades and protocol == "Kalshi":
            continue
        if protocol == "Polymarket" or platform_trades:
            details[protocol] = {
                "nodeType": "protocol",
                "platform": protocol,
                "tradeCount": len(platform_trades) if protocol == "Kalshi" else len(
                    [t for t in trades if str(t.get("platform") or "polymarket") == "polymarket"]
                ),
                "totalCapital": round(
                    sum(_float_or_zero(t.get("usd")) for t in trades if (
                        (protocol == "Polymarket" and str(t.get("platform") or "polymarket") == "polymarket")
                        or (protocol == "Kalshi" and str(t.get("platform")) == "kalshi")
                    )),
                    4,
                ),
                "origin": "extracted",
            }

    trade_rows_by_market: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for i, decision in enumerate(decisions):
        trade_id = next(
            (n["node_id"] for n in decision.get("nodes") or [] if n.get("node_type") == "trade"),
            f"TRD_HIST_{i + 1:04d}",
        )
        trade_node = next(
            (n for n in decision.get("nodes") or [] if n.get("node_type") == "trade"),
            {},
        )
        trade_props = trade_node.get("properties") or {}
        market_edge = next(
            (e for e in decision.get("edges") or [] if e.get("Action")),
            {},
        )
        meta = market_edge.get("metadata") or {}
        market_id = next(
            (n["node_id"] for n in decision.get("nodes") or [] if n.get("node_type") == "market"),
            "",
        )
        market_label = next(
            (
                (n.get("properties") or {}).get("label")
                for n in decision.get("nodes") or []
                if n.get("node_type") == "market"
            ),
            market_nodes.get(market_id, {}).get("label", market_id),
        )
        trade_row = {
            "tradeId": trade_id,
            "action": market_edge.get("Action"),
            "price": meta.get("price"),
            "size": meta.get("size"),
            "volume": meta.get("size"),
            "capital": meta.get("usd"),
            "timestamp": meta.get("timestamp"),
            "txHash": (decision.get("provenance") or {}).get("tx_hash"),
            "origin": "extracted",
        }
        details[trade_id] = {
            "nodeType": "trade",
            "tradeId": trade_id,
            "marketId": market_id,
            "market": market_label,
            "platform": (decision.get("provenance") or {}).get("source"),
            "action": market_edge.get("Action"),
            "side": trade_props.get("side") or meta.get("side"),
            "outcome": trade_props.get("outcome") or meta.get("outcome"),
            "price": meta.get("price"),
            "size": meta.get("size"),
            "volume": meta.get("size"),
            "capital": meta.get("usd"),
            "timestamp": meta.get("timestamp"),
            "txHash": (decision.get("provenance") or {}).get("tx_hash"),
            "thesis": meta.get("thesis"),
            "origin": "extracted",
        }
        if market_id:
            trade_rows_by_market[market_id].append(trade_row)

    for market_id, meta in market_nodes.items():
        rows = trade_rows_by_market.get(market_id, [])
        mtrades = market_trades.get(market_id, [])
        details[market_id] = {
            "nodeType": "market",
            "marketId": market_id,
            "market": meta.get("label", market_id),
            "platform": meta.get("platform"),
            "tradeCount": len(rows) or len(mtrades),
            "totalVolume": round(sum(_float_or_zero(r.get("volume")) for r in rows), 4),
            "totalCapital": round(sum(_float_or_zero(r.get("capital")) for r in rows), 4),
            "categories": _infer_categories(meta.get("label", "")),
            "trades": rows,
            "origin": "extracted",
        }

    for decision in decisions:
        for node in decision.get("nodes") or []:
            node_id = str(node.get("node_id") or "").strip()
            if not node_id:
                continue
            node_type = str(node.get("node_type") or "")
            if node_id in details:
                continue
            if node_type == "feedback":
                details[node_id] = {
                    "nodeType": "feedback",
                    "linkedTradeId": node_id.replace("FB_", ""),
                    "origin": "extracted",
                }

    return details


def decisions_to_snapshot(
    graph_id: str,
    decisions: list[dict[str, Any]],
    *,
    market_correlations: list[dict[str, Any]] | None = None,
    market_nodes: dict[str, dict[str, Any]] | None = None,
) -> dict[str, Any]:
    """Merge decision events into a FalkorDB-style snapshot for the CoT graph viewer."""
    node_map: dict[str, dict[str, Any]] = {}
    edges: list[dict[str, Any]] = []
    seen_edges: set[tuple[str, str, str]] = set()
    correlated_market_ids: set[str] = set()

    if market_correlations:
        for corr in market_correlations:
            correlated_market_ids.add(str(corr["source"]))
            correlated_market_ids.add(str(corr["target"]))

    for decision in decisions:
        for node in decision.get("nodes") or []:
            node_id = str(node["node_id"])
            node_type = str(node["node_type"])
            props = node.get("properties") or {}
            if node_id not in node_map:
                entry: dict[str, Any] = {"id": node_id, "type": node_type}
                label = props.get("label") or props.get("market_label")
                if label:
                    entry["label"] = label
                if node_type == "market":
                    if node_id in correlated_market_ids and len(correlated_market_ids) > 1:
                        entry["marketRole"] = "correlated_peer"
                    else:
                        entry["marketRole"] = "anchor"
                node_map[node_id] = entry
            elif props.get("label") and "label" not in node_map[node_id]:
                node_map[node_id]["label"] = props.get("label")

    if market_nodes:
        for market_id, meta in market_nodes.items():
            if market_id in node_map:
                node_map[market_id]["label"] = meta.get("label", market_id)
                if market_id in correlated_market_ids:
                    node_map[market_id]["marketRole"] = "correlated_peer"

    for decision in decisions:
        for edge in decision.get("edges") or []:
            action = edge.get("Action")
            if action and isinstance(action, str):
                normalized = action.upper().replace(" ", "_")
                edge_type = _edge_type_for_action(normalized)
            else:
                edge_type = "CONNECTED_TO"

            targets = edge.get("targets")
            if targets:
                source = str(edge["source"])
                for target in targets:
                    key = (source, str(target), "CORRELATED_WITH")
                    if key in seen_edges:
                        continue
                    seen_edges.add(key)
                    edges.append({"source": source, "target": str(target), "type": "CORRELATED_WITH"})
                continue

            source = str(edge.get("source") or "")
            target = str(edge.get("target") or "")
            if not source or not target:
                continue
            key = (source, target, edge_type)
            if key in seen_edges:
                continue
            seen_edges.add(key)
            edges.append({"source": source, "target": target, "type": edge_type})

    if market_correlations:
        for corr in market_correlations:
            source = str(corr["source"])
            target = str(corr["target"])
            key = (source, target, "CORRELATED_WITH")
            if key in seen_edges:
                continue
            seen_edges.add(key)
            edges.append(
                {
                    "source": source,
                    "target": target,
                    "type": "CORRELATED_WITH",
                    "weight": corr.get("weight"),
                    "label": corr.get("label"),
                    "origin": corr.get("origin", "inferred"),
                }
            )

    return {"graph_id": graph_id, "nodes": list(node_map.values()), "edges": edges}


def build_cot_graph(trades: list[dict[str, Any]], wallet: str) -> dict[str, Any]:
    graph_id = combined_graph_id(wallet)
    user_node_id = wallet_user_slug(wallet)
    market_nodes, market_trades, trade_market_ids = _index_markets_from_trades(trades)
    market_correlations = _compute_market_correlations(
        market_trades, market_nodes, trades, trade_market_ids
    )
    decisions = [
        _decision_from_trade(trade, wallet=wallet, graph_id=graph_id, user_node_id=user_node_id, trade_index=i + 1)
        for i, trade in enumerate(trades)
    ]
    snapshot = decisions_to_snapshot(
        graph_id,
        decisions,
        market_correlations=market_correlations,
        market_nodes=market_nodes,
    )
    node_details = build_node_details(
        wallet=wallet,
        user_node_id=user_node_id,
        trades=trades,
        decisions=decisions,
        market_nodes=market_nodes,
        market_trades=market_trades,
    )
    return {
        "graph_id": graph_id,
        "user_node_id": user_node_id,
        "decisions": decisions,
        "snapshot": snapshot,
        "nodeDetails": node_details,
        "marketCorrelations": market_correlations,
        "stats": {
            "decisionCount": len(decisions),
            "nodeCount": len(snapshot["nodes"]),
            "edgeCount": len(snapshot["edges"]),
            "correlationEdges": len(market_correlations),
        },
    }


async def build_wallet_graph_preview(
    *,
    wallet: str,
    limit: int = 50,
    kalshi_api_key_id: str | None = None,
    kalshi_private_key_pem: str | None = None,
) -> dict[str, Any]:
    wallet = wallet.strip()
    if not wallet:
        raise ValueError("wallet address is required")

    errors: list[str] = []
    trades: list[dict[str, Any]] = []

    try:
        trades.extend(await fetch_polymarket_trades(wallet, limit))
    except Exception as exc:
        errors.append(str(exc))

    kalshi_key = (kalshi_api_key_id or "").strip()
    kalshi_pem = (kalshi_private_key_pem or "").strip()
    if kalshi_key and kalshi_pem:
        try:
            trades.extend(
                await fetch_kalshi_trades(
                    api_key_id=kalshi_key,
                    private_key_pem=kalshi_pem,
                    limit=limit,
                )
            )
        except Exception as exc:
            errors.append(str(exc))

    trades = trades[:limit]

    if not trades and errors:
        raise RuntimeError("; ".join(errors))
    if not trades:
        raise ValueError("No trades found for this wallet — try another address or increase the limit")

    agentic = build_agentic_graph(trades)
    cot = build_cot_graph(trades, wallet)

    platforms = sorted({str(t.get("platform") or "unknown") for t in trades})
    return {
        "ok": True,
        "wallet": wallet,
        "platforms": platforms,
        "tradeCount": len(trades),
        "trades": trades,
        "agenticGraph": agentic,
        "cotGraph": cot,
        "errors": errors,
    }
