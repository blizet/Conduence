"""
Hardcoded domain instructions for the trading assistant.

Two levels — mirroring Zep's custom-instructions hierarchy:

  PROJECT_WIDE_INSTRUCTION   — applies to every user / graph in the project.
  USER_INSTRUCTIONS          — per-user overrides (keyed by user_id).

On free / Flex plans the Zep API will reject add_custom_instructions.
`push_to_zep()` (called from setup_instructions.py) tries the API and falls
back gracefully.  Either way the instructions are always embedded directly
into the LLM system prompt via `get_system_instructions()`, so they always
influence extraction indirectly through the assistant's phrasing.
"""
from __future__ import annotations

# ─── Project-wide ─────────────────────────────────────────────────────────────

PROJECT_WIDE_INSTRUCTION = """
This assistant operates in the retail trading and prediction-markets domain.
Extract and reason about the following concepts precisely:

ASSETS & INSTRUMENTS
- "market" or "markets" refers to a tradable asset, index, or prediction-market
  contract unless the user explicitly means a physical marketplace.
- Distinguish: Crypto (BTC, ETH, altcoins), Equities (stocks, indices),
  Commodities (crude oil, gold, silver, nat-gas), Forex (USD, IRR, etc.),
  and Prediction markets (Kalshi, Polymarket contracts).
- "crude" always means crude oil unless stated otherwise.
- "IRR" is the Iranian Rial; "IRR markets" means Iranian financial markets.

SENTIMENT & PROXIMITY
- Record explicit sentiment scores: bullish/long/like = positive, bearish/short/hate = negative.
- "proximity" on CO_RELATES edges should be -1 for inverse correlations
  (e.g. gold vs USD) and +1 for positive (e.g. crude oil vs Iranian equities).

INFLUENCERS & EVENTS
- Geopolitical actors (governments, central banks, OPEC, FED) are Influencer nodes.
- Sanctions, wars, elections, OPEC meetings are Event nodes.
- Connect them to affected assets via INFLUENCES edges.

TEMPORAL REASONING
- When a user says "now", "today", "this week" pin it to the current date.
- Record time-sensitive claims on the node's `time` attribute.
- Do NOT carry forward outdated sentiment; update existing nodes rather than
  creating duplicates when the user revises a view.

USER PROFILE
- The user is a retail trader. Capture their trading style, risk appetite,
  preferred assets, and specific market focus as Preference nodes.
- Link personal identifiers (name, email) to the User node immediately.
"""

# ─── Per-user overrides ───────────────────────────────────────────────────────

USER_INSTRUCTIONS: dict[str, str] = {
    "shared-user": """
This specific user (shared-user) is a retail trader focused on Iranian
prediction and commodity markets.  Apply these additional rules:

- Iranian market references imply both the Tehran Stock Exchange (TSE) and
  informal currency / gold markets.
- Crude oil price movements are HIGHLY_INFLUENCED_BY OPEC decisions, US
  sanctions, and geopolitical events in the Middle East — capture all three.
- Gold in an Iranian context is often held as a currency hedge (IRR
  devaluation); record this motivation on the edge fact.
- When the user shares personal info (name, email, occupation), update the
  User node immediately and confirm with a brief acknowledgment.
- Track the user's portfolio concerns (inflation hedge, FX risk, geopolitical
  exposure) as Preference nodes with sector = "Risk Management".
""",
}

# ─── Helpers ─────────────────────────────────────────────────────────────────


def get_system_instructions(user_id: str | None = None) -> str:
    """
    Return the instruction text to embed in the LLM system prompt.
    Combines the project-wide baseline with any per-user override.
    """
    base = PROJECT_WIDE_INSTRUCTION.strip()
    user_override = USER_INSTRUCTIONS.get(user_id or "", "").strip()
    if user_override:
        return f"{base}\n\nUSER-SPECIFIC CONTEXT\n{user_override}"
    return base


def push_to_zep(zep_client, user_id: str | None = None) -> dict:
    """
    Attempt to push instructions to the Zep API.
    Silently skips if the plan doesn't support it (free / Flex).
    Returns {"pushed": True/False, "reason": str}.
    """
    from zep_cloud import CustomInstruction

    results = {}

    # Project-wide
    try:
        zep_client.graph.add_custom_instructions(
            instructions=[
                CustomInstruction(
                    name="trading_project_wide",
                    text=PROJECT_WIDE_INSTRUCTION.strip(),
                )
            ]
        )
        results["project_wide"] = "pushed"
    except Exception as exc:  # noqa: BLE001
        msg = str(exc)
        if "Enterprise" in msg or "400" in msg:
            results["project_wide"] = "skipped (Enterprise plan required)"
        else:
            results["project_wide"] = f"error: {msg}"

    # User-specific
    if user_id and user_id in USER_INSTRUCTIONS:
        try:
            zep_client.graph.add_custom_instructions(
                user_ids=[user_id],
                instructions=[
                    CustomInstruction(
                        name=f"trading_user_{user_id}",
                        text=USER_INSTRUCTIONS[user_id].strip(),
                    )
                ],
            )
            results["user_specific"] = "pushed"
        except Exception as exc:  # noqa: BLE001
            msg = str(exc)
            if "Enterprise" in msg or "400" in msg:
                results["user_specific"] = "skipped (Enterprise plan required)"
            else:
                results["user_specific"] = f"error: {msg}"

    return results
