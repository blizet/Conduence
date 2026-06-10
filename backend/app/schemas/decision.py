from typing import Any, Literal, Optional

from pydantic import BaseModel, Field, model_validator

NodeType = Literal[
    "user",
    "protocol",
    "market",
    "correlated_market",
    "trade",
    "outcome",
    "feedback",
    "agent",
]


class GraphNode(BaseModel):
    node_id: str = Field(min_length=1)
    node_type: NodeType
    properties: dict[str, Any] = Field(default_factory=dict)
    label: Optional[str] = None


class GraphEdge(BaseModel):
    source: str
    target: Optional[str] = None
    targets: Optional[list[str]] = None
    Action: Optional[str] = None
    relationship_type: Optional[str] = None
    direction: Optional[Literal["uni-directional", "bi-directional"]] = None
    metadata: dict[str, Any] = Field(default_factory=dict)

    @model_validator(mode="after")
    def require_target(self) -> "GraphEdge":
        if self.target is None and not self.targets:
            raise ValueError("edge must have target or targets")
        return self


class DecisionEvent(BaseModel):
    schema_version: str = "1.0"
    decision_id: Optional[str] = None
    graph_id: str = Field(min_length=1)
    updated_at: str
    operation: Literal["assert", "revise", "retract"] = "assert"
    provenance: Optional[dict[str, Any]] = None
    nodes: list[GraphNode] = Field(min_length=1)
    edges: list[GraphEdge] = Field(min_length=1)
