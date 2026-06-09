import { loadWhaleWallets, WHALE_FETCH_DELAY_MS } from './whale-wallet.config';
import { DATA } from '../endpoints';
import { trackWhaleWalletsByAddress } from './track-by-address';
import type {
  MarketRef,
  WhaleActivityEntry,
  WhaleActivityResult,
  WhaleTrackRequest,
  WhaleWalletConfig,
} from '../types';

const FETCH_TIMEOUT_MS = Number(process.env.TOOL_FETCH_TIMEOUT_MS ?? 15_000);
const TRADES_LIMIT = Number(process.env.WHALE_TRADES_LIMIT ?? 100);
const MAX_WHALE_ENTRIES = Number(process.env.WHALE_MAX_ENTRIES ?? 25);

const KEYWORD_ALIASES: Record<string, string[]> = {
  BTC: ['btc', 'bitcoin'],
  ETH: ['eth', 'ethereum'],
  SOL: ['sol', 'solana'],
  XRP: ['xrp', 'ripple'],
  DOGE: ['doge', 'dogecoin'],
  IPO: ['ipo'],
  ETF: ['etf'],
  SEC: ['sec'],
  AI: ['ai', 'artificial intelligence'],
  DEFI: ['defi'],
};

const STOPWORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'to', 'of', 'in', 'on', 'at', 'by', 'for', 'is',
  'will', 'be', 'as', 'it', 'its', 'this', 'that', 'with', 'from', 'before', 'after',
]);

type PolymarketTrade = {
  proxyWallet: string;
  side: 'BUY' | 'SELL';
  conditionId: string;
  size: number;
  price: number;
  timestamp: number;
  title: string;
  slug: string;
  outcome: string;
  name: string;
  pseudonym: string;
  transactionHash: string;
};

function normalizeText(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function tokenize(text: string): Set<string> {
  const tokens = new Set<string>();
  for (const part of normalizeText(text).split(/\s+/)) {
    if (part.length < 2 || STOPWORDS.has(part)) continue;
    tokens.add(part);
  }
  return tokens;
}

function expandNewsKeywords(keywords: string[], headline?: string): Set<string> {
  const expanded = new Set<string>();
  for (const kw of keywords) {
    const aliases = KEYWORD_ALIASES[kw.toUpperCase()] ?? [normalizeText(kw)];
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
  const kw = keyword.toLowerCase();
  if (kw.length <= 3) {
    return new RegExp(`\\b${kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(text);
  }
  return normalizeText(text).includes(kw) || tokenize(text).has(kw);
}

function scoreTradeAgainstNews(
  trade: PolymarketTrade,
  keywords: string[],
  headline?: string,
): number {
  const text = `${trade.title} ${trade.slug}`;
  const expanded = expandNewsKeywords(keywords, headline);
  let score = 0;
  for (const kw of expanded) {
    if (keywordMatchesText(text, kw)) {
      score += kw.length <= 3 ? 3 : 2;
    }
  }
  return score;
}

function marketMatchesTrade(market: MarketRef, trade: PolymarketTrade): boolean {
  if (market.conditionId && trade.conditionId) {
    return market.conditionId.toLowerCase() === trade.conditionId.toLowerCase();
  }
  if (market.slug && trade.slug) {
    return normalizeText(market.slug) === normalizeText(trade.slug);
  }
  const mTitle = normalizeText(market.title);
  const tTitle = normalizeText(trade.title);
  return mTitle.length > 0 && (mTitle === tTitle || mTitle.includes(tTitle) || tTitle.includes(mTitle));
}

function marketRefFromTrade(trade: PolymarketTrade): MarketRef {
  const slugPart = trade.slug.replace(/[^a-z0-9]+/gi, '_').slice(0, 24).toUpperCase();
  return {
    id: `PM_${slugPart}`,
    venue: 'polymarket',
    title: trade.title,
    slug: trade.slug,
    conditionId: trade.conditionId,
    url: `https://polymarket.com/event/${trade.slug}`,
  };
}

async function fetchWalletTrades(wallet: string, limit = TRADES_LIMIT): Promise<PolymarketTrade[]> {
  const url = `${DATA.trades}?user=${encodeURIComponent(wallet)}&limit=${limit}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) {
      console.warn(`[whale-tool] trades API ${res.status} for ${wallet}`);
      return [];
    }
    const body = await res.json();
    return Array.isArray(body) ? (body as PolymarketTrade[]) : [];
  } catch (err) {
    console.warn(`[whale-tool] trades fetch failed for ${wallet}: ${err}`);
    return [];
  } finally {
    clearTimeout(timer);
  }
}

export class WhaleWalletTool {
  private readonly walletsOverride?: WhaleWalletConfig[];
  private readonly lastSeenTx = new Map<string, Set<string>>();

  constructor(wallets?: WhaleWalletConfig[]) {
    this.walletsOverride = wallets;
  }

  private resolveWallets(): WhaleWalletConfig[] {
    return this.walletsOverride ?? loadWhaleWallets();
  }

  async track(request: WhaleTrackRequest): Promise<WhaleActivityResult> {
    const wallets = this.resolveWallets();
    const markets = request.polymarketMarkets ?? [];
    const keywords = request.keywords ?? [];
    const headline = request.headline;
    const entries: WhaleActivityEntry[] = [];
    let totalTrades = 0;

    const tradeBatches: Array<{ wallet: WhaleWalletConfig; trades: PolymarketTrade[] }> = [];
    for (const wallet of wallets) {
      tradeBatches.push({
        wallet,
        trades: await fetchWalletTrades(wallet.proxyWallet),
      });
      if (WHALE_FETCH_DELAY_MS > 0) {
        await new Promise((r) => setTimeout(r, WHALE_FETCH_DELAY_MS));
      }
    }

    for (const { wallet, trades } of tradeBatches) {
      totalTrades += trades.length;
      const seen = this.lastSeenTx.get(wallet.proxyWallet) ?? new Set<string>();
      const cycleSeen = new Set<string>();

      for (const trade of trades) {
        const txKey = trade.transactionHash;
        cycleSeen.add(txKey);
        if (seen.has(txKey)) continue;

        const matchedMarket = markets.find((m) => marketMatchesTrade(m, trade));
        const newsScore =
          !matchedMarket && (keywords.length > 0 || headline)
            ? scoreTradeAgainstNews(trade, keywords, headline)
            : 0;

        if (!matchedMarket && newsScore < 2) continue;
        if (entries.length >= MAX_WHALE_ENTRIES) break;

        entries.push({
          wallet: wallet.proxyWallet,
          pseudonym: trade.pseudonym || wallet.pseudonym,
          name: trade.name || wallet.name,
          market: matchedMarket ?? marketRefFromTrade(trade),
          side: trade.side,
          outcome: trade.outcome,
          size: trade.size,
          price: trade.price,
          timestamp: trade.timestamp,
          transactionHash: trade.transactionHash,
        });
      }

      this.lastSeenTx.set(wallet.proxyWallet, cycleSeen);
      if (entries.length >= MAX_WHALE_ENTRIES) break;
    }

    if (entries.length === 0 && totalTrades > 0) {
      console.log(
        `[whale-wallet-tool] scanned ${totalTrades} trades across ${wallets.length} wallets, 0 matched ${markets.length} markets`,
      );
    }

    return { entries };
  }
}

export const whaleWalletTool = new WhaleWalletTool();

export async function trackWhaleWallets(request: WhaleTrackRequest): Promise<WhaleActivityResult> {
  if (request.walletAddresses?.length) {
    return trackWhaleWalletsByAddress(request);
  }
  return whaleWalletTool.track(request);
}
