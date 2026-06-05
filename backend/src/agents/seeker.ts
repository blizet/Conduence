/**
 * Seeker Agent — maps publisher whale deltas into the isolated seeker graph.
 */

import type { DecisionEvent } from '../schemas/decision.schema';

export type WhaleTrade = {
  marketId: string;
  tradeId: string;
  action: string;
};

const WHALE_NODE_TYPES = new Set(['protocol', 'market', 'correlated_market', 'trade']);

/** Strip publisher user/agent; keep anchor nodes keyed by node_id for cross-stream merge. */
export function transformWhaleToSeekerDelta(
  payload: DecisionEvent,
  seekerGraphId: string,
): DecisionEvent {
  const nodes = payload.nodes.filter((n) => WHALE_NODE_TYPES.has(n.node_type));
  const nodeIds = new Set(nodes.map((n) => n.node_id));

  const edges = payload.edges.filter((edge) => {
    if (!nodeIds.has(edge.source)) return false;
    if (edge.targets?.length) return edge.targets.every((t) => nodeIds.has(t));
    return edge.target ? nodeIds.has(edge.target) : false;
  });

  return {
    ...payload,
    graph_id: seekerGraphId,
    decision_id: `seek-whale-${payload.decision_id ?? payload.updated_at}`,
    nodes,
    edges,
  };
}

export function extractWhaleTrade(payload: DecisionEvent): WhaleTrade | null {
  for (const edge of payload.edges) {
    if (!edge.Action || !edge.target) continue;
    const trade = payload.nodes.find(
      (n) => n.node_id === edge.target && n.node_type === 'trade',
    );
    if (trade) {
      return { marketId: edge.source, tradeId: trade.node_id, action: edge.Action };
    }
  }
  return null;
}
