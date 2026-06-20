"""Compile React Flow canvas topology — re-exports from workflow_context."""

from app.orchestrator.workflow_context import (
    ORCHESTRATOR_NODE_TYPE,
    PURE_TOOL_NODE_TYPES,
    SUB_AGENT_NODE_TYPES,
    compile_orchestrator,
    compile_workflow_context,
    find_llm_node,
)


def compile_canvas(
    nodes: list,
    edges: list,
    llm_node_id: str | None = None,
) -> dict:
    """Partial compile — returns workflow context (legacy name)."""
    return compile_workflow_context(nodes, edges, llm_node_id=llm_node_id)


__all__ = [
    "ORCHESTRATOR_NODE_TYPE",
    "PURE_TOOL_NODE_TYPES",
    "SUB_AGENT_NODE_TYPES",
    "compile_canvas",
    "compile_orchestrator",
    "compile_workflow_context",
    "find_llm_node",
]
