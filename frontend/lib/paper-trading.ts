'use client';

import type { Edge } from '@xyflow/react';
import type { WorkflowNode } from '@/nodes/types';
import { runOrchestrator, type OrchestratorRunResult } from './orchestrator-runner';
import {
  ensureDefaultWorkflows,
  getWorkflowById,
  loadSavedWorkflows,
  type SavedWorkflow,
} from './workflow-storage';

const STORAGE_KEY = 'cot-paper-trading-workspaces';

export type SimulationPlatform = 'polymarket' | 'kalshi' | 'both';

export type PaperSide = 'YES' | 'NO';

export type PaperPosition = {
  market: string;
  slug: string;
  side: PaperSide;
  shares: number;
  avgEntryPrice: number;
  costBasis: number;
  markPrice: number;
  unrealizedPnl: number;
  openedAt: string;
};

export type PaperTrade = {
  id: string;
  timestamp: string;
  action: 'BUY' | 'SELL';
  market: string;
  slug: string;
  side: PaperSide;
  price: number;
  shares: number;
  cost: number;
  thesis?: string;
  confidence?: number;
  runId: string;
};

export type EquityPoint = {
  timestamp: string;
  equity: number;
  cash: number;
};

export type PaperPortfolio = {
  initialCapital: number;
  cash: number;
  positions: PaperPosition[];
  trades: PaperTrade[];
  equityHistory: EquityPoint[];
  totalRealizedPnl: number;
};

export type SimulationSettings = {
  autoRun: boolean;
  intervalSec: number;
  minConfidence: number;
  maxPositionPct: number;
  maxOpenPositions: number;
};

export type PaperWorkspace = {
  id: string;
  name: string;
  description?: string;
  createdAt: string;
  updatedAt: string;
  workflowId: string;
  workflowName?: string;
  platform: SimulationPlatform;
  /** Legacy — canvas is loaded from workflow-storage when workflowId is set */
  canvas?: { nodes: WorkflowNode[]; edges: Edge[] };
  portfolio: PaperPortfolio;
  settings: SimulationSettings;
  lastRunAt?: string;
  lastRunOk?: boolean;
  lastRunError?: string;
  lastDecision?: Record<string, unknown>;
  runCount: number;
  stressCycleCount?: number;
};

export type StressTestResult = {
  cycles: number;
  completed: number;
  tradesExecuted: number;
  startEquity: number;
  endEquity: number;
  pnl: number;
  errors: string[];
};

export type SimulationCycleResult = {
  ok: boolean;
  runId: string;
  orchestrator: OrchestratorRunResult;
  tradesExecuted: PaperTrade[];
  error?: string;
};

const DEFAULT_SETTINGS: SimulationSettings = {
  autoRun: false,
  intervalSec: 60,
  minConfidence: 0.55,
  maxPositionPct: 0.08,
  maxOpenPositions: 5,
};

function emptyPortfolio(initialCapital: number): PaperPortfolio {
  return {
    initialCapital,
    cash: initialCapital,
    positions: [],
    trades: [],
    equityHistory: [
      {
        timestamp: new Date().toISOString(),
        equity: initialCapital,
        cash: initialCapital,
      },
    ],
    totalRealizedPnl: 0,
  };
}

function uid(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function createWorkspace(
  name: string,
  initialCapital = 10000,
  workflow?: SavedWorkflow,
  platform: SimulationPlatform = 'both',
): PaperWorkspace {
  const now = new Date().toISOString();
  const wf = workflow ?? ensureDefaultWorkflows().workflows[0];
  return {
    id: uid(),
    name,
    createdAt: now,
    updatedAt: now,
    workflowId: wf.id,
    workflowName: wf.name,
    platform,
    portfolio: emptyPortfolio(initialCapital),
    settings: { ...DEFAULT_SETTINGS },
    runCount: 0,
    stressCycleCount: 10,
  };
}

export function resolveWorkspaceCanvas(workspace: PaperWorkspace): {
  nodes: WorkflowNode[];
  edges: Edge[];
  workflowName: string;
} {
  const workflow = getWorkflowById(workspace.workflowId);
  if (workflow) {
    return {
      nodes: workflow.canvas.nodes,
      edges: workflow.canvas.edges,
      workflowName: workflow.name,
    };
  }
  const legacy = workspace.canvas;
  return {
    nodes: legacy?.nodes ?? [],
    edges: legacy?.edges ?? [],
    workflowName: workspace.workflowName ?? workspace.name,
  };
}

export function listSimulatableWorkflows(): SavedWorkflow[] {
  return loadSavedWorkflows();
}

function migrateWorkspace(raw: PaperWorkspace): PaperWorkspace {
  const { workflows, activeId } = ensureDefaultWorkflows();
  const workflowId = raw.workflowId ?? activeId ?? workflows[0]?.id ?? '';
  const workflow = getWorkflowById(workflowId);
  return {
    ...raw,
    workflowId,
    workflowName: workflow?.name ?? raw.workflowName ?? raw.name,
    platform: raw.platform ?? 'both',
    description: raw.description ?? '',
    stressCycleCount: raw.stressCycleCount ?? 10,
    settings: { ...DEFAULT_SETTINGS, ...raw.settings },
  };
}

export function loadWorkspaces(): PaperWorkspace[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as PaperWorkspace[];
    if (!Array.isArray(parsed)) return [];
    return parsed.map(migrateWorkspace);
  } catch {
    return [];
  }
}

