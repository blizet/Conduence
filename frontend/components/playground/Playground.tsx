'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import Image from 'next/image';
import Link from 'next/link';
import { ReactFlowProvider } from '@xyflow/react';
import type { Edge } from '@xyflow/react';
import type { WorkflowNode } from '@/nodes/types';
import { NodePalette } from './NodePalette';
import { AgentMarketplace } from './AgentMarketplace';
import { PublishWorkflowModal } from './PublishWorkflowModal';
import { WorkflowCanvas } from './WorkflowCanvas';
import { InstalledAgentsProvider } from '@/lib/marketplace';
import { AgentFeedProvider } from '@/lib/agent-feed';
import {
  fetchWorkflowLiveStatus,
  startWorkflowLive,
  stopWorkflowLive,
} from '@/lib/workflow-live';
import {
  addSavedWorkflow,
  deleteSavedWorkflow,
  ensureDefaultWorkflows,
  getWorkflowById,
  renameWorkflow,
  setActiveWorkflowId,
  upsertWorkflowCanvas,
  type SavedWorkflow,
} from '@/lib/workflow-storage';

const CotGraphView = dynamic(
  () => import('./CotGraphView').then((mod) => mod.CotGraphView),
  {
    ssr: false,
    loading: () => <div className="cot-graph-view cot-graph-view--loading">Loading graph…</div>,
  },
);

type PlaygroundInnerProps = {
  nodeCount: number;
  edgeCount: number;
  showGraph: boolean;
  showMarketplace: boolean;
  showPublish: boolean;
  onToggleGraph: () => void;
  onToggleMarketplace: () => void;
  onCloseMarketplace: () => void;
  onOpenPublish: () => void;
  onClosePublish: () => void;
  onCountsChange: (nodes: number, edges: number) => void;
  onRunWorkflow: () => void;
  onGoLive: () => void;
  onStopLive: () => void;
  workflowLive: boolean;
  liveBusy: boolean;
  liveError: string | null;
  runBusy: boolean;
  runSignal: number;
  onRunStateChange: (running: boolean) => void;
  onCanvasChange: (nodes: WorkflowNode[], edges: Edge[]) => void;
  canvasSnapshot: { nodes: WorkflowNode[]; edges: Edge[] };
  onInstallWorkflow: (canvas: { nodes: WorkflowNode[]; edges: Edge[] }) => void;
  loadCanvas: { key: number; nodes: WorkflowNode[]; edges: Edge[] } | null;
  canvasBootKey: string;
  storageReady: boolean;
  workflowRefreshSignal: number;
  onWorkflowPublished: () => void;
  savedWorkflows: SavedWorkflow[];
  activeWorkflowId: string;
  activeWorkflowName: string;
  onSelectWorkflow: (id: string) => void;
  onRenameWorkflow: (name: string) => void;
  onNewWorkflow: () => void;
  onDeleteWorkflow: (id: string) => void;
  onCanvasHydrated: () => void;
};

