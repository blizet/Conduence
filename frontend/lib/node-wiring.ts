import type { Edge } from '@xyflow/react';
import type { WorkflowNode } from '@/nodes/types';

export const PURE_TOOL_NODE_TYPES = new Set([
  'coingecko',
  'coinmarketcap',
  'defillama',
  'cryptonews',
  'cryptoquant',
  'tavily',
  'polymarketGamma',
  'polymarketWallet',
  'xMonitor',
  'walletMonitor',
  'clob',
  'kalshi',
  'paperTrading',
  'cotBuilder',
]);

export const SUB_AGENT_NODE_TYPES = new Set(['newsAgent', 'arbitrageAgent', 'riskAnalyzer']);

export const MIND_AGENT_NODE_TYPES = new Set(['sportsScanner']);

export const ORCHESTRATOR_NODE_TYPE = 'llm';

export type WiredInput = {
  id: string;
  type: string;
  label: string;
  category: 'tool' | 'subagent' | 'mindagent' | 'orchestrator' | 'other';
};

function categoryForType(type: string | undefined): WiredInput['category'] {
  if (!type) return 'other';
  if (PURE_TOOL_NODE_TYPES.has(type)) return 'tool';
  if (SUB_AGENT_NODE_TYPES.has(type)) return 'subagent';
  if (MIND_AGENT_NODE_TYPES.has(type)) return 'mindagent';
  if (type === ORCHESTRATOR_NODE_TYPE) return 'orchestrator';
  return 'other';
}

export function wiredInputsForNode(
  nodeId: string,
  nodes: WorkflowNode[],
  edges: Edge[],
): WiredInput[] {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const incoming = edges.filter((e) => e.target === nodeId);
  const seen = new Set<string>();
  const result: WiredInput[] = [];

  for (const edge of incoming) {
    const src = byId.get(edge.source);
    const type = src?.type ?? 'unknown';
    if (seen.has(edge.source)) continue;
    seen.add(edge.source);
    result.push({
      id: edge.source,
      type,
      label: src?.data?.label ?? type,
      category: categoryForType(type),
    });
  }

  return result;
}

export function partitionWiredInputs(inputs: WiredInput[]) {
  return {
    tools: inputs.filter((i) => i.category === 'tool'),
    feeds: inputs.filter((i) => i.category === 'subagent' || i.category === 'mindagent'),
    other: inputs.filter(
      (i) => i.category !== 'tool' && i.category !== 'subagent' && i.category !== 'mindagent',
    ),
  };
}

/** Marketplace / Kafka feed id for a sub-agent or mind-agent source node. */
export function agentFeedIdForSourceNode(node: WorkflowNode | undefined): string | null {
  if (!node?.type) return null;
  if (node.type === 'newsAgent') return 'newsAgent';
  if (node.type === 'arbitrageAgent') return 'arbitrageAgent';
  if (node.type === 'riskAnalyzer') return 'riskAnalyzer';
  if (node.type === 'sportsScanner') {
    return String(node.data?.agentId ?? 'sportsScanner.user_demo');
  }
  return null;
}

/** When Output is wired from a live sub-agent, return its feed agent id. */
export function upstreamAgentFeedId(
  outputNodeId: string,
  nodes: WorkflowNode[],
  edges: Edge[],
): string | null {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  for (const edge of edges) {
    if (edge.target !== outputNodeId) continue;
    const feedId = agentFeedIdForSourceNode(byId.get(edge.source));
    if (feedId) return feedId;
  }
  return null;
}
