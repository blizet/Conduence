"""Risk analyzer sub-agent — position sizing from user trade + risk parameters.

Standalone template: user fills trade proposal and risk limits in the inspector.
Deterministic sizing mirrors orchestrator DecisionEngine; optional wired tools
(polymarketGamma, polymarketWallet, kalshi) enrich liquidity and exposure.

Canvas/registry: wired via app.subagents.registry

Event contract:
{
  "type": "risk", "agent": "riskAnalyzer", "action": "BUY_YES"|"BUY_NO"|"HOLD",
  "venue": "polymarket"|"kalshi", "market_id": str, "market": str,
  "tokenId": str, "ticker": str, "confidence": float, "price": float,
  "size_usd": float, "size": float, "count": int, "max_size_usd": float,
  "gates": [str], "gates_failed": [str], "thesis": str, "summary": str,
  "evidence": [str], "ts": iso8601
}
"""

from __future__ import annotations

import argparse
import asyncio
import json
import os
import sys
from datetime import datetime, timezone
from typing import Any, AsyncIterator

from app.subagents.tool_loop import RISK_TOOLS, fetch_risk_context_from_tools

RISK_POLL_INTERVAL_MS = int(os.getenv("RISK_POLL_INTERVAL_MS", "30000"))
RISK_SIMULATE_INTERVAL_MS = int(os.getenv("RISK_SIMULATE_INTERVAL_MS", "8000"))

ENTRY_MIN = 0.05
ENTRY_MAX = 0.92
MIN_MARKET_QUALITY = 0.30

SIMULATED_MARKET = {
    "question": "Will Bitcoin exceed $100,000 by end of 2026?",
    "slug": "btc-100k-2026",
    "liquidity": 85_000.0,
    "volume24hr": 120_000.0,
    "spread": 0.03,
    "quality": 0.72,
    "bestBid": 0.58,
    "bestAsk": 0.62,
    "outcomePrices": [0.62, 0.38],
}


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _resolve_subagent_config(config: dict[str, Any]) -> dict[str, Any]:
    if config.get("execution_tools") is not None:
        return config
    wc = config.get("workflow_context") or {}
    entry = (wc.get("subagent_registry") or {}).get("riskAnalyzer") or {}
    if entry:
        return {**entry, **{k: v for k, v in config.items() if k not in entry}}
    return config


def _float(value: Any, default: float) -> float:
    try:
        if value is None or value == "":
            return default
        return float(value)
    except (TypeError, ValueError):
        return default


def _parse_risk_config(config: dict[str, Any]) -> dict[str, Any]:
    return {
        "portfolio_usd": _float(config.get("portfolioUsd"), 10_000.0),
        "risk_pct_min": _float(config.get("riskPctMin"), 0.02),
        "risk_pct_max": _float(config.get("riskPctMax"), 0.05),
        "max_liquidity_fraction": _float(config.get("maxLiquidityFraction"), 0.05),
        "min_confidence": _float(config.get("minConfidence"), 0.55),
        "max_open_risk_usd": _float(config.get("maxOpenRiskUsd"), 0.0),
        "trade_action": str(config.get("tradeAction") or "BUY_YES").strip().upper(),
        "trade_market_id": str(config.get("tradeMarketId") or "").strip(),
        "trade_title": str(config.get("tradeTitle") or "").strip(),
        "trade_confidence": _float(config.get("tradeConfidence"), 0.65),
        "trade_price": _float(config.get("tradePrice"), 0.0),
        "trade_venue": str(config.get("tradeVenue") or "polymarket").strip().lower(),
        "user_prompt": str(config.get("userPrompt") or "").strip(),
    }


def _position_size(
    confidence: float,
    *,
    portfolio_usd: float,
    min_confidence: float,
    risk_pct_min: float,
    risk_pct_max: float,
    liquidity: float,
    max_liquidity_fraction: float,
) -> float:
    conviction = (confidence - min_confidence) / max(1e-9, 1.0 - min_confidence)
    pct = risk_pct_min + (risk_pct_max - risk_pct_min) * max(0.0, min(1.0, conviction))
    by_portfolio = portfolio_usd * pct
    by_liquidity = liquidity * max_liquidity_fraction
    return round(min(by_portfolio, by_liquidity), 0)


def _entry_price(market: dict[str, Any], action: str) -> float | None:
    bid, ask = market.get("bestBid"), market.get("bestAsk")
    buy_yes = "YES" in action
    if bid and ask:
        return ask if buy_yes else round(1.0 - bid, 4)
    prices = market.get("outcomePrices") or []
    if len(prices) >= 2:
        return float(prices[0]) if buy_yes else float(prices[1])
    return None


