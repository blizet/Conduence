"""Expand macro agentic graph with correlated markets from Totalis API."""

from __future__ import annotations

import json
import re
import time
from collections import defaultdict
from itertools import combinations
from pathlib import Path
from typing import Any

import httpx

from app.agentic.weight import clamp_weight

TOTALIS_BASE = "https://api.totalis.trade"
USER_AGENT = "Conduence/1.0 (agentic-graph-seed)"

STOPWORDS = frozenset(
    {
        "the",
        "and",
        "for",
        "will",
        "this",
        "that",
        "from",
        "with",
        "are",
        "was",
        "were",
        "have",
        "has",
        "had",
        "not",
        "but",
        "any",
        "all",
        "who",
        "what",
        "when",
        "where",
        "how",
        "yes",
        "out",
        "end",
        "day",
        "week",
        "month",
        "year",
        "before",
        "after",
        "than",
        "into",
        "over",
        "under",
        "above",
        "below",
        "between",
        "during",
        "market",
        "price",
        "total",
        "spot",
        "index",
        "rate",
        "rates",
    }
)

DEFAULT_CATEGORIES = ("politics", "crypto", "finance", "economics", "sports", "tech")

CATEGORY_MACRO_PREFIXES: dict[str, tuple[str, ...]] = {
    "politics": ("geo_", "macro_"),
    "crypto": ("cry_", "stk_prox_"),
    "finance": ("stk_", "fi_", "macro_", "cmd_"),
    "economics": ("macro_", "cmd_", "fi_"),
    "sports": ("stk_", "geo_"),
    "tech": ("stk_prox_", "cry_", "macro_"),
}

CATEGORY_FALLBACK_MACRO: dict[str, str] = {
    "politics": "geo_01",
    "crypto": "cry_l1_01",
    "finance": "stk_idx_01",
    "economics": "macro_01",
    "sports": "stk_idx_01",
    "tech": "stk_prox_01",
    "default": "macro_01",
}

TOPIC_MACRO_HINTS: list[tuple[re.Pattern[str], str]] = [
    (re.compile(r"trump|president|election|congress|senate|governor|vote|gop|democrat", re.I), "geo_01"),
    (re.compile(r"iran|israel|war|military|strike|nato|ukraine|russia|china|taiwan", re.I), "geo_01"),
    (re.compile(r"bitcoin|btc|crypto|ethereum|eth|solana|defi|token", re.I), "cry_l1_01"),
    (re.compile(r"fed|rate|inflation|cpi|gdp|treasury|yield|recession|employment", re.I), "macro_01"),
    (re.compile(r"oil|crude|wti|brent|gas|energy|opec", re.I), "cmd_02"),
    (re.compile(r"gold|silver|copper|commodity|wheat|corn", re.I), "cmd_01"),
    (re.compile(r"s&p|nasdaq|dow|stock|equity|earnings", re.I), "stk_idx_01"),
]


def _get_with_retry(
    client: httpx.Client,
    url: str,
    *,
    params: dict[str, Any] | None = None,
    max_retries: int = 6,
) -> httpx.Response:
    delay = 1.5
    last_exc: Exception | None = None
    for attempt in range(max_retries):
        try:
            response = client.get(url, params=params)
            if response.status_code == 429:
                time.sleep(delay)
                delay = min(delay * 1.8, 20.0)
                continue
            response.raise_for_status()
            return response
        except httpx.HTTPError as exc:
            last_exc = exc
            if attempt + 1 >= max_retries:
                raise
            time.sleep(delay)
            delay = min(delay * 1.8, 20.0)
    if last_exc:
        raise last_exc
    raise RuntimeError("Totalis request failed without response")


def _repo_root() -> Path:
    return Path(__file__).resolve().parents[3]


def _slugify(text: str, *, max_len: int = 40) -> str:
    base = re.sub(r"[^a-z0-9]+", "_", text.lower()).strip("_")[:max_len] or "market"
    return base


def _tokens(text: str) -> set[str]:
    return {
        w
        for w in re.findall(r"[a-z0-9]+", text.lower())
        if len(w) >= 3 and w not in STOPWORDS
    }


def _is_totalis_node_id(node_id: str) -> bool:
    return str(node_id).startswith("tot_")


def _macro_nodes(graph: dict[str, Any]) -> list[dict[str, Any]]:
    return [
        n
        for n in graph.get("nodes") or []
        if n.get("label") and not _is_totalis_node_id(str(n.get("id") or ""))
    ]


