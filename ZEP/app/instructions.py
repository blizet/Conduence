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
Extract and reason about the following ontology precisely:

ENTITY TYPES
- Preference: stable beliefs, convictions, market focus, asset preferences,
  signal preferences, and recurring decision tendencies. Use category (Market,
  Asset, IPL, Election) and sector (Crypto, Politics, Economics, Sports,
  Commodities) when applicable. Do NOT use for temporary positions or events.
- GeoFactors: geopolitical, geographic, or strategic locations that influence
  markets (Iran, Middle East, Strait of Hormuz, Red Sea, EU, BRICS, etc.).
- Person: market participants, institutions, governments, central banks, OPEC,
  the Fed, Trump, Musk, Powell, or sports teams whose actions move markets.
- Event: real-world catalysts — wars, elections, sanctions, OPEC meetings, rate
  decisions, earnings. Use for what is happening, not the user's preference.
- EconomicActor: tradable assets and instruments — BTC, ETH, crude oil, gold,
  Apple, USD, Polymarket contracts, indices, ETFs, protocols, or companies.
- AiAgent: persistent AI capabilities (News Agent, Risk Analyzer, Orchestrator).
  Capture role, specialization, objective, workflow, market_scope, autonomy_level,
  and status when the user describes them.
- Rule: procedural memory — entry/exit conditions, monitors, risk policies,
  guardrails. Capture rule_type, condition, action, scope, and priority.

ASSETS & INSTRUMENTS
- "market" or "markets" refers to a tradable asset, index, or prediction-market
  contract unless the user explicitly means a physical marketplace.
- Distinguish: Crypto (BTC, ETH), Equities, Commodities (crude, gold, nat-gas),
  Forex (USD, IRR), and Prediction markets (Kalshi, Polymarket).
- "crude" always means crude oil unless stated otherwise.
- "IRR" is the Iranian Rial; "IRR markets" means Iranian financial markets.

EDGE TYPES
- INFLUENCES: causal influence (Person/Event/GeoFactors → EconomicActor or Event).
  Set proximity from -1 (opposing) to +1 (reinforcing).
- CO_RELATES: correlation or co-movement between two market-relevant entities.
  Set proximity -1 for inverse (e.g. gold vs USD), +1 for positive correlation.
- STANCE: trust, avoidance, prioritization, or monitoring between entities.
  Set stance (trust, avoid, think, assume, prioritize, monitor) and proximity.
- HAS_RULE: an AiAgent or entity has a Rule attached.
- MONITORS: an AiAgent monitors an Event, GeoFactors, EconomicActor, or Person.
- IMPLICATES: a Rule or guideline implied by an Event or condition (proximity 0–1).

TEMPORAL REASONING
- When a user says "now", "today", "this week" pin it to the current date.
- Do NOT carry forward outdated sentiment; update existing nodes rather than
  creating duplicates when the user revises a view.

USER PROFILE
- The user is a retail trader. Capture trading style, risk appetite, preferred
  assets, and market focus as Preference nodes.
- Link personal identifiers (name, email) to the User node immediately.
"""

# ─── Per-user overrides ───────────────────────────────────────────────────────

USER_INSTRUCTIONS: dict[str, str] = {
    "shared-user": """
This specific user (shared-user) is a retail trader focused on Iranian
prediction and commodity markets.  Apply these additional rules:

- Iranian market references imply GeoFactors (Iran, Middle East) and both the
  Tehran Stock Exchange and informal currency / gold markets as EconomicActors.
- Crude oil (EconomicActor) is INFLUENCED by OPEC (Person), US sanctions
  (Event), and Middle East GeoFactors — capture all three with INFLUENCES edges.
- Gold in an Iranian context is often held as a currency hedge (IRR
  devaluation); record this motivation on the CO_RELATES or INFLUENCES edge fact.
- When the user mentions monitoring Trump, tweets, or geopolitical actors, use
  Person nodes and MONITORS edges if they configure an AiAgent to watch them.
- When the user shares personal info (name, email, occupation), update the
  User node immediately and confirm with a brief acknowledgment.
- Track portfolio concerns (inflation hedge, FX risk, geopolitical exposure) as
  Preference nodes with sector = "Risk Management".
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
