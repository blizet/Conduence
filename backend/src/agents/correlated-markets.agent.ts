import { CORRELATED_MARKETS_LIMIT } from '../lib/main-agent.config';
import type {
  CorrelateRequest,
  CorrelatedMarketsResult,
  MarketCorrelation,
  MarketRef,
} from './types';

const TOTALIS_URL =
  'https://app.totalis.trade/api/kalshi/markets?limit=21&category=Crypto';
const GAMMA_CRYPTO_URL =
  'https://gamma-api.polymarket.com/markets?active=true&tag=crypto&limit=50';
const GAMMA_SEARCH_URL = 'https://gamma-api.polymarket.com/public-search';

const FETCH_TIMEOUT_MS = Number(process.env.AGENT_FETCH_TIMEOUT_MS ?? 15_000);

const KEYWORD_ALIASES: Record<string, string[]> = {
  BTC: ['btc', 'bitcoin'],
  ETH: ['eth', 'ethereum'],
  SOL: ['sol', 'solana'],
  XRP: ['xrp', 'ripple'],
  ZEC: ['zec', 'zcash'],
  DOGE: ['doge', 'dogecoin'],
  ETF: ['etf'],
  IPO: ['ipo'],
  SEC: ['sec'],
  AI: ['ai', 'artificial intelligence'],
  DEFI: ['defi', 'decentralized finance'],
};

const SEARCH_ALIASES: Record<string, string[]> = {
  BTC: ['Bitcoin'],
  ETH: ['Ethereum'],
  SOL: ['Solana'],
  XRP: ['XRP', 'Ripple'],
  ZEC: ['Zcash'],
  DOGE: ['Dogecoin'],
  MSTR: ['MicroStrategy'],
  FED: ['Federal Reserve', 'Fed rate'],
};

const ASSET_TOKENS = new Set([
  'btc', 'bitcoin', 'eth', 'ethereum', 'sol', 'solana', 'xrp', 'doge', 'dogecoin',
]);

const STOPWORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'to', 'of', 'in', 'on', 'at', 'by', 'for', 'is',
  'will', 'be', 'as', 'it', 'its', 'this', 'that', 'with', 'from', 'before', 'after',
  'what', 'here', 'says', 'could', 'warn', 'experts', 'today', 'nobody', 'told',
]);

type KalshiMarketRaw = {
  ticker: string;
  title: string;
  subtitle?: string | null;
  yes_sub_title?: string;
  subcategory?: string;
  series_title?: string;
  event_title?: string;
};

type TotalisResponse = {
  data?: {
    events?: Array<{
      markets?: KalshiMarketRaw[];
    }>;
  };
};

type GammaMarketRaw = {
  id: string;
  question: string;
  slug: string;
  conditionId?: string;
  active?: boolean;
  closed?: boolean;
  events?: Array<{ title?: string }>;
};

type GammaSearchEvent = {
  title?: string;
  description?: string;
  slug?: string;
  markets?: GammaMarketRaw[];
};

type GammaSearchResponse = {
  events?: GammaSearchEvent[];
  markets?: GammaMarketRaw[];
};