def _infer_category(title: str, venue: str | None = None) -> str:
    blob = title.lower()
    if venue == "kalshi":
        if any(k in blob for k in ("btc", "bitcoin", "eth", "crypto", "sol")):
            return "crypto"
        if any(k in blob for k in ("fed", "cpi", "gdp", "rate", "inflation")):
            return "economics"
    if any(k in blob for k in ("trump", "election", "president", "senate", "congress", "iran", "war")):
        return "politics"
    if any(k in blob for k in ("bitcoin", "btc", "eth", "crypto", "solana", "defi")):
        return "crypto"
    if any(k in blob for k in ("fed", "rate", "inflation", "cpi", "gdp", "jobs", "recession")):
        return "economics"
    if any(k in blob for k in ("oil", "wti", "crude", "gas", "gold", "wheat", "corn")):
        return "finance"
    if any(k in blob for k in ("nba", "nfl", "mlb", "ufc", "soccer", "tennis", "vs.")):
        return "sports"
    if any(k in blob for k in ("ai", "openai", "apple", "google", "microsoft", "tesla")):
        return "tech"
    return "finance"


def _topic_fallback_macro_id(title: str) -> str | None:
    for pattern, macro_id in TOPIC_MACRO_HINTS:
        if pattern.search(title):
            return macro_id
    return None


def _best_macro_match(
    title: str,
    macro_nodes: list[dict[str, Any]],
    *,
    category: str | None = None,
) -> tuple[float, str, str]:
    prefixes = CATEGORY_MACRO_PREFIXES.get(category or "", ())
    best_score = 0.0
    best_id = ""
    best_label = ""

    for macro in macro_nodes:
        macro_id = str(macro["id"])
        macro_label = str(macro.get("label") or "")
        score = _macro_match_score(macro_label, title)
        if prefixes and macro_id.startswith(prefixes):
            score += 0.18
        if score > best_score:
            best_score = score
            best_id = macro_id
            best_label = macro_label

    if best_score < 0.06:
        hinted = _topic_fallback_macro_id(title)
        if hinted:
            for macro in macro_nodes:
                if macro["id"] == hinted:
                    return 0.42, hinted, str(macro.get("label") or hinted)
        fallback_id = CATEGORY_FALLBACK_MACRO.get(category or "", CATEGORY_FALLBACK_MACRO["default"])
        for macro in macro_nodes:
            if macro["id"] == fallback_id:
                return 0.38, fallback_id, str(macro.get("label") or fallback_id)

    return best_score, best_id, best_label


def totalis_node_id(market: dict[str, Any]) -> str:
    ticker = str(market.get("ticker") or market.get("title") or "unknown")
    venue = str(market.get("venue") or "pm")[:2]
    if ticker.startswith("0x") and len(ticker) > 12:
        ticker = ticker[:6] + ticker[-6:]
    return f"tot_{venue}_{_slugify(ticker, max_len=32)}"


def fetch_totalis_markets(
    *,
    categories: tuple[str, ...] = DEFAULT_CATEGORIES,
    pages_per_category: int = 8,
    date_filter: str = "all",
) -> list[dict[str, Any]]:
    """Paginate Totalis /markets and flatten to market rows."""
    headers = {"User-Agent": USER_AGENT}
    markets: list[dict[str, Any]] = []
    seen_tickers: set[str] = set()

    with httpx.Client(timeout=60.0, headers=headers) as client:
        for category in categories:
            cursor: str | None = None
            for _ in range(pages_per_category):
                params: dict[str, Any] = {
                    "category": category,
                    "limit": 50,
                    "markets_per_event": 30,
                    "date_filter": date_filter,
                }
                if cursor:
                    params["cursor"] = cursor
                response = _get_with_retry(client, f"{TOTALIS_BASE}/markets", params=params)
                payload = response.json()
                events = (payload.get("data") or {}).get("events") or []
                for event in events:
                    for market in event.get("markets") or []:
                        ticker = str(market.get("ticker") or "")
                        if not ticker or ticker in seen_tickers:
                            continue
                        seen_tickers.add(ticker)
                        title = str(market.get("title") or "").strip()
                        if not title:
                            continue
                        markets.append(
                            {
                                "ticker": ticker,
                                "title": title,
                                "venue": market.get("venue"),
                                "category": market.get("category") or category,
                                "subcategory": market.get("subcategory"),
                                "event_ticker": market.get("event_ticker"),
                                "series_ticker": market.get("series_ticker"),
                                "exclusion_keys": list(market.get("exclusion_keys") or []),
                                "volume_24h": int(market.get("volume_24h") or market.get("volume") or 0),
                                "venue_url": market.get("venue_url"),
                            }
                        )
                meta = payload.get("meta") or {}
                if not meta.get("has_more"):
                    break
                cursor = meta.get("cursor")
                if not cursor:
                    break
                time.sleep(0.35)
    return markets