export function saveWorkspaces(workspaces: PaperWorkspace[]): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(workspaces));
}

export function computeEquity(portfolio: PaperPortfolio): number {
  const positionsValue = portfolio.positions.reduce(
    (sum, pos) => sum + pos.shares * pos.markPrice,
    0,
  );
  return portfolio.cash + positionsValue;
}

function normalizeSide(raw: string | undefined): PaperSide | null {
  if (!raw) return null;
  const upper = raw.toUpperCase().replace(/\s+/g, ' ');
  if (upper.includes('NO')) return 'NO';
  if (upper.includes('YES')) return 'YES';
  return null;
}

function pickTradeIntent(
  orchestrator: OrchestratorRunResult,
  minConfidence: number,
): {
  market: string;
  slug: string;
  side: PaperSide;
  price: number;
  confidence: number;
  thesis: string;
  suggestedSizeUsd?: number;
} | null {
  const decision = orchestrator.decision;
  if (decision && typeof decision === 'object') {
    const action = String(decision.action ?? '');
    if (action && action !== 'HOLD') {
      const side = action.includes('NO') ? 'NO' : action.includes('YES') ? 'YES' : null;
      if (side) {
        const price = Number(decision.entry_price ?? decision.price ?? 0.5);
        const confidence = Number(decision.conviction_level ?? 7) / 10;
        if (confidence >= minConfidence) {
          return {
            market: String(decision.market ?? decision.market_id ?? 'Unknown market'),
            slug: String(decision.slug ?? decision.market_id ?? decision.market ?? 'unknown'),
            side,
            price: clampPrice(price),
            confidence,
            thesis: String(decision.thesis ?? decision.summary ?? ''),
          };
        }
      }
    }
  }

  const suggestions = orchestrator.suggestions ?? [];
  for (const raw of suggestions) {
    if (!raw || typeof raw !== 'object') continue;
    const suggestion = raw as Record<string, unknown>;
    const confidence = Number(suggestion.confidence ?? 0);
    if (confidence < minConfidence) continue;
    const side = normalizeSide(String(suggestion.side ?? ''));
    if (!side) continue;
    const price = Number(suggestion.entry_price ?? 0.5);
    return {
      market: String(suggestion.market ?? 'Unknown market'),
      slug: String(suggestion.slug ?? suggestion.market ?? 'unknown'),
      side,
      price: clampPrice(price),
      confidence,
      thesis: String(suggestion.thesis ?? ''),
      suggestedSizeUsd: Number(suggestion.suggested_size_usd ?? 0) || undefined,
    };
  }

  return null;
}

function clampPrice(price: number): number {
  if (!Number.isFinite(price)) return 0.5;
  return Math.min(0.98, Math.max(0.02, price));
}

function positionKey(slug: string, side: PaperSide): string {
  return `${slug}::${side}`;
}

function updateMarks(portfolio: PaperPortfolio, slug: string, side: PaperSide, price: number): void {
  for (const pos of portfolio.positions) {
    if (pos.slug === slug && pos.side === side) {
      pos.markPrice = price;
      pos.unrealizedPnl = pos.shares * pos.markPrice - pos.costBasis;
    }
  }
}

function recordEquity(portfolio: PaperPortfolio): void {
  const equity = computeEquity(portfolio);
  portfolio.equityHistory.push({
    timestamp: new Date().toISOString(),
    equity,
    cash: portfolio.cash,
  });
  if (portfolio.equityHistory.length > 200) {
    portfolio.equityHistory = portfolio.equityHistory.slice(-200);
  }
}

