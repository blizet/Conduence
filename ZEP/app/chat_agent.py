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

from dataclasses import dataclass

from zep_cloud import Message
from zep_cloud.client import Zep

from config import Settings
from instructions import get_system_instructions
from llm import generate_reply

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

Use these ontology labels explicitly when helpful:
- User: personal identity details such as name, email, role, occupation.
- Preference: the user's market focus, interests, trading preferences, risk
  concerns, or recurring topic focus. Phrases like "Iranian war-based markets"
  are Preference when the user is describing what they trade or follow.
- Thing: tradable assets/instruments such as crude oil, gold, BTC, ETH,
  equities, forex, indices, or prediction-market contracts.
- Influencer: people, governments, central banks, OPEC, the Fed, Trump, or any
  actor whose actions/statements move markets. Do not use Person/Organization.
- Event: the real-world event itself, such as a war, election, sanctions, or an
  OPEC meeting. Do not label a user's "event-based market preference" as Event;
  label that as Preference.
- Company: companies such as Google, SpaceX, Apple.

Output format:
One to five short lines. Each line should start with an ontology label, for
example:
Preference: The user is interested in Iranian war-based prediction markets.
Influencer: Trump is an influencer for the user's market focus.
Thing: Crude oil is relevant to the user's Iranian market focus.
"""


def _build_prompt(user_id: str, context: str | None) -> str:
    instructions = get_system_instructions(user_id)
    return (
        _PROMPT_TEMPLATE
        .replace("__INSTRUCTIONS__", instructions)
        .replace("__CONTEXT__", context or "(no graph context yet)")
    )


def _refine_user_message_for_zep(settings: Settings, user_message: str) -> str | None:
    refined = generate_reply(
        settings,
        system_prompt=_ZEP_MEMORY_REFINEMENT_PROMPT,
        messages=[{"role": "user", "content": user_message}],
    ).strip()

    if not refined or refined.upper() == "NO_MEMORY":
        return None

    return refined


@dataclass
class ChatTurnResult:
    reply: str
    context_used: str | None


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
    memory_text = _refine_user_message_for_zep(settings, user_message)
    if memory_text:
        zep.thread.add_messages(
            thread_id=thread_id,
            messages=[Message(role="user", content=memory_text)],
        )

    context = get_context_block(zep, thread_id)
    system_prompt = _build_prompt(user_id, context)

    messages = conversation_history + [{"role": "user", "content": user_message}]

    reply_text = generate_reply(settings, system_prompt=system_prompt, messages=messages)

    return ChatTurnResult(reply=reply_text, context_used=context)
