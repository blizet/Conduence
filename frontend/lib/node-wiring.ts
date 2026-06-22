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
]);

export const ORCHESTRATOR_NODE_TYPE = 'llm';

export type WiredInput = {
  id: string;
  type: string;
  label: string;
  category: 'tool' | 'orchestrator' | 'other';
};

function categoryForType(type: string | undefined): WiredInput['category'] {
  if (!type) return 'other';
  if (PURE_TOOL_NODE_TYPES.has(type)) return 'tool';
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
    other: inputs.filter((i) => i.category !== 'tool'),
  };
}
