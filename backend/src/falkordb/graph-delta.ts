import type { DecisionEvent, GraphEdge } from '../schemas/decision.schema';
import { cypherRelType } from './cypher-delta';

export type GraphSnapshot = {
  nodeIds: Set<string>;
  edgeKeys: Set<string>;
};

export type EdgeOperation = {
  source: string;
  target: string;
  relType: string;
  edge: GraphEdge;
  targetId: string;
  isReverse: boolean;
};

/** Canonical directed edge identity for dedup. */
export function edgeKey(source: string, relType: string, target: string): string {
  return `${source}|${relType}|${target}`;
}

export function snapshotFromRows(
  nodes: { id: string }[],
  edges: { source: string; target: string; type: string }[],
): GraphSnapshot {
  return {
    nodeIds: new Set(nodes.map((n) => n.id)),
    edgeKeys: new Set(edges.map((e) => edgeKey(e.source, e.type, e.target))),
  };
}

function targetIds(edge: GraphEdge): string[] {
  if (edge.target) return [edge.target];
  return [...(edge.targets ?? [])];
}

/** Expand payload edges into directed MERGE operations (forward + optional reverse). */
export function expandEdgeOperations(edges: GraphEdge[]): EdgeOperation[] {
  const ops: EdgeOperation[] = [];
  const seen = new Set<string>();

  for (const edge of edges) {
    if (edge.metadata?.direction === 'reverse') continue;

    const relType = cypherRelType(edge);
    const targets = targetIds(edge);

    for (const targetId of targets) {
      const forwardKey = edgeKey(edge.source, relType, targetId);
      if (!seen.has(forwardKey)) {
        seen.add(forwardKey);
        ops.push({
          source: edge.source,
          target: targetId,
          relType,
          edge,
          targetId,
          isReverse: false,
        });
      }

      if (edge.direction === 'bi-directional') {
        const reverseKey = edgeKey(targetId, relType, edge.source);
        if (!seen.has(reverseKey)) {
          seen.add(reverseKey);
          ops.push({
            source: targetId,
            target: edge.source,
            relType,
            edge,
            targetId,
            isReverse: true,
          });
        }
      }
    }
  }

  return ops;
}

/** JSON vs graph: only nodes/edge ops not already present. */
export function computeGraphDelta(
  snapshot: GraphSnapshot,
  payload: DecisionEvent,
): {
  nodes: DecisionEvent['nodes'];
  edgeOps: EdgeOperation[];
  stats: {
    nodesSkipped: number;
    edgeOpsSkipped: number;
    nodesNew: number;
    edgeOpsNew: number;
  };
} {
  const nodes = payload.nodes.filter((n) => {
    if (snapshot.nodeIds.has(n.node_id)) return false;
    return true;
  });

  const allOps = expandEdgeOperations(payload.edges);
  const edgeOps = allOps.filter((op) => {
    const key = edgeKey(op.source, op.relType, op.target);
    return !snapshot.edgeKeys.has(key);
  });

  return {
    nodes,
    edgeOps,
    stats: {
      nodesSkipped: payload.nodes.length - nodes.length,
      edgeOpsSkipped: allOps.length - edgeOps.length,
      nodesNew: nodes.length,
      edgeOpsNew: edgeOps.length,
    },
  };
}
