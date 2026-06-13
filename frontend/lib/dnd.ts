import { DEFAULT_LLM_PROVIDER, defaultModelForProvider } from '@/lib/llm-providers';
import type { PaletteItem, WorkflowNodeData } from '@/nodes/types';
import {
  DEFAULT_COT_CORRELATED_JSON,
  DEFAULT_COT_DECISION_JSON,
  DEFAULT_COT_GRAPH_ID,
  DEFAULT_COT_USER_NODE_ID,
  DEFAULT_LLM_SYSTEM_PROMPT,
  DEFAULT_LLM_USER_PROMPT,
} from '@/nodes/constants';

let nodeId = 0;

export function getNodeId(): string {
  nodeId += 1;
  return `node_${nodeId}`;
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
  },
  arbitrageAgent: {
    simulate: false,
    llmProvider: DEFAULT_LLM_PROVIDER,
    llmApiKey: '',
    model: defaultModelForProvider(DEFAULT_LLM_PROVIDER),
  },
  clob: {
    clobMode: 'read',
    clobTokenSource: 'manual',
    executeSide: 'BOTH',
    tokenId: '',
    tradeSize: '',
    tradePrice: '',
    apiKey: '',
    apiSecret: '',
    apiPassphrase: '',
  },
  kalshi: {
    kalshiMode: 'read',
    kalshiTradeSource: 'manual',
    kalshiTicker: '',
    kalshiSide: 'yes',
    kalshiAction: 'buy',
    kalshiCount: '',
    kalshiPrice: '',
    apiKey: '',
    apiSecret: '',
  },
  cotBuilder: {
    graphId: DEFAULT_COT_GRAPH_ID,
    userNodeId: DEFAULT_COT_USER_NODE_ID,
    autoEmit: false,
    decisionJson: DEFAULT_COT_DECISION_JSON,
    correlatedJson: DEFAULT_COT_CORRELATED_JSON,
  },
  coinmarketcap: { apiKey: '' },
  defillama: { apiKey: '' },
  cryptonews: { apiKey: '' },
  cryptoquant: { apiKey: '' },
  tavily: { apiKey: '' },
  coingecko: { apiKey: '' },
  polymarketGamma: {},
  polymarketWallet: {},
};

export function createNodeData(item: PaletteItem): WorkflowNodeData {
  return {
    label: item.label,
    description: item.description,
    category: item.category,
    accent: item.accent,
    ...DEFAULTS[item.type],
  };
}

export const DND_TYPE = 'application/reactflow';
