import type { Edge } from '@xyflow/react';
import { DEFAULT_LLM_PROVIDER, defaultModelForProvider } from '@/lib/llm-providers';
import type { PaletteItem, WorkflowNodeData } from '@/nodes/types';
import {
  DEFAULT_COT_GRAPH_ID,
  DEFAULT_LLM_SYSTEM_PROMPT,
  DEFAULT_LLM_USER_PROMPT,
} from '@/nodes/constants';

let nodeId = 0;

export function getNodeId(): string {
  nodeId += 1;
  return `node_${Date.now()}_${nodeId}_${Math.random().toString(36).slice(2, 7)}`;
}

/** Ensure React Flow node ids are unique (fixes duplicate `node_1` from legacy saves). */
export function normalizeWorkflowCanvas<T extends { id: string }>(
  nodes: T[],
  edges: Edge[],
): { nodes: T[]; edges: Edge[] } {
  const used = new Set<string>();
  const remap = new Map<string, string>();

  const normalizedNodes = nodes.map((node) => {
    if (!used.has(node.id)) {
      used.add(node.id);
      return node;
    }
    const newId = getNodeId();
    remap.set(node.id, newId);
    used.add(newId);
    return { ...node, id: newId };
  });

  if (remap.size === 0) {
    return { nodes: normalizedNodes, edges };
  }

  const normalizedEdges = edges.map((edge) => ({
    ...edge,
    source: remap.get(edge.source) ?? edge.source,
    target: remap.get(edge.target) ?? edge.target,
  }));

  return { nodes: normalizedNodes, edges: normalizedEdges };
}

const DEFAULTS: Partial<Record<string, Partial<WorkflowNodeData>>> = {
  llm: {
    llmProvider: DEFAULT_LLM_PROVIDER,
    apiKey: '',
    model: defaultModelForProvider(DEFAULT_LLM_PROVIDER),
    temperature: '0.7',
    maxTokens: '2048',
    systemPrompt: DEFAULT_LLM_SYSTEM_PROMPT,
    userPrompt: DEFAULT_LLM_USER_PROMPT,
    newsFilterCategories: [],
    contextGraph: 'correlation',
    graphId: DEFAULT_COT_GRAPH_ID,
  },
  newsAgent: {
    apiKey: '',
    newsPollLimit: '20',
    llmProvider: DEFAULT_LLM_PROVIDER,
    llmApiKey: '',
    model: defaultModelForProvider(DEFAULT_LLM_PROVIDER),
    userPrompt: '',
  },
  arbitrageAgent: {
    simulate: false,
    llmProvider: DEFAULT_LLM_PROVIDER,
    llmApiKey: '',
    model: defaultModelForProvider(DEFAULT_LLM_PROVIDER),
    userPrompt: '',
  },
  riskAnalyzer: {
    simulate: false,
    portfolioUsd: '10000',
    riskPctMin: '0.02',
    riskPctMax: '0.05',
    maxLiquidityFraction: '0.05',
    minConfidence: '0.55',
    maxOpenRiskUsd: '',
    tradeAction: 'BUY_YES',
    tradeMarketId: '',
    tradeTitle: '',
    tradeConfidence: '0.65',
    tradePrice: '',
    tradeVenue: 'polymarket',
    userPrompt: '',
  },
  clob: {
    tradeSize: '',
    tradePrice: '',
    apiKey: '',
    apiSecret: '',
    apiPassphrase: '',
  },
  kalshi: {
    kalshiCount: '',
    kalshiPrice: '',
    apiKey: '',
    apiSecret: '',
  },
  paperTrading: {
    paperWorkflowId: '',
    paperSessionId: '',
  },
  telegram: {
    apiKey: '',
    telegramUsername: '',
    telegramChatId: '',
    telegramMessagePrefix: '',
  },
  coinmarketcap: { apiKey: '' },
  defillama: { apiKey: '', defillamaMode: 'protocols', toolEndpoint: 'protocols' },
  cryptonews: { apiKey: '' },
  cryptoquant: { apiKey: '' },
  tavily: { apiKey: '' },
  coingecko: { apiKey: '' },
  polymarketGamma: {},
  polymarketWallet: {},
  xMonitor: {
    xMonitorUsernames: '',
    xMonitorAlertCriteria: '',
    xMonitorTopics: '',
    xMonitorLimit: '10',
    apiKey: '',
  },
  walletMonitor: {
    walletMonitorPlatform: 'polymarket',
    walletMonitorWallets: '',
    walletMonitorCategories: '',
    walletMonitorSuppressKeywords: '',
    walletMonitorLimit: '20',
    apiKey: '',
    apiSecret: '',
  },
};

export function createNodeData(item: PaletteItem): WorkflowNodeData {
  return {
    label: item.label,
    description: item.description,
    category: item.category,
    accent: item.accent,
    ...(item.toolGroup ? { toolGroup: item.toolGroup } : {}),
    ...DEFAULTS[item.type],
  };
}

export const DND_TYPE = 'application/reactflow';
