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

export type NewsSentiment = 'bullish' | 'bearish' | 'neutral';

export type NewsSignal = {
  headline: string;
  url: string;
  publishedAt: string;
  sentiment: NewsSentiment;
  keywords: string[];
  source: string;
};

export type CorrelateRequest = {
  keywords: string[];
  headline?: string;
};

export type MarketCorrelation = {
  pmId: string;
  kalId: string;
  score: number;
};

export type CorrelatedMarketsResult = {
  polymarket: MarketRef[];
  kalshi: MarketRef[];
  correlations: MarketCorrelation[];
};

export type WhaleTrackRequest = {
  polymarketMarkets: MarketRef[];
  keywords?: string[];
  headline?: string;
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

export type MainInferenceInput = {
  news: NewsSignal;
  correlated: CorrelatedMarketsResult;
  whales: WhaleActivityResult;
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
