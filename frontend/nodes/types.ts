import type { Node } from '@xyflow/react';
import type { LlmProvider } from '@/lib/llm-providers';

export type NodeCategory = 'tool' | 'mindagent' | 'subagent';

export type ClobMode = 'read' | 'execute';
export type ClobTokenSource = 'upstream' | 'manual';
export type ClobExecuteSide = 'BUY' | 'SELL' | 'BOTH';

export type WorkflowNodeData = {
  label: string;
  description?: string;
  category: NodeCategory;
  accent: string;
  apiKey?: string;
  llmApiKey?: string;
  llmProvider?: LlmProvider;
  apiSecret?: string;
  apiPassphrase?: string;
  systemPrompt?: string;
  userPrompt?: string;
  model?: string;
  temperature?: string;
  maxTokens?: string;
  newsPollLimit?: string;
  newsFilterCategories?: string[];
  graphId?: string;
  userNodeId?: string;
  backendUrl?: string;
  autoEmit?: boolean;
  decisionJson?: string;
  correlatedJson?: string;
  cotOutput?: string;
  cotStatus?: string;
  tokenId?: string;
  tradeSide?: 'BUY' | 'SELL';
  tradeSize?: string;
  tradePrice?: string;
  clobMode?: ClobMode;
  clobTokenSource?: ClobTokenSource;
  executeSide?: ClobExecuteSide;
  clobStatus?: string;
  clobQuoteJson?: string;
  walletAddresses?: string[];
  conditionId?: string;
  whaleStatus?: string;
  whaleOutput?: string;
  workflowStatus?: 'idle' | 'running' | 'success' | 'error';
  workflowResult?: string;
  workflowError?: string;
  outputStatus?: string;
  outputPayload?: string;
  outputSource?: string;
  cmcSymbols?: string;
  cmcConvert?: string;
  defillamaMode?:
    | 'protocols'
    | 'protocol'
    | 'tvl'
    | 'chains'
    | 'historicalChainTvl'
    | 'chain'
    | 'tokenProtocols';
  defillamaProtocol?: string;
  defillamaChain?: string;
  defillamaSymbol?: string;
  cryptonewsTickers?: string;
  cryptonewsItems?: string;
  cryptonewsSentiment?: string;
  cryptonewsKeywords?: string;
  cryptoquantMetric?: string;
  cryptoquantSymbol?: string;
  cryptoquantWindow?: string;
  cryptoquantExchange?: string;
  tavilyQuery?: string;
  tavilySearchDepth?: 'basic' | 'advanced';
  tavilyMaxResults?: string;
  coingeckoIds?: string;
  gammaKeywords?: string;
  gammaLimit?: string;
  gammaMinVolume?: string;
  gammaMinLiquidity?: string;
  gammaMaxSpread?: string;
  pmWallet?: string;
  pmWalletAction?: 'trades' | 'positions';
  pmWalletLimit?: string;
  divBaseId?: string;
  divOtherId?: string;
  divBaseChange?: string;
  divOtherChange?: string;
  divExpectedCorr?: string;
  simulate?: boolean;
};

export type WorkflowNode = Node<WorkflowNodeData>;

export type PaletteItem = {
  type: string;
  label: string;
  description: string;
  category: NodeCategory;
  accent: string;
};

export type HandleConfig = {
  type: 'source' | 'target';
  position: 'left' | 'right' | 'top' | 'bottom';
  id?: string;
  label?: string;
  style?: React.CSSProperties;
};

export const MARKET_CATEGORIES = [
  'Crypto',
  'Finance',
  'Economics',
  'Politics',
  'Entertainment',
  'Weather',
] as const;

export type MarketCategory = (typeof MARKET_CATEGORIES)[number];

export const LLM_INPUT_COUNT = 4;
export const LLM_OUTPUT_COUNT = 3;