function executeBuy(
  portfolio: PaperPortfolio,
  intent: {
    market: string;
    slug: string;
    side: PaperSide;
    price: number;
    confidence: number;
    thesis: string;
    suggestedSizeUsd?: number;
  },
  settings: SimulationSettings,
  runId: string,
): PaperTrade | null {
  if (portfolio.positions.length >= settings.maxOpenPositions) {
    const existing = portfolio.positions.find(
      (p) => p.slug === intent.slug && p.side === intent.side,
    );
    if (!existing) return null;
  }

  const maxSpend = portfolio.cash * settings.maxPositionPct;
  const targetSpend = intent.suggestedSizeUsd
    ? Math.min(intent.suggestedSizeUsd, maxSpend)
    : maxSpend;
  if (targetSpend < 1 || portfolio.cash < intent.price) return null;

  const spend = Math.min(targetSpend, portfolio.cash);
  const shares = spend / intent.price;
  if (shares <= 0) return null;

  portfolio.cash -= spend;

  const key = positionKey(intent.slug, intent.side);
  const existingIdx = portfolio.positions.findIndex(
    (p) => positionKey(p.slug, p.side) === key,
  );

  if (existingIdx >= 0) {
    const pos = portfolio.positions[existingIdx];
    const newCost = pos.costBasis + spend;
    const newShares = pos.shares + shares;
    pos.shares = newShares;
    pos.costBasis = newCost;
    pos.avgEntryPrice = newCost / newShares;
    pos.markPrice = intent.price;
    pos.unrealizedPnl = newShares * pos.markPrice - newCost;
  } else {
    portfolio.positions.push({
      market: intent.market,
      slug: intent.slug,
      side: intent.side,
      shares,
      avgEntryPrice: intent.price,
      costBasis: spend,
      markPrice: intent.price,
      unrealizedPnl: shares * intent.price - spend,
      openedAt: new Date().toISOString(),
    });
  }

  const trade: PaperTrade = {
    id: uid(),
    timestamp: new Date().toISOString(),
    action: 'BUY',
    market: intent.market,
    slug: intent.slug,
    side: intent.side,
    price: intent.price,
    shares,
    cost: spend,
    thesis: intent.thesis,
    confidence: intent.confidence,
    runId,
  };
  portfolio.trades.unshift(trade);
  if (portfolio.trades.length > 500) {
    portfolio.trades = portfolio.trades.slice(0, 500);
  }
  return trade;
}

export function applySimulationResult(
  workspace: PaperWorkspace,
  result: SimulationCycleResult,
): PaperWorkspace {
  const portfolio = { ...workspace.portfolio, positions: [...workspace.portfolio.positions] };
  const tradesExecuted: PaperTrade[] = [];

  if (result.ok && result.orchestrator.ok) {
    const intent = pickTradeIntent(result.orchestrator, workspace.settings.minConfidence);
    if (intent) {
      updateMarks(portfolio, intent.slug, intent.side, intent.price);
      const trade = executeBuy(portfolio, intent, workspace.settings, result.runId);
      if (trade) tradesExecuted.push(trade);
    }

    for (const pos of portfolio.positions) {
      pos.unrealizedPnl = pos.shares * pos.markPrice - pos.costBasis;
    }
    recordEquity(portfolio);
  }

  return {
    ...workspace,
    portfolio,
    updatedAt: new Date().toISOString(),
    lastRunAt: new Date().toISOString(),
    lastRunOk: result.ok && result.orchestrator.ok,
    lastRunError: result.error ?? result.orchestrator.error,
    lastDecision: result.orchestrator.decision,
    runCount: workspace.runCount + 1,
  };
}

export async function runSimulationCycle(workspace: PaperWorkspace): Promise<SimulationCycleResult> {
  const runId = uid();
  const { nodes, edges } = resolveWorkspaceCanvas(workspace);
  if (nodes.length === 0) {
    return {
      ok: false,
      runId,
      orchestrator: {
        ok: false,
        error: 'No strategy workflow — build one on the Workflow canvas first.',
      },
      tradesExecuted: [],
      error: 'No workflow loaded',
    };
  }

  const orchestrator = await runOrchestrator({ nodes, edges });

  return {
    ok: orchestrator.ok,
    runId,
    orchestrator,
    tradesExecuted: [],
    error: orchestrator.error,
  };
}

export async function runStressTest(
  workspace: PaperWorkspace,
  cycles: number,
  onProgress?: (completed: number, total: number) => void,
): Promise<{ workspace: PaperWorkspace; result: StressTestResult }> {
  const total = Math.max(1, Math.min(100, Math.floor(cycles)));
  let current = workspace;
  const startEquity = computeEquity(current.portfolio);
  let tradesExecuted = 0;
  const errors: string[] = [];

  for (let i = 0; i < total; i++) {
    const cycle = await runSimulationCycle(current);
    const beforeTrades = current.portfolio.trades.length;
    current = applySimulationResult(current, { ...cycle, tradesExecuted: [] });
    tradesExecuted += current.portfolio.trades.length - beforeTrades;
    if (cycle.error) errors.push(cycle.error);
    onProgress?.(i + 1, total);
  }

  const endEquity = computeEquity(current.portfolio);
  return {
    workspace: {
      ...current,
      stressCycleCount: total,
      updatedAt: new Date().toISOString(),
    },
    result: {
      cycles: total,
      completed: total,
      tradesExecuted,
      startEquity,
      endEquity,
      pnl: endEquity - startEquity,
      errors,
    },
  };
}

