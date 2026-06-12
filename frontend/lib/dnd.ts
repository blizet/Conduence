import { DEFAULT_LLM_PROVIDER, defaultModelForProvider } from '@/lib/llm-providers';
import type { PaletteItem, WorkflowNodeData } from '@/nodes/types';
import {
  DEFAULT_COT_CORRELATED_JSON,
  DEFAULT_COT_DECISION_JSON,
  DEFAULT_COT_GRAPH_ID,
  DEFAULT_COT_USER_NODE_ID,
  DEFAULT_LLM_SYSTEM_PROMPT,
  DEFAULT_LLM_USER_PROMPT,
  DEFAULT_WHALE_WALLET_SYSTEM_PROMPT,
  DEFAULT_WHALE_WALLET_USER_PROMPT,
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
  newsAgent: { apiKey: '', newsPollLimit: '20' },
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
  cotBuilder: {
    graphId: DEFAULT_COT_GRAPH_ID,
    userNodeId: DEFAULT_COT_USER_NODE_ID,
    autoEmit: false,
    decisionJson: DEFAULT_COT_DECISION_JSON,
    correlatedJson: DEFAULT_COT_CORRELATED_JSON,
  },
  whaleWallet: {
    simulate: false,
    walletAddresses: [''],
    apiKey: '',
    llmProvider: DEFAULT_LLM_PROVIDER,
    llmApiKey: '',
    model: defaultModelForProvider(DEFAULT_LLM_PROVIDER),
    systemPrompt: DEFAULT_WHALE_WALLET_SYSTEM_PROMPT,
    userPrompt: DEFAULT_WHALE_WALLET_USER_PROMPT,
  },
  divergenceAgent: {
    simulate: false,
    llmProvider: DEFAULT_LLM_PROVIDER,
    llmApiKey: '',
    model: defaultModelForProvider(DEFAULT_LLM_PROVIDER),
  },
  coinmarketcap: {
    toolAccessMode: 'private',
    toolEndpoint: 'quotes_latest',
    apiKey: '',
    cmcSymbols: 'BTC,ETH',
    cmcConvert: 'USD',
  },
  defillama: {
    toolAccessMode: 'public',
    toolEndpoint: 'protocols',
    defillamaMode: 'protocols',
    defillamaProtocol: 'lido',
    defillamaChain: 'Ethereum',
    defillamaSymbol: 'usdt',
    apiKey: '',
  },
  cryptonews: {
    toolAccessMode: 'private',
    toolEndpoint: 'ticker_news',
    apiKey: '',
    cryptonewsTickers: 'BTC',
    cryptonewsItems: '10',
    cryptonewsSentiment: '',
    cryptonewsKeywords: '',
  },
  cryptoquant: {
    toolAccessMode: 'private',
    toolEndpoint: 'metric',
    apiKey: '',
    cryptoquantMetric: 'btc/exchange-flows/inflow',
    cryptoquantSymbol: 'btc',
    cryptoquantWindow: 'day',
    cryptoquantExchange: '',
  },
  tavily: {
    toolAccessMode: 'private',
    toolEndpoint: 'search',
    apiKey: '',
    tavilyQuery: '',
    tavilySearchDepth: 'basic',
    tavilyMaxResults: '5',
    tavilyUrls: '',
  },
  coingecko: {
    toolAccessMode: 'public',
    toolEndpoint: 'simple_price',
    coingeckoIds: 'bitcoin,ethereum',
  },
  polymarketGamma: {
    toolAccessMode: 'public',
    toolEndpoint: 'markets_search',
    gammaKeywords: 'bitcoin',
  },
  polymarketWallet: {
    toolAccessMode: 'public',
    toolEndpoint: 'wallet_trades',
  },
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
