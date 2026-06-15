'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import type { Edge } from '@xyflow/react';
import { ReactFlowProvider } from '@xyflow/react';
import type { WorkflowNode } from '@/nodes/types';
import { NodePalette } from '@/components/playground/NodePalette';
import { WorkflowCanvas } from '@/components/playground/WorkflowCanvas';
import { InstalledAgentsProvider } from '@/lib/marketplace';
import { AgentFeedProvider } from '@/lib/agent-feed';
import {
  applySimulationResult,
  computeEquity,
  createWorkspace,
  formatPct,
  formatUsd,
  loadWorkspaces,
  resetPortfolio,
  runSimulationCycle,
  saveWorkspaces,
  type PaperWorkspace,
} from '@/lib/paper-trading';

function WorkspaceTab({
  workspace,
  active,
  onSelect,
  onClose,
}: {
  workspace: PaperWorkspace;
  active: boolean;
  onSelect: () => void;
  onClose: () => void;
}) {
  return (
    <div className="simulate-workspace-tab">
      <button
        type="button"
        className={`graph-view-toggle simulate-workspace-tab__btn${active ? ' graph-view-toggle--active' : ''}`}
        onClick={onSelect}
      >
        {workspace.name}
      </button>
      <button
        type="button"
        className="simulate-workspace-tab__close"
        onClick={onClose}
        title="Remove workspace"
        aria-label={`Remove ${workspace.name}`}
      >
        ×
      </button>
    </div>
  );
}