function PlaygroundInner({
  nodeCount,
  edgeCount,
  showGraph,
  showMarketplace,
  showPublish,
  onToggleGraph,
  onToggleMarketplace,
  onCloseMarketplace,
  onOpenPublish,
  onClosePublish,
  onCountsChange,
  onRunWorkflow,
  onGoLive,
  onStopLive,
  workflowLive,
  liveBusy,
  liveError,
  runBusy,
  runSignal,
  onRunStateChange,
  onCanvasChange,
  canvasSnapshot,
  onInstallWorkflow,
  loadCanvas,
  canvasBootKey,
  storageReady,
  workflowRefreshSignal,
  onWorkflowPublished,
  savedWorkflows,
  activeWorkflowId,
  activeWorkflowName,
  onSelectWorkflow,
  onRenameWorkflow,
  onNewWorkflow,
  onDeleteWorkflow,
  onCanvasHydrated,
}: PlaygroundInnerProps) {
  return (
    <div className="playground-shell">
      <AgentMarketplace
        open={showMarketplace}
        onClose={onCloseMarketplace}
        onInstallWorkflow={onInstallWorkflow}
        workflowRefreshSignal={workflowRefreshSignal}
      />
      <PublishWorkflowModal
        open={showPublish}
        onClose={onClosePublish}
        canvas={canvasSnapshot}
        onPublished={onWorkflowPublished}
      />
      <header className="playground-header">
        <Image
          src="/conduence-logo.png"
          alt="Conduence"
          width={250}
          height={50}
          className="playground-header__logo"
          priority
        />
        <div className="playground-header__workflows">
          <label className="playground-workflow-bar__label" htmlFor="playground-workflow-select">
            Workflow
          </label>
          <select
            id="playground-workflow-select"
            className="playground-workflow-bar__select"
            value={activeWorkflowId}
            onChange={(e) => onSelectWorkflow(e.target.value)}
            disabled={workflowLive}
            title={workflowLive ? 'Stop Live before switching workflows' : 'Select a saved workflow'}
          >
            {savedWorkflows.map((wf) => (
              <option key={wf.id} value={wf.id}>
                {wf.name}
              </option>
            ))}
          </select>
          <input
            type="text"
            className="playground-workflow-bar__name"
            value={activeWorkflowName}
            onChange={(e) => onRenameWorkflow(e.target.value)}
            disabled={workflowLive}
            aria-label="Workflow name"
            placeholder="Workflow name"
          />
          <button
            type="button"
            className="graph-view-toggle playground-workflow-bar__new"
            onClick={onNewWorkflow}
            disabled={workflowLive}
            title="Create a new workflow"
          >
            + New
          </button>
          {savedWorkflows.length > 1 ? (
            <button
              type="button"
              className="graph-view-toggle playground-workflow-bar__delete"
              onClick={() => onDeleteWorkflow(activeWorkflowId)}
              disabled={workflowLive}
              title="Delete this workflow"
            >
              Delete
            </button>
          ) : null}
        </div>
        <div className="playground-header__actions">
          <span className="playground-header__stats">
            {nodeCount} nodes · {edgeCount} edges
          </span>
          <button
            type="button"
            className="graph-view-toggle"
            onClick={onOpenPublish}
            disabled={showGraph || nodeCount === 0}
            title={nodeCount === 0 ? 'Add nodes to the canvas first' : 'Publish this workflow to the marketplace'}
          >
            Publish
          </button>
          <button
            type="button"
            className="graph-view-toggle marketplace-toggle"
            onClick={onToggleMarketplace}
            title="Mind agent marketplace — published workflows tagged Workflow"
          >
            Marketplace
          </button>
          <button
            type="button"
            className={`graph-view-toggle${workflowLive ? ' graph-view-toggle--active' : ''}`}
            onClick={workflowLive ? onStopLive : onGoLive}
            disabled={showGraph || liveBusy || nodeCount === 0}
            title={
              workflowLive
                ? 'Stop workflow — orchestrator and subagents go offline'
                : 'Go Live — run wired subagents and orchestrator continuously'
            }
          >
            {liveBusy ? '…' : workflowLive ? 'Stop Live' : 'Go Live'}
          </button>
          {liveError ? (
            <span className="playground-header__stats" style={{ color: '#f87171' }}>
              {liveError}
            </span>
          ) : null}
          <button
            type="button"
            className="graph-view-toggle"
            onClick={onRunWorkflow}
            disabled={showGraph || runBusy || workflowLive}
            title={
              workflowLive
                ? 'Stop Live before single Run Workflow'
                : showGraph
                  ? 'Switch to workflow canvas first'
                  : 'Run connected workflow once'
            }
          >
            {runBusy ? 'Running…' : 'Run Workflow'}
          </button>
          <button
            type="button"
            className={`graph-view-toggle${showGraph ? ' graph-view-toggle--active' : ''}`}
            onClick={onToggleGraph}
            title={showGraph ? 'Back to workflow canvas' : 'View CoT knowledge graph'}
          >
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
              <circle cx="4" cy="4" r="2" />
              <circle cx="12" cy="4" r="2" />
              <circle cx="8" cy="12" r="2" />
              <path d="M5.5 4.5L7 10M10.5 4.5L9 10" />
            </svg>
            {showGraph ? 'Workflow' : 'CoT Graph'}
          </button>
          <Link href="/simulate" className="graph-view-toggle" title="Paper trading simulation">
            Paper Trade
          </Link>
        </div>
      </header>
      <div className="playground-body">
        {!showGraph && storageReady && <NodePalette />}
        {!storageReady ? (
          <div className="playground-canvas playground-canvas--loading">Loading saved workflow…</div>
        ) : showGraph ? (
          <CotGraphView />
        ) : (
          <WorkflowCanvas
            key={canvasBootKey}
            onCountsChange={onCountsChange}
            runSignal={runSignal}
            onRunStateChange={onRunStateChange}
            onCanvasChange={onCanvasChange}
            onCanvasHydrated={onCanvasHydrated}
            initialNodes={loadCanvas?.nodes ?? []}
            initialEdges={loadCanvas?.edges ?? []}
            loadCanvas={
              loadCanvas
                ? { key: loadCanvas.key, nodes: loadCanvas.nodes, edges: loadCanvas.edges }
                : null
            }
          />
        )}
      </div>
    </div>
  );
}