def _macro_match_score(macro_label: str, market_title: str) -> float:
    macro_tokens = _tokens(macro_label)
    market_tokens = _tokens(market_title)
    if not macro_tokens or not market_tokens:
        return 0.0
    shared = set(macro_tokens & market_tokens)
    title_lower = market_title.lower()
    for token in macro_tokens:
        if len(token) >= 4 and token in title_lower:
            shared.add(token)
    if len(shared) < 1:
        return 0.0
    return len(shared) / min(len(macro_tokens), len(market_tokens))


def _correlation_weight(shared_keys: int) -> float:
    return clamp_weight(min(0.95, 0.35 + 0.12 * max(1, shared_keys)))


def build_totalis_expansion(
    macro_graph: dict[str, Any],
    markets: list[dict[str, Any]],
    *,
    max_market_nodes: int = 180,
    max_market_pair_edges: int = 400,
    max_macro_links: int = 350,
    min_macro_score: float = 0.08,
) -> dict[str, Any]:
    """Return new nodes and edges to merge into the macro graph."""
    existing_ids = {str(n["id"]) for n in macro_graph.get("nodes") or []}
    existing_edge_ids = {str(e["id"]) for e in macro_graph.get("edges") or []}
    macro_nodes = _macro_nodes(macro_graph)

    ranked = sorted(markets, key=lambda m: m.get("volume_24h") or 0, reverse=True)
    selected = ranked[:max_market_nodes]

    new_nodes: list[dict[str, Any]] = []
    node_by_id: dict[str, dict[str, Any]] = {}
    for market in selected:
        node_id = totalis_node_id(market)
        if node_id in existing_ids or node_id in node_by_id:
            continue
        node = {
            "id": node_id,
            "label": market["title"][:120],
            "type": "market",
            "sector": "totalis",
            "venue": market.get("venue"),
            "category": market.get("category"),
            "ticker": market.get("ticker"),
            "origin": "totalis",
        }
        node_by_id[node_id] = node
        new_nodes.append(node)

    if not node_by_id:
        # Re-link existing Totalis nodes already present in the macro graph.
        for node in macro_graph.get("nodes") or []:
            node_id = str(node.get("id") or "")
            if not node_id.startswith("tot_"):
                continue
            node_by_id[node_id] = {
                "id": node_id,
                "label": str(node.get("label") or node_id),
                "category": node.get("category"),
                "venue": node.get("venue"),
            }

    keys_to_markets: dict[str, set[str]] = defaultdict(set)
    market_keys: dict[str, list[str]] = {}
    for market in selected:
        mid = totalis_node_id(market)
        if mid not in node_by_id:
            continue
        keys = list(market.get("exclusion_keys") or [])
        market_keys[mid] = keys
        for key in keys:
            keys_to_markets[key].add(mid)

    new_edges: list[dict[str, Any]] = []
    pair_edges_added = 0
    seen_pairs: set[tuple[str, str]] = set()

    for key, members in keys_to_markets.items():
        member_list = sorted(members)
        if len(member_list) < 2:
            continue
        for left, right in combinations(member_list, 2):
            pair = (left, right) if left < right else (right, left)
            if pair in seen_pairs:
                continue
            shared = len(set(market_keys.get(pair[0], [])) & set(market_keys.get(pair[1], [])))
            if shared < 1:
                continue
            seen_pairs.add(pair)
            edge_id = f"{pair[0]}_corr_{pair[1]}"
            if edge_id in existing_edge_ids:
                continue
            left_label = node_by_id[pair[0]]["label"]
            right_label = node_by_id[pair[1]]["label"]
            weight = _correlation_weight(shared)
            new_edges.append(
                {
                    "id": edge_id,
                    "source": pair[0],
                    "target": pair[1],
                    "label": f"{left_label} ↔ {right_label}",
                    "weight": weight,
                    "expectedSign": 1 if weight >= 0 else -1,
                    "origin": "totalis",
                    "correlationKeys": shared,
                }
            )
            pair_edges_added += 1
            if pair_edges_added >= max_market_pair_edges:
                break
        if pair_edges_added >= max_market_pair_edges:
            break

    macro_links = 0
    macro_candidates: list[tuple[float, str, str, str]] = []
    seen_macro_pairs: set[tuple[str, str]] = set()
    existing_macro_tot: set[tuple[str, str]] = set()
    for edge in macro_graph.get("edges") or []:
        src, tgt = str(edge.get("source") or ""), str(edge.get("target") or "")
        if _is_totalis_node_id(tgt) and not _is_totalis_node_id(src):
            existing_macro_tot.add((src, tgt))
        elif _is_totalis_node_id(src) and not _is_totalis_node_id(tgt):
            existing_macro_tot.add((tgt, src))

    for mid, node in node_by_id.items():
        title = str(node.get("label") or "")
        category = str(node.get("category") or "") or _infer_category(title, node.get("venue"))
        score, macro_id, macro_label = _best_macro_match(title, macro_nodes, category=category)
        if not macro_id:
            continue
        pair = (macro_id, mid)
        if pair in seen_macro_pairs or pair in existing_macro_tot:
            continue
        seen_macro_pairs.add(pair)
        macro_candidates.append((score, macro_id, mid, macro_label))

    macro_candidates.sort(key=lambda row: row[0], reverse=True)
    for score, macro_id, target_id, macro_label in macro_candidates:
        edge_id = f"{macro_id}_to_{target_id}"
        if edge_id in existing_edge_ids:
            continue
        weight = clamp_weight(min(0.9, 0.45 + score))
        new_edges.append(
            {
                "id": edge_id,
                "source": macro_id,
                "target": target_id,
                "label": f"{macro_label} → {node_by_id[target_id]['label']}",
                "weight": weight,
                "expectedSign": 1,
                "origin": "totalis",
                "macroMatchScore": round(score, 3),
            }
        )
        macro_links += 1

    return {
        "nodes": new_nodes,
        "edges": new_edges,
        "stats": {
            "totalisMarketsFetched": len(markets),
            "totalisMarketsAdded": len(new_nodes),
            "correlationEdges": pair_edges_added,
            "macroBridgeEdges": macro_links,
        },
    }


