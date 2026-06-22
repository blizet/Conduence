"""
Zep graph ontology for the trading assistant.

This module is the single source of truth for the shape of the graph:
- Entity types: the kinds of "nodes" Zep will extract from conversation.
- Edge types: the kinds of typed, attributed relationships between those
  nodes (and the User node, which Zep provides by default).

Run `python setup_ontology.py` after changing anything in this file
to push the new ontology to your Zep project. `set_ontology` REPLACES the
existing ontology wholesale, so this file should always reflect the full,
current schema -- not a diff.

Edges
-----
Per the source diagram, there are three edge types, each carrying a
`proximity` float in the range -1 (strongly opposed / unrelated) to
1 (strongly aligned / closely related):

  INFLUENCES   -- an Influencer moving/affecting a market-relevant thing
  INTERESTED   -- a User's interest in a thing/topic
  CO_RELATES   -- two market-relevant things moving together (or inversely)
"""
from __future__ import annotations

from pydantic import Field
from zep_cloud import EntityEdgeSourceTarget
from zep_cloud.external_clients.ontology import (
    EdgeModel,
    EntityFloat,
    EntityModel,
    EntityText,
)


# ---------------------------------------------------------------------------
# Entity types
# ---------------------------------------------------------------------------


class User(EntityModel):
    """
    Represents a trader/user whose prediction-market behavior we model.
    """

    first_name: EntityText = Field(description="The user's first name", default=None)
    last_name: EntityText = Field(description="The user's last name", default=None)
    occupation: EntityText = Field(
        description="The user's occupation or profession, for example: software engineer, trader, analyst, etc.",
        default=None,
    )
    status: EntityText = Field(
        description="The user's current status, for example: active, inactive, onboarding, suspended, etc.",
        default=None,
    )
    email: EntityText = Field(description="The user's email address", default=None)


class Preference(EntityModel):
    """
    Represents a user's market focus, trading preference, recurring topic
    interest, or risk concern. If the user says they trade or follow
    "war-based markets", "Iranian markets", or "oil-sensitive markets", model
    that as a Preference rather than as the underlying Event itself.
    """

    category: EntityText = Field(
        description="The category of the preference, for example: Asset, Event-Based Market, Sports, Politics, Commodity, Risk Management, etc.",
        default=None,
    )
    sector: EntityText = Field(
        description="The sector the preference belongs to, for example: Crypto, Cricket, Indian_Congress_party, Crude_Oil etc.",
        default=None,
    )


class Thing(EntityModel):
    """
    Represents a tradable thing or asset in a prediction market, for
    example: ETH, SpaceX stock, Gold, Crude oil.
    """

    user_sentiment: EntityFloat = Field(
        description="The user's sentiment toward this thing, ranging from -1 (very negative) to 1 (very positive)",
        default=None,
    )
    time: EntityText = Field(
        description="The time horizon or relevant time period for this thing, for example: Dec, Q1, 2026, etc.",
        default=None,
    )
    sector: EntityText = Field(
        description="The sector this thing belongs to, for example: Crypto, Commodities, Tech, etc.",
        default=None,
    )


class Influencer(EntityModel):
    """
    Represents an influential person or entity whose actions or statements
    can move a prediction market, for example: Trump, an Indian cricket
    team, OPEC, the Fed, or a government. Use this instead of generic Person or
    Organization labels.
    """

    job: EntityText = Field(
        description="The role or job of the influencer, for example: US President, Cricket team, CEO, etc.",
        default=None,
    )
    sector: EntityText = Field(
        description="The sector the influencer operates in, for example: Politics, Sports, Tech, etc.",
        default=None,
    )
    user_sentiment: EntityFloat = Field(
        description="The user's sentiment toward this influencer, ranging from -1 (very negative) to 1 (very positive)",
        default=None,
    )