export function applyStartingCapital(workspace: PaperWorkspace, capital: number): PaperWorkspace {
  const val = Math.max(100, Number.isFinite(capital) ? capital : workspace.portfolio.initialCapital);
  return {
    ...workspace,
    portfolio: emptyPortfolio(val),
    runCount: 0,
    lastRunAt: undefined,
    lastRunOk: undefined,
    lastRunError: undefined,
    lastDecision: undefined,
    updatedAt: new Date().toISOString(),
  };
}

export function resetPortfolio(workspace: PaperWorkspace): PaperWorkspace {
  const capital = workspace.portfolio.initialCapital;
  return {
    ...workspace,
    portfolio: emptyPortfolio(capital),
    runCount: 0,
    lastRunAt: undefined,
    lastRunOk: undefined,
    lastRunError: undefined,
    lastDecision: undefined,
    updatedAt: new Date().toISOString(),
  };
}

/** Apply an orchestrator/agent decision payload to a paper session portfolio. */
export function applyAgentDecisionToWorkspace(
  workspace: PaperWorkspace,
  decision: Record<string, unknown>,
): { workspace: PaperWorkspace; traded: boolean; message: string } {
  const action = String(decision.action ?? '').toUpperCase();
  if (action === 'HOLD' || !action) {
    return {
      workspace: {
        ...workspace,
        lastDecision: decision,
        lastRunAt: new Date().toISOString(),
        lastRunOk: true,
        lastRunError: undefined,
        updatedAt: new Date().toISOString(),
      },
      traded: false,
      message: 'HOLD — no paper trade executed',
    };
  }

  const beforeTrades = workspace.portfolio.trades.length;
  const updated = applySimulationResult(workspace, {
    ok: true,
    runId: uid(),
    orchestrator: { ok: true, decision },
    tradesExecuted: [],
  });
  const traded = updated.portfolio.trades.length > beforeTrades;
  return {
    workspace: updated,
    traded,
    message: traded ? 'Paper trade executed' : 'Decision received but no trade met session rules',
  };
}

export function executePaperTradingForSession(
  sessionId: string,
  payload: Record<string, unknown>,
  workflowId?: string,
): {
  ok: boolean;
  error?: string;
  data?: Record<string, unknown>;
} {
  const workspaces = loadWorkspaces();
  let idx = -1;

  const sid = sessionId.trim();
  if (sid) {
    idx = workspaces.findIndex((w) => w.id === sid);
  }

  const wfId = workflowId?.trim();
  if (idx === -1 && wfId) {
    idx = workspaces.findIndex((w) => w.workflowId === wfId);
  }

  if (idx === -1) {
    if (wfId) {
      return {
        ok: false,
        error: 'No paper session for this workflow — create one on the Paper Trading page',
      };
    }
    return { ok: false, error: 'Select a strategy workflow or paper session on the node' };
  }

  const { workspace, traded, message } = applyAgentDecisionToWorkspace(workspaces[idx], payload);
  workspaces[idx] = workspace;
  saveWorkspaces(workspaces);

  const equity = computeEquity(workspace.portfolio);
  const lastTrade = workspace.portfolio.trades[0];

  return {
    ok: true,
    data: {
      traded,
      message,
      sessionId: workspace.id,
      sessionName: workspace.name,
      equity,
      cash: workspace.portfolio.cash,
      runCount: workspace.runCount,
      lastTrade,
    },
  };
}

export type PaperSessionOption = {
  id: string;
  name: string;
  workflowId: string;
  workflowName?: string;
  platform: SimulationPlatform;
  equity: number;
};

export function listPaperSessionOptions(): PaperSessionOption[] {
  return loadWorkspaces().map((w) => ({
    id: w.id,
    name: w.name,
    workflowId: w.workflowId,
    workflowName: w.workflowName,
    platform: w.platform,
    equity: computeEquity(w.portfolio),
  }));
}

export function persistPaperWorkspace(workspace: PaperWorkspace): void {
  const workspaces = loadWorkspaces();
  const idx = workspaces.findIndex((w) => w.id === workspace.id);
  if (idx === -1) {
    saveWorkspaces([...workspaces, workspace]);
    return;
  }
  workspaces[idx] = workspace;
  saveWorkspaces(workspaces);
}

export function formatUsd(value: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 2,
  }).format(value);
}

export function formatPct(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

export const PLATFORM_LABELS: Record<SimulationPlatform, string> = {
  polymarket: 'Polymarket',
  kalshi: 'Kalshi',
  both: 'Polymarket × Kalshi',
};

export const STRESS_CYCLE_PRESETS = [1, 5, 10, 25, 50] as const;
