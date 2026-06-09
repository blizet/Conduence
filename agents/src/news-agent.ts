import { NEWS_POLL_INTERVAL_MS } from './config';
import { fetchCoinDeskNews } from './coindesk';
import { extractShortTailKeywords, inferNewsCategories, inferSentiment } from './news-utils';
import type { CoinDeskArticle, NewsSignal } from './types';

function resolveApiKey(apiKey?: string): string {
  const key = apiKey?.trim() || process.env.COINDESK_API_KEY?.trim();
  if (!key) {
    throw new Error('CoinDesk API key required — set COINDESK_API_KEY or pass apiKey');
  }
  return key;
}

function articleToSignal(article: CoinDeskArticle): NewsSignal {
  const headline = article.title;
  const summary = article.summary ?? '';
  const keywords = extractShortTailKeywords(headline, summary);
  return {
    headline,
    url: article.url ?? '',
    publishedAt: article.publishedAt ?? new Date().toISOString(),
    sentiment: inferSentiment(headline),
    keywords,
    categories: inferNewsCategories(headline, keywords),
    source: article.source ?? 'CoinDesk',
  };
}

function signalKey(signal: NewsSignal): string {
  return signal.url || signal.headline;
}

/** Autonomous news mind agent — polls CoinDesk Data API. */
export class NewsAgent {
  private readonly pollMs: number;
  private readonly seenKeys = new Set<string>();

  constructor(pollMs = NEWS_POLL_INTERVAL_MS) {
    this.pollMs = pollMs;
  }

  async pollOnce(apiKey?: string, limit = 20): Promise<NewsSignal[]> {
    const key = resolveApiKey(apiKey);
    const { articles } = await fetchCoinDeskNews({ apiKey: key, limit });
    return articles
      .map(articleToSignal)
      .sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime());
  }

  async *streamNewsSignals(apiKey?: string, limit = 20): AsyncGenerator<NewsSignal> {
    const key = resolveApiKey(apiKey);

    while (true) {
      try {
        const batch = await this.pollOnce(key, limit);
        const fresh = batch.filter((signal) => !this.seenKeys.has(signalKey(signal)));

        if (fresh.length > 0) {
          const signal = fresh[0];
          this.seenKeys.add(signalKey(signal));
          yield signal;
        }
      } catch (err) {
        console.warn(`[news-agent] poll failed: ${err instanceof Error ? err.message : err}`);
      }

      await new Promise((r) => setTimeout(r, this.pollMs));
    }
  }

  /** Run autonomously — logs each fresh headline to stdout. */
  async run(apiKey?: string, limit = 20): Promise<void> {
    console.log('[news-agent] starting CoinDesk feed (autonomous)');
    console.log(`[news-agent] poll interval=${this.pollMs}ms limit=${limit}`);

    for await (const news of this.streamNewsSignals(apiKey, limit)) {
      console.log(
        `[news-agent] ${news.sentiment} keywords=[${news.keywords.join(', ')}] "${news.headline.slice(0, 100)}"`,
      );
      console.log(JSON.stringify(news));
    }
  }
}

export const newsAgent = new NewsAgent();