class Event(EntityModel):
    """
    Represents the real-world event itself, for example: IPL, India elections,
    Iran-US war, sanctions, or an OPEC meeting. Do not use Event when the user
    is describing their preference for an event-based market; use Preference
    for that.
    """

    category: EntityText = Field(
        description="The category of the event, for example: Sports, Politics, War, etc.",
        default=None,
    )
    sector: EntityText = Field(
        description="The sector the event belongs to, for example: Cricket, Politics, Geopolitics, etc.",
        default=None,
    )
    user_sentiment: EntityFloat = Field(
        description="The user's sentiment toward this event, ranging from -1 (very negative) to 1 (very positive)",
        default=None,
    )


class Company(EntityModel):
    """
    Represents a company relevant to a prediction market, for example:
    Google, SpaceX.
    """

    sector: EntityText = Field(
        description="The sector(s) the company operates in, for example: Tech, Cloud, Web3, etc.",
        default=None,
    )
    user_sentiment: EntityFloat = Field(
        description="The user's sentiment toward this company, ranging from -1 (very negative) to 1 (very positive)",
        default=None,
    )
    hero_product: EntityText = Field(
        description="The company's flagship or hero product, for example: AWS, lending, etc.",
        default=None,
    )


ENTITIES: dict[str, type[EntityModel]] = {
    "User": User,
    "Preference": Preference,
    "Thing": Thing,
    "Influencer": Influencer,
    "Event": Event,
    "Company": Company,
}


# ---------------------------------------------------------------------------
# Edge types
# ---------------------------------------------------------------------------

# All three edge types share the same single attribute, but Zep's ontology
# API wants a distinct EdgeModel class per edge type name (the name you
# register it under is what matters, not the class name), so we still
# define one class per edge for clarity.


class Influences(EdgeModel):
    """An edge representing an influencer (or company/event) moving or
    affecting a market-relevant thing, event, or company."""

    proximity: EntityFloat = Field(
        description="Strength/direction of the influence, from -1 (strongly negative/opposing influence) to 1 (strongly positive/reinforcing influence)",
        default=None,
    )


class Interested(EdgeModel):
    """An edge representing a user's interest in a thing, event,
    influencer, company, or preference/topic."""

    proximity: EntityFloat = Field(
        description="Strength/direction of the user's interest, from -1 (strongly disinterested/averse) to 1 (strongly interested/engaged)",
        default=None,
    )


class CoRelates(EdgeModel):
    """An edge representing two market-relevant things, events, or
    companies that move together or move inversely to each other."""

    proximity: EntityFloat = Field(
        description="Correlation strength/direction between the two nodes, from -1 (strong negative/inverse correlation) to 1 (strong positive correlation)",
        default=None,
    )


# Source -> target pairs per edge type. These constrain which entity-type
# pairs Zep is allowed to connect with a given edge type. Built from the
# diagram (Influences / Interested / Co-relates) plus what makes sense
# given the entity definitions above.
EDGES: dict[str, tuple[type[EdgeModel], list[EntityEdgeSourceTarget]]] = {
    "INFLUENCES": (
        Influences,
        [
            EntityEdgeSourceTarget(source="Influencer", target="Thing"),
            EntityEdgeSourceTarget(source="Influencer", target="Event"),
            EntityEdgeSourceTarget(source="Influencer", target="Company"),
            EntityEdgeSourceTarget(source="Event", target="Thing"),
            EntityEdgeSourceTarget(source="Event", target="Company"),
            EntityEdgeSourceTarget(source="Company", target="Thing"),
        ],
    ),
    "INTERESTED": (
        Interested,
        [
            EntityEdgeSourceTarget(source="User", target="Thing"),
            EntityEdgeSourceTarget(source="User", target="Event"),
            EntityEdgeSourceTarget(source="User", target="Influencer"),
            EntityEdgeSourceTarget(source="User", target="Company"),
            EntityEdgeSourceTarget(source="User", target="Preference"),
        ],
    ),
    "CO_RELATES": (
        CoRelates,
        [
            EntityEdgeSourceTarget(source="Thing", target="Thing"),
            EntityEdgeSourceTarget(source="Thing", target="Event"),
            EntityEdgeSourceTarget(source="Thing", target="Company"),
            EntityEdgeSourceTarget(source="Event", target="Event"),
            EntityEdgeSourceTarget(source="Company", target="Company"),
        ],
    ),
}
