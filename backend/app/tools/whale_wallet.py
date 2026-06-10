import asyncio
import json
import os
import re
from pathlib import Path
from typing import Any

import httpx

from app.config import TOOL_FETCH_TIMEOUT_MS
from app.tools.endpoints import DATA

TIMEOUT = TOOL_FETCH_TIMEOUT_MS / 1000
TRADES_LIMIT = int(os.getenv("WHALE_TRADES_LIMIT", "100"))
MAX_WHALE_ENTRIES = int(os.getenv("WHALE_MAX_ENTRIES", "25"))
WHALE_FETCH_DELAY_MS = int(os.getenv("WHALE_FETCH_DELAY_MS", "800"))
WHALE_WALLETS_FILE = os.getenv("WHALE_WALLETS_FILE", "config/whale-wallets.json")

KEYWORD_ALIASES = {
    "BTC": ["btc", "bitcoin"],
    "ETH": ["eth", "ethereum"],
    "SOL": ["sol", "solana"],
    "XRP": ["xrp", "ripple"],
    "DOGE": ["doge", "dogecoin"],
    "IPO": ["ipo"],
    "ETF": ["etf"],
    "SEC": ["sec"],
    "AI": ["ai", "artificial intelligence"],
    "DEFI": ["defi"],
}

STOPWORDS = {
    "the", "a", "an", "and", "or", "to", "of", "in", "on", "at", "by", "for", "is",
    "will", "be", "as", "it", "its", "this", "that", "with", "from", "before", "after",
}


def _normalize_text(value: str) -> str:
    return re.sub(r"\s+", " ", re.sub(r"[^a-z0-9]+", " ", value.lower())).strip()


def _tokenize(text: str) -> set[str]:
    return {p for p in _normalize_text(text).split() if len(p) >= 2 and p not in STOPWORDS}


def _expand_news_keywords(keywords: list[str], headline: str | None = None) -> set[str]:
    expanded: set[str] = set()
    for kw in keywords:
        aliases = KEYWORD_ALIASES.get(kw.upper(), [_normalize_text(kw)])
        expanded.update(a for a in aliases if a)
    if headline:
        expanded.update(_tokenize(headline))
    return expanded


def _keyword_matches_text(text: str, keyword: str) -> bool:
    kw = keyword.lower()
    if len(kw) <= 3:
        return bool(re.search(rf"\b{re.escape(kw)}\b", text, re.I))
    return kw in _normalize_text(text) or kw in _tokenize(text)


def _score_trade_against_news(trade: dict[str, Any], keywords: list[str], headline: str | None) -> int:
    text = f"{trade.get('title', '')} {trade.get('slug', '')}"
    expanded = _expand_news_keywords(keywords, headline)
    score = 0
    for kw in expanded:
        if _keyword_matches_text(text, kw):
            score += 3 if len(kw) <= 3 else 2
    return score


def _market_matches_trade(market: dict[str, Any], trade: dict[str, Any]) -> bool:
    if market.get("conditionId") and trade.get("conditionId"):
        return market["conditionId"].lower() == trade["conditionId"].lower()
    if market.get("slug") and trade.get("slug"):
        return _normalize_text(market["slug"]) == _normalize_text(trade["slug"])
    m_title = _normalize_text(market.get("title", ""))
    t_title = _normalize_text(trade.get("title", ""))
    return bool(m_title) and (m_title == t_title or m_title in t_title or t_title in m_title)


def _market_ref_from_trade(trade: dict[str, Any]) -> dict[str, Any]:
    slug_part = re.sub(r"[^a-z0-9]+", "_", trade.get("slug", ""), flags=re.I)[:24].upper()
    return {
        "id": f"PM_{slug_part}",
        "venue": "polymarket",
        "title": trade.get("title", ""),
        "slug": trade.get("slug", ""),
        "conditionId": trade.get("conditionId", ""),
        "url": f"https://polymarket.com/event/{trade.get('slug', '')}",
    }


async def _fetch_wallet_trades(wallet: str, limit: int = TRADES_LIMIT) -> list[dict[str, Any]]:
    url = f"{DATA.trades}?user={wallet}&limit={limit}"
    try:
        async with httpx.AsyncClient(timeout=TIMEOUT) as client:
            res = await client.get(url)
            if res.status_code >= 400:
                return []
            body = res.json()
            return body if isinstance(body, list) else []
    except Exception:
        return []


def _resolve_whale_wallets_path() -> Path | None:
    repo_root = Path(__file__).resolve().parents[3]
    for candidate in (Path(WHALE_WALLETS_FILE), repo_root / WHALE_WALLETS_FILE):
        if candidate.exists():
            return candidate
    return None


def load_whale_wallets() -> list[dict[str, Any]]:
    path = _resolve_whale_wallets_path()
    if not path:
        return []
    raw = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(raw, list):
        raise ValueError(f"{path}: expected JSON array of whale wallets")
    return raw


