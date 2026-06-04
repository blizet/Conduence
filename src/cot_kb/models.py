from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, Field, model_validator

NodeType = Literal[
    "user", "protocol", "market", "trade", "outcome", "feedback", "agent"
]
Operation = Literal["assert", "revise", "retract"]


class GraphNode(BaseModel):
    node_id: str
    node_type: NodeType
    label: str | None = None
    properties: dict[str, Any] = Field(default_factory=dict)


class GraphEdge(BaseModel):
    source: str
    target: str | None = None
    targets: list[str] | None = None
    Action: str | None = None
    relationship_type: str | None = None
    direction: Literal["uni-directional", "bi-directional"] | None = None
    metadata: dict[str, Any] = Field(default_factory=dict)

    @model_validator(mode="after")
    def require_target(self) -> GraphEdge:
        if self.target is None and not self.targets:
            raise ValueError("edge must have target or targets")
        return self


class Provenance(BaseModel):
    raw_sources: list[str] = Field(default_factory=list)
    wiki_pages: list[str] = Field(default_factory=list)


class DecisionEvent(BaseModel):
    schema_version: str = "1.0"
    decision_id: str | None = None
    graph_id: str
    updated_at: str
    operation: Operation = "assert"
    provenance: Provenance | None = None
    nodes: list[GraphNode]
    edges: list[GraphEdge]

    def model_dump_payload(self) -> dict[str, Any]:
        return self.model_dump(mode="json", exclude_none=True)


def decision_event_from_dict(data: dict[str, Any]) -> DecisionEvent:
    return DecisionEvent.model_validate(data)
