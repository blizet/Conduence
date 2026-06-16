#!/usr/bin/env python3
"""Convert Gemini-style macro correlation JSON → CoT correlation_graph.json schema.

Usage:
  python backend/scripts/convert_gemini_correlation_graph.py \\
    path/to/gemini-graph.json \\
    data/correlation/gemini_macro_graph.json
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

# Tickers in labels like "Bitcoin (BTC)" or "NVIDIA Corporation (NVDA)"
_TICKER_RE = re.compile(r"\(([A-Z0-9]{2,10})\)")
# Crypto symbols in labels like "Ethereum (ETH)" or bare "Toncoin (TON)"
_SYMBOL_WORD_RE = re.compile(r"\b([A-Z]{2,6})\b")

_STOPWORDS = frozenset(
    {
        "a",
        "an",
        "the",
        "and",
        "or",
        "of",
        "in",
        "on",
        "for",
        "to",
        "via",
        "with",
        "inc",
        "corp",
        "ltd",
        "llc",
        "group",
        "index",
        "spot",
        "price",
        "market",
        "global",
        "total",
        "net",
        "usd",
        "us",
        "eu",
        "uk",
    }
)

_COINGECKO_BY_TICKER: dict[str, str] = {
    "BTC": "bitcoin",
    "ETH": "ethereum",
    "SOL": "solana",
    "BNB": "binancecoin",
    "XRP": "ripple",
    "ADA": "cardano",
    "AVAX": "avalanche",
    "DOT": "polkadot",
    "NEAR": "near",
    "SUI": "sui",
    "APT": "aptos",
    "ATOM": "cosmos",
    "TON": "the-open-network",
    "TRX": "tron",
    "LTC": "litecoin",
    "ARB": "arbitrum",
    "OP": "optimism",
    "MATIC": "matic-network",
    "POL": "matic-network",
    "STRK": "starknet",
    "TIA": "celestia",
    "LINK": "chainlink",
    "UNI": "uniswap",
    "AAVE": "aave",
    "CRV": "curve-dao-token",
    "JUP": "jupiter-exchange-solana",
    "ENA": "ethena",
    "GRT": "the-graph",
    "AR": "arweave",
    "FIL": "filecoin",
    "RENDER": "render-token",
    "FET": "fetch-ai",
    "TAO": "bittensor",
    "HNT": "helium",
    "ONDO": "ondo-finance",
    "DAI": "dai",
    "USDT": "tether",
    "USDC": "usd-coin",
}

_ASSET_ID_PREFIXES = (
    "cry_l1_",
    "cry_l2_",
    "cry_st_",
    "cry_df_",
    "cry_inst_",
    "stk_tech_",
    "stk_fin_",
    "stk_prox_",
)


def _node_type(node_id: str, sector: str) -> str:
    if any(node_id.startswith(p) for p in _ASSET_ID_PREFIXES):
        return "asset"
    sector_lower = sector.lower()
    if sector_lower.startswith("crypto_") and "sentiment" not in sector_lower:
        if sector_lower.startswith(("crypto_network", "crypto_exchanges", "crypto_derivatives")):
            return "theme"
        return "asset"
    if sector_lower.startswith("stocks_") and "indices" not in sector_lower:
        return "asset"
    return "theme"


def _keywords_from_label(label: str, sector: str, node_id: str) -> list[str]:
    words: list[str] = []

    for match in _TICKER_RE.finditer(label):
        words.append(match.group(1).lower())

    for token in re.findall(r"[a-z0-9]+", label.lower()):
        if len(token) >= 3 and token not in _STOPWORDS:
            words.append(token)

    for part in sector.lower().split("_"):
        if len(part) >= 3 and part not in _STOPWORDS:
            words.append(part)

    # Node id slug: cry_l1_01 → cry, l1 (skip numeric tail)
    id_parts = node_id.lower().split("_")
    for part in id_parts:
        if part.isdigit() or len(part) < 2:
            continue
        if part not in _STOPWORDS:
            words.append(part)

    seen: set[str] = set()
    out: list[str] = []
    for w in words:
        if w not in seen:
            seen.add(w)
            out.append(w)
    return out[:14]


def _coingecko_id(label: str, node_type: str) -> str | None:
    if node_type != "asset":
        return None
    for match in _TICKER_RE.finditer(label):
        ticker = match.group(1)
        if ticker in _COINGECKO_BY_TICKER:
            return _COINGECKO_BY_TICKER[ticker]
    return None


def convert_gemini_graph(raw: dict) -> dict:
    nodes_out = []
    for node in raw.get("nodes") or []:
        node_id = str(node["id"])
        label = str(node.get("label") or node_id)
        sector = str(node.get("sector") or "")
        node_type = _node_type(node_id, sector)
        nodes_out.append(
            {
                "id": node_id,
                "type": node_type,
                "label": label,
                "keywords": _keywords_from_label(label, sector, node_id),
                "coingecko_id": _coingecko_id(label, node_type),
                "sector": sector,
            }
        )

    edges_out = []
    for edge in raw.get("edges") or []:
        weight = float(edge.get("weight", 0))
        correlation = str(edge.get("correlation") or "").lower()
        if correlation == "negative" and weight > 0:
            weight = -weight
        elif correlation == "positive" and weight < 0:
            weight = abs(weight)

        edges_out.append(
            {
                "source": str(edge["source"]),
                "target": str(edge["target"]),
                "weight": round(weight, 4),
                "direction": "bi",
                "rationale": str(edge.get("mechanism") or edge.get("rationale") or ""),
            }
        )

    meta = raw.get("graph_metadata") or {}
    return {
        "graph_metadata": {
            "source": "gemini",
            "version": meta.get("version"),
            "total_nodes": len(nodes_out),
            "total_edges": len(edges_out),
            "weight_interpretation": meta.get("weight_interpretation"),
        },
        "nodes": nodes_out,
        "edges": edges_out,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="Convert Gemini macro graph to CoT correlation schema")
    parser.add_argument("input", type=Path, help="Gemini JSON input path")
    parser.add_argument(
        "output",
        type=Path,
        nargs="?",
        default=Path("data/correlation/gemini_macro_graph.json"),
        help="Output path (default: data/correlation/gemini_macro_graph.json)",
    )
    args = parser.parse_args()

    if not args.input.is_file():
        print(f"Input not found: {args.input}", file=sys.stderr)
        return 1

    raw = json.loads(args.input.read_text(encoding="utf-8"))
    converted = convert_gemini_graph(raw)

    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(converted, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")

    print(
        f"Wrote {converted['graph_metadata']['total_nodes']} nodes, "
        f"{converted['graph_metadata']['total_edges']} edges -> {args.output}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
