'use client';

import type { Edge } from '@xyflow/react';
import type { WorkflowNode, WorkflowNodeData } from '@/nodes/types';
import { API_BASE, type ToolExecutionResult } from './workflow-tools';
import type { OrchestratorRunResult } from './orchestrator-runner';
import { executePaperTradingForSession } from './paper-trading';

export const EXECUTION_TOOL_TYPES = new Set(['clob', 'kalshi', 'telegram', 'paperTrading']);

const AGENT_SOURCE_TYPES = new Set(['llm', 'newsAgent', 'arbitrageAgent', 'riskAnalyzer']);

export type AgentTradeInput = Record<string, unknown>;

function asRecord(value: unknown): Record<string, unknown> | null {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return null;
}

function pickTradeObject(payload: AgentTradeInput): AgentTradeInput {
  const nested = asRecord(payload.trade) ?? asRecord(payload.order) ?? asRecord(payload.execution);
  return nested ?? payload;
}

function parseAction(raw: unknown): string {
  return String(raw ?? '').trim().toUpperCase();
}

function parseNumber(raw: unknown, fallback?: number): number | undefined {
  if (raw === undefined || raw === null || raw === '') return fallback;
  const n = Number(raw);
  return Number.isFinite(n) ? n : fallback;
}

function kalshiTickerFromPayload(payload: AgentTradeInput): string {
  const trade = pickTradeObject(payload);
  const candidates = [trade.ticker, trade.market_id, trade.marketId, payload.ticker, payload.market_id];
  for (const value of candidates) {
    const text = String(value ?? '').trim();
    if (text && (text.startsWith('KX') || text.includes('-'))) return text;
  }
  return String(trade.ticker ?? trade.market_id ?? '').trim();
}

function polymarketTokenFromPayload(payload: AgentTradeInput): string {
  const trade = pickTradeObject(payload);
  const candidates = [
    trade.tokenId,
    trade.token_id,
    trade.market_id,
    trade.marketId,
    payload.tokenId,
    payload.token_id,
    payload.market_id,
  ];
  for (const value of candidates) {
    const text = String(value ?? '').trim();
    if (text) return text;
  }
  const correlated = asRecord(payload.correlated) ?? asRecord(trade.correlated);
  const polyMarkets = correlated?.polymarket;
  if (Array.isArray(polyMarkets) && polyMarkets.length > 0) {
    const first = asRecord(polyMarkets[0]);
    return String(first?.tokenId ?? first?.token_id ?? first?.id ?? '').trim();
  }
  return '';
}

export function upstreamAgentForExecutionTool(
  execNodeId: string,
  nodes: WorkflowNode[],
  edges: Edge[],
): WorkflowNode | null {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const incoming = edges.filter(
    (edge) =>
      edge.target === execNodeId &&
      (edge.targetHandle === 'in' || edge.targetHandle == null || edge.targetHandle === ''),
  );
  const candidates: WorkflowNode[] = [];
  for (const edge of incoming) {
    const source = byId.get(edge.source);
    if (source?.type && AGENT_SOURCE_TYPES.has(source.type)) {
      candidates.push(source);
    }
  }
  const orchestrator = candidates.find((n) => n.type === 'llm');
  if (orchestrator) return orchestrator;
  return candidates[0] ?? null;
}

export function resolveAgentTradePayload(
  sourceNode: WorkflowNode,
  orchResult?: OrchestratorRunResult,
  feedSignals?: Record<string, { latest?: unknown }>,
): AgentTradeInput | null {
  if (sourceNode.type === 'llm') {
    if (orchResult?.decision) {
      return {
        ...orchResult.decision,
        correlated: orchResult.correlated,
      };
    }
    if (sourceNode.data.decisionJson) {
      try {
        const decision = JSON.parse(sourceNode.data.decisionJson) as AgentTradeInput;
        return {
          ...decision,
          correlated: sourceNode.data.correlatedJson
            ? (JSON.parse(sourceNode.data.correlatedJson) as AgentTradeInput)
            : undefined,
        };
      } catch {
        return null;
      }
    }
    return null;
  }

  const feedKey = sourceNode.type ?? '';
  const feed = feedSignals?.[feedKey]?.latest;
  if (feed && typeof feed === 'object') {
    return feed as AgentTradeInput;
  }

  if (orchResult?.decision) {
    return orchResult.decision;
  }

  return null;
}