class WhaleWalletTool:
    def __init__(self, wallets: list[dict[str, Any]] | None = None) -> None:
        self._wallets_override = wallets
        self._last_seen_tx: dict[str, set[str]] = {}

    def _resolve_wallets(self) -> list[dict[str, Any]]:
        return self._wallets_override if self._wallets_override is not None else load_whale_wallets()

    async def track(self, request: dict[str, Any]) -> dict[str, Any]:
        wallets = self._resolve_wallets()
        markets = request.get("polymarketMarkets") or []
        keywords = request.get("keywords") or []
        headline = request.get("headline")
        entries: list[dict[str, Any]] = []
        total_trades = 0

        trade_batches = []
        for wallet in wallets:
            trades = await _fetch_wallet_trades(wallet["proxyWallet"])
            trade_batches.append({"wallet": wallet, "trades": trades})
            if WHALE_FETCH_DELAY_MS > 0:
                await asyncio.sleep(WHALE_FETCH_DELAY_MS / 1000)

        for batch in trade_batches:
            wallet = batch["wallet"]
            trades = batch["trades"]
            total_trades += len(trades)
            seen = self._last_seen_tx.get(wallet["proxyWallet"], set())
            cycle_seen: set[str] = set()

            for trade in trades:
                tx_key = trade.get("transactionHash", "")
                cycle_seen.add(tx_key)
                if tx_key in seen:
                    continue
                matched_market = next((m for m in markets if _market_matches_trade(m, trade)), None)
                news_score = (
                    0
                    if matched_market
                    else _score_trade_against_news(trade, keywords, headline)
                    if keywords or headline
                    else 0
                )
                if not matched_market and news_score < 2:
                    continue
                if len(entries) >= MAX_WHALE_ENTRIES:
                    break
                entries.append(
                    {
                        "wallet": wallet["proxyWallet"],
                        "pseudonym": trade.get("pseudonym") or wallet.get("pseudonym", ""),
                        "name": trade.get("name") or wallet.get("name", ""),
                        "market": matched_market or _market_ref_from_trade(trade),
                        "side": trade.get("side", "BUY"),
                        "outcome": trade.get("outcome", ""),
                        "size": trade.get("size", 0),
                        "price": trade.get("price", 0),
                        "timestamp": trade.get("timestamp", 0),
                        "transactionHash": tx_key,
                    }
                )
            self._last_seen_tx[wallet["proxyWallet"]] = cycle_seen
            if len(entries) >= MAX_WHALE_ENTRIES:
                break

        return {"entries": entries}


whale_wallet_tool = WhaleWalletTool()


async def track_whale_wallets_by_address(request: dict[str, Any]) -> dict[str, Any]:
    entries: list[dict[str, Any]] = []
    wallets = [w.strip() for w in (request.get("walletAddresses") or []) if w.strip()]
    condition_id = request.get("conditionId")
    api_key = request.get("apiKey")

    for wallet in wallets:
        if condition_id:
            url = f"{DATA.recent_trades(condition_id)}&user={wallet}"
            try:
                headers = {"Authorization": f"Bearer {api_key}"} if api_key else None
                async with httpx.AsyncClient(timeout=TIMEOUT) as client:
                    res = await client.get(url, headers=headers)
                    if res.status_code < 400:
                        trades = res.json()
                        if isinstance(trades, list) and trades:
                            t = trades[0]
                            entries.append(
                                {
                                    "wallet": wallet,
                                    "pseudonym": str(t.get("pseudonym", "")),
                                    "name": str(t.get("name", wallet)),
                                    "market": {
                                        "id": str(t.get("conditionId", "unknown")),
                                        "venue": "polymarket",
                                        "title": str(t.get("title", "")),
                                        "slug": str(t.get("slug", "")),
                                        "conditionId": str(t.get("conditionId", "")),
                                    },
                                    "side": t.get("side", "BUY"),
                                    "outcome": str(t.get("outcome", "")),
                                    "size": float(t.get("size", 0)),
                                    "price": float(t.get("price", 0)),
                                    "timestamp": int(t.get("timestamp", 0)),
                                    "transactionHash": str(t.get("transactionHash", "")),
                                }
                            )
                            continue
            except Exception:
                pass
        entries.append(
            {
                "wallet": wallet,
                "pseudonym": "",
                "name": wallet,
                "market": {"id": "unknown", "venue": "polymarket", "title": ""},
                "side": "BUY",
                "outcome": "",
                "size": 0,
                "price": 0,
                "timestamp": 0,
                "transactionHash": "",
            }
        )
    return {"entries": entries}


async def track_whale_wallets(request: dict[str, Any]) -> dict[str, Any]:
    if request.get("walletAddresses"):
        return await track_whale_wallets_by_address(request)
    return await whale_wallet_tool.track(request)
