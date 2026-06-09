export type NewsSentiment = 'bullish' | 'bearish' | 'neutral';

/** Payload shape for news.signal events on agent.feeds.{agentId}.public */
export type NewsSignalPayload = {
  headline: string;
  url: string;
  publishedAt: string;
  sentiment: NewsSentiment;
  keywords: string[];
  categories: string[];
  source: string;
};
