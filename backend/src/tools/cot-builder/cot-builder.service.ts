import type {
  CorrelatedMarketsResult,
  CotBuilderOptions,
  DecisionEventDraft,
  GeminiTradeDecision,
} from '../types';

const DEFAULT_GRAPH_ID = 'user_771.main.v1';
const DEFAULT_USER_NODE_ID = 'user_771';

let tradeCounter = 0;

function nextTradeId(): string {
  tradeCounter += 1;
  return `TRD_M${String(tradeCounter).padStart(3, '0')}`;
}

function actionLabel(action: GeminiTradeDecision['action']): string {
  if (action === 'BUY_YES') return 'Buy YES';
  if (action === 'BUY_NO') return 'Buy NO';
  return 'Hold';
}

function outcomeNodeId(action: GeminiTradeDecision['action']): string {
  if (action === 'BUY_NO') return 'OUT_NO_CONTRACTS';
  return 'OUT_YES_SHARES';
}

export function buildCotDecision(
  decision: GeminiTradeDecision,
  correlated: CorrelatedMarketsResult,
  options: CotBuilderOptions = {},
): DecisionEventDraft | null {
  if (decision.action === 'HOLD' || decision.market_id === 'NONE') {
    return null;
  }

  const graphId = options.graphId ?? DEFAULT_GRAPH_ID;
  const userNodeId = options.userNodeId ?? DEFAULT_USER_NODE_ID;
  const tradeId = options.tradeId ?? nextTradeId();
  const marketId = decision.market_id;
  const now = new Date().toISOString();
  const action = actionLabel(decision.action);

  const pmMarket = correlated.polymarket.find((m) => m.id === marketId);
  const correlatedTargets = correlated.correlations
    .filter((c) => c.pmId === marketId)
    .map((c) => c.kalId);

  const otherPmPeers = correlated.polymarket
    .filter((m) => m.id !== marketId)
    .slice(0, 2)
    .map((m) => m.id);

  const targets = [...new Set([...correlatedTargets, ...otherPmPeers])];

  const nodes: DecisionEventDraft['nodes'] = [
    { node_id: userNodeId, node_type: 'user' },
    { node_id: 'Polymarket', node_type: 'protocol' },
    { node_id: marketId, node_type: 'market' },
    { node_id: tradeId, node_type: 'trade' },
    { node_id: outcomeNodeId(decision.action), node_type: 'outcome' },
    { node_id: 'FB_OPEN', node_type: 'feedback' },
  ];

  for (const kalId of correlatedTargets) {
    if (!nodes.some((n) => n.node_id === kalId)) {
      nodes.push({ node_id: kalId, node_type: 'market' });
    }
  }

  const edges: DecisionEventDraft['edges'] = [
    { source: userNodeId, target: 'Polymarket' },
    {
      source: 'Polymarket',
      target: marketId,
      metadata: {
        source_url: pmMarket?.url ?? 'https://polymarket.com',
        confidence_score: 1.0,
        slug: decision.market_slug ?? pmMarket?.slug,
        condition_id: decision.condition_id ?? pmMarket?.conditionId,
      },
    },
    {
      source: marketId,
      target: tradeId,
      Action: action,
      metadata: {
        thesis: decision.thesis,
        conviction_level: decision.conviction_level,
        tags: decision.tags,
        reasoning: decision.reasoning,
        source_url: pmMarket?.url ?? 'https://polymarket.com',
        confidence_score: decision.conviction_level / 10,
        timestamp: now,
      },
    },
    {
      source: tradeId,
      target: outcomeNodeId(decision.action),
      metadata: { source_url: pmMarket?.url ?? 'https://polymarket.com' },
    },
    {
      source: tradeId,
      target: 'FB_OPEN',
      metadata: { source_url: pmMarket?.url ?? 'https://polymarket.com' },
    },
  ];

  if (targets.length > 0) {
    edges.push({
      source: marketId,
      targets,
      direction: 'bi-directional',
      metadata: { relationship_type: 'correlated_market' },
    });
  }

  return {
    schema_version: '1.0',
    operation: 'assert',
    graph_id: graphId,
    decision_id: `dec-${tradeId.toLowerCase()}-open`,
    updated_at: now,
    nodes,
    edges,
    provenance: {
      raw_sources: [pmMarket?.url ?? 'https://polymarket.com'].filter(Boolean),
    },
  };
}
