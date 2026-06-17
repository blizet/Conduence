export type GraphSnapshotNode = {
  id: string;
  type: string;
  label?: string;
  marketRole?: 'anchor' | 'correlated_peer';
};

export type GraphSnapshotEdge = {
  source: string;
  target: string;
  type: string;
  label?: string;
  weight?: number;
  origin?: string;
};

export type GraphSnapshot = {
  graph_id: string;
  nodes: GraphSnapshotNode[];
  edges: GraphSnapshotEdge[];
};

export type GraphNodeDetailDecision = {
  decision_id?: string | null;
  action?: string | null;
  thesis?: string | null;
  reasoning?: string | null;
  conviction_level?: number | null;
  tags?: string[];
  timestamp?: string | null;
  market_id?: string | null;
  linked_trade_id?: string | null;
  summary?: string | null;
};

export type GraphObservabilityAgent = {
  agent_id: string;
  role?: string;
  contribution?: string;
};

export type GraphObservabilityTool = {
  tool_id: string;
  ok?: boolean;
  error?: string;
  latency_ms?: number;
  cost_estimate_usd?: number;
};

export type GraphObservabilityLlmUsage = {
  total_input_tokens?: number;
  total_output_tokens?: number;
  total_cost_usd?: number;
  calls?: Array<{
    provider?: string;
    model?: string;
    agent_id?: string;
    input_tokens?: number;
    output_tokens?: number;
    cost_usd?: number;
    langsmith_span_id?: string;
  }>;
};

export type GraphObservability = {
  schema_version?: string;
  langsmith?: {
    project?: string;
    trace_id?: string | null;
    run_id?: string | null;
    url?: string | null;
    status?: string;
  };
  workflow?: {
    workflow_id?: string | null;
    signal_id?: string | null;
    path?: string;
  };
  agents?: GraphObservabilityAgent[];
  tools?: GraphObservabilityTool[];
  llm_usage?: GraphObservabilityLlmUsage;
  steps?: string[];
  duration_ms?: number;
  started_at?: string;
  finished_at?: string;
};

export type GraphNodeDetail = {
  graph_id: string;
  node: {
    id: string;
    type: string;
    decision_id?: string | null;
    marketRole?: 'anchor' | 'correlated_peer';
    created_at?: string | null;
    last_seen_at?: string | null;
  };
  decision?: GraphNodeDetailDecision | null;
  observability?: GraphObservability | null;
  incoming_edges?: Array<{
    source: string;
    target: string;
    type: string;
    action?: string | null;
    thesis?: string;
    reasoning?: string;
  }>;
  outgoing_edges?: Array<{
    source: string;
    target: string;
    type: string;
  }>;
};

export const DEFAULT_GRAPH_ID =
  process.env.NEXT_PUBLIC_MAIN_GRAPH_ID ?? 'user_771.main.v1';

export const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

/** Graphify-inspired palette mapped to CoT node types. */
export const NODE_TYPE_COLORS: Record<string, string> = {
  user: '#4E79A7',
  protocol: '#59A14F',
  market: '#F28E2B',
  correlated_market: '#EDC948',
  trade: '#E15759',
  outcome: '#76B7B2',
  feedback: '#B07AA1',
  agent: '#FF9DA7',
};

export const NODE_TYPE_LABELS: Record<string, string> = {
  user: 'User',
  protocol: 'Protocol',
  market: 'Market',
  correlated_market: 'Correlated market',
  trade: 'Trade',
  outcome: 'Outcome',
  feedback: 'Feedback',
  agent: 'Agent',
};

export function resolveNodeColor(node: GraphSnapshotNode): string {
  if (node.type === 'market' && node.marketRole === 'correlated_peer') {
    return NODE_TYPE_COLORS.correlated_market;
  }
  if (node.type === 'correlated_market') {
    return NODE_TYPE_COLORS.correlated_market;
  }
  return NODE_TYPE_COLORS[node.type] ?? '#BAB0AC';
}

export function shortLabel(id: string, max = 22): string {
  if (id.length <= max) return id;
  return `${id.slice(0, max - 1)}…`;
}

export function computeDegrees(snapshot: GraphSnapshot): Map<string, number> {
  const degrees = new Map<string, number>();
  for (const node of snapshot.nodes) degrees.set(node.id, 0);
  for (const edge of snapshot.edges) {
    degrees.set(edge.source, (degrees.get(edge.source) ?? 0) + 1);
    degrees.set(edge.target, (degrees.get(edge.target) ?? 0) + 1);
  }
  return degrees;
}