function PaperTradingSidebar({
  workspace,
  onUpdate,
  running,
  onPaperRun,
  onReset,
}: {
  workspace: PaperWorkspace;
  onUpdate: (patch: Partial<PaperWorkspace>) => void;
  running: boolean;
  onPaperRun: () => void;
  onReset: () => void;
}) {
  const decision = workspace.lastDecision;
  const equity = computeEquity(workspace.portfolio);
  const initial = workspace.portfolio.initialCapital;
  const pnl = equity - initial;
  const history = workspace.portfolio.equityHistory;
  const max = Math.max(...history.map((p) => p.equity), initial, equity);
  const min = Math.min(...history.map((p) => p.equity), initial, equity);
  const range = max - min || 1;
  const trades = workspace.portfolio.trades;
  const positions = workspace.portfolio.positions;

  return (
    <aside className="cot-graph-view__sidebar simulate-paper-sidebar dark-scroll">
      <div className="cot-graph-sidebar__section">
        <div className="cot-graph-sidebar__label">Workspace</div>
        <input
          className="cot-graph-sidebar__input"
          type="text"
          value={workspace.name}
          onChange={(e) => onUpdate({ name: e.target.value })}
        />
      </div>

      <div className="cot-graph-sidebar__section">
        <div className="cot-graph-sidebar__label">Portfolio</div>
        <strong className="simulate-equity__value">{formatUsd(equity)}</strong>
        <p
          className={
            pnl >= 0 ? 'simulate-pnl simulate-pnl--up' : 'simulate-pnl simulate-pnl--down'
          }
        >
          {formatUsd(pnl)} ({formatPct(initial > 0 ? pnl / initial : 0)})
        </p>
        <div className="simulate-equity__chart simulate-equity__chart--compact" aria-hidden>
          {history.map((point, i) => {
            const height = ((point.equity - min) / range) * 100;
            return (
              <div
                key={`${point.timestamp}-${i}`}
                className="simulate-equity__bar"
                style={{ height: `${Math.max(4, height)}%` }}
              />
            );
          })}
        </div>
        <p className="cot-graph-sidebar__hint">
          Cash {formatUsd(workspace.portfolio.cash)} · {workspace.runCount} cycles
        </p>
      </div>

      <div className="cot-graph-sidebar__section">
        <div className="cot-graph-sidebar__label">Starting capital</div>
        <input
          className="cot-graph-sidebar__input"
          type="number"
          min={100}
          step={100}
          value={workspace.portfolio.initialCapital}
          onChange={(e) => {
            const val = Number(e.target.value);
            if (!Number.isFinite(val) || val < 0) return;
            onUpdate({
              portfolio: {
                ...workspace.portfolio,
                initialCapital: val,
                cash: val,
                positions: [],
                trades: [],
                equityHistory: [
                  { timestamp: new Date().toISOString(), equity: val, cash: val },
                ],
                totalRealizedPnl: 0,
              },
              runCount: 0,
            });
          }}
        />
      </div>

      <div className="cot-graph-sidebar__section">
        <div className="cot-graph-sidebar__label">
          Min confidence · {formatPct(workspace.settings.minConfidence)}
        </div>
        <input
          className="simulate-range"
          type="range"
          min={0.3}
          max={0.95}
          step={0.05}
          value={workspace.settings.minConfidence}
          onChange={(e) =>
            onUpdate({
              settings: {
                ...workspace.settings,
                minConfidence: Number(e.target.value),
              },
            })
          }
        />
      </div>

      <div className="cot-graph-sidebar__section">
        <div className="cot-graph-sidebar__label">
          Max position · {formatPct(workspace.settings.maxPositionPct)}
        </div>
        <input
          className="simulate-range"
          type="range"
          min={0.02}
          max={0.25}
          step={0.01}
          value={workspace.settings.maxPositionPct}
          onChange={(e) =>
            onUpdate({
              settings: {
                ...workspace.settings,
                maxPositionPct: Number(e.target.value),
              },
            })
          }
        />
      </div>

      <div className="cot-graph-sidebar__section">
        <label className="simulate-check">
          <input
            type="checkbox"
            checked={workspace.settings.autoRun}
            onChange={(e) =>
              onUpdate({
                settings: { ...workspace.settings, autoRun: e.target.checked },
              })
            }
          />
          <span>Auto paper-run</span>
        </label>
        <input
          className="cot-graph-sidebar__input"
          type="number"
          min={15}
          max={600}
          step={15}
          value={workspace.settings.intervalSec}
          disabled={!workspace.settings.autoRun}
          onChange={(e) =>
            onUpdate({
              settings: {
                ...workspace.settings,
                intervalSec: Number(e.target.value) || 60,
              },
            })
          }
        />
      </div>

      <div className="cot-graph-sidebar__section">
        <div className="simulate-run-actions">
          <button
            type="button"
            className="graph-view-toggle graph-view-toggle--active"
            disabled={running}
            onClick={onPaperRun}
          >
            {running ? 'Running…' : 'Paper cycle'}
          </button>
          <button type="button" className="graph-view-toggle" disabled={running} onClick={onReset}>
            Reset
          </button>
        </div>
        {workspace.lastRunAt && (
          <p className="cot-graph-sidebar__hint">
            Last {new Date(workspace.lastRunAt).toLocaleString()}
            {workspace.lastRunOk ? ' · OK' : ' · Failed'}
          </p>
        )}
        {workspace.lastRunError && <p className="simulate-error">{workspace.lastRunError}</p>}
        {decision && (
          <div className="simulate-decision">
            <span className="simulate-decision__action">{String(decision.action ?? '—')}</span>
            {decision.thesis != null && decision.thesis !== '' && (
              <p>{String(decision.thesis)}</p>
            )}
          </div>
        )}
      </div>

      <div className="cot-graph-sidebar__section">
        <div className="cot-graph-sidebar__label">
          Open positions ({positions.length})
        </div>
        {positions.length === 0 ? (
          <p className="cot-graph-sidebar__hint">No open paper positions.</p>
        ) : (
          <ul className="simulate-positions">
            {positions.map((pos) => (
              <li key={`${pos.slug}-${pos.side}`} className="simulate-position">
                <div className="simulate-position__head">
                  <strong>{pos.market}</strong>
                  <span className="simulate-badge">{pos.side}</span>
                </div>
                <div className="simulate-position__meta">
                  <span>{pos.shares.toFixed(2)} sh @ {formatUsd(pos.avgEntryPrice)}</span>
                  <span
                    className={
                      pos.unrealizedPnl >= 0
                        ? 'simulate-pnl simulate-pnl--up'
                        : 'simulate-pnl simulate-pnl--down'
                    }
                  >
                    {formatUsd(pos.unrealizedPnl)}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="simulate-paper-sidebar__scroll dark-scroll">
        <div className="cot-graph-sidebar__section">
          <div className="cot-graph-sidebar__label">
            Trade log ({trades.length})
          </div>
        </div>
        {trades.length === 0 ? (
          <p className="cot-graph-sidebar__hint simulate-paper-sidebar__empty">
            Paper buys appear here after a successful cycle.
          </p>
        ) : (
          <ul className="simulate-trades">
            {trades.map((trade) => (
              <li key={trade.id} className="cot-graph-sidebar__section simulate-trade">
                <div className="simulate-trade__head">
                  <span className="simulate-badge">{trade.action} {trade.side}</span>
                  <time className="cot-graph-sidebar__hint">
                    {new Date(trade.timestamp).toLocaleTimeString()}
                  </time>
                </div>
                <p className="simulate-trade__market">{trade.market}</p>
                <p className="cot-graph-sidebar__hint">
                  {trade.shares.toFixed(2)} sh @ {formatUsd(trade.price)} · {formatUsd(trade.cost)}
                </p>
                {trade.thesis && <p className="cot-graph-field--muted">{trade.thesis}</p>}
              </li>
            ))}
          </ul>
        )}
      </div>
    </aside>
  );
}

function SimulateAppInner() {
  const [workspaces, setWorkspaces] = useState<PaperWorkspace[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [paperRunning, setPaperRunning] = useState(false);
  const [workflowRunning, setWorkflowRunning] = useState(false);
  const [workflowRunSignal, setWorkflowRunSignal] = useState(0);
  const [nodeCount, setNodeCount] = useState(0);
  const [canvasHydrateKey, setCanvasHydrateKey] = useState(0);
  const [hydrated, setHydrated] = useState(false);
  const workspacesRef = useRef(workspaces);
  const prevActiveIdRef = useRef<string | null>(null);

  useEffect(() => {
    workspacesRef.current = workspaces;
  }, [workspaces]);

  useEffect(() => {
    const stored = loadWorkspaces();
    if (stored.length === 0) {
      const first = createWorkspace('Strategy A');
      const second = createWorkspace('Strategy B');
      setWorkspaces([first, second]);
      setActiveId(first.id);
      saveWorkspaces([first, second]);
    } else {
      setWorkspaces(stored);
      setActiveId(stored[0]?.id ?? null);
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    saveWorkspaces(workspaces);
  }, [workspaces, hydrated]);

  useEffect(() => {
    if (prevActiveIdRef.current !== activeId) {
      prevActiveIdRef.current = activeId;
      setCanvasHydrateKey((k) => k + 1);
    }
  }, [activeId]);

  const activeWorkspace = useMemo(
    () => workspaces.find((w) => w.id === activeId) ?? workspaces[0] ?? null,
    [workspaces, activeId],
  );

  const updateWorkspace = useCallback((id: string, patch: Partial<PaperWorkspace>) => {
    setWorkspaces((current) =>
      current.map((w) => (w.id === id ? { ...w, ...patch, updatedAt: new Date().toISOString() } : w)),
    );
  }, []);

  const onCanvasChange = useCallback(
    (nodes: WorkflowNode[], edges: Edge[]) => {
      if (!activeId) return;
      setWorkspaces((current) =>
        current.map((w) => {
          if (w.id !== activeId) return w;
          return { ...w, canvas: { nodes, edges } };
        }),
      );
    },
    [activeId],
  );

  const onCountsChange = useCallback((nodes: number, _edges: number) => {
    setNodeCount(nodes);
  }, []);

  const loadCanvasPayload = useMemo(() => {
    if (!activeWorkspace) return null;
    return {
      key: `${activeWorkspace.id}-${canvasHydrateKey}`,
      nodes: activeWorkspace.canvas.nodes,
      edges: activeWorkspace.canvas.edges,
    };
  }, [activeWorkspace, canvasHydrateKey]);

  const addWorkspace = useCallback(() => {
    const next = createWorkspace(`Strategy ${workspacesRef.current.length + 1}`);
    setWorkspaces((current) => [...current, next]);
    setActiveId(next.id);
  }, []);

  const removeWorkspace = useCallback(
    (id: string) => {
      setWorkspaces((current) => {
        const filtered = current.filter((w) => w.id !== id);
        if (filtered.length === 0) {
          const fresh = createWorkspace('Strategy A');
          setActiveId(fresh.id);
          return [fresh];
        }
        if (activeId === id) setActiveId(filtered[0].id);
        return filtered;
      });
    },
    [activeId],
  );

  const runPaperCycle = useCallback(async () => {
    const ws = workspacesRef.current.find((w) => w.id === activeId) ?? workspacesRef.current[0];
    if (!ws || paperRunning) return;
    setPaperRunning(true);
    try {
      const result = await runSimulationCycle(ws);
      const withTrades = applySimulationResult(ws, {
        ...result,
        tradesExecuted: [],
      });
      setWorkspaces((current) =>
        current.map((w) => (w.id === withTrades.id ? withTrades : w)),
      );
    } finally {
      setPaperRunning(false);
    }
  }, [activeId, paperRunning]);

  useEffect(() => {
    if (!activeWorkspace?.settings.autoRun || paperRunning) return;
    const ms = Math.max(15, activeWorkspace.settings.intervalSec) * 1000;
    const timer = window.setInterval(() => {
      void runPaperCycle();
    }, ms);
    return () => window.clearInterval(timer);
  }, [
    activeWorkspace?.settings.autoRun,
    activeWorkspace?.settings.intervalSec,
    activeWorkspace?.id,
    runPaperCycle,
    paperRunning,
  ]);

  if (!hydrated || !activeWorkspace) {
    return (
      <div className="playground-loading">
        <span>Loading paper trading…</span>
      </div>
    );
  }

  const equity = computeEquity(activeWorkspace.portfolio);
  const running = paperRunning || workflowRunning;

  return (
    <div className="playground-shell">
      <header className="playground-header">
        <Image
          src="/conduence-logo.png"
          alt="Conduence"
          width={250}
          height={50}
          className="playground-header__logo"
          priority
        />

        <nav className="simulate-workspaces" aria-label="Strategy workspaces">
          {workspaces.map((ws) => (
            <WorkspaceTab
              key={ws.id}
              workspace={ws}
              active={ws.id === activeWorkspace.id}
              onSelect={() => setActiveId(ws.id)}
              onClose={() => removeWorkspace(ws.id)}
            />
          ))}
          <button type="button" className="graph-view-toggle" onClick={addWorkspace}>
            + Workspace
          </button>
        </nav>

        <div className="playground-header__actions">
          <span className="playground-header__stats">
            {formatUsd(equity)}
          </span>
          <button
            type="button"
            className="graph-view-toggle"
            onClick={() => setWorkflowRunSignal((v) => v + 1)}
            disabled={running || nodeCount === 0}
            title="Run connected workflow on canvas"
          >
            {workflowRunning ? 'Running…' : 'Run Workflow'}
          </button>
          <button
            type="button"
            className="graph-view-toggle"
            onClick={() => void runPaperCycle()}
            disabled={running || nodeCount === 0}
            title="Run orchestrator and execute paper trades"
          >
            {paperRunning ? 'Paper…' : 'Paper cycle'}
          </button>
          <Link href="/" className="graph-view-toggle" title="Back to workflow builder">
            Workflow
          </Link>
          <span className="graph-view-toggle graph-view-toggle--active">Paper Trade</span>
        </div>
      </header>

      <div className="playground-body">
        <NodePalette />
        <WorkflowCanvas
          onCountsChange={onCountsChange}
          runSignal={workflowRunSignal}
          onRunStateChange={setWorkflowRunning}
          onCanvasChange={onCanvasChange}
          loadCanvas={loadCanvasPayload}
        />
        <PaperTradingSidebar
          workspace={activeWorkspace}
          onUpdate={(patch) => updateWorkspace(activeWorkspace.id, patch)}
          running={paperRunning}
          onPaperRun={() => void runPaperCycle()}
          onReset={() =>
            updateWorkspace(activeWorkspace.id, resetPortfolio(activeWorkspace))
          }
        />
      </div>
    </div>
  );
}

export function SimulateApp() {
  return (
    <InstalledAgentsProvider>
      <AgentFeedProvider>
        <ReactFlowProvider>
          <SimulateAppInner />
        </ReactFlowProvider>
      </AgentFeedProvider>
    </InstalledAgentsProvider>
  );
}
