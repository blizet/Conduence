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
  | 'coinmarketcap'
  | 'defillama'
  | 'cryptonews'
  | 'cryptoquant'
  | 'tavily'
  | 'coingecko'
  | 'polymarketGamma'
  | 'polymarketWallet'
  | 'kalshi';

export const RUNNABLE_TOOL_TYPES: ReadonlySet<string> = new Set<RunnableToolType>([
  'clob',
  'cotBuilder',
  'coinmarketcap',
  'defillama',
  'cryptonews',
  'cryptoquant',
  'tavily',
  'coingecko',
  'polymarketGamma',
  'polymarketWallet',
  'kalshi',
]);

/** Minimal preview payloads when running workflow phase A — LLM fills params at orchestrate time. */
const PREVIEW_DEFAULTS: Record<string, Record<string, unknown>> = {
  coingecko: { ids: 'bitcoin,ethereum' },
  coinmarketcap: { symbols: 'BTC,ETH', convert: 'USD' },
  defillama: { mode: 'protocols' },
  cryptonews: { tickers: 'BTC', items: 5 },
  cryptoquant: { metric: 'btc/exchange-flows/netflow', window: 'day' },
  tavily: { query: 'bitcoin market news', maxResults: 5 },
  polymarketGamma: { keywords: 'bitcoin', limit: 8 },
  polymarketWallet: { wallet: '', action: 'trades', limit: 10 },
  kalshi: { ticker: 'KXBTC-25DEC31' },
};

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

function toolRequest(type: string, data: WorkflowNodeData): Record<string, unknown> {
  const apiKey = (data.apiKey ?? '').trim();
  const base = PREVIEW_DEFAULTS[type] ?? {};
  return apiKey ? { ...base, apiKey } : { ...base };
}

export async function executeToolNode(type: string, data: WorkflowNodeData): Promise<ToolExecutionResult> {
  if (type === 'coinmarketcap') {
    const request = toolRequest(type, data);
    const { response, payload, durationMs } = await postJson(
      '/api/tools/coinmarketcap/fetch',
      request,
      data.backendUrl,
    );
    return normalizeResult('coinmarketcap', payload, request, response.ok, durationMs);
  }
  if (type === 'defillama') {
    const request = toolRequest(type, data);
    const { response, payload, durationMs } = await postJson(
      '/api/tools/defillama/fetch',
      request,
      data.backendUrl,
    );
    return normalizeResult('defillama', payload, request, response.ok, durationMs);
  }
  if (type === 'cryptonews') {
    const request = toolRequest(type, data);
    const { response, payload, durationMs } = await postJson(
      '/api/tools/cryptonews/fetch',
      request,
      data.backendUrl,
    );
    return normalizeResult('cryptonews', payload, request, response.ok, durationMs);
  }
  if (type === 'cryptoquant') {
    const request = toolRequest(type, data);
    const { response, payload, durationMs } = await postJson(
      '/api/tools/cryptoquant/fetch',
      request,
      data.backendUrl,
    );
    return normalizeResult('cryptoquant', payload, request, response.ok, durationMs);
  }
  if (type === 'tavily') {
    const request = toolRequest(type, data);
    const { response, payload, durationMs } = await postJson('/api/tools/tavily/fetch', request, data.backendUrl);
    return normalizeResult('tavily', payload, request, response.ok, durationMs);
  }
  if (type === 'coingecko') {
    const request = toolRequest(type, data);
    const { response, payload, durationMs } = await postJson(
      '/api/tools/coingecko/fetch',
      request,
      data.backendUrl,
    );
    return normalizeResult('coingecko', payload, request, response.ok, durationMs);
  }
  if (type === 'polymarketGamma') {
    const request = toolRequest(type, data);
    const { response, payload, durationMs } = await postJson(
      '/api/tools/gamma/markets',
      request,
      data.backendUrl,
    );
    return normalizeResult('polymarketGamma', payload, request, response.ok, durationMs);
  }
  if (type === 'polymarketWallet') {
    const request = toolRequest(type, data);
    const { response, payload, durationMs } = await postJson(
      '/api/tools/polymarket/wallet',
      request,
      data.backendUrl,
    );
    return normalizeResult('polymarketWallet', payload, request, response.ok, durationMs);
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
  if (type === 'kalshi') {
    const request = {
      ticker: (data.kalshiTicker ?? '').trim(),
    };
    const { response, payload, durationMs } = await postJson('/api/tools/kalshi/quote', request, data.backendUrl);
    return normalizeResult('kalshi', payload, request, response.ok, durationMs);
  }
  return {
    ok: false,
    source: type,
    request: {},
    error: `Unsupported runnable node type: ${type}`,
  };
}