export function buildTypeLegend(snapshot: GraphSnapshot) {
  const counts = new Map<string, number>();
  for (const node of snapshot.nodes) {
    const key =
      node.type === 'market' && node.marketRole === 'correlated_peer'
        ? 'correlated_market'
        : node.type;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([type, count]) => ({
      type,
      label: NODE_TYPE_LABELS[type] ?? type,
      color: NODE_TYPE_COLORS[type] ?? '#BAB0AC',
      count,
    }))
    .sort((a, b) => b.count - a.count);
}

/** Minimal CoT chain when backend / FalkorDB is unavailable. */
export const SAMPLE_SNAPSHOT: GraphSnapshot = {
  graph_id: DEFAULT_GRAPH_ID,
  nodes: [
    { id: 'user_771', type: 'user' },
    { id: 'Polymarket', type: 'protocol' },
    { id: 'PM_EXAMPLE', type: 'market', marketRole: 'anchor' },
    { id: 'TRD_M001', type: 'trade' },
    { id: 'FB_TRD_M001', type: 'feedback' },
  ],
  edges: [
    { source: 'user_771', target: 'Polymarket', type: 'CONNECTED_TO' },
    { source: 'Polymarket', target: 'PM_EXAMPLE', type: 'CONNECTED_TO' },
    { source: 'PM_EXAMPLE', target: 'TRD_M001', type: 'OPEN_YES' },
    { source: 'TRD_M001', target: 'FB_TRD_M001', type: 'CONNECTED_TO' },
  ],
};

const SAMPLE_OBSERVABILITY: GraphObservability = {
  schema_version: '1.0',
  langsmith: {
    project: 'cot-workflows',
    trace_id: 'sample-trace-001',
    run_id: 'sample-run-001',
    url: 'https://smith.langchain.com',
    status: 'sample',
  },
  workflow: { workflow_id: 'demo-workflow', path: 'orchestrator' },
  agents: [
    { agent_id: 'newsAgent', role: 'subagent', contribution: 'signal' },
    { agent_id: 'orchestrator', role: 'synthesizer', contribution: 'final_decision' },
  ],
  tools: [
    { tool_id: 'tavily', ok: true, latency_ms: 420 },
    { tool_id: 'polymarketGamma', ok: true, latency_ms: 180 },
  ],
  llm_usage: {
    total_input_tokens: 12400,
    total_output_tokens: 890,
    total_cost_usd: 0.023,
    calls: [
      {
        provider: 'openai',
        model: 'gpt-4o-mini',
        agent_id: 'newsAgent',
        input_tokens: 5200,
        output_tokens: 310,
        cost_usd: 0.009,
      },
      {
        provider: 'openai',
        model: 'gpt-4o-mini',
        agent_id: 'orchestrator',
        input_tokens: 7200,
        output_tokens: 580,
        cost_usd: 0.014,
      },
    ],
  },
  steps: [
    'ingest_signal',
    'plan_tools',
    'invoke_tools',
    'evaluate',
    'llm_synthesize',
    'publish_outputs',
  ],
  duration_ms: 4200,
};