async function fetchJson<T>(url: string): Promise<T | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function normalizeToken(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function tokenize(text: string): Set<string> {
  const tokens = new Set<string>();
  for (const part of normalizeToken(text).split(/\s+/)) {
    if (part.length < 2 || STOPWORDS.has(part)) continue;
    tokens.add(part);
  }
  return tokens;
}

function expandKeywords(keywords: string[], headline?: string): Set<string> {
  const expanded = new Set<string>();
  for (const kw of keywords) {
    const upper = kw.toUpperCase();
    const aliases = KEYWORD_ALIASES[upper] ?? [normalizeToken(kw)];
    for (const alias of aliases) {
      if (alias) expanded.add(alias);
    }
  }
  if (headline) {
    for (const t of tokenize(headline)) expanded.add(t);
  }
  return expanded;
}

function keywordMatchesText(text: string, keyword: string): boolean {
  const norm = normalizeToken(text);
  const kw = keyword.toLowerCase();
  if (kw.length <= 3) {
    return new RegExp(`\\b${kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(text);
  }
  return norm.includes(kw) || tokenize(text).has(kw);
}

function scoreText(text: string, keywords: Set<string>): number {
  let score = 0;
  for (const kw of keywords) {
    if (keywordMatchesText(text, kw)) {
      score += kw.length <= 3 ? 3 : 2;
    }
  }
  return score;
}

function extractAssets(text: string): Set<string> {
  const assets = new Set<string>();
  for (const t of tokenize(text)) {
    if (ASSET_TOKENS.has(t)) assets.add(t);
    if (t === 'bitcoin') assets.add('btc');
    if (t === 'ethereum') assets.add('eth');
    if (t === 'solana') assets.add('sol');
  }
  return assets;
}

function pmNodeId(market: GammaMarketRaw): string {
  const slugPart = market.slug.replace(/[^a-z0-9]+/gi, '_').slice(0, 24).toUpperCase();
  return `PM_${slugPart || market.id}`;
}

function kalNodeId(market: KalshiMarketRaw): string {
  const ticker = market.ticker.replace(/[^a-zA-Z0-9]+/g, '_');
  return `KAL_${ticker}`;
}

function buildSearchQueries(request: CorrelateRequest): string[] {
  const queries = new Set<string>();

  for (const kw of request.keywords) {
    if (!kw.trim()) continue;
    queries.add(kw.trim());
    for (const alias of SEARCH_ALIASES[kw.toUpperCase()] ?? []) {
      queries.add(alias);
    }
  }

  if (request.headline) {
    for (const t of tokenize(request.headline)) {
      if (t.length >= 4) queries.add(t);
    }
    const upperTokens = request.headline.match(/\b[A-Z]{2,6}\b/g) ?? [];
    for (const t of upperTokens) {
      if (!STOPWORDS.has(t.toLowerCase())) queries.add(t);
    }
  }

  if (queries.size === 0 && request.headline) {
    const fallback = [...tokenize(request.headline)].filter((t) => t.length >= 4).slice(0, 3);
    for (const t of fallback) queries.add(t);
  }

  return [...queries].slice(0, 8);
}

async function fetchKalshiMarkets(): Promise<KalshiMarketRaw[]> {
  const body = await fetchJson<TotalisResponse>(TOTALIS_URL);
  if (!body) {
    console.warn('[correlated-agent] Totalis API unavailable — skipping Kalshi markets');
    return [];
  }
  const markets: KalshiMarketRaw[] = [];
  for (const event of body.data?.events ?? []) {
    for (const m of event.markets ?? []) markets.push(m);
  }
  return markets;
}

function flattenSearchResults(body: GammaSearchResponse | null): GammaMarketRaw[] {
  if (!body) return [];
  const fromEvents = (body.events ?? []).flatMap((event) =>
    (event.markets ?? []).map((m) => ({
      ...m,
      events: m.events ?? [{ title: event.title }],
    })),
  );
  if (fromEvents.length > 0) return fromEvents;
  return body.markets ?? [];
}

async function fetchPolymarketByKeyword(keyword: string): Promise<GammaMarketRaw[]> {
  const url = `${GAMMA_SEARCH_URL}?q=${encodeURIComponent(keyword)}&limit_per_type=15`;
  const body = await fetchJson<GammaSearchResponse>(url);
  return flattenSearchResults(body);
}

async function fetchPolymarketCryptoFallback(): Promise<GammaMarketRaw[]> {
  const body = await fetchJson<GammaMarketRaw[]>(GAMMA_CRYPTO_URL);
  return Array.isArray(body) ? body : [];
}

function toKalshiRef(m: KalshiMarketRaw, score: number): MarketRef & { score: number } {
  return {
    id: kalNodeId(m),
    venue: 'kalshi',
    title: m.title || m.event_title || m.ticker,
    ticker: m.ticker,
    url: `https://kalshi.com/markets/${m.ticker}`,
    score,
  };
}

function toPolymarketRef(m: GammaMarketRaw, score: number): MarketRef & { score: number } {
  return {
    id: pmNodeId(m),
    venue: 'polymarket',
    title: m.question,
    slug: m.slug,
    conditionId: m.conditionId,
    url: `https://polymarket.com/event/${m.slug}`,
    score,
  };
}

function buildCorrelations(
  pmMarkets: Array<MarketRef & { score: number; assets: Set<string> }>,
  kalMarkets: Array<MarketRef & { score: number; assets: Set<string> }>,
): MarketCorrelation[] {
  const correlations: MarketCorrelation[] = [];
  const threshold = 2;

  for (const pm of pmMarkets) {
    for (const kal of kalMarkets) {
      let score = 0;
      for (const asset of pm.assets) {
        if (kal.assets.has(asset)) score += 3;
      }
      const pmTokens = tokenize(pm.title);
      const kalTokens = tokenize(kal.title);
      for (const t of pmTokens) {
        if (kalTokens.has(t)) score += 1;
      }
      if (score >= threshold) {
        correlations.push({ pmId: pm.id, kalId: kal.id, score });
      }
    }
  }

  return correlations.sort((a, b) => b.score - a.score);
}

export class CorrelatedMarketsAgent {
  async find(request: CorrelateRequest): Promise<CorrelatedMarketsResult> {
    const searchQueries = buildSearchQueries(request);
    const keywords = expandKeywords(request.keywords, request.headline);

    const [kalshiRaw, pmSearchBatches, pmFallback] = await Promise.all([
      fetchKalshiMarkets(),
      Promise.all(searchQueries.map((q) => fetchPolymarketByKeyword(q))),
      fetchPolymarketCryptoFallback(),
    ]);

    const pmRawMap = new Map<string, GammaMarketRaw>();
    const searchBoost = new Map<string, number>();

    for (const batch of pmSearchBatches) {
      for (const m of batch) {
        pmRawMap.set(m.id, m);
        searchBoost.set(m.id, (searchBoost.get(m.id) ?? 0) + 5);
      }
    }
    for (const m of pmFallback) pmRawMap.set(m.id, m);

    const scoredKal = kalshiRaw
      .map((m) => {
        const text = [m.title, m.subcategory, m.yes_sub_title, m.series_title, m.event_title]
          .filter(Boolean)
          .join(' ');
        const score = scoreText(text, keywords);
        const ref = toKalshiRef(m, score);
        return { ...ref, score, assets: extractAssets(text) };
      })
      .filter((m) => m.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, CORRELATED_MARKETS_LIMIT);

    const scoredPm = [...pmRawMap.values()]
      .filter((m) => m.active !== false && m.closed !== true)
      .map((m) => {
        const text = [m.question, m.slug, ...(m.events?.map((e) => e.title ?? '') ?? [])].join(' ');
        const score = scoreText(text, keywords) + (searchBoost.get(m.id) ?? 0);
        const ref = toPolymarketRef(m, score);
        return { ...ref, score, assets: extractAssets(text) };
      })
      .filter((m) => m.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, CORRELATED_MARKETS_LIMIT);

    const correlations = buildCorrelations(scoredPm, scoredKal);

    return {
      polymarket: scoredPm.map(({ score: _s, assets: _a, ...ref }) => ref),
      kalshi: scoredKal.map(({ score: _s, assets: _a, ...ref }) => ref),
      correlations,
    };
  }
}

export const correlatedMarketsAgent = new CorrelatedMarketsAgent();
