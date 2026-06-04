import type { DecisionEvent, GraphEdge } from '../schemas/decision.schema';
import {
  agentNodeId,
  graphIdFor,
  parseGraphId,
  primaryUserNodeId,
  resolveAgentContext,
  userSlugFromNodeId,
} from './graph-topology';

const LEGACY_AGENT_ID = 'publisher_agent';
const AGENT_DISPLAY_ID = 'Publisher Agent';

const LABEL_MAP: Record<string, string> = {
  user: 'User',
  protocol: 'Protocol',
  market: 'Market',
  trade: 'Trade',
  outcome: 'Outcome',
  feedback: 'Feedback',
  agent: 'Agent',
};

function slug(value: string): string {
  return value.replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_|_$/g, '').toLowerCase();
}

function actionToRel(action: string): string {
  return action.trim().toUpperCase().replace(/\s+/g, '_');
}

function inferDecisionId(edges: GraphEdge[], updatedAt: string): string {
  for (const edge of edges) {
    if (edge.Action && edge.target) return `dec-${slug(edge.target)}`;
  }
  return `dec-${updatedAt.replace(/[:.-]/g, '')}`;
}

export function graphName(graphId: string): string {
  return graphId.replace(/[^a-zA-Z0-9_]/g, '_');
}

function remapLegacyAgent(payload: DecisionEvent, agentId: string): void {
  const nodeIds = new Set(payload.nodes.map((n) => n.node_id));
  if (!nodeIds.has(LEGACY_AGENT_ID) && !nodeIds.has(agentId)) {
    const refsLegacy = payload.edges.some(
      (e) =>
        e.source === LEGACY_AGENT_ID ||
        e.target === LEGACY_AGENT_ID ||
        e.source === AGENT_DISPLAY_ID ||
        e.target === AGENT_DISPLAY_ID,
    );
    if (refsLegacy) {
      payload.nodes.push({
        node_id: agentId,
        node_type: 'agent',
        properties: { display_name: 'Publisher Agent', role: 'publisher' },
        label: 'Agent',
      });
    }
  }

  for (const node of payload.nodes) {
    if (node.node_id === LEGACY_AGENT_ID) node.node_id = agentId;
  }

  for (const edge of payload.edges) {
    if (edge.source === LEGACY_AGENT_ID || edge.source === AGENT_DISPLAY_ID) edge.source = agentId;
    if (edge.target === LEGACY_AGENT_ID || edge.target === AGENT_DISPLAY_ID) edge.target = agentId;
    if (edge.targets) {
      edge.targets = edge.targets.map((t) =>
        t === LEGACY_AGENT_ID || t === AGENT_DISPLAY_ID ? agentId : t,
      );
    }
  }
}

function remapNodeId(payload: DecisionEvent, from: string, to: string): void {
  const node = payload.nodes.find((n) => n.node_id === from);
  if (!node || from === to) return;
  node.node_id = to;
  for (const edge of payload.edges) {
    if (edge.source === from) edge.source = to;
    if (edge.target === from) edge.target = to;
    if (edge.targets) {
      edge.targets = edge.targets.map((t) => (t === from ? to : t));
    }
  }
}

/** Stable per-trade leaf id; safe if normalize runs more than once (seed + worker). */
export function scopedLeafId(leafId: string, tradeId: string): string {
  const suffix = `__${tradeId}`;
  let base = leafId;
  while (base.endsWith(suffix)) base = base.slice(0, -suffix.length);
  return `${base}${suffix}`;
}

/** One feedback/outcome node per trade so merged graphs stay U→P→M→T→F/O chains. */
function scopeTradeLeafNodes(payload: DecisionEvent): void {
  const tradeIds = new Set<string>();
  for (const edge of payload.edges) {
    if (edge.Action && edge.target) tradeIds.add(edge.target);
  }

  for (const tradeId of tradeIds) {
    for (const edge of payload.edges) {
      if (edge.source !== tradeId || !edge.target) continue;
      const targetNode = payload.nodes.find((n) => n.node_id === edge.target);
      if (!targetNode) continue;
      if (targetNode.node_type !== 'feedback' && targetNode.node_type !== 'outcome') continue;
      const scopedId = scopedLeafId(edge.target, tradeId);
      if (edge.target !== scopedId) remapNodeId(payload, edge.target, scopedId);
    }
  }
}

function ensureHasAgentEdge(payload: DecisionEvent, userNodeId: string, agentId: string, role: string): void {
  const has = payload.edges.some(
    (e) =>
      e.source === userNodeId &&
      e.target === agentId &&
      e.relationship_type === 'HAS_AGENT',
  );
  if (!has) {
    payload.edges.unshift({
      source: userNodeId,
      target: agentId,
      relationship_type: 'HAS_AGENT',
      metadata: { role },
    });
  }
}

export function normalizeDecision(raw: DecisionEvent): DecisionEvent {
  const payload = structuredClone(raw) as DecisionEvent & { edges: GraphEdge[] };
  payload.schema_version = payload.schema_version ?? '1.0';
  payload.operation = payload.operation ?? 'assert';

  const ctx = resolveAgentContext(payload);
  if (ctx) {
    if (!parseGraphId(payload.graph_id)) {
      payload.graph_id = graphIdFor(ctx.userSlug, ctx.role);
    }
    remapLegacyAgent(payload, ctx.agentId);
    ensureHasAgentEdge(payload, ctx.userNodeId, ctx.agentId, ctx.role);
  } else {
    const userNodeId = primaryUserNodeId(payload.nodes);
    if (userNodeId) {
      const userSlug = userSlugFromNodeId(userNodeId);
      const agentId = agentNodeId(userSlug, 'publisher');
      remapLegacyAgent(payload, agentId);
      ensureHasAgentEdge(payload, userNodeId, agentId, 'publisher');
    }
  }

  const normalizedEdges: GraphEdge[] = [];
  for (const edge of payload.edges) {
    const e = structuredClone(edge) as GraphEdge;
    let rel = e.relationship_type;
    if (!rel && e.Action) rel = actionToRel(e.Action);
    if (!rel) rel = actionToRel(String(e.metadata?.relationship_type ?? 'CONNECTED_TO'));
    e.relationship_type = rel;
    e.metadata = { ...(e.metadata ?? {}), ...(e.Action ? { action: e.Action } : {}) };
    normalizedEdges.push(e);
  }

  payload.edges = normalizedEdges;
  if (!payload.decision_id) {
    payload.decision_id = inferDecisionId(normalizedEdges, payload.updated_at);
  }

  scopeTradeLeafNodes(payload);

  payload.nodes = payload.nodes.map((n) => ({
    ...n,
    properties: n.properties ?? {},
    label: n.label ?? LABEL_MAP[n.node_type] ?? 'Entity',
  }));

  return payload;
}

export function escapeCypher(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}
