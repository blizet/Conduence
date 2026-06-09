export type GraphSnapshotNode = {
  id: string;
  type: string;
  marketRole?: 'anchor' | 'correlated_peer';
};

export type GraphSnapshotEdge = {
  source: string;
  target: string;
  type: string;
};

export type GraphSnapshot = {
  graph_id: string;
  nodes: GraphSnapshotNode[];
  edges: GraphSnapshotEdge[];
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
    { id: 'OUT_YES_SHARES', type: 'outcome' },
    { id: 'FB_OPEN', type: 'feedback' },
  ],
  edges: [
    { source: 'user_771', target: 'Polymarket', type: 'CONNECTED_TO' },
    { source: 'Polymarket', target: 'PM_EXAMPLE', type: 'CONNECTED_TO' },
    { source: 'PM_EXAMPLE', target: 'TRD_M001', type: 'OPEN_YES' },
    { source: 'TRD_M001', target: 'OUT_YES_SHARES', type: 'CONNECTED_TO' },
    { source: 'TRD_M001', target: 'FB_OPEN', type: 'CONNECTED_TO' },
  ],
};

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
