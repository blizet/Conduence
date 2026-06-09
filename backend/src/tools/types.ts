export type MarketVenue = 'polymarket' | 'kalshi';

export type MarketRef = {
  id: string;
  venue: MarketVenue;
  title: string;
  slug?: string;
  conditionId?: string;
  ticker?: string;
  url?: string;
};

export type MarketCorrelation = {
  pmId: string;
  kalId: string;
  score: number;
  category?: string;
};

export type CorrelatedMarketsResult = {
  polymarket: MarketRef[];
  kalshi: MarketRef[];
  correlations: MarketCorrelation[];
  categories?: string[];
};

export type GeminiTradeDecision = {
  action: 'BUY_YES' | 'BUY_NO' | 'HOLD';
  market_id: string;
  market_slug?: string;
  market_title?: string;
  condition_id?: string;
  conviction_level: number;
  thesis: string;
  tags: string[];
  reasoning: string;
};

export type DecisionEventDraft = {
  schema_version: string;
  operation: 'assert' | 'revise' | 'retract';
  graph_id: string;
  decision_id: string;
  updated_at: string;
  nodes: Array<{
    node_id: string;
    node_type: string;
    properties?: Record<string, unknown>;
    label?: string;
  }>;
  edges: Array<Record<string, unknown>>;
  provenance?: { raw_sources?: string[] };
};

export type CotBuilderOptions = {
  graphId?: string;
  userNodeId?: string;
  tradeId?: string;
};

export type WhaleTrackRequest = {
  polymarketMarkets?: MarketRef[];
  keywords?: string[];
  headline?: string;
  walletAddresses?: string[];
  conditionId?: string;
  apiKey?: string;
};

export type WhaleActivityEntry = {
  wallet: string;
  pseudonym: string;
  name: string;
  market: MarketRef;
  side: 'BUY' | 'SELL';
  outcome: string;
  size: number;
  price: number;
  timestamp: number;
  transactionHash: string;
};

export type WhaleActivityResult = {
  entries: WhaleActivityEntry[];
};

export type WhaleWalletConfig = {
  proxyWallet: string;
  pseudonym: string;
  name: string;
  amount?: number;
};

export type ClobQuoteRequest = {
  tokenId: string;
};

export type ClobQuoteResult = {
  tokenId: string;
  orderbook: unknown;
  lastTradePrice: unknown;
  spread: unknown;
  midpoint: unknown;
};

export type ClobExecuteRequest = {
  tokenId: string;
  side: 'BUY' | 'SELL';
  size: number;
  price: number;
  apiKey?: string;
  apiSecret?: string;
  apiPassphrase?: string;
};

export type ClobExecuteResult = {
  status: 'dry_run' | 'submitted' | 'error';
  message?: string;
  orderId?: string;
  tokenId: string;
  side: 'BUY' | 'SELL';
  size: number;
  price: number;
};