async def analyze_trade(
    risk_cfg: dict[str, Any],
    execution_tools: list[str],
    tool_configs: dict[str, dict[str, Any]],
    *,
    simulate: bool = False,
) -> dict[str, Any]:
    action = risk_cfg["trade_action"]
    confidence = max(0.0, min(1.0, risk_cfg["trade_confidence"]))
    venue = risk_cfg["trade_venue"]
    market_id = risk_cfg["trade_market_id"]
    title = risk_cfg["trade_title"] or market_id or "Unknown market"
    evidence: list[str] = []
    gates: list[str] = []
    gates_failed: list[str] = []

    if action == "HOLD":
        return _hold_signal(title, market_id, venue, "User configured HOLD", evidence)

    if confidence < risk_cfg["min_confidence"]:
        gates_failed.append("confidence_below_min")
        evidence.append(
            f"Confidence {confidence:.2f} below minimum {risk_cfg['min_confidence']:.2f}"
        )
        return _hold_signal(title, market_id, venue, "Confidence gate failed", evidence, gates_failed)

    if simulate:
        market = dict(SIMULATED_MARKET)
        open_exposure = 1_200.0
        evidence.append("Simulated market liquidity $85,000 · open exposure $1,200")
    else:
        context = await fetch_risk_context_from_tools(
            execution_tools,
            tool_configs,
            market_id=market_id,
            keywords=risk_cfg["trade_title"],
            venue=venue,
        )
        market = context.get("market") or {}
        open_exposure = float(context.get("open_exposure_usd") or 0.0)
        if market:
            evidence.extend(context.get("evidence") or [])
        elif risk_cfg["trade_price"] <= 0:
            gates_failed.append("no_market_data")
            evidence.append("No live market data — set trade price or wire polymarketGamma / kalshi")
            return _hold_signal(title, market_id, venue, "Missing market context", evidence, gates_failed)

    price = risk_cfg["trade_price"]
    if price <= 0 and market:
        entry = _entry_price(market, action)
        if entry is not None:
            price = entry
            evidence.append(f"Entry price from market: {price:.4f}")

    if price <= 0 or not (ENTRY_MIN <= price <= ENTRY_MAX):
        gates_failed.append("price_out_of_range")
        evidence.append(f"Price {price:.4f} outside allowed range [{ENTRY_MIN}, {ENTRY_MAX}]")
        return _hold_signal(title, market_id, venue, "Price gate failed", evidence, gates_failed)

    liquidity = float(market.get("liquidity") or 0.0) if market else 50_000.0
    quality = float(market.get("quality") or 0.5) if market else 0.5
    if market and quality < MIN_MARKET_QUALITY:
        gates_failed.append("market_quality_low")
        evidence.append(f"Market quality {quality:.2f} below minimum {MIN_MARKET_QUALITY}")
        return _hold_signal(title, market_id, venue, "Market quality gate failed", evidence, gates_failed)

    gates.append("confidence_ok")
    gates.append("price_ok")
    if market:
        gates.append("liquidity_ok")

    size_usd = _position_size(
        confidence,
        portfolio_usd=risk_cfg["portfolio_usd"],
        min_confidence=risk_cfg["min_confidence"],
        risk_pct_min=risk_cfg["risk_pct_min"],
        risk_pct_max=risk_cfg["risk_pct_max"],
        liquidity=liquidity if liquidity > 0 else risk_cfg["portfolio_usd"],
        max_liquidity_fraction=risk_cfg["max_liquidity_fraction"],
    )

    max_open = risk_cfg["max_open_risk_usd"]
    if max_open > 0:
        headroom = max(0.0, max_open - open_exposure)
        if headroom <= 0:
            gates_failed.append("max_open_risk_exceeded")
            evidence.append(f"Open exposure ${open_exposure:,.0f} at max ${max_open:,.0f}")
            return _hold_signal(title, market_id, venue, "Portfolio risk cap reached", evidence, gates_failed)
        if size_usd > headroom:
            size_usd = round(headroom, 0)
            evidence.append(f"Capped size to ${size_usd:,.0f} portfolio headroom")
        gates.append("portfolio_headroom")

    if size_usd <= 0:
        gates_failed.append("zero_size")
        return _hold_signal(title, market_id, venue, "Computed size is zero", evidence, gates_failed)

    count = max(1, int(size_usd / price)) if price > 0 else 0
    side_label = "YES" if "YES" in action else "NO"
    thesis_parts = [
        f"Risk-adjusted {action} on {title[:80]}",
        f"Confidence {confidence:.0%} → ${size_usd:,.0f} ({count} contracts @ {price:.2f})",
    ]
    if risk_cfg["user_prompt"]:
        thesis_parts.append(f"Strategy: {risk_cfg['user_prompt'][:120]}")
    thesis = " | ".join(thesis_parts)
    summary = f"{action} ${size_usd:,.0f} @ {price:.2f} — {count} contracts"

    token_id = market.get("tokenId") or market.get("token_id") or market_id
    ticker = market.get("ticker") or market_id

    return {
        "type": "risk",
        "agent": "riskAnalyzer",
        "action": action,
        "venue": venue,
        "market_id": market_id or market.get("slug") or ticker,
        "market": market.get("question") or title,
        "tokenId": token_id if venue == "polymarket" else "",
        "ticker": ticker if venue == "kalshi" else "",
        "confidence": round(confidence, 3),
        "price": round(price, 4),
        "size_usd": size_usd,
        "size": count,
        "count": count,
        "max_size_usd": size_usd,
        "liquidity": liquidity,
        "open_exposure_usd": open_exposure,
        "gates": gates,
        "gates_failed": gates_failed,
        "thesis": thesis,
        "summary": summary,
        "evidence": evidence,
        "ts": _now_iso(),
    }


