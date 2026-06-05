import Parser from 'rss-parser';
import { NEWS_POLL_INTERVAL_MS } from '../lib/main-agent.config';
import type { NewsSentiment, NewsSignal } from './types';

const DEFAULT_FEEDS: Array<{ name: string; url: string }> = [
  { name: 'CoinDesk', url: 'https://www.coindesk.com/arc/outboundfeeds/rss/' },
  { name: 'Cointelegraph', url: 'https://cointelegraph.com/rss' },
];

const SHORT_TAIL_MAP: Record<string, string> = {
  bitcoin: 'BTC',
  btc: 'BTC',
  ethereum: 'ETH',
  eth: 'ETH',
  solana: 'SOL',
  sol: 'SOL',
  xrp: 'XRP',
  dogecoin: 'DOGE',
  doge: 'DOGE',
  etf: 'ETF',
  ipo: 'IPO',
  spacex: 'SpaceX',
  microstrategy: 'MicroStrategy',
  mstr: 'MicroStrategy',
  zcash: 'ZEC',
  ripple: 'XRP',
  stablecoin: 'stablecoin',
  visa: 'Visa',
  sec: 'SEC',
  fed: 'Fed',
  inflation: 'inflation',
  regulation: 'regulation',
  hack: 'hack',
  defi: 'DeFi',
  nft: 'NFT',
};

const BULLISH_WORDS = new Set([
  'surge', 'rally', 'soar', 'jump', 'gain', 'rise', 'bull', 'record', 'high', 'approval', 'launch',
]);

const BEARISH_WORDS = new Set([
  'drop', 'fall', 'crash', 'plunge', 'decline', 'bear', 'hack', 'ban', 'lawsuit', 'selloff', 'loss',
]);

const STOPWORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'to', 'of', 'in', 'on', 'at', 'by', 'for', 'is', 'will', 'be',
  'as', 'it', 'its', 'this', 'that', 'with', 'from', 'after', 'before', 'says', 'new', 'how', 'why',
]);

function parseFeedsFromEnv(): Array<{ name: string; url: string }> {
  const raw = process.env.NEWS_RSS_FEEDS;
  if (!raw) return DEFAULT_FEEDS;
  try {
    const parsed = JSON.parse(raw) as Array<{ name: string; url: string }>;
    return parsed.length ? parsed : DEFAULT_FEEDS;
  } catch {
    return DEFAULT_FEEDS;
  }
}

function inferSentiment(headline: string): NewsSentiment {
  const tokens = headline.toLowerCase().split(/[^a-z0-9]+/);
  let bull = 0;
  let bear = 0;
  for (const t of tokens) {
    if (BULLISH_WORDS.has(t)) bull += 1;
    if (BEARISH_WORDS.has(t)) bear += 1;
  }
  if (bull > bear) return 'bullish';
  if (bear > bull) return 'bearish';
  return 'neutral';
}

export function extractShortTailKeywords(headline: string, summary?: string): string[] {
  const text = `${headline} ${summary ?? ''}`;
  const keywords = new Set<string>();

  for (const [raw, canonical] of Object.entries(SHORT_TAIL_MAP)) {
    const re = new RegExp(`\\b${raw}\\b`, 'i');
    if (re.test(text)) keywords.add(canonical);
  }

  const tokens = text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length >= 2 && t.length <= 12 && !STOPWORDS.has(t));

  const upperTokens = new Set(
    text.match(/\b[A-Z]{2,5}\b/g)?.map((t) => t) ?? [],
  );

  for (const t of tokens) {
    if (SHORT_TAIL_MAP[t]) {
      keywords.add(SHORT_TAIL_MAP[t]);
    }
  }

  for (const t of upperTokens) {
    if (!STOPWORDS.has(t.toLowerCase())) keywords.add(t);
  }

  return [...keywords].slice(0, 8);
}

function signalKey(signal: NewsSignal): string {
  return signal.url || signal.headline;
}

export class NewsAgent {
  private readonly parser = new Parser();
  private readonly feeds = parseFeedsFromEnv();
  private readonly pollMs: number;
  private readonly seenKeys = new Set<string>();

  constructor(pollMs = NEWS_POLL_INTERVAL_MS) {
    this.pollMs = pollMs;
  }

  private async pollOnce(): Promise<NewsSignal[]> {
    const cycleGuids = new Set<string>();
    const signals: NewsSignal[] = [];

    for (const feed of this.feeds) {
      try {
        const parsed = await this.parser.parseURL(feed.url);
        for (const item of parsed.items ?? []) {
          const guid = item.guid ?? item.link ?? item.title ?? '';
          if (!guid || cycleGuids.has(guid)) continue;
          cycleGuids.add(guid);

          const headline = item.title?.trim() ?? '';
          if (!headline) continue;

          signals.push({
            headline,
            url: item.link ?? '',
            publishedAt: item.pubDate ? new Date(item.pubDate).toISOString() : new Date().toISOString(),
            sentiment: inferSentiment(headline),
            keywords: extractShortTailKeywords(headline, item.contentSnippet),
            source: feed.name,
          });
        }
      } catch (err) {
        console.warn(`[news-agent] feed ${feed.name} failed: ${err}`);
      }
    }

    return signals.sort(
      (a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime(),
    );
  }

  async *streamNewsSignals(): AsyncGenerator<NewsSignal> {
    while (true) {
      const batch = await this.pollOnce();
      const fresh = batch.filter((signal) => !this.seenKeys.has(signalKey(signal)));

      if (fresh.length > 0) {
        const signal = fresh[0];
        this.seenKeys.add(signalKey(signal));
        yield signal;
      }

      await new Promise((r) => setTimeout(r, this.pollMs));
    }
  }
}

export const newsAgent = new NewsAgent();
