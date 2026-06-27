"""
The actual chat agent loop: takes a user message, pulls relevant context
from that user's Zep graph (built up over all of their past sessions),
asks the configured LLM provider for a reply, then writes both messages
back to the Zep thread so the graph keeps growing.

This file has no I/O of its own (no print/input) so it can be reused by
the CLI, a future web server, etc. It's also provider-agnostic: which LLM
actually generates the reply (Anthropic / OpenAI / Gemini) is decided by
`settings.llm_provider` and handled in `app/llm.py`.
"""
from __future__ import annotations

import json
import logging
import re
from dataclasses import dataclass, field
from datetime import date
from typing import Any

from zep_cloud import Message
from zep_cloud.client import Zep

from config import Settings
from instructions import get_system_instructions
from intent import should_skip_zep_ingest
from llm import generate_reply
from market_tools import lookup_markets_for_user

logger = logging.getLogger(__name__)

# The core persona + graph-context block.  Domain instructions are injected at
# runtime from instructions.py so they stay in one place and always stay in sync.
_PROMPT_TEMPLATE = """\
You are a knowledgeable, candid trading-markets assistant. \
You discuss prediction markets, tradable assets (crypto, equities, commodities), \
the companies, events, and influencers that move them, and how all of that \
connects to this specific user's interests and sentiment.

Speak plainly and concretely. When the user expresses interest, sentiment, or \
a take on something tradable -- an asset, an event, a company, an influencer -- \
engage with the substance of it rather than just acknowledging it, so there's \
always real information for their evolving profile to be built from.

You are not a financial advisor and do not give individualized investment advice; \
you can discuss markets, mechanics, and the user's own stated views factually.

If the user shares personal details (name, email, role), confirm them briefly and \
continue the conversation naturally.

<domain_instructions>
__INSTRUCTIONS__
</domain_instructions>

<user_context>
__CONTEXT__
</user_context>
"""


_ZEP_MEMORY_REFINEMENT_PROMPT = """\
Rewrite a single raw user chat message into concise memory-ingestion text for
Zep. This text is the ONLY thing that will be sent to Zep for graph extraction.

Rules:
- Preserve only facts, preferences, sentiment, identity, and market beliefs the
  user actually stated.
- Do not answer the user.
- Do not add explanations, advice, background market knowledge, or inferred
  facts not present in the user's message.
- Normalize spelling/grammar and expand obvious abbreviations, but keep the
  meaning unchanged.
- If the message contains no durable user/profile/trading/market signal, output
  exactly: NO_MEMORY

okay Use these ontology entity labels explicitly when helpful:
- User: personal identity details such as name, email, role, occupation.
- Preference: stable beliefs, market focus, interests, trading preferences, risk
  concerns, or recurring topic focus. Phrases like "Iranian war-based markets"
  are Preference when the user describes what they trade or follow — not Event.
- GeoFactors: geopolitical or geographic locations that influence markets, such
  as Iran, Middle East, Strait of Hormuz, or European Union.
- Person: market participants, institutions, governments, central banks, OPEC,
  the Fed, Trump, Musk, Powell, or any actor whose actions move markets.
- Event: real-world catalysts such as wars, elections, sanctions, OPEC meetings,
  rate decisions, or earnings — not the user's preference toward them.
- EconomicActor: tradable assets and instruments such as crude oil, gold, BTC,
  ETH, Apple, USD, Polymarket contracts, or SpaceX stock.
- AiAgent: persistent AI capabilities the user wants or configures, such as a
  News Agent, Risk Analyzer, or Macro Analyst (include role/specialization if stated).
- Rule: procedural guardrails, entry/exit conditions, monitors, or risk policies
  the user defines (include condition/action if stated).

When describing relationships, name the edge type where useful:
INFLUENCES, CO_RELATES, STANCE, HAS_RULE, MONITORS, IMPLICATES.

Output format:
One to five short lines. Each line should start with an entity label, for example:
Preference: The user is interested in Iranian war-based prediction markets.
Person: Trump is a market actor the user wants to monitor.
EconomicActor: Crude oil is relevant to the user's Iranian market focus.
GeoFactors: Iran is a geo-factor in the user's market focus.
"""