export function buildClobExecuteRequest(
  data: WorkflowNodeData,
  payload: AgentTradeInput,
): { request: Record<string, unknown> } | { error: string } {
  const trade = pickTradeObject(payload);
  const action = parseAction(trade.action ?? payload.action);
  if (action === 'HOLD') {
    return { error: 'Agent decision is HOLD — no trade to execute' };
  }

  const tokenId = polymarketTokenFromPayload(payload);
  if (!tokenId) {
    return { error: 'Agent payload missing tokenId / market_id for Polymarket' };
  }

  let side = String(trade.side ?? '').trim().toUpperCase();
  if (!side) {
    if (action.startsWith('SELL')) side = 'SELL';
    else side = 'BUY';
  }

  const size = parseNumber(trade.size ?? trade.count ?? payload.size, parseNumber(data.tradeSize));
  const price = parseNumber(trade.price ?? payload.price, parseNumber(data.tradePrice));
  if (size === undefined || size <= 0) {
    return { error: 'Agent payload missing order size (size / count)' };
  }
  if (price === undefined || price <= 0) {
    return { error: 'Agent payload missing limit price' };
  }

  return {
    request: {
      tokenId,
      side,
      size,
      price,
      apiKey: data.apiKey,
      apiSecret: data.apiSecret,
      apiPassphrase: data.apiPassphrase,
    },
  };
}

export function buildKalshiExecuteRequest(
  data: WorkflowNodeData,
  payload: AgentTradeInput,
): { request: Record<string, unknown> } | { error: string } {
  const trade = pickTradeObject(payload);
  const actionRaw = parseAction(trade.action ?? payload.action);
  if (actionRaw === 'HOLD') {
    return { error: 'Agent decision is HOLD — no trade to execute' };
  }

  const ticker = kalshiTickerFromPayload(payload);
  if (!ticker) {
    return { error: 'Agent payload missing Kalshi ticker / market_id' };
  }

  let action = String(trade.kalshiAction ?? trade.action_type ?? '').trim().toLowerCase();
  if (!action || action.includes('_')) {
    action = actionRaw.startsWith('SELL') ? 'sell' : 'buy';
  }

  let side = String(trade.side ?? trade.kalshiSide ?? '').trim().toLowerCase();
  if (!side || side.includes('_')) {
    side = actionRaw.includes('NO') ? 'no' : 'yes';
  }

  const count = parseNumber(
    trade.count ?? trade.size ?? payload.count ?? payload.size,
    parseNumber(data.kalshiCount ?? data.tradeSize),
  );
  let price = parseNumber(trade.price ?? trade.yesPrice ?? payload.price, parseNumber(data.kalshiPrice ?? data.tradePrice));
  if (price !== undefined && price > 0 && price <= 1) {
    price = Math.round(price * 100);
  }

  if (count === undefined || count <= 0) {
    return { error: 'Agent payload missing contract count (count / size)' };
  }
  if (price === undefined || price <= 0 || price >= 100) {
    return { error: 'Agent payload missing limit price (1–99 cents)' };
  }

  return {
    request: {
      ticker,
      action,
      side,
      count,
      price,
      apiKey: data.apiKey,
      apiSecret: data.apiSecret,
    },
  };
}

