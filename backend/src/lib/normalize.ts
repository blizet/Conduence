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
  correlated_market: 'CorrelatedMarket',
  trade: 'Trade',
  outcome: 'Outcome',
  feedback: 'Feedback',
  agent: 'Agent',
};

/** Legacy Sell decision id -> original Buy trade id for the same position. */
const LEGACY_CLOSE_TRADE_OF: Record<string, string> = {
  TRD_003: 'TRD_001',
  TRD_005: 'TRD_004',
  TRD_007: 'TRD_006',
  TRD_010: 'TRD_008',
  TRD_012: 'TRD_009',
  TRD_014: 'TRD_011',
  TRD_017: 'TRD_013',
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

function collapseAgentIntoUser(payload: DecisionEvent, userNodeId: string, agentId: string): void {
  if (userNodeId === agentId) return;

  for (const edge of payload.edges) {
    if (edge.source === agentId) edge.source = userNodeId;
    if (edge.target === agentId) edge.target = userNodeId;
    if (edge.targets) {
      edge.targets = edge.targets.map((t) => (t === agentId ? userNodeId : t));
    }
  }

  payload.edges = payload.edges.filter((e) => e.relationship_type !== 'HAS_AGENT');
  payload.nodes = payload.nodes.filter((n) => n.node_id !== agentId && n.node_type !== 'agent');
}

/** Stable per-trade leaf id; safe if normalize runs more than once (seed + worker). */
export function scopedLeafId(leafId: string, tradeId: string): string {
  const suffix = `__${tradeId}`;
  let base = leafId;
  while (base.endsWith(suffix)) base = base.slice(0, -suffix.length);
  return `${base}${suffix}`;
}

function normalizeLegacyBuySellLifecycle(payload: DecisionEvent): void {
  for (const edge of payload.edges) {
    if (typeof edge.Action !== 'string' || !edge.target) continue;
    const match = edge.Action.match(/^(Buy|Sell)\s+(YES|NO)$/i);
    if (!match) continue;

    const verb = match[1].toLowerCase();
    const side = match[2].toUpperCase();
    const originalTradeId = edge.target;
    const isClose = verb === 'sell';
    const tradeId = isClose ? (LEGACY_CLOSE_TRADE_OF[originalTradeId] ?? originalTradeId) : originalTradeId;

    if (tradeId !== originalTradeId) {
      remapNodeId(payload, originalTradeId, tradeId);
    }

    edge.Action = `${isClose ? 'Close' : 'Open'} ${side}`;
    edge.relationship_type = actionToRel(edge.Action);
    edge.metadata = {
      ...(edge.metadata ?? {}),
      action: edge.Action,
      lifecycle: isClose ? 'close' : 'open',
      ...(isClose ? { position_trade_id: tradeId } : {}),
    };
    payload.operation = isClose ? 'revise' : 'assert';
    payload.decision_id = `dec-trd_${tradeId.replace('TRD_', '').toLowerCase()}-${
      isClose ? 'close' : 'open'
    }`;
  }
}

/** Open events must not include outcome/feedback nodes or edges (those belong on close only). */
function stripOpenLifecycleOrphans(payload: DecisionEvent): void {
  const isOpen =
    payload.operation === 'assert' &&
    payload.edges.some(
      (e) =>
        e.metadata?.lifecycle === 'open' ||
        (typeof e.Action === 'string' && /^Open\s/i.test(e.Action)),
    );
  if (!isOpen) return;

  const leafIds = new Set(
    payload.nodes
      .filter((n) => n.node_type === 'outcome' || n.node_type === 'feedback')
      .map((n) => n.node_id),
  );

  payload.edges = payload.edges.filter((e) => !(e.target && leafIds.has(e.target)));
  payload.nodes = payload.nodes.filter((n) => {
    if (n.node_type !== 'outcome' && n.node_type !== 'feedback') return true;
    return false;
  });
}

/** Stamp close deltas so ingest can tie back to the same trade node. */
function stampCloseLifecycle(payload: DecisionEvent): void {
  const isClose =
    payload.operation === 'revise' ||
    payload.edges.some(
      (e) =>
        e.metadata?.lifecycle === 'close' ||
        (typeof e.Action === 'string' && /^Close\s/i.test(e.Action)),
    );
  if (!isClose) return;

  const tradeNode = payload.nodes.find((n) => n.node_type === 'trade');
  if (!tradeNode) return;

  for (const e of payload.edges) {
    if (e.Action && e.target === tradeNode.node_id) {
      e.metadata = {
        ...(e.metadata ?? {}),
        lifecycle: 'close',
        position_trade_id: tradeNode.node_id,
      };
    }
  }
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

/** Markets that open/close a position (source of Action edge → trade). */
export function anchorMarketIds(payload: DecisionEvent): Set<string> {
  const ids = new Set<string>();
  for (const edge of payload.edges) {
    if (!edge.Action || !edge.target) continue;
    const trade = payload.nodes.find((n) => n.node_id === edge.target && n.node_type === 'trade');
    if (trade) ids.add(edge.source);
  }
  return ids;
}

function correlatedTargetIds(payload: DecisionEvent): Set<string> {
  const ids = new Set<string>();
  for (const edge of payload.edges) {
    const rel = (edge.relationship_type ?? String(edge.metadata?.relationship_type ?? ''))
      .toUpperCase()
      .replace(/[^A-Z0-9_]/g, '_');
    if (rel !== 'CORRELATED_MARKET') continue;
    for (const tid of edge.targets ?? []) ids.add(tid);
  }
  return ids;
}

/** Drop correlated peers from nodes[] — they belong in CORRELATED_MARKET targets[] only. */
function stripCorrelatedOnlyMarketNodes(payload: DecisionEvent): void {
  const anchors = anchorMarketIds(payload);
  payload.nodes = payload.nodes.filter((n) => {
    if (n.node_type !== 'market') return true;
    return anchors.has(n.node_id);
  });
}

/**
 * MERGE stub market nodes for correlated targets (not written to decision JSON on disk).
 */
function stampAnchorMarketProperties(payload: DecisionEvent): void {
  const anchors = anchorMarketIds(payload);
  for (const node of payload.nodes) {
    if (node.node_type !== 'market' || !anchors.has(node.node_id)) continue;
    node.properties = { ...(node.properties ?? {}), anchor: true };
  }
}

export function augmentCorrelatedPeerNodes(payload: DecisionEvent): DecisionEvent {
  const existing = new Set(payload.nodes.map((n) => n.node_id));
  const peers = correlatedTargetIds(payload);
  for (const nodeId of peers) {
    if (existing.has(nodeId)) continue;
    payload.nodes.push({
      node_id: nodeId,
      node_type: 'correlated_market',
      properties: { correlated_peer: true },
      label: 'CorrelatedMarket',
    });
    existing.add(nodeId);
  }
  return payload;
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
  normalizeLegacyBuySellLifecycle(payload);

  const ctx = resolveAgentContext(payload);
  if (ctx) {
    if (!parseGraphId(payload.graph_id)) {
      payload.graph_id = graphIdFor(ctx.userSlug, ctx.role);
    }
    remapLegacyAgent(payload, ctx.agentId);
    if (ctx.role === 'seeker') {
      collapseAgentIntoUser(payload, ctx.userNodeId, ctx.agentId);
    } else {
      ensureHasAgentEdge(payload, ctx.userNodeId, ctx.agentId, ctx.role);
    }
  } else {
    const userNodeId = primaryUserNodeId(payload.nodes);
    if (userNodeId) {
      const userSlug = userSlugFromNodeId(userNodeId);
      const agentId = agentNodeId(userSlug, 'publisher');
      remapLegacyAgent(payload, agentId);
      ensureHasAgentEdge(payload, userNodeId, agentId, 'publisher');
    }
  }

  payload.edges = payload.edges.filter(
    (e) => e.metadata?.direction !== 'reverse',
  );

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

  stripOpenLifecycleOrphans(payload);
  stampCloseLifecycle(payload);
  scopeTradeLeafNodes(payload);
  stripCorrelatedOnlyMarketNodes(payload);
  stampAnchorMarketProperties(payload);

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