_MEMORY_REVIEW_PROMPT = """\
You decide whether a refined user memory should be saved to a knowledge graph
immediately or confirmed with the user first.

Return ONLY valid JSON with this shape:
{
  "status": "new" | "duplicate" | "update" | "conflict",
  "reason": "short reason",
  "matches": ["short existing memory references that matter"]
}

Rules:
- status "new": no materially similar existing memory.
- status "duplicate": the new memory says substantially the same thing as an
  existing memory.
- status "update": the new memory changes, refreshes, dates, or supersedes an
  existing memory without a direct contradiction.
- status "conflict": the new memory contradicts existing sentiment, preference,
  identity, or temporal state.
- Prefer "new" if the existing memories are only loosely related background.
- Treat temporal language ("now", "today", "this week", "used to", "no longer",
  "changed my mind") as likely update/conflict when it references the same
  entity or preference.
"""


def _build_prompt(user_id: str, context: str | None) -> str:
    instructions = get_system_instructions(user_id)
    return (
        _PROMPT_TEMPLATE
        .replace("__INSTRUCTIONS__", instructions)
        .replace("__CONTEXT__", context or "(no graph context yet)")
    )


def _refine_user_message_for_zep(settings: Settings, user_message: str) -> str | None:
    system_prompt = (
        _ZEP_MEMORY_REFINEMENT_PROMPT
        + f"\nCurrent date for temporal claims: {date.today().isoformat()}."
    )
    refined = generate_reply(
        settings,
        system_prompt=system_prompt,
        messages=[{"role": "user", "content": user_message}],
    ).strip()

    if not refined or refined.upper() == "NO_MEMORY":
        return None

    return refined


@dataclass
class MemoryReview:
    memory_text: str | None
    needs_confirmation: bool = False
    status: str = "new"
    reason: str = ""
    matches: list[str] | None = None

    def to_dict(self) -> dict[str, Any]:
        return {
            "memory_text": self.memory_text,
            "needs_confirmation": self.needs_confirmation,
            "status": self.status,
            "reason": self.reason,
            "matches": self.matches or [],
        }


@dataclass
class ChatTurnResult:
    reply: str
    context_used: str | None
    memory_text: str | None = None
    memory_review: MemoryReview | None = None
    action: str | None = None
    markets: list[dict[str, Any]] = field(default_factory=list)
    ingested_to_zep: bool | None = None

    def to_api_dict(self) -> dict[str, Any]:
        payload: dict[str, Any] = {"reply": self.reply}
        if self.action:
            payload["action"] = self.action
        if self.action == "market_lookup":
            payload["markets"] = self.markets
            payload["ingested_to_zep"] = bool(self.ingested_to_zep)
        return payload


def _extract_json_object(text: str) -> dict[str, Any] | None:
    try:
        parsed = json.loads(text)
        return parsed if isinstance(parsed, dict) else None
    except json.JSONDecodeError:
        pass

    match = re.search(r"\{.*\}", text, flags=re.DOTALL)
    if not match:
        return None
    try:
        parsed = json.loads(match.group(0))
        return parsed if isinstance(parsed, dict) else None
    except json.JSONDecodeError:
        return None


def _format_node_match(node: Any) -> str:
    labels = ", ".join(getattr(node, "labels", None) or [])
    name = getattr(node, "name", "") or "(unnamed node)"
    summary = getattr(node, "summary", "") or ""
    return f"Node[{labels or 'Entity'}] {name}: {summary}".strip()


def _format_edge_match(edge: Any) -> str:
    name = getattr(edge, "name", "") or "RELATION"
    fact = getattr(edge, "fact", "") or ""
    return f"Edge[{name}] {fact}".strip()


def _search_existing_memory(zep: Zep, user_id: str, memory_text: str) -> list[str]:
    try:
        result = zep.graph.search(user_id=user_id, query=memory_text, limit=8)
    except Exception:  # noqa: BLE001 - memory review should not break chat
        return []

    matches: list[str] = []
    for node in getattr(result, "nodes", None) or []:
        formatted = _format_node_match(node)
        if formatted:
            matches.append(formatted)
    for edge in getattr(result, "edges", None) or []:
        formatted = _format_edge_match(edge)
        if formatted:
            matches.append(formatted)
    return matches[:8]


def _review_memory_candidate(
    settings: Settings,
    *,
    memory_text: str,
    existing_matches: list[str],
) -> MemoryReview:
    if not existing_matches:
        return MemoryReview(memory_text=memory_text)

    payload = {
        "candidate_memory": memory_text,
        "existing_memories": existing_matches,
    }
    response = generate_reply(
        settings,
        system_prompt=_MEMORY_REVIEW_PROMPT,
        messages=[{"role": "user", "content": json.dumps(payload, indent=2)}],
    )
    parsed = _extract_json_object(response) or {}
    status = str(parsed.get("status") or "new").lower()
    if status not in {"new", "duplicate", "update", "conflict"}:
        status = "new"

    matches_raw = parsed.get("matches")
    matches = [str(item) for item in matches_raw] if isinstance(matches_raw, list) else []
    reason = str(parsed.get("reason") or "")

    if status != "new" and not matches:
        matches = existing_matches[:3]

    return MemoryReview(
        memory_text=memory_text,
        needs_confirmation=status != "new",
        status=status,
        reason=reason,
        matches=matches[:5],
    )


