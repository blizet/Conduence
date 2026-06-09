import type { NewsSentiment } from './types';

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

export function inferSentiment(headline: string): NewsSentiment {
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

  const upperTokens = new Set(text.match(/\b[A-Z]{2,5}\b/g)?.map((t) => t) ?? []);

  for (const t of tokens) {
    if (SHORT_TAIL_MAP[t]) keywords.add(SHORT_TAIL_MAP[t]);
  }

  for (const t of upperTokens) {
    if (!STOPWORDS.has(t.toLowerCase())) keywords.add(t);
  }

  return [...keywords].slice(0, 8);
}

/** Map headline/keywords to correlation categories (Crypto, Finance, …). */
const CATEGORY_HINTS: Record<string, string[]> = {
  Crypto: [
    'btc', 'bitcoin', 'eth', 'ethereum', 'crypto', 'sol', 'solana', 'xrp', 'doge', 'defi', 'nft',
    'blockchain', 'stablecoin', 'token', 'binance', 'coinbase',
  ],
  Finance: ['stock', 'ipo', 'etf', 'bank', 'visa', 'microstrategy', 'mstr', 'earnings', 'market'],
  Economics: ['fed', 'inflation', 'gdp', 'rates', 'treasury', 'jobs', 'recession', 'cpi'],
  Politics: ['election', 'trump', 'biden', 'congress', 'sec', 'regulation', 'sanction', 'war'],
  Entertainment: ['movie', 'celebrity', 'sport', 'nfl', 'nba', 'oscar', 'music'],
  Weather: ['hurricane', 'storm', 'climate', 'weather', 'flood', 'drought'],
};

export const NEWS_CATEGORIES = Object.keys(CATEGORY_HINTS);

export function inferNewsCategories(headline: string, keywords: string[] = []): string[] {
  const text = `${headline} ${keywords.join(' ')}`.toLowerCase();
  const matched: string[] = [];
  for (const [category, hints] of Object.entries(CATEGORY_HINTS)) {
    if (hints.some((h) => text.includes(h))) matched.push(category);
  }
  return matched.length > 0 ? matched : ['Finance'];
}
