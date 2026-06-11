'use client';

import type { Edge } from '@xyflow/react';
import type { WorkflowNode } from '@/nodes/types';
import { API_BASE } from './workflow-tools';

const DEMO_SIGNAL = {
  type: 'news',
  agent: 'newsAgent',
  headline: 'Bitcoin ETF sees record daily inflow as institutions accumulate',
  sentiment: 'bullish',
  keywords: ['bitcoin', 'etf', 'inflow'],
  summary: 'Bitcoin ETF sees record daily inflow as institutions accumulate',
  strength: 0.75,
  source: 'simulated',
};

export type OrchestratorRunResult = {
  ok: boolean;
  steps?: string[];
  decision?: Record<string, unknown>;
  suggestions?: Record<string, unknown>[];
  cot?: Record<string, unknown>;
  correlated?: Record<string, unknown>;
  tool_results?: Record<string, unknown>;
  graph_impacts?: Record<string, unknown>[];
  evidence?: string[];
  errors?: string[];
  error?: string;
};

function canvasPayload(nodes: WorkflowNode[], edges: Edge[]) {
  return {
    nodes: nodes.map((n) => ({ id: n.id, type: n.type, data: n.data })),
    edges: edges.map((e) => ({
      id: e.id,
      source: e.source,
      target: e.target,
      sourceHandle: e.sourceHandle,
      targetHandle: e.targetHandle,
    })),
  };
}

function pickSignal(feeds: Record<string, { latest?: unknown }> | undefined): Record<string, unknown> {
  const news = feeds?.newsAgent?.latest;
  if (news && typeof news === 'object') {
    const payload = news as Record<string, unknown>;
    return {
      type: 'news',
      agent: 'newsAgent',
      ...payload,
      direction: payload.sentiment ?? payload.direction,
    };
  }
  const arb = feeds?.arbitrageAgent?.latest;
  if (arb && typeof arb === 'object') {
    return { type: 'arbitrage', agent: 'arbitrageAgent', ...(arb as Record<string, unknown>) };
  }
  const whale = feeds?.whaleWallet?.latest;
  if (whale && typeof whale === 'object') {
    return { type: 'whale', agent: 'whaleWallet', ...(whale as Record<string, unknown>) };
  }
  const div = feeds?.divergenceAgent?.latest;
  if (div && typeof div === 'object') {
    return { type: 'divergence', agent: 'divergenceAgent', ...(div as Record<string, unknown>) };
  }
  return DEMO_SIGNAL;
}

export async function runOrchestrator({
  nodes,
  edges,
  feedSignals,
  signal,
  config,
  backendUrl,
}: {
  nodes: WorkflowNode[];
  edges: Edge[];
  feedSignals?: Record<string, { latest?: unknown }>;
  signal?: Record<string, unknown>;
  config?: Record<string, unknown>;
  backendUrl?: string;
}): Promise<OrchestratorRunResult> {
  const base = (backendUrl ?? API_BASE).replace(/\/$/, '');
  const body = {
    signal: signal ?? pickSignal(feedSignals),
    canvas: canvasPayload(nodes, edges),
    config: config ?? {},
  };

  try {
    const response = await fetch(`${base}/api/orchestrator/run`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const payload = (await response.json()) as OrchestratorRunResult;
    if (!response.ok) {
      return { ok: false, error: payload.error ?? `HTTP ${response.status}` };
    }
    return { ...payload, ok: payload.ok ?? true };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Orchestrator request failed',
    };
  }
}

export function findLlmNode(nodes: WorkflowNode[]): WorkflowNode | undefined {
  return nodes.find((n) => n.type === 'llm');
}

export function downstreamNodes(
  sourceId: string,
  nodes: WorkflowNode[],
  edges: Edge[],
  type?: string,
): WorkflowNode[] {
  const targets = new Set(
    edges.filter((e) => e.source === sourceId).map((e) => e.target),
  );
  return nodes.filter((n) => targets.has(n.id) && (!type || n.type === type));
}