def _hold_signal(
    title: str,
    market_id: str,
    venue: str,
    reason: str,
    evidence: list[str] | None = None,
    gates_failed: list[str] | None = None,
) -> dict[str, Any]:
    return {
        "type": "risk",
        "agent": "riskAnalyzer",
        "action": "HOLD",
        "venue": venue,
        "market_id": market_id or "NONE",
        "market": title,
        "confidence": 0.0,
        "price": 0.0,
        "size_usd": 0.0,
        "size": 0,
        "count": 0,
        "gates": [],
        "gates_failed": gates_failed or ["hold"],
        "thesis": reason,
        "summary": f"HOLD — {reason}",
        "evidence": evidence or [],
        "ts": _now_iso(),
    }


class RiskAnalyzerAgent:
    def __init__(self, poll_ms: int = RISK_POLL_INTERVAL_MS) -> None:
        self.poll_ms = poll_ms
        self._last_summary: str | None = None

    async def stream_risk_signals(
        self,
        risk_cfg: dict[str, Any],
        execution_tools: list[str],
        tool_configs: dict[str, dict[str, Any]],
        *,
        simulate: bool = False,
    ) -> AsyncIterator[dict[str, Any]]:
        interval_ms = RISK_SIMULATE_INTERVAL_MS if simulate else self.poll_ms
        while True:
            try:
                signal = await analyze_trade(
                    risk_cfg,
                    execution_tools,
                    tool_configs,
                    simulate=simulate,
                )
                summary = signal.get("summary") or ""
                if summary != self._last_summary or simulate:
                    self._last_summary = summary
                    yield signal
            except Exception as exc:
                print(f"[riskAnalyzer] analyze failed: {exc}", file=sys.stderr)
            await asyncio.sleep(interval_ms / 1000)


risk_analyzer = RiskAnalyzerAgent()


async def stream_risk_signals(config: dict[str, Any]) -> AsyncIterator[dict[str, Any]]:
    cfg = _resolve_subagent_config(config)
    risk_cfg = _parse_risk_config(cfg)
    simulate = bool(cfg.get("simulate"))
    execution_tools = list(cfg.get("execution_tools") or [])
    tool_configs = dict(cfg.get("tool_configs") or {})

    if not simulate and not risk_cfg["trade_market_id"] and not risk_cfg["trade_title"]:
        raise ValueError(
            "Risk Analyzer requires a trade market ID or title in the inspector."
        )

    async for signal in risk_analyzer.stream_risk_signals(
        risk_cfg,
        execution_tools,
        tool_configs,
        simulate=simulate,
    ):
        yield signal


async def validate_risk_config(config: dict[str, Any]) -> None:
    cfg = _resolve_subagent_config(config)
    risk_cfg = _parse_risk_config(cfg)
    if cfg.get("simulate"):
        return
    if not risk_cfg["trade_market_id"] and not risk_cfg["trade_title"]:
        raise ValueError(
            "Set trade market ID or title on the Risk Analyzer node."
        )
    if risk_cfg["trade_price"] <= 0:
        tools = set(cfg.get("execution_tools") or [])
        if not tools.intersection(RISK_TOOLS):
            raise ValueError(
                "Set trade price or wire polymarketGamma / kalshi / polymarketWallet for live quotes."
            )


async def _run_cli(simulate: bool) -> None:
    config = {
        "portfolioUsd": os.getenv("RISK_PORTFOLIO_USD", "10000"),
        "tradeAction": "BUY_YES",
        "tradeMarketId": "btc-100k-2026",
        "tradeTitle": "Bitcoin 100k",
        "tradeConfidence": "0.72",
        "tradePrice": "0.62",
        "tradeVenue": "polymarket",
        "execution_tools": [],
        "tool_configs": {},
        "simulate": simulate,
    }
    async for signal in stream_risk_signals(config):
        print(json.dumps(signal), flush=True)


def main() -> None:
    parser = argparse.ArgumentParser(description="Risk analyzer sub-agent (riskAnalyzer)")
    parser.add_argument("--simulate", action="store_true")
    args = parser.parse_args()
    asyncio.run(_run_cli(args.simulate))


if __name__ == "__main__":
    main()
