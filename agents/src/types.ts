export type NewsSentiment = 'bullish' | 'bearish' | 'neutral';

export type NewsSignal = {
  headline: string;
  url: string;
  publishedAt: string;
  sentiment: NewsSentiment;
  keywords: string[];
  categories?: string[];
  source: string;
};

export type CoinDeskArticle = {
  id?: string;
  guid?: string;
  sourceId?: string;
  title: string;
  url?: string;
  publishedAt?: string;
  source?: string;
  summary?: string;
};

/** Latest Articles — `/news/v1/article/list` */
export type CoinDeskLatestArticlesRequest = {
  apiKey: string;
  limit?: number;
  language?: string;
  sourceId?: string;
  categories?: string[];
  excludeCategories?: string[];
  toTimestamp?: number;
};

/** @deprecated alias */
export type CoinDeskNewsRequest = CoinDeskLatestArticlesRequest;

export type CoinDeskNewsResult = {
  articles: CoinDeskArticle[];
  sources?: unknown;
  raw?: unknown;
};

/** Sources — `/news/v1/source/list` */
export type CoinDeskSourcesRequest = {
  apiKey: string;
  language?: string;
  sourceType?: string;
  status?: string;
};

/** Categories — `/news/v1/category/list` */
export type CoinDeskCategoriesRequest = {
  apiKey: string;
  status?: string;
};

/** Single Article — `/news/v1/article/get` */
export type CoinDeskArticleGetRequest = {
  apiKey: string;
  sourceId: string;
  guid: string;
};

/** News Search — `/news/v1/search` */
export type CoinDeskSearchRequest = {
  apiKey: string;
  query: string;
  limit?: number;
  language?: string;
  sourceIds?: string[];
  languages?: string[];
};

export type AutonomousAgentConfig = {
  apiKey?: string;
  limit?: number;
  [key: string]: unknown;
};

export type AutonomousAgentDefinition = {
  id: string;
  eventType: string;
  feedTopic: string;
  validateConfig: (config: AutonomousAgentConfig) => Promise<void>;
  streamSignals: (config: AutonomousAgentConfig) => AsyncGenerator<unknown>;
};
