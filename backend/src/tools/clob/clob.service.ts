import { CLOB } from '../endpoints';
import type { ClobExecuteRequest, ClobExecuteResult, ClobQuoteRequest, ClobQuoteResult } from '../types';

const FETCH_TIMEOUT_MS = Number(process.env.TOOL_FETCH_TIMEOUT_MS ?? 15_000);

async function fetchJson(url: string, init?: RequestInit): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, { ...init, signal: controller.signal });
    if (!res.ok) return { error: res.status, statusText: res.statusText };
    return res.json();
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) };
  } finally {
    clearTimeout(timer);
  }
}

export async function getClobQuote(req: ClobQuoteRequest): Promise<ClobQuoteResult> {
  const { tokenId } = req;
  const [orderbook, lastTradePrice, spread, midpoint] = await Promise.all([
    fetchJson(CLOB.orderbook(tokenId)),
    fetchJson(CLOB.lastTradePrice(tokenId)),
    fetchJson(CLOB.spread(tokenId)),
    fetchJson(CLOB.midpoint(tokenId)),
  ]);
  return { tokenId, orderbook, lastTradePrice, spread, midpoint };
}

/** Without L2 credentials returns a dry_run preview for workflow testing. */
export async function executeClobTrade(req: ClobExecuteRequest): Promise<ClobExecuteResult> {
  const { tokenId, side, size, price, apiKey, apiSecret, apiPassphrase } = req;

  if (!apiKey || !apiSecret || !apiPassphrase) {
    return {
      status: 'dry_run',
      message:
        'No CLOB credentials — order validated but not submitted. Add API key, secret, and passphrase on the CLOB node.',
      tokenId,
      side,
      size,
      price,
    };
  }

  const body = JSON.stringify({
    tokenID: tokenId,
    side,
    size: String(size),
    price: String(price),
    type: 'GTC',
  });

  const result = await fetchJson(CLOB.orders, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      POLY_API_KEY: apiKey,
      POLY_PASSPHRASE: apiPassphrase,
    },
    body,
  });

  if (result && typeof result === 'object' && 'error' in result) {
    return {
      status: 'error',
      message: String((result as { error: unknown }).error),
      tokenId,
      side,
      size,
      price,
    };
  }

  const orderId =
    result && typeof result === 'object' && 'orderID' in result
      ? String((result as { orderID: unknown }).orderID)
      : undefined;

  return {
    status: 'submitted',
    orderId,
    message: orderId ? `Order ${orderId} submitted` : 'Order submitted',
    tokenId,
    side,
    size,
    price,
  };
}

export const clobTool = { quote: getClobQuote, execute: executeClobTrade };