function PlaygroundWithState() {
  const [nodeCount, setNodeCount] = useState(0);
  const [edgeCount, setEdgeCount] = useState(0);
  const [showGraph, setShowGraph] = useState(false);
  const [showMarketplace, setShowMarketplace] = useState(false);
  const [showPublish, setShowPublish] = useState(false);
  const [runBusy, setRunBusy] = useState(false);
  const [workflowLive, setWorkflowLive] = useState(false);
  const [liveBusy, setLiveBusy] = useState(false);
  const [liveError, setLiveError] = useState<string | null>(null);
  const [runSignal, setRunSignal] = useState(0);
  const [workflowRefreshSignal, setWorkflowRefreshSignal] = useState(0);
  const [savedWorkflows, setSavedWorkflows] = useState<SavedWorkflow[]>([]);
  const [activeWorkflowId, setActiveWorkflowIdState] = useState('');
  const [activeWorkflowName, setActiveWorkflowName] = useState('Untitled workflow');
  const [loadCanvas, setLoadCanvas] = useState<{
    key: number;
    nodes: WorkflowNode[];
    edges: Edge[];
  } | null>(null);
  const [canvasBootKey, setCanvasBootKey] = useState('boot');
  const [storageReady, setStorageReady] = useState(false);
  const canvasSnapshotRef = useRef<{ nodes: WorkflowNode[]; edges: Edge[] }>({
    nodes: [],
    edges: [],
  });
  const activeWorkflowIdRef = useRef('');
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const suppressPersistRef = useRef(true);
  const pendingCanvasRef = useRef<{ nodes: WorkflowNode[]; edges: Edge[] } | null>(null);
  const [, bumpCanvasSnapshot] = useState(0);

  const flushPersist = useCallback(() => {
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
    const id = activeWorkflowIdRef.current;
    const pending = pendingCanvasRef.current;
    if (!id || !pending || suppressPersistRef.current) return;
    const next = upsertWorkflowCanvas(id, pending);
    setSavedWorkflows(next);
    pendingCanvasRef.current = null;
  }, []);

  const loadWorkflowIntoCanvas = useCallback((workflow: SavedWorkflow) => {
    suppressPersistRef.current = true;
    setActiveWorkflowName(workflow.name);
    canvasSnapshotRef.current = {
      nodes: workflow.canvas.nodes,
      edges: workflow.canvas.edges,
    };
    setNodeCount(workflow.canvas.nodes.length);
    setEdgeCount(workflow.canvas.edges.length);
    setLoadCanvas({
      key: Date.now(),
      nodes: workflow.canvas.nodes,
      edges: workflow.canvas.edges,
    });
    setCanvasBootKey(workflow.id);
  }, []);

  useEffect(() => {
    const { workflows, activeId } = ensureDefaultWorkflows();
    const active = getWorkflowById(activeId);
    setSavedWorkflows(workflows);
    setActiveWorkflowIdState(activeId);
    activeWorkflowIdRef.current = activeId;
    if (active) {
      loadWorkflowIntoCanvas(active);
    }
    setStorageReady(true);
  }, [loadWorkflowIntoCanvas]);

  useEffect(() => {
    const onPageHide = () => flushPersist();
    window.addEventListener('pagehide', onPageHide);
    return () => {
      window.removeEventListener('pagehide', onPageHide);
      flushPersist();
    };
  }, [flushPersist]);

  const onCanvasHydrated = useCallback(() => {
    suppressPersistRef.current = false;
  }, []);

  const persistActiveCanvas = useCallback((nodes: WorkflowNode[], edges: Edge[]) => {
    pendingCanvasRef.current = { nodes, edges };
    const id = activeWorkflowIdRef.current;
    if (!id) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      if (suppressPersistRef.current) return;
      const pending = pendingCanvasRef.current;
      if (!pending) return;
      const next = upsertWorkflowCanvas(id, pending);
      setSavedWorkflows(next);
      pendingCanvasRef.current = null;
    }, 250);
  }, []);

  const onCountsChange = useCallback((nodes: number, edges: number) => {
    setNodeCount(nodes);
    setEdgeCount(edges);
  }, []);

  const onCanvasChange = useCallback(
    (nodes: WorkflowNode[], edges: Edge[]) => {
      canvasSnapshotRef.current = { nodes, edges };
      bumpCanvasSnapshot((v) => v + 1);
      if (!storageReady || !activeWorkflowIdRef.current) return;
      persistActiveCanvas(nodes, edges);
    },
    [persistActiveCanvas, storageReady],
  );

  const onSelectWorkflow = useCallback(
    (id: string) => {
      if (id === activeWorkflowIdRef.current) return;
      flushPersist();
      const { nodes, edges } = canvasSnapshotRef.current;
      persistActiveCanvas(nodes, edges);
      flushPersist();
      setActiveWorkflowId(id);
      activeWorkflowIdRef.current = id;
      setActiveWorkflowIdState(id);
      const next = getWorkflowById(id);
      if (next) loadWorkflowIntoCanvas(next);
    },
    [flushPersist, loadWorkflowIntoCanvas, persistActiveCanvas],
  );

  const onRenameWorkflow = useCallback((name: string) => {
    setActiveWorkflowName(name);
    const id = activeWorkflowIdRef.current;
    if (!id) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      setSavedWorkflows(renameWorkflow(id, name));
    }, 300);
  }, []);

  const onNewWorkflow = useCallback(() => {
    flushPersist();
    const { nodes, edges } = canvasSnapshotRef.current;
    persistActiveCanvas(nodes, edges);
    flushPersist();
    const { workflows, workflow } = addSavedWorkflow();
    setSavedWorkflows(workflows);
    setActiveWorkflowIdState(workflow.id);
    activeWorkflowIdRef.current = workflow.id;
    loadWorkflowIntoCanvas(workflow);
  }, [flushPersist, loadWorkflowIntoCanvas, persistActiveCanvas]);

  const onDeleteWorkflow = useCallback(
    (id: string) => {
      flushPersist();
      const { nodes, edges } = canvasSnapshotRef.current;
      persistActiveCanvas(nodes, edges);
      flushPersist();
      const { workflows, activeId } = deleteSavedWorkflow(id);
      setSavedWorkflows(workflows);
      setActiveWorkflowIdState(activeId);
      activeWorkflowIdRef.current = activeId;
      const next = getWorkflowById(activeId);
      if (next) loadWorkflowIntoCanvas(next);
    },
    [flushPersist, loadWorkflowIntoCanvas, persistActiveCanvas],
  );

  const onInstallWorkflow = useCallback((canvas: { nodes: WorkflowNode[]; edges: Edge[] }) => {
    setShowGraph(false);
    setShowMarketplace(false);
    suppressPersistRef.current = true;
    canvasSnapshotRef.current = canvas;
    setNodeCount(canvas.nodes.length);
    setEdgeCount(canvas.edges.length);
    setLoadCanvas({ key: Date.now(), ...canvas });
    const id = activeWorkflowIdRef.current;
    if (id) {
      const next = upsertWorkflowCanvas(id, canvas);
      setSavedWorkflows(next);
    }
    suppressPersistRef.current = false;
  }, []);

  const onWorkflowPublished = useCallback(() => {
    setWorkflowRefreshSignal((v) => v + 1);
    setShowMarketplace(true);
  }, []);

  const onToggleGraph = useCallback(() => {
    setShowGraph((v) => !v);
  }, []);

  const onToggleMarketplace = useCallback(() => {
    setShowMarketplace((v) => !v);
  }, []);

  const onCloseMarketplace = useCallback(() => {
    setShowMarketplace(false);
  }, []);

  const onRunWorkflow = useCallback(() => {
    setRunSignal((value) => value + 1);
  }, []);

  const onRunStateChange = useCallback((running: boolean) => {
    setRunBusy(running);
  }, []);

  useEffect(() => {
    void fetchWorkflowLiveStatus().then((s) => setWorkflowLive(Boolean(s.running)));
  }, []);

  const onGoLive = useCallback(async () => {
    setLiveBusy(true);
    setLiveError(null);
    const { nodes, edges } = canvasSnapshotRef.current;
    const autoEmitCot = nodes.some(
      (n) => n.type === 'cotBuilder' && Boolean(n.data?.autoEmit),
    );
    const result = await startWorkflowLive({
      nodes,
      edges,
      config: autoEmitCot
        ? { mind_agent_live: true, publishAsMindAgent: true }
        : {},
    });
    setLiveBusy(false);
    if (!result.ok) {
      setLiveError(result.error ?? 'Go Live failed');
      return;
    }
    setWorkflowLive(true);
  }, []);

  const onStopLive = useCallback(async () => {
    setLiveBusy(true);
    setLiveError(null);
    const result = await stopWorkflowLive();
    setLiveBusy(false);
    if (!result.ok) {
      setLiveError(result.error ?? 'Stop failed');
      return;
    }
    setWorkflowLive(false);
  }, []);

  return (
    <PlaygroundInner
      nodeCount={nodeCount}
      edgeCount={edgeCount}
      showGraph={showGraph}
      showMarketplace={showMarketplace}
      showPublish={showPublish}
      onToggleGraph={onToggleGraph}
      onToggleMarketplace={onToggleMarketplace}
      onCloseMarketplace={onCloseMarketplace}
      onOpenPublish={() => setShowPublish(true)}
      onClosePublish={() => setShowPublish(false)}
      onCountsChange={onCountsChange}
      onRunWorkflow={onRunWorkflow}
      onGoLive={onGoLive}
      onStopLive={onStopLive}
      workflowLive={workflowLive}
      liveBusy={liveBusy}
      liveError={liveError}
      runBusy={runBusy}
      runSignal={runSignal}
      onRunStateChange={onRunStateChange}
      onCanvasChange={onCanvasChange}
      canvasSnapshot={canvasSnapshotRef.current}
      onInstallWorkflow={onInstallWorkflow}
      loadCanvas={loadCanvas}
      canvasBootKey={canvasBootKey}
      storageReady={storageReady}
      workflowRefreshSignal={workflowRefreshSignal}
      onWorkflowPublished={onWorkflowPublished}
      savedWorkflows={savedWorkflows}
      activeWorkflowId={activeWorkflowId}
      activeWorkflowName={activeWorkflowName}
      onSelectWorkflow={onSelectWorkflow}
      onRenameWorkflow={onRenameWorkflow}
      onNewWorkflow={onNewWorkflow}
      onDeleteWorkflow={onDeleteWorkflow}
      onCanvasHydrated={onCanvasHydrated}
    />
  );
}

export function Playground() {
  return (
    <InstalledAgentsProvider>
      <AgentFeedProvider>
        <ReactFlowProvider>
          <PlaygroundWithState />
        </ReactFlowProvider>
      </AgentFeedProvider>
    </InstalledAgentsProvider>
  );
}