async function postExecute(
  path: string,
  body: Record<string, unknown>,
  backendUrl?: string,
): Promise<{ response: Response; payload: Record<string, unknown>; durationMs: number }> {
  const base = (backendUrl ?? API_BASE).replace(/\/$/, '');
  const started = performance.now();
  const response = await fetch(`${base}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const durationMs = Math.round(performance.now() - started);
  const payload = (await response.json()) as Record<string, unknown>;
  return { response, payload, durationMs };
}

export async function executeClobFromAgent(
  data: WorkflowNodeData,
  payload: AgentTradeInput,
  backendUrl?: string,
): Promise<ToolExecutionResult> {
  const built = buildClobExecuteRequest(data, payload);
  if ('error' in built) {
    return { ok: false, source: 'clob', request: {}, error: built.error };
  }

  const { response, payload: body, durationMs } = await postExecute(
    '/api/tools/clob/execute',
    built.request,
    backendUrl ?? data.backendUrl,
  );
  const ok = response.ok && body.status !== 'error' && !body.error;
  return {
    ok,
    source: 'clob',
    request: built.request,
    data: body,
    error: ok ? null : String(body.message ?? body.error ?? response.status),
    durationMs,
  };
}

export async function executeKalshiFromAgent(
  data: WorkflowNodeData,
  payload: AgentTradeInput,
  backendUrl?: string,
): Promise<ToolExecutionResult> {
  const built = buildKalshiExecuteRequest(data, payload);
  if ('error' in built) {
    return { ok: false, source: 'kalshi', request: {}, error: built.error };
  }

  const { response, payload: body, durationMs } = await postExecute(
    '/api/tools/kalshi/execute',
    built.request,
    backendUrl ?? data.backendUrl,
  );
  const ok = response.ok && body.status !== 'error' && !body.error;
  return {
    ok,
    source: 'kalshi',
    request: built.request,
    data: body,
    error: ok ? null : String(body.message ?? body.error ?? response.status),
    durationMs,
  };
}

export function buildTelegramSendRequest(
  data: WorkflowNodeData,
  payload: AgentTradeInput,
): { request: Record<string, unknown> } | { error: string } {
  const username = (data.telegramUsername ?? '').trim();
  const chatId = (data.telegramChatId ?? '').trim();
  if (!username && !chatId) {
    return { error: 'Set Telegram username or chat ID on the node' };
  }

  const botToken = (data.apiKey ?? '').trim();

  return {
    request: {
      ...(botToken ? { botToken } : {}),
      telegramUsername: username,
      telegramChatId: chatId,
      messagePrefix: data.telegramMessagePrefix ?? '',
      payload,
    },
  };
}

export async function executeTelegramFromAgent(
  data: WorkflowNodeData,
  payload: AgentTradeInput,
  backendUrl?: string,
): Promise<ToolExecutionResult> {
  const built = buildTelegramSendRequest(data, payload);
  if ('error' in built) {
    return { ok: false, source: 'telegram', request: {}, error: built.error };
  }

  const { response, payload: body, durationMs } = await postExecute(
    '/api/tools/telegram/send',
    built.request,
    backendUrl ?? data.backendUrl,
  );
  const ok = response.ok && body.ok !== false && !body.error;
  return {
    ok,
    source: 'telegram',
    request: built.request,
    data: body.data ?? body,
    error: ok ? null : String(body.error ?? body.message ?? response.status),
    durationMs,
  };
}

export async function executePaperTradingFromAgent(
  data: WorkflowNodeData,
  payload: AgentTradeInput,
): Promise<ToolExecutionResult> {
  const sessionId = data.paperSessionId ?? '';
  const result = executePaperTradingForSession(
    sessionId,
    payload as Record<string, unknown>,
    data.paperWorkflowId,
  );
  if (!result.ok) {
    return {
      ok: false,
      source: 'paperTrading',
      request: { sessionId, workflowId: data.paperWorkflowId },
      error: result.error ?? 'Paper trade failed',
    };
  }
  const body = result.data ?? {};
  return {
    ok: true,
    source: 'paperTrading',
    request: { sessionId, workflowId: data.paperWorkflowId },
    data: body,
    error: null,
    durationMs: 0,
  };
}

export async function runExecutionToolFromAgent(
  type: 'clob' | 'kalshi' | 'telegram' | 'paperTrading',
  data: WorkflowNodeData,
  payload: AgentTradeInput,
  backendUrl?: string,
): Promise<ToolExecutionResult> {
  if (type === 'paperTrading') return executePaperTradingFromAgent(data, payload);
  if (type === 'clob') return executeClobFromAgent(data, payload, backendUrl);
  if (type === 'telegram') return executeTelegramFromAgent(data, payload, backendUrl);
  return executeKalshiFromAgent(data, payload, backendUrl);
}
