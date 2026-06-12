'use client';

import type { WorkflowNodeData } from '@/nodes/types';

export const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

export type ToolExecutionResult = {
  ok: boolean;
  source: string;
  request: Record<string, unknown>;
  data?: unknown;
  error?: string | null;
  durationMs?: number;
};

export type RunnableToolType =
  | 'clob'
  | 'cotBuilder'
  | 'whaleWallet'
  | 'coinmarketcap'
  | 'defillama'
  | 'cryptonews'
  | 'cryptoquant'
  | 'tavily'
  | 'coingecko'
  | 'polymarketGamma'
  | 'polymarketWallet'
  | 'divergence';

export const RUNNABLE_TOOL_TYPES: ReadonlySet<string> = new Set<RunnableToolType>([
  'clob',
  'cotBuilder',
  'whaleWallet',
  'coinmarketcap',
  'defillama',
  'cryptonews',
  'cryptoquant',
  'tavily',
  'coingecko',
  'polymarketGamma',
  'polymarketWallet',
  'divergence',
]);

async function postJson(path: string, body: Record<string, unknown>, backendUrl?: string) {
  const base = (backendUrl ?? API_BASE).replace(/\/$/, '');
  const started = performance.now();
  const response = await fetch(`${base}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const durationMs = Math.round(performance.now() - started);
  let payload: unknown = null;
  try {
    payload = await response.json();
  } catch {
    payload = { error: `Invalid JSON response (${response.status})` };
  }
  return { response, payload, durationMs };
}

function sanitizeRequest(request: Record<string, unknown>): Record<string, unknown> {
  const { apiKey, apiSecret, apiPassphrase, ...rest } = request;
  return rest;
}

export function formatToolResultDisplay(result: ToolExecutionResult): string {
  return JSON.stringify(result, null, 2);
}

export function toolResultPatch(result: ToolExecutionResult): {
  workflowStatus: 'success' | 'error';
  workflowError: string;
  workflowResult: string;
  workflowDurationMs: number | undefined;
} {
  return {
    workflowStatus: result.ok ? 'success' : 'error',
    workflowError: result.error ?? '',
    workflowResult: formatToolResultDisplay(result),
    workflowDurationMs: result.durationMs,
  };
}

export function clearFetchState(): {
  workflowStatus: 'running';
  workflowError: string;
  workflowResult: string;
  workflowDurationMs: undefined;
} {
  return {
    workflowStatus: 'running',
    workflowError: '',
    workflowResult: '',
    workflowDurationMs: undefined,
  };
}

function normalizeResult(
  source: string,
  payload: unknown,
  request: Record<string, unknown>,
  httpOk: boolean,
  durationMs?: number,
): ToolExecutionResult {
  const safeRequest = sanitizeRequest(request);

  if (
    payload &&
    typeof payload === 'object' &&
    'ok' in payload &&
    'source' in payload &&
    'request' in payload
  ) {
    const normalized = payload as ToolExecutionResult;
    return {
      ...normalized,
      request: sanitizeRequest(normalized.request ?? safeRequest),
      durationMs: normalized.durationMs ?? durationMs,
    };
  }

  if (!httpOk) {
    const detail =
      payload && typeof payload === 'object' && 'detail' in payload
        ? String((payload as { detail?: unknown }).detail)
        : `Backend request failed (${(payload as { error?: unknown })?.error ?? 'unknown'})`;
    const message =
      detail === 'Not Found'
        ? 'Backend route not found — restart the backend (npm run dev:backend)'
        : detail;
    return { ok: false, source, request: safeRequest, error: message, durationMs };
  }

  const possibleError =
    payload && typeof payload === 'object' && 'error' in payload
      ? String((payload as { error?: unknown }).error ?? '')
      : payload && typeof payload === 'object' && 'detail' in payload
        ? String((payload as { detail?: unknown }).detail ?? '')
        : '';

  return {
    ok: !possibleError,
    source,
    request: safeRequest,
    data: possibleError ? undefined : payload,
    error: possibleError || null,
    durationMs,
  };
}

function toolAccessPayload(data: WorkflowNodeData): Record<string, unknown> {
  return {
    accessMode: data.toolAccessMode ?? 'public',
    endpoint: data.toolEndpoint ?? undefined,
    apiKey: (data.apiKey ?? '').trim(),
  };
}

export async function executeToolNode(type: string, data: WorkflowNodeData): Promise<ToolExecutionResult> {
  if (type === 'coinmarketcap') {
    const request = {
      ...toolAccessPayload(data),
      symbols: (data.cmcSymbols ?? 'BTC').trim() || 'BTC',
      convert: (data.cmcConvert ?? 'USD').trim() || 'USD',
    };
    const { response, payload, durationMs } = await postJson(
      '/api/tools/coinmarketcap/fetch',
      request,
      data.backendUrl,
    );
    return normalizeResult('coinmarketcap', payload, request, response.ok, durationMs);
  }
  if (type === 'defillama') {
    const endpoint = data.toolEndpoint ?? data.defillamaMode ?? 'protocols';
    const request = {
      ...toolAccessPayload(data),
      endpoint,
      mode: endpoint,
      protocol: (data.defillamaProtocol ?? '').trim(),
      chain: (data.defillamaChain ?? '').trim(),
      symbol: (data.defillamaSymbol ?? '').trim(),
      timestamp: (data.defillamaTimestamp ?? '').trim() || undefined,
    };
    const { response, payload, durationMs } = await postJson(
      '/api/tools/defillama/fetch',
      request,
      data.backendUrl,
    );
    return normalizeResult('defillama', payload, request, response.ok, durationMs);
  }
  if (type === 'cryptonews') {
    const request = {
      ...toolAccessPayload(data),
      tickers: (data.cryptonewsTickers ?? 'BTC').trim() || 'BTC',
      items: Number(data.cryptonewsItems ?? '10') || 10,
      sentiment: (data.cryptonewsSentiment ?? '').trim() || undefined,
      keywords: (data.cryptonewsKeywords ?? '').trim() || undefined,
    };
    const { response, payload, durationMs } = await postJson(
      '/api/tools/cryptonews/fetch',
      request,
      data.backendUrl,
    );
    return normalizeResult('cryptonews', payload, request, response.ok, durationMs);
  }
  if (type === 'cryptoquant') {
    const request = {
      ...toolAccessPayload(data),
      metric: (data.cryptoquantMetric ?? '').trim(),
      symbol: (data.cryptoquantSymbol ?? 'btc').trim() || 'btc',
      window: (data.cryptoquantWindow ?? 'day').trim() || 'day',
      exchange: (data.cryptoquantExchange ?? '').trim() || undefined,
    };
    const { response, payload, durationMs } = await postJson(
      '/api/tools/cryptoquant/fetch',
      request,
      data.backendUrl,
    );
    return normalizeResult('cryptoquant', payload, request, response.ok, durationMs);
  }
  if (type === 'tavily') {
    const request = {
      ...toolAccessPayload(data),
      query: (data.tavilyQuery ?? '').trim(),
      urls: (data.tavilyUrls ?? '').trim() || undefined,
      searchDepth: data.tavilySearchDepth ?? 'basic',
      maxResults: Number(data.tavilyMaxResults ?? '5') || 5,
    };
    const { response, payload, durationMs } = await postJson('/api/tools/tavily/fetch', request, data.backendUrl);
    return normalizeResult('tavily', payload, request, response.ok, durationMs);
  }
  if (type === 'coingecko') {
    const request = {
      ...toolAccessPayload(data),
      ids: (data.coingeckoIds ?? 'bitcoin').trim() || 'bitcoin',
      query: (data.coingeckoQuery ?? '').trim() || undefined,
      coinId: (data.coingeckoCoinId ?? '').trim() || undefined,
      network: (data.coingeckoNetwork ?? '').trim() || undefined,
      poolAddress: (data.coingeckoPoolAddress ?? '').trim() || undefined,
      days: (data.coingeckoDays ?? '30').trim() || '30',
    };
    const { response, payload, durationMs } = await postJson(
      '/api/tools/coingecko/fetch',
      request,
      data.backendUrl,
    );
    return normalizeResult('coingecko', payload, request, response.ok, durationMs);
  }
  if (type === 'polymarketGamma') {
    const request = {
      ...toolAccessPayload(data),
      keywords: (data.gammaKeywords ?? '').trim(),
      limit: Number(data.gammaLimit ?? '8') || 8,
      minVolume24h: Number(data.gammaMinVolume ?? '10000') || 10000,
      minLiquidity: Number(data.gammaMinLiquidity ?? '10000') || 10000,
      maxSpread: Number(data.gammaMaxSpread ?? '0.05') || 0.05,
    };
    const { response, payload, durationMs } = await postJson(
      '/api/tools/gamma/markets',
      request,
      data.backendUrl,
    );
    return normalizeResult('polymarketGamma', payload, request, response.ok, durationMs);
  }
  if (type === 'polymarketWallet') {
    const request = {
      ...toolAccessPayload(data),
      wallet: (data.pmWallet ?? '').trim(),
      action: data.pmWalletAction ?? 'trades',
      limit: Number(data.pmWalletLimit ?? '20') || 20,
    };
    const { response, payload, durationMs } = await postJson(
      '/api/tools/polymarket/wallet',
      request,
      data.backendUrl,
    );
    return normalizeResult('polymarketWallet', payload, request, response.ok, durationMs);
  }
  if (type === 'divergence') {
    const started = performance.now();
    // Local computation — ported from cry/tools/divergence.py
    const DIVERGENCE_THRESHOLD = 3.0; // percentage points of unexplained move
    const baseChange = Number(data.divBaseChange ?? '');
    const otherChange = Number(data.divOtherChange ?? '');
    const expectedCorr = Number(data.divExpectedCorr ?? '');
    const baseId = (data.divBaseId ?? 'base').trim() || 'base';
    const otherId = (data.divOtherId ?? 'other').trim() || 'other';
    const request = { baseId, otherId, baseChange, otherChange, expectedCorr };

    const durationMs = () => Math.round(performance.now() - started);

    if ([baseChange, otherChange, expectedCorr].some((v) => Number.isNaN(v))) {
      return {
        ok: false,
        source: 'divergence',
        request,
        error: 'baseChange, otherChange and expectedCorr must be numbers',
        durationMs: durationMs(),
      };
    }
    if (expectedCorr < -1 || expectedCorr > 1) {
      return {
        ok: false,
        source: 'divergence',
        request,
        error: 'expectedCorr must be in [-1, 1]',
        durationMs: durationMs(),
      };
    }

    const expectedOther = baseChange * expectedCorr;
    const gap = otherChange - expectedOther;
    const diverging = Math.abs(gap) >= DIVERGENCE_THRESHOLD;
    const direction = gap > 0 ? 'above' : 'below';
    const note =
      `${otherId} moved ${otherChange >= 0 ? '+' : ''}${otherChange.toFixed(1)}% vs expected ` +
      `${expectedOther >= 0 ? '+' : ''}${expectedOther.toFixed(1)}% (corr ${expectedCorr >= 0 ? '+' : ''}${expectedCorr.toFixed(2)} ` +
      `with ${baseId} which moved ${baseChange >= 0 ? '+' : ''}${baseChange.toFixed(1)}%) — ` +
      `${Math.abs(gap).toFixed(1)}pp ${direction} expectation`;

    return {
      ok: true,
      source: 'divergence',
      request,
      data: {
        diverging,
        gap_pp: Math.round(gap * 100) / 100,
        expected_change: Math.round(expectedOther * 100) / 100,
        actual_change: Math.round(otherChange * 100) / 100,
        note,
      },
      error: null,
      durationMs: durationMs(),
    };
  }
  if (type === 'whaleWallet') {
    const request = {
      walletAddresses: (data.walletAddresses ?? []).map((w) => w.trim()).filter(Boolean),
      conditionId: (data.conditionId ?? '').trim() || undefined,
      apiKey: (data.apiKey ?? '').trim() || undefined,
    };
    const { response, payload, durationMs } = await postJson('/api/tools/whale/track', request, data.backendUrl);
    return normalizeResult('whaleWallet', payload, request, response.ok, durationMs);
  }
  if (type === 'cotBuilder') {
    const decision = JSON.parse(data.decisionJson ?? '{}');
    const correlated = JSON.parse(data.correlatedJson ?? '{}');
    const request = {
      decision,
      correlated,
      graphId: data.graphId,
      userNodeId: data.userNodeId,
    };
    const { response, payload, durationMs } = await postJson('/api/tools/cot/build', request, data.backendUrl);
    return normalizeResult('cotBuilder', payload, request, response.ok, durationMs);
  }
  if (type === 'clob') {
    const request = {
      tokenId: (data.tokenId ?? '').trim(),
    };
    const { response, payload, durationMs } = await postJson('/api/tools/clob/quote', request, data.backendUrl);
    return normalizeResult('clob', payload, request, response.ok, durationMs);
  }
  return {
    ok: false,
    source: type,
    request: {},
    error: `Unsupported runnable node type: ${type}`,
  };
}
