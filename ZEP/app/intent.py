"""Deterministic intent classification for chat/voice turns (no LLM)."""
from __future__ import annotations

import re
from enum import Enum

_MARKET_LOOKUP_PATTERNS = (
    # Direct show/list/find/fetch + markets (with words in between)
    r"\bshow\s+me\b.{0,40}\bmarkets?\b",
    r"\blist\b.{0,30}\bmarkets?\b",
    r"\bfetch\b.{0,30}\bmarkets?\b",
    r"\bfind\b.{0,30}\bmarkets?\b",
    r"\bget\b.{0,30}\bmarkets?\b",
    r"\bpull\b.{0,30}\bmarkets?\b",
    # Markets + relation phrases
    r"\bmarkets?\s+related\s+to\b",
    r"\bmarkets?\s+for\s+my\b",
    r"\bmarkets?\s+matching\b",
    r"\bmarkets?\s+on\s+polymarket\b",
    r"\bmarkets?\s+from\s+poly\b",
    # Polymarket specific
    r"\bpolymarket\b.{0,40}\bmarkets?\b",
    r"\blist\s+polymarket\b",
    r"\bsearch\s+polymarket\b",
    r"\bpolymarket\s+for\b",
    r"\bfetch.{0,20}\bpoly\b",
    r"\bfrom\s+poly\b",
    r"\bon\s+polymarket\b",
    # What's trading
    r"\bwhat(?:'s|s)\s+trading\b",
    # "I want to see" + markets
    r"\bi\s+want\s+to\s+see\b.{0,40}\bmarkets?\b",
    # "show me" + anything + "polymarket"
    r"\bshow\s+me\b.{0,60}\bpolymarket\b",
    # Capability references ("you can fetch it from poly")
    r"\bcapabilit\w*\b.{0,60}\bmarket\b",
    # Question-style requests ("are there markets", "what markets")
    r"\bare\s+there\b.{0,40}\bmarkets?\b",
    r"\bwhat\s+markets?\b",
    r"\bany\s+markets?\b",
    r"\bmarkets?\s+available\b",
    # "not fetching" / "not showing" complaints about Polymarket
    r"\bnot\s+fetching\b.{0,40}\bpolymarket\b",
    r"\bnot\s+showing\b.{0,40}\bmarkets?\b",
    # "show" standalone + markets in same short phrase
    r"\bshow\s+markets?\b",
    r"\bshow\b.{0,60}\bmarkets?\b",
    r"\bwhat\b.{0,60}\bmarkets?\b",
    # "so fetch/show/get" variants
    r"\bso\s+(?:fetch|show|get|find|pull|list)\b.{0,30}\bmarkets?\b",
    # Discovery/recommendation language
    r"\btrending\s+markets?\b",
    r"\bmost\s+active\s+markets?\b",
    r"\bhigh[-\s]?volume\s+markets?\b",
    r"\bnewly\s+created\s+markets?\b",
    r"\bmarkets?\s+(?:closing|ending)\b",
    r"\bbiggest\s+movers\b",
    r"\bmost\s+liquid\s+markets?\b",
    r"\bpeople\s+trading\b",
    r"\brecommend\b.{0,40}\bmarkets?\b",
    r"\bwhich\s+markets?\b.{0,40}\bmonitor\b",
    r"\bopportunit(?:y|ies)\b",
    # Specific event phrasing that implies market lookup even without "market"
    r"\bwill\b.{0,80}\b(?:win|hit|reach|qualify|close|cut|announce|fall)\b",
    r"\bwhat\b.{0,40}\b(?:matches|trades|opportunities)\b",
    r"\bmatches?\s+(?:available|today|trending)\b",
    r"\bshow\b.{0,60}\bmatches?\b",
)

_COMPILED = tuple(re.compile(p, re.IGNORECASE | re.DOTALL) for p in _MARKET_LOOKUP_PATTERNS)

_MARKET_SURFACE_TERMS = (
    "market",
    "markets",
    "polymarket",
    "prediction",
    "predictions",
    "odds",
    "trading volume",
    "liquidity",
    "probability",
    "underdog",
    "yes above",
    "expiring",
    "closing today",
    "ending today",
    "ending this week",
)


class TurnIntent(str, Enum):
    MARKET_LOOKUP = "market_lookup"
    MEMORY = "memory"
    CHITCHAT = "chitchat"


def is_market_lookup(message: str) -> bool:
    """True when the user is asking for a live market listing, not stating a preference."""
    text = (message or "").strip()
    if not text:
        return False
    return any(p.search(text) for p in _COMPILED)


def classify_intent(message: str) -> TurnIntent:
    if should_route_market_lookup(message):
        return TurnIntent.MARKET_LOOKUP
    return TurnIntent.MEMORY


def should_route_market_lookup(message: str) -> bool:
    """Broad routing gate for market tools.

    This only decides whether to call the candidate-first market retriever. It
    does not choose markets or filter results; that happens after fetching
    Polymarket candidates.
    """
    text = (message or "").strip().lower()
    if not text:
        return False
    if is_market_lookup(text):
        return True
    return any(term in text for term in _MARKET_SURFACE_TERMS)


def should_skip_zep_ingest(message: str) -> bool:
    """Ephemeral action queries must not be refined into Zep graph memory."""
    return should_route_market_lookup(message)
