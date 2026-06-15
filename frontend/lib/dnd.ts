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
  telegram: {
    apiKey: '',
    telegramUsername: '',
    telegramChatId: '',
    telegramMessagePrefix: '',
  },
  cotBuilder: {
    graphId: DEFAULT_COT_GRAPH_ID,
    userNodeId: DEFAULT_COT_USER_NODE_ID,
    autoEmit: false,
    decisionJson: DEFAULT_COT_DECISION_JSON,
    correlatedJson: DEFAULT_COT_CORRELATED_JSON,
  },
  coinmarketcap: { apiKey: '' },
  defillama: { apiKey: '', defillamaMode: 'protocols', toolEndpoint: 'protocols' },
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
    ...(item.toolGroup ? { toolGroup: item.toolGroup } : {}),
    ...DEFAULTS[item.type],
  };
}

export const DND_TYPE = 'application/reactflow';