/** Sample decision + LangSmith observability for offline / empty-graph demo. */
export const SAMPLE_NODE_DETAILS: Record<string, GraphNodeDetail> = {
  TRD_M001: {
    graph_id: DEFAULT_GRAPH_ID,
    node: {
      id: 'TRD_M001',
      type: 'trade',
      decision_id: 'dec-trd_m001-open',
    },
    decision: {
      decision_id: 'dec-trd_m001-open',
      action: 'Buy YES',
      thesis: 'ETF inflows and macro tailwind support upside into year-end.',
      reasoning: 'News corroboration from newsAgent; gamma liquidity acceptable.',
      conviction_level: 8,
      tags: ['#BTC', '#ETF'],
      timestamp: new Date().toISOString(),
      market_id: 'PM_EXAMPLE',
    },
    observability: SAMPLE_OBSERVABILITY,
    incoming_edges: [
      {
        source: 'PM_EXAMPLE',
        target: 'TRD_M001',
        type: 'OPEN_YES',
        action: 'Buy YES',
        thesis: 'ETF inflows and macro tailwind support upside into year-end.',
        reasoning: 'News corroboration from newsAgent; gamma liquidity acceptable.',
      },
    ],
    outgoing_edges: [{ source: 'TRD_M001', target: 'FB_TRD_M001', type: 'CONNECTED_TO' }],
  },
  PM_EXAMPLE: {
    graph_id: DEFAULT_GRAPH_ID,
    node: { id: 'PM_EXAMPLE', type: 'market', marketRole: 'anchor' },
    decision: {
      decision_id: 'dec-trd_m001-open',
      linked_trade_id: 'TRD_M001',
      action: 'Buy YES',
      thesis: 'ETF inflows and macro tailwind support upside into year-end.',
      conviction_level: 8,
    },
    observability: SAMPLE_OBSERVABILITY,
    incoming_edges: [{ source: 'Polymarket', target: 'PM_EXAMPLE', type: 'CONNECTED_TO' }],
    outgoing_edges: [{ source: 'PM_EXAMPLE', target: 'TRD_M001', type: 'OPEN_YES' }],
  },
  FB_TRD_M001: {
    graph_id: DEFAULT_GRAPH_ID,
    node: { id: 'FB_TRD_M001', type: 'feedback' },
    decision: {
      decision_id: 'dec-trd_m001-open',
      linked_trade_id: 'TRD_M001',
      action: 'Buy YES',
      thesis: 'Open feedback loop for TRD_M001 — awaiting market resolution.',
      conviction_level: 8,
    },
    observability: SAMPLE_OBSERVABILITY,
    incoming_edges: [{ source: 'TRD_M001', target: 'FB_TRD_M001', type: 'CONNECTED_TO' }],
    outgoing_edges: [],
  },
};

function resolveLinkedSampleDetail(nodeId: string): GraphNodeDetail | null {
  if (SAMPLE_NODE_DETAILS[nodeId]) return SAMPLE_NODE_DETAILS[nodeId];

  const snapNode = SAMPLE_SNAPSHOT.nodes.find((n) => n.id === nodeId);
  if (!snapNode) return null;

  const linkedToTrade = SAMPLE_SNAPSHOT.edges.some(
    (e) =>
      (e.source === nodeId && e.target === 'TRD_M001') ||
      (e.source === 'TRD_M001' && e.target === nodeId) ||
      (e.source === nodeId && e.target === 'PM_EXAMPLE') ||
      (e.source === 'PM_EXAMPLE' && e.target === nodeId),
  );
  if (!linkedToTrade) return null;

  const trade = SAMPLE_NODE_DETAILS.TRD_M001;
  if (!trade.decision) return null;

  return {
    graph_id: DEFAULT_GRAPH_ID,
    node: { id: nodeId, type: snapNode.type, marketRole: snapNode.marketRole },
    decision: {
      ...trade.decision,
      linked_trade_id: nodeId === 'TRD_M001' ? undefined : 'TRD_M001',
      summary:
        nodeId === 'TRD_M001' || nodeId === 'PM_EXAMPLE'
          ? undefined
          : `Part of decision ${trade.decision.decision_id ?? 'TRD_M001'}`,
    },
    observability: SAMPLE_OBSERVABILITY,
  };
}

export async function fetchGraphSnapshot(graphId = DEFAULT_GRAPH_ID): Promise<GraphSnapshot> {
  const res = await fetch(
    `${API_BASE}/api/graphs/${encodeURIComponent(graphId)}/snapshot`,
    { cache: 'no-store' },
  );
  if (!res.ok) {
    throw new Error(`Graph snapshot failed (${res.status})`);
  }
  return res.json() as Promise<GraphSnapshot>;
}

export async function fetchGraphNodeDetail(
  graphId: string,
  nodeId: string,
  options?: { useSampleFallback?: boolean },
): Promise<GraphNodeDetail | null> {
  try {
    const res = await fetch(
      `${API_BASE}/api/graphs/${encodeURIComponent(graphId)}/nodes/${encodeURIComponent(nodeId)}`,
      { cache: 'no-store' },
    );
    if (res.status === 404) {
      if (options?.useSampleFallback) {
        return resolveLinkedSampleDetail(nodeId);
      }
      return null;
    }
    if (!res.ok) {
      throw new Error(`Node detail failed (${res.status})`);
    }
    return res.json() as Promise<GraphNodeDetail>;
  } catch {
    if (options?.useSampleFallback) {
      return resolveLinkedSampleDetail(nodeId);
    }
    return null;
  }
}
