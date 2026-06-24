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
"""
from __future__ import annotations

from pydantic import Field
from zep_cloud.external_clients.ontology import (
    EdgeModel,
    EntityFloat,
    EntityModel,
    EntityText,
)


# ---------------------------------------------------------------------------
# Entity types
# ---------------------------------------------------------------------------


class Preference(EntityModel):
    """
    Represents a trader's long-term preference, conviction, focus area, bias,
    or recurring decision tendency. Use for stable beliefs such as market
    interests, asset preferences, signal preferences, trusted or avoided
    themes, and broad theses. Do not use for temporary positions, active
    trades, or short-term events.
    """

    category: EntityText = Field(
        description="High-level preference type. Examples: Market, Asset, IPL, Election.",
        default=None,
    )

    sector: EntityText = Field(
        description="Domain the preference belongs to. Examples: Crypto, Politics, Economics, Sports, Commodities.",
        default=None,
    )


class GeoFactors(EntityModel):
    """
    Represents a geopolitical, geographic, economic, or strategic location that
    can influence markets, commodities, trade, conflicts, supply chains,
    currencies, or prediction markets. Examples include Iran, India, China,
    Taiwan, Strait of Hormuz, Red Sea, European Union, Middle East, and BRICS.
    """


class Person(EntityModel):
    """
    Represents a market participant, institution, organization, team,
    government body, or public figure whose actions, statements, policies, or
    decisions can affect markets, narratives, or prediction outcomes. Use for
    actors the user monitors or trades around, such as Trump, Musk, Powell,
    OPEC, the Fed, governments, or sports teams.
    """


class Event(EntityModel):
    """
    Represents a real-world occurrence, catalyst, announcement, conflict,
    election, sporting event, economic release, policy decision, or time-bound
    situation that can affect market outcomes. Use for what is happening in the
    world, not the user's preference toward it. Examples include wars,
    elections, OPEC meetings, rate decisions, sanctions, and earnings.
    """


class EconomicActor(EntityModel):
    """
    Represents an economically significant asset, instrument, company,
    protocol, currency, commodity, stock, ETF, index, prediction-market subject,
    or financial entity that can be traded, monitored, analyzed, or influence
    market outcomes. Examples include BTC, ETH, crude oil, Apple, Polymarket,
    Aave, USD, and SpaceX stock.
    """


class AiAgent(EntityModel):
    """
    Represents a persistent AI capability in a Conduence workflow. Agents
    monitor, research, analyze, execute, or manage risk for a trader. They
    observe markets, events, geo-factors, economic actors, and signals to find
    opportunities, validate theses, enforce rules, and manage positions. Use for
    agents like News Agent, Risk Analyzer, Macro Analyst, or Orchestrator.
    """

    role: EntityText = Field(
        description="Monitoring, Research, Analysis, Execution, Risk, Orchestration",
        default=None,
    )

    specialization: EntityText = Field(
        description="Crypto, Politics, Economics, Sports, Macro, Cross-Market",
        default=None,
    )

    objective: EntityText = Field(
        description="Primary goal of the agent",
        default=None,
    )

    workflow: EntityText = Field(
        description="Workflow or strategy this agent belongs to",
        default=None,
    )

    market_scope: EntityText = Field(
        description="Markets this agent is allowed to operate in",
        default=None,
    )

    memory_access: EntityText = Field(
        description="Agentic Graph, User Graph, Both",
        default=None,
    )

    autonomy_level: EntityText = Field(
        description="Observe, Recommend, ApprovalRequired, Autonomous",
        default=None,
    )

    confidence_threshold: EntityFloat = Field(
        description="Minimum confidence before taking action",
        default=None,
    )

    status: EntityText = Field(
        description="Active, Paused, Disabled, Testing",
        default=None,
    )

    risk_scope: EntityText = Field(
        description="Capital or exposure constraints applied to this agent",
        default=None,
    )


class Rule(EntityModel):
    """
    Represents reusable procedural memory: an instruction, guardrail, monitor,
    entry condition, exit condition, risk policy, execution policy, or workflow
    constraint. Rules describe what should happen when conditions are met, unlike
    Preferences which describe beliefs. Use for logic such as enter, exit,
    monitor, risk limit, confirmation requirement, or expiry condition.
    """

    rule_type: EntityText = Field(
        description="Entry, Exit, Monitor, Risk, Workflow, Filter, Capital",
        default=None,
    )

    condition: EntityText = Field(
        description="Condition that activates the rule",
        default=None,
    )

    action: EntityText = Field(
        description="Action performed when condition becomes true",
        default=None,
    )

    scope: EntityText = Field(
        description="Agent, Workflow, Strategy, Position, User",
        default=None,
    )

    priority: EntityText = Field(
        description="Critical, High, Medium, Low",
        default=None,
    )

    confidence: EntityFloat = Field(
        description="Confidence in usefulness of the rule",
        default=None,
    )

    created_by: EntityText = Field(
        description="User, Agent, System",
        default=None,
    )

    status: EntityText = Field(
        description="Active, Testing, Disabled, Expired",
        default=None,
    )

    expiry_condition: EntityText = Field(
        description="Condition under which the rule becomes inactive",
        default=None,
    )

    description: EntityText = Field(
        description="Human readable explanation of the rule",
        default=None,
    )


ENTITIES: dict[str, type[EntityModel]] = {
    "Preference": Preference,
    "GeoFactors": GeoFactors,
    "Person": Person,
    "Event": Event,
    "EconomicActor": EconomicActor,
    "AiAgent": AiAgent,
    "Rule": Rule,
}


# ---------------------------------------------------------------------------
# Edge types
# ---------------------------------------------------------------------------


class Influences(EdgeModel):
    """
    An edge representing causal influence between entities.
    Person/Event/GeoFactor influencing EconomicActor, Event, or other entities.
    """

    proximity: EntityFloat = Field(
        description="Strength/direction of the influence, from -1 (strongly negative/opposing influence) to 1 (strongly positive/reinforcing influence)",
        default=None,
    )


class CoRelates(EdgeModel):
    """
    An edge representing correlation or co-movement between two market-relevant entities.
    """

    proximity: EntityFloat = Field(
        description="Correlation strength/direction between the two nodes, from -1 (strong negative/inverse correlation) to 1 (strong positive correlation)",
        default=None,
    )


class Stance(EdgeModel):
    """
    An edge representing a stance, trust relationship, prioritization, or avoidance
    between an entity and another entity (often AiAgent to Preference/Person/EconomicActor).
    """

    proximity: EntityFloat = Field(
        description="Strength/direction of the stance, from -1 (strongly avoid) to 1 (strongly prioritize/trust)",
        default=None,
    )

    stance: EntityText = Field(
        description="The type of stance: trust, avoid, think, assume, prioritize, monitor",
        default=None,
    )


class HasRule(EdgeModel):
    """
    An edge representing an AiAgent or entity having a Rule attached.
    """


class Monitors(EdgeModel):
    """
    An edge representing an AiAgent monitoring an Event, GeoFactor, EconomicActor, or Person.
    """


class Implicates(EdgeModel):
    """
    An edge representing a Rule or guideline that is implied by an Event, Company, or condition.
    """

    proximity: EntityFloat = Field(
        description="Strength/direction of the implication, from 0 (lenient/less implication) to 1 (strongly positive/reinforcing implication)",
        default=None,
    )


# Do not hardcode source/target constraints. Let Zep infer valid links from
# context and extraction semantics.
EDGES: dict[str, type[EdgeModel]] = {
    "INFLUENCES": Influences,
    "CO_RELATES": CoRelates,
    "STANCE": Stance,
    "HAS_RULE": HasRule,
    "MONITORS": Monitors,
    "IMPLICATES": Implicates,
}
