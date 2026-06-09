/** Polymarket data / execution endpoints for workflow tools. */

const GAMMA_BASE = 'https://gamma-api.polymarket.com';
const DATA_BASE = 'https://data-api.polymarket.com';
const CLOB_BASE = 'https://clob.polymarket.com';

export const GAMMA = {
  base: GAMMA_BASE,
  eventBySlug: (slug: string) => `${GAMMA_BASE}/events/slug/${encodeURIComponent(slug)}`,
  marketBySlug: (slug: string) => `${GAMMA_BASE}/markets/slug/${encodeURIComponent(slug)}`,
  markets: `${GAMMA_BASE}/markets`,
} as const;

export const DATA = {
  base: DATA_BASE,
  trades: `${DATA_BASE}/trades`,
  recentTrades: (conditionId: string) =>
    `${DATA_BASE}/trades?condition_id=${encodeURIComponent(conditionId)}`,
  positions: (conditionId: string) =>
    `${DATA_BASE}/positions?condition_id=${encodeURIComponent(conditionId)}`,
} as const;

export const CLOB = {
  base: CLOB_BASE,
  orderbook: (tokenId: string) => `${CLOB_BASE}/book?token_id=${encodeURIComponent(tokenId)}`,
  lastTradePrice: (tokenId: string) =>
    `${CLOB_BASE}/last-trade-price?token_id=${encodeURIComponent(tokenId)}`,
  spread: (tokenId: string) => `${CLOB_BASE}/spread?token_id=${encodeURIComponent(tokenId)}`,
  midpoint: (tokenId: string) => `${CLOB_BASE}/midpoint?token_id=${encodeURIComponent(tokenId)}`,
  orders: `${CLOB_BASE}/order`,
} as const;