def merge_expansion_into_macro(
    macro_path: Path,
    expansion: dict[str, Any],
) -> dict[str, Any]:
    raw = json.loads(macro_path.read_text(encoding="utf-8"))
    nodes = list(raw.get("nodes") or [])
    edges = list(raw.get("edges") or [])
    existing_node_ids = {str(n["id"]) for n in nodes}
    existing_edge_ids = {str(e["id"]) for e in edges}

    for node in expansion.get("nodes") or []:
        if node["id"] not in existing_node_ids:
            nodes.append(node)
            existing_node_ids.add(node["id"])

    for edge in expansion.get("edges") or []:
        if edge["id"] not in existing_edge_ids:
            edges.append(edge)
            existing_edge_ids.add(edge["id"])

    meta = dict(raw.get("graph_metadata") or {})
    meta.update(
        {
            "total_nodes": len(nodes),
            "total_edges": len(edges),
            "totalis_expansion": expansion.get("stats") or {},
        }
    )
    raw["graph_metadata"] = meta
    raw["nodes"] = nodes
    raw["edges"] = edges
    macro_path.write_text(json.dumps(raw, indent=2), encoding="utf-8")
    return raw


def add_macro_bridges_to_file(
    macro_path: Path | None = None,
    *,
    max_macro_links: int = 350,
    min_macro_score: float = 0.08,
) -> dict[str, Any]:
    """Add macro→Totalis market bridge edges to an already-expanded graph."""
    path = macro_path or (_repo_root() / "data" / "agentic" / "macro_correlation_graph.json")
    macro = json.loads(path.read_text(encoding="utf-8"))
    tot_markets = [
        {
            "ticker": n.get("ticker") or n["id"],
            "title": n.get("label") or "",
            "exclusion_keys": [],
            "volume_24h": 0,
        }
        for n in macro.get("nodes") or []
        if str(n.get("id", "")).startswith("tot_")
    ]
    expansion = build_totalis_expansion(
        macro,
        tot_markets,
        max_market_nodes=0,
        max_market_pair_edges=0,
        max_macro_links=max_macro_links,
        min_macro_score=min_macro_score,
    )
    merged = merge_expansion_into_macro(path, expansion)
    return {
        "path": str(path),
        "stats": expansion.get("stats"),
        "totalNodes": len(merged.get("nodes") or []),
        "totalEdges": len(merged.get("edges") or []),
    }


