'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import {
  ensureDefaultWorkflows,
  getWorkflowById,
  loadSavedWorkflows,
  type SavedWorkflow,
} from '@/lib/workflow-storage';
import {
  applySimulationResult,
  applyStartingCapital,
  computeEquity,
  createWorkspace,
  formatPct,
  formatUsd,
  listSimulatableWorkflows,
  loadWorkspaces,
  PLATFORM_LABELS,
  resetPortfolio,
  resolveWorkspaceCanvas,
  runSimulationCycle,
  runStressTest,
  saveWorkspaces,
  STRESS_CYCLE_PRESETS,
  type PaperWorkspace,
  type SimulationPlatform,
  type StressTestResult,
} from '@/lib/paper-trading';

function StrategySetupPanel({
  workspace,
  savedWorkflows,
  workflowReady,
  workflowName,
  nodeCount,
  onUpdate,
  onApplyCapital,
  onRefreshWorkflows,
}: {
  workspace: PaperWorkspace;
  savedWorkflows: SavedWorkflow[];
  workflowReady: boolean;
  workflowName: string;
  nodeCount: number;
  onUpdate: (patch: Partial<PaperWorkspace>) => void;
  onApplyCapital: (capital: number) => void;
  onRefreshWorkflows: () => void;
}) {
  const [capitalInput, setCapitalInput] = useState(String(workspace.portfolio.initialCapital));

  useEffect(() => {
    setCapitalInput(String(workspace.portfolio.initialCapital));
  }, [workspace.id, workspace.portfolio.initialCapital]);

  const parsedCapital = Number(capitalInput);
  const capitalValid = Number.isFinite(parsedCapital) && parsedCapital >= 100;
  const capitalChanged =
    capitalValid && parsedCapital !== workspace.portfolio.initialCapital;

  return (
    <section className="paper-setup glass-panel">
      <div className="paper-setup__head">
        <h2 className="paper-section-title">Strategy setup</h2>
        <p className="cot-graph-sidebar__hint">
          Configure this paper session before running cycles.
        </p>
      </div>

      <div className="paper-setup__grid">
        <div className="paper-setup__col">
          <h3 className="paper-setup__subtitle">Session</h3>
          <label className="paper-field">
            <span className="paper-field__label">Name</span>
            <input
              className="cot-graph-sidebar__input"
              type="text"
              value={workspace.name}
              placeholder="e.g. Kalshi arb test"
              onChange={(e) => onUpdate({ name: e.target.value })}
            />
          </label>
          <label className="paper-field">
            <span className="paper-field__label">Notes</span>
            <textarea
              className="cot-graph-sidebar__input paper-setup__textarea"
              rows={3}
              value={workspace.description ?? ''}
              placeholder="Thesis, markets to watch, risk limits, edge assumptions…"
              onChange={(e) => onUpdate({ description: e.target.value })}
            />
          </label>
        </div>

        <div className="paper-setup__col">
          <h3 className="paper-setup__subtitle">Workflow</h3>
          <label className="paper-field">
            <span className="paper-field__label">Saved strategy</span>
            <select
              className="cot-graph-sidebar__input"
              value={workspace.workflowId}
              onChange={(e) => {
                const wf = getWorkflowById(e.target.value);
                if (!wf) return;
                onUpdate({ workflowId: wf.id, workflowName: wf.name });
                onRefreshWorkflows();
              }}
            >
              {savedWorkflows.map((wf) => (
                <option key={wf.id} value={wf.id}>
                  {wf.name}
                </option>
              ))}
            </select>
          </label>
          <p className="paper-field__hint">
            {workflowReady
              ? `«${workflowName}» · ${nodeCount} nodes wired`
              : 'This workflow has no nodes yet.'}
          </p>
          <div className="paper-setup__links">
            <Link
              href={`/?workflow=${workspace.workflowId}`}
              className="graph-view-toggle"
            >
              Edit workflow graph
            </Link>
            <button type="button" className="graph-view-toggle" onClick={onRefreshWorkflows}>
              Sync from builder
            </button>
          </div>
          <label className="paper-field">
            <span className="paper-field__label">Platform</span>
            <select
              className="cot-graph-sidebar__input"
              value={workspace.platform}
              onChange={(e) =>
                onUpdate({ platform: e.target.value as SimulationPlatform })
              }
            >
              {(Object.keys(PLATFORM_LABELS) as SimulationPlatform[]).map((key) => (
                <option key={key} value={key}>
                  {PLATFORM_LABELS[key]}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="paper-setup__col">
          <h3 className="paper-setup__subtitle">Capital</h3>
          <label className="paper-field">
            <span className="paper-field__label">Starting bankroll (USD)</span>
            <input
              className="cot-graph-sidebar__input"
              type="number"
              min={100}
              step={100}
              value={capitalInput}
              onChange={(e) => setCapitalInput(e.target.value)}
            />
          </label>
          <p className="paper-field__hint">
            Current cash {formatUsd(workspace.portfolio.cash)} · configured start{' '}
            {formatUsd(workspace.portfolio.initialCapital)}
          </p>
          <div className="paper-setup__links">
            <button
              type="button"
              className="graph-view-toggle paper-actions__primary"
              disabled={!capitalValid || !capitalChanged}
              onClick={() => onApplyCapital(parsedCapital)}
            >
              Apply &amp; reset portfolio
            </button>
          </div>
        </div>

        <div className="paper-setup__col">
          <h3 className="paper-setup__subtitle">Risk &amp; execution</h3>
          <label className="paper-field">
            <span className="paper-field__label">
              Min confidence · {formatPct(workspace.settings.minConfidence)}
            </span>
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
          </label>
          <label className="paper-field">
            <span className="paper-field__label">
              Max position size · {formatPct(workspace.settings.maxPositionPct)}
            </span>
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
          </label>
          <label className="paper-field">
            <span className="paper-field__label">Max open positions</span>
            <input
              className="cot-graph-sidebar__input"
              type="number"
              min={1}
              max={20}
              step={1}
              value={workspace.settings.maxOpenPositions}
              onChange={(e) => {
                const val = Number(e.target.value);
                if (!Number.isFinite(val)) return;
                onUpdate({
                  settings: {
                    ...workspace.settings,
                    maxOpenPositions: Math.max(1, Math.min(20, val)),
                  },
                });
              }}
            />
          </label>
          <label className="paper-field">
            <span className="paper-field__label">Stress test cycles</span>
            <select
              className="cot-graph-sidebar__input"
              value={workspace.stressCycleCount ?? 10}
              onChange={(e) =>
                onUpdate({ stressCycleCount: Number(e.target.value) })
              }
            >
              {STRESS_CYCLE_PRESETS.map((n) => (
                <option key={n} value={n}>
                  {n} cycles
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="paper-setup__col">
          <h3 className="paper-setup__subtitle">Automation</h3>
          <label className="simulate-check paper-field">
            <input
              type="checkbox"
              checked={workspace.settings.autoRun}
              onChange={(e) =>
                onUpdate({
                  settings: { ...workspace.settings, autoRun: e.target.checked },
                })
              }
            />
            <span>Auto-run cycles</span>
          </label>
          <label className="paper-field">
            <span className="paper-field__label">Interval (seconds)</span>
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
          </label>
          <p className="paper-field__hint">
            Paper trades execute when the orchestrator returns BUY YES/NO above your
            confidence threshold.
          </p>
        </div>
      </div>
    </section>
  );
}

function SessionList({
  workspaces,
  activeId,
  onSelect,
  onAdd,
  onRemove,
}: {
  workspaces: PaperWorkspace[];
  activeId: string;
  onSelect: (id: string) => void;
  onAdd: () => void;
  onRemove: (id: string) => void;
}) {
  return (
    <aside className="paper-sidebar glass-panel">
      <div className="paper-sidebar__head">
        <h2 className="paper-sidebar__title">Sessions</h2>
        <button type="button" className="paper-sidebar__add" onClick={onAdd} title="New session">
          +
        </button>
      </div>
      <ul className="paper-session-list">
        {workspaces.map((ws) => {
          const equity = computeEquity(ws.portfolio);
          const pnl = equity - ws.portfolio.initialCapital;
          const active = ws.id === activeId;
          return (
            <li key={ws.id}>
              <button
                type="button"
                className={`paper-session${active ? ' paper-session--active' : ''}`}
                onClick={() => onSelect(ws.id)}
              >
                <span className="paper-session__name">{ws.name}</span>
                <span className="paper-session__equity">{formatUsd(equity)}</span>
                <span
                  className={
                    pnl >= 0 ? 'simulate-pnl simulate-pnl--up' : 'simulate-pnl simulate-pnl--down'
                  }
                >
                  {formatUsd(pnl)}
                </span>
              </button>
              {workspaces.length > 1 ? (
                <button
                  type="button"
                  className="paper-session__remove"
                  onClick={() => onRemove(ws.id)}
                  aria-label={`Remove ${ws.name}`}
                >
                  ×
                </button>
              ) : null}
            </li>
          );
        })}
      </ul>
    </aside>
  );
}

function PaperDashboard({
  workspace,
  savedWorkflows,
  workflowReady,
  workflowName,
  nodeCount,
  running,
  stressProgress,
  lastStressResult,
  onUpdate,
  onApplyCapital,
  onReset,
  onRunCycle,
  onStressTest,
  onRefreshWorkflows,
}: {
  workspace: PaperWorkspace;
  savedWorkflows: SavedWorkflow[];
  workflowReady: boolean;
  workflowName: string;
  nodeCount: number;
  running: boolean;
  stressProgress: { completed: number; total: number } | null;
  lastStressResult: StressTestResult | null;
  onUpdate: (patch: Partial<PaperWorkspace>) => void;
  onApplyCapital: (capital: number) => void;
  onReset: () => void;
  onRunCycle: () => void;
  onStressTest: () => void;
  onRefreshWorkflows: () => void;
}) {
  const equity = computeEquity(workspace.portfolio);
  const initial = workspace.portfolio.initialCapital;
  const pnl = equity - initial;
  const returnPct = initial > 0 ? pnl / initial : 0;
  const history = workspace.portfolio.equityHistory;
  const max = Math.max(...history.map((p) => p.equity), initial, equity);
  const min = Math.min(...history.map((p) => p.equity), initial, equity);
  const range = max - min || 1;
  const positions = workspace.portfolio.positions;
  const trades = workspace.portfolio.trades;
  const decision = workspace.lastDecision;

  return (
    <div className="paper-dashboard dark-scroll">
      <StrategySetupPanel
        workspace={workspace}
        savedWorkflows={savedWorkflows}
        workflowReady={workflowReady}
        workflowName={workflowName}
        nodeCount={nodeCount}
        onUpdate={onUpdate}
        onApplyCapital={onApplyCapital}
        onRefreshWorkflows={onRefreshWorkflows}
      />

      <section className="paper-stats">
        <div className="paper-stat glass-panel">
          <span className="paper-stat__label">Portfolio value</span>
          <strong className="paper-stat__value">{formatUsd(equity)}</strong>
        </div>
        <div className="paper-stat glass-panel">
          <span className="paper-stat__label">P&amp;L</span>
          <strong
            className={`paper-stat__value${pnl >= 0 ? ' paper-stat__value--up' : ' paper-stat__value--down'}`}
          >
            {formatUsd(pnl)}
          </strong>
          <span className="paper-stat__sub">{formatPct(returnPct)}</span>
        </div>
        <div className="paper-stat glass-panel">
          <span className="paper-stat__label">Cash</span>
          <strong className="paper-stat__value">{formatUsd(workspace.portfolio.cash)}</strong>
        </div>
        <div className="paper-stat glass-panel">
          <span className="paper-stat__label">Cycles</span>
          <strong className="paper-stat__value">{workspace.runCount}</strong>
          <span className="paper-stat__sub">{positions.length} open</span>
        </div>
      </section>

      <section className="paper-chart glass-panel">
        <div className="paper-chart__head">
          <h2 className="paper-section-title">Equity curve</h2>
          <span className="cot-graph-sidebar__hint">
            Started {formatUsd(initial)}
          </span>
        </div>
        <div className="simulate-equity__chart paper-chart__bars" aria-hidden>
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
      </section>

      <section className="paper-actions glass-panel">
        <div className="paper-actions__buttons">
          <button
            type="button"
            className="graph-view-toggle paper-actions__primary"
            disabled={running || !workflowReady}
            onClick={onRunCycle}
          >
            {running && !stressProgress ? 'Running…' : 'Run cycle'}
          </button>
          <button
            type="button"
            className="graph-view-toggle"
            disabled={running || !workflowReady}
            onClick={onStressTest}
          >
            {stressProgress
              ? `Stress ${stressProgress.completed}/${stressProgress.total}`
              : `Stress test (${workspace.stressCycleCount ?? 10})`}
          </button>
          <button type="button" className="graph-view-toggle" onClick={onReset} disabled={running}>
            Reset to starting capital
          </button>
        </div>
        {workspace.lastRunAt ? (
          <p className="cot-graph-sidebar__hint paper-actions__status">
            Last run {new Date(workspace.lastRunAt).toLocaleString()}
            {workspace.lastRunOk ? ' · OK' : ' · Failed'}
          </p>
        ) : null}
        {workspace.lastRunError ? (
          <p className="simulate-error">{workspace.lastRunError}</p>
        ) : null}
        {lastStressResult ? (
          <p className="cot-graph-sidebar__hint paper-actions__status">
            Last stress: {lastStressResult.completed} cycles · {lastStressResult.tradesExecuted}{' '}
            trades ·{' '}
            <span
              className={
                lastStressResult.pnl >= 0
                  ? 'simulate-pnl simulate-pnl--up'
                  : 'simulate-pnl simulate-pnl--down'
              }
            >
              {formatUsd(lastStressResult.pnl)}
            </span>
          </p>
        ) : null}
      </section>

      <div className="paper-columns">
        <section className="paper-panel glass-panel">
          <h2 className="paper-section-title">Open positions ({positions.length})</h2>
          {positions.length === 0 ? (
            <p className="cot-graph-sidebar__hint">No open YES/NO positions.</p>
          ) : (
            <ul className="simulate-positions">
              {positions.map((pos) => (
                <li key={`${pos.slug}-${pos.side}`} className="simulate-position">
                  <div className="simulate-position__head">
                    <strong>{pos.market}</strong>
                    <span className="simulate-badge">{pos.side}</span>
                  </div>
                  <div className="simulate-position__meta">
                    <span>
                      {pos.shares.toFixed(2)} sh @ {formatUsd(pos.avgEntryPrice)}
                    </span>
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
        </section>

        <section className="paper-panel glass-panel">
          <h2 className="paper-section-title">Trade log ({trades.length})</h2>
          {trades.length === 0 ? (
            <p className="cot-graph-sidebar__hint">Paper trades appear after successful cycles.</p>
          ) : (
            <ul className="simulate-trades paper-trades">
              {trades.slice(0, 20).map((trade) => (
                <li key={trade.id} className="simulate-trade">
                  <div className="simulate-trade__head">
                    <span className="simulate-badge">
                      {trade.action} {trade.side}
                    </span>
                    <time className="cot-graph-sidebar__hint">
                      {new Date(trade.timestamp).toLocaleString()}
                    </time>
                  </div>
                  <p className="simulate-trade__market">{trade.market}</p>
                  <p className="cot-graph-sidebar__hint">
                    {trade.shares.toFixed(2)} sh @ {formatUsd(trade.price)} · {formatUsd(trade.cost)}
                  </p>
                  {trade.thesis ? (
                    <p className="cot-graph-field--muted">{trade.thesis}</p>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <section className="paper-panel glass-panel">
        <h2 className="paper-section-title">Last orchestrator decision</h2>
        {decision ? (
          <div className="simulate-decision">
            <span className="simulate-decision__action">{String(decision.action ?? '—')}</span>
            {decision.thesis != null && decision.thesis !== '' && (
              <p>{String(decision.thesis)}</p>
            )}
          </div>
        ) : (
          <p className="cot-graph-sidebar__hint">Run a cycle to see the latest trade thesis.</p>
        )}
      </section>
    </div>
  );
}

function SimulateAppInner() {
  const [workspaces, setWorkspaces] = useState<PaperWorkspace[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [savedWorkflows, setSavedWorkflows] = useState<SavedWorkflow[]>([]);
  const [running, setRunning] = useState(false);
  const [stressProgress, setStressProgress] = useState<{ completed: number; total: number } | null>(
    null,
  );
  const [lastStressResult, setLastStressResult] = useState<StressTestResult | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const workspacesRef = useRef(workspaces);

  useEffect(() => {
    workspacesRef.current = workspaces;
  }, [workspaces]);

  useEffect(() => {
    const { workflows } = ensureDefaultWorkflows();
    const stored = loadWorkspaces();
    setSavedWorkflows(loadSavedWorkflows());

    if (stored.length === 0) {
      const first = createWorkspace('Session A', 10000, workflows[0], 'both');
      setWorkspaces([first]);
      setActiveId(first.id);
      saveWorkspaces([first]);
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

  const refreshWorkflows = useCallback(() => {
    setSavedWorkflows(loadSavedWorkflows());
  }, []);

  const activeWorkspace = useMemo(
    () => workspaces.find((w) => w.id === activeId) ?? workspaces[0] ?? null,
    [workspaces, activeId],
  );

  const resolvedCanvas = useMemo(() => {
    if (!activeWorkspace) return { nodes: [], edges: [], workflowName: '' };
    return resolveWorkspaceCanvas(activeWorkspace);
  }, [activeWorkspace, savedWorkflows]);

  const updateWorkspace = useCallback((id: string, patch: Partial<PaperWorkspace>) => {
    setWorkspaces((current) =>
      current.map((w) =>
        w.id === id ? { ...w, ...patch, updatedAt: new Date().toISOString() } : w,
      ),
    );
  }, []);

  const addWorkspace = useCallback(() => {
    const workflows = listSimulatableWorkflows();
    const wf = workflows[workspacesRef.current.length % workflows.length] ?? workflows[0];
    const next = createWorkspace(`Session ${workspacesRef.current.length + 1}`, 10000, wf, 'both');
    setWorkspaces((current) => [...current, next]);
    setActiveId(next.id);
    setLastStressResult(null);
  }, []);

  const removeWorkspace = useCallback(
    (id: string) => {
      setWorkspaces((current) => {
        const filtered = current.filter((w) => w.id !== id);
        if (filtered.length === 0) {
          const workflows = listSimulatableWorkflows();
          const fresh = createWorkspace('Session A', 10000, workflows[0], 'both');
          setActiveId(fresh.id);
          return [fresh];
        }
        if (activeId === id) {
          setActiveId(filtered[0].id);
          setLastStressResult(null);
        }
        return filtered;
      });
    },
    [activeId],
  );

  const runPaperCycle = useCallback(async () => {
    const ws = workspacesRef.current.find((w) => w.id === activeId) ?? workspacesRef.current[0];
    if (!ws || running) return;
    setRunning(true);
    try {
      const result = await runSimulationCycle(ws);
      const withTrades = applySimulationResult(ws, { ...result, tradesExecuted: [] });
      setWorkspaces((current) =>
        current.map((w) => (w.id === withTrades.id ? withTrades : w)),
      );
    } finally {
      setRunning(false);
    }
  }, [activeId, running]);

  const runStress = useCallback(async () => {
    const ws = workspacesRef.current.find((w) => w.id === activeId) ?? workspacesRef.current[0];
    if (!ws || running) return;
    const cycles = ws.stressCycleCount ?? 10;
    setRunning(true);
    setStressProgress({ completed: 0, total: cycles });
    try {
      const { workspace: updated, result } = await runStressTest(ws, cycles, (completed, total) => {
        setStressProgress({ completed, total });
      });
      setWorkspaces((current) => current.map((w) => (w.id === updated.id ? updated : w)));
      setLastStressResult(result);
    } finally {
      setRunning(false);
      setStressProgress(null);
    }
  }, [activeId, running]);

  useEffect(() => {
    if (!activeWorkspace?.settings.autoRun || running) return;
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
    running,
  ]);

  if (!hydrated || !activeWorkspace) {
    return (
      <div className="playground-loading">
        <span>Loading paper trading…</span>
      </div>
    );
  }

  const workflowReady = resolvedCanvas.nodes.length > 0;

  return (
    <div className="playground-shell paper-shell">
      <header className="playground-header paper-header">
        <Image
          src="/conduence-logo.png"
          alt="Conduence"
          width={250}
          height={50}
          className="playground-header__logo"
          priority
        />
        <nav className="paper-nav" aria-label="App sections">
          <Link href="/" className="graph-view-toggle">
            Workflow
          </Link>
          <span className="graph-view-toggle graph-view-toggle--active">Paper Trading</span>
        </nav>
      </header>

      <div className="paper-body">
        <SessionList
          workspaces={workspaces}
          activeId={activeWorkspace.id}
          onSelect={(id) => {
            setActiveId(id);
            setLastStressResult(null);
          }}
          onAdd={addWorkspace}
          onRemove={removeWorkspace}
        />
        <PaperDashboard
          workspace={activeWorkspace}
          savedWorkflows={savedWorkflows}
          workflowReady={workflowReady}
          workflowName={resolvedCanvas.workflowName}
          nodeCount={resolvedCanvas.nodes.length}
          running={running}
          stressProgress={stressProgress}
          lastStressResult={lastStressResult}
          onUpdate={(patch) => updateWorkspace(activeWorkspace.id, patch)}
          onApplyCapital={(capital) =>
            updateWorkspace(
              activeWorkspace.id,
              applyStartingCapital(activeWorkspace, capital),
            )
          }
          onReset={() => updateWorkspace(activeWorkspace.id, resetPortfolio(activeWorkspace))}
          onRunCycle={() => void runPaperCycle()}
          onStressTest={() => void runStress()}
          onRefreshWorkflows={refreshWorkflows}
        />
      </div>
    </div>
  );
}

export function SimulateApp() {
  return <SimulateAppInner />;
}