def prepare_memory_review(
    *,
    zep: Zep,
    settings: Settings,
    user_id: str,
    user_message: str,
) -> MemoryReview:
    memory_text = _refine_user_message_for_zep(settings, user_message)
    if not memory_text:
        return MemoryReview(memory_text=None)

    existing_matches = _search_existing_memory(zep, user_id, memory_text)
    return _review_memory_candidate(
        settings,
        memory_text=memory_text,
        existing_matches=existing_matches,
    )


def save_memory_to_zep(zep: Zep, thread_id: str, memory_text: str) -> None:
    zep.thread.add_messages(
        thread_id=thread_id,
        messages=[Message(role="user", content=memory_text)],
    )


def persist_voice_turn_to_zep(
    *,
    zep: Zep,
    settings: Settings,
    thread_id: str,
    user_id: str,
    user_message: str,
) -> str | None:
    """Refine a voice transcript and write it to Zep (no UI confirmation step)."""
    if should_skip_zep_ingest(user_message):
        logger.info("voice zep ingest skipped (action query): %s", user_message[:80])
        return None

    review = prepare_memory_review(
        zep=zep,
        settings=settings,
        user_id=user_id,
        user_message=user_message,
    )
    if not review.memory_text:
        return None
    save_memory_to_zep(zep, thread_id, review.memory_text)
    logger.info("voice zep ingest saved thread=%s len=%d", thread_id, len(review.memory_text))
    return review.memory_text


async def run_market_lookup_turn(
    *,
    zep: Zep,
    thread_id: str,
    user_id: str,
    user_message: str,
    settings: Settings | None = None,
) -> ChatTurnResult:
    """Fetch live Polymarket markets from Zep preferences — no graph write."""
    lookup = await lookup_markets_for_user(zep, user_id, user_message, settings=settings)
    context = get_context_block(zep, thread_id)
    logger.info(
        "market_lookup turn user=%s markets=%d status=%s",
        user_id,
        len(lookup.markets),
        lookup.status,
    )
    return ChatTurnResult(
        reply=lookup.reply,
        context_used=context,
        memory_text=None,
        action="market_lookup",
        markets=lookup.to_market_dicts(),
        ingested_to_zep=False,
    )


def get_context_block(zep: Zep, thread_id: str) -> str | None:
    """Fetch the most relevant facts/entities from the user's whole graph,
    scoped to what's relevant given the recent thread messages."""
    response = zep.thread.get_user_context(thread_id=thread_id)
    return response.context


def run_turn(
    *,
    zep: Zep,
    settings: Settings,
    thread_id: str,
    user_id: str,
    user_message: str,
    conversation_history: list[dict[str, str]],
    memory_text: str | None = None,
    ingest_memory: bool = True,
) -> ChatTurnResult:
    """
    Runs one turn: refine the user's raw message into graph-ingestion text,
    write only that refined text to Zep, pull back the context Zep has built so
    far, ask the configured LLM for a reply, return it.

    The raw user message and assistant reply are intentionally NOT pushed to
    Zep. Only the cleaned memory text should drive graph extraction. Pushing the
    LLM reply would fold the assistant's general market commentary into the
    user's personal knowledge graph, duplicating and diluting the signal.

    `conversation_history` keeps the immediate back-and-forth in memory so
    the LLM has conversational context even before Zep's async extraction
    catches up with the latest message.
    """
    memory_review: MemoryReview | None = None
    if ingest_memory:
        if memory_text is None:
            memory_review = prepare_memory_review(
                zep=zep,
                settings=settings,
                user_id=user_id,
                user_message=user_message,
            )
            memory_text = memory_review.memory_text

        if memory_text:
            save_memory_to_zep(zep, thread_id, memory_text)

    context = get_context_block(zep, thread_id)
    system_prompt = _build_prompt(user_id, context)

    messages = conversation_history + [{"role": "user", "content": user_message}]

    reply_text = generate_reply(settings, system_prompt=system_prompt, messages=messages)

    return ChatTurnResult(
        reply=reply_text,
        context_used=context,
        memory_text=memory_text,
        memory_review=memory_review,
    )