def tighten_agentic_graph_file(macro_path: Path | None = None) -> dict[str, Any]:
    """Ensure every Totalis market node bridges into the macro agentic graph."""
    path = macro_path or (_repo_root() / "data" / "agentic" / "macro_correlation_graph.json")
    raw = json.loads(path.read_text(encoding="utf-8"))
    macro_nodes = _macro_nodes(raw)
    macro_ids = {str(n["id"]) for n in macro_nodes}
    existing_edge_ids = {str(e["id"]) for e in raw.get("edges") or []}

    edges = [
        e
        for e in raw.get("edges") or []
        if str(e.get("source") or "") != str(e.get("target") or "")
    ]

    adj: dict[str, set[str]] = defaultdict(set)
    for edge in edges:
        src, tgt = str(edge["source"]), str(edge["target"])
        adj[src].add(tgt)
        adj[tgt].add(src)

    new_edges: list[dict[str, Any]] = []
    bridge_count = 0
    secondary_count = 0

    for node in raw.get("nodes") or []:
        node_id = str(node.get("id") or "")
        if not _is_totalis_node_id(node_id):
            continue
        title = str(node.get("label") or "")
        category = str(node.get("category") or "") or _infer_category(title, node.get("venue"))
        has_macro = bool(adj[node_id] & macro_ids)
        score, macro_id, macro_label = _best_macro_match(title, macro_nodes, category=category)
        if not macro_id:
            continue

        if not has_macro:
            edge_id = f"{macro_id}_bridge_{node_id}"
            if edge_id not in existing_edge_ids:
                weight = clamp_weight(max(0.52, min(0.88, 0.48 + score)))
                new_edges.append(
                    {
                        "id": edge_id,
                        "source": macro_id,
                        "target": node_id,
                        "label": f"{macro_label} → {title[:80]}",
                        "weight": weight,
                        "expectedSign": 1,
                        "origin": "totalis_bridge",
                        "macroMatchScore": round(score, 3),
                    }
                )
                existing_edge_ids.add(edge_id)
                bridge_count += 1
                adj[macro_id].add(node_id)
                adj[node_id].add(macro_id)

        # Secondary link to a related macro market/asset for tighter coupling.
        ranked: list[tuple[float, str, str]] = []
        prefixes = CATEGORY_MACRO_PREFIXES.get(category, ())
        for macro in macro_nodes:
            mid = str(macro["id"])
            if mid == macro_id:
                continue
            s = _macro_match_score(str(macro.get("label") or ""), title)
            if prefixes and str(macro["id"]).startswith(prefixes):
                s += 0.05
            if s >= 0.12:
                ranked.append((s, mid, str(macro.get("label") or mid)))
        ranked.sort(reverse=True)
        if ranked:
            s2, macro_id2, macro_label2 = ranked[0]
            edge_id2 = f"{macro_id2}_bridge2_{node_id}"
            if edge_id2 not in existing_edge_ids and macro_id2 not in adj[node_id]:
                new_edges.append(
                    {
                        "id": edge_id2,
                        "source": macro_id2,
                        "target": node_id,
                        "label": f"{macro_label2} → {title[:80]}",
                        "weight": clamp_weight(max(0.45, min(0.75, 0.4 + s2))),
                        "expectedSign": 1,
                        "origin": "totalis_bridge",
                        "macroMatchScore": round(s2, 3),
                    }
                )
                existing_edge_ids.add(edge_id2)
                secondary_count += 1

    expansion = {
        "nodes": [],
        "edges": new_edges,
        "stats": {
            "primaryBridges": bridge_count,
            "secondaryBridges": secondary_count,
        },
    }
    merged = merge_expansion_into_macro(path, expansion)
    return {
        "path": str(path),
        "stats": expansion["stats"],
        "totalNodes": len(merged.get("nodes") or []),
        "totalEdges": len(merged.get("edges") or []),
    }


def expand_macro_graph_file(
    macro_path: Path | None = None,
    *,
    categories: tuple[str, ...] = DEFAULT_CATEGORIES,
    pages_per_category: int = 8,
) -> dict[str, Any]:
    path = macro_path or (_repo_root() / "data" / "agentic" / "macro_correlation_graph.json")
    macro = json.loads(path.read_text(encoding="utf-8"))
    markets = fetch_totalis_markets(categories=categories, pages_per_category=pages_per_category)
    expansion = build_totalis_expansion(macro, markets)
    merged = merge_expansion_into_macro(path, expansion)
    return {
        "path": str(path),
        "stats": expansion.get("stats"),
        "totalNodes": len(merged.get("nodes") or []),
        "totalEdges": len(merged.get("edges") or []),
    }
