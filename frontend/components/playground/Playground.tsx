'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import Image from 'next/image';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { ReactFlowProvider } from '@xyflow/react';
import type { Edge } from '@xyflow/react';
import type { WorkflowNode } from '@/nodes/types';
import { NodePalette } from './NodePalette';
import { WorkflowCanvas } from './WorkflowCanvas';
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
import { normalizeWorkflowCanvas } from '@/lib/dnd';

const GraphSection = dynamic(
  () => import('@/components/graph/GraphSection').then((mod) => mod.GraphSection),
  {
    ssr: false,
    loading: () => <div className="cot-graph-view cot-graph-view--loading">Loading graph…</div>,
  },
);

type PlaygroundView = 'workflow' | 'graph';

type PlaygroundInnerProps = {
  nodeCount: number;
  viewMode: PlaygroundView;
  onToggleGraph: () => void;
  onCountsChange: (nodes: number, edges: number) => void;
  onGoLive: () => void;
  onStopLive: () => void;
  workflowLive: boolean;
  liveBusy: boolean;
  liveError: string | null;
  onCanvasChange: (nodes: WorkflowNode[], edges: Edge[]) => void;
  loadCanvas: { key: number; nodes: WorkflowNode[]; edges: Edge[] } | null;
  canvasBootKey: string;
  storageReady: boolean;
  activeWorkflowName: string;
  workflowIndex: number;
  workflowCount: number;
  onRenameWorkflow: (name: string) => void;
  onPrevWorkflow: () => void;
  onNextWorkflow: () => void;
  onNewWorkflow: () => void;
  onDeleteWorkflow: () => void;
  onCanvasHydrated: () => void;
};

function PlaygroundInner({
  nodeCount,
  viewMode,
  onToggleGraph,
  onCountsChange,
  onGoLive,
  onStopLive,
  workflowLive,
  liveBusy,
  liveError,
  onCanvasChange,
  loadCanvas,
  canvasBootKey,
  storageReady,
  activeWorkflowName,
  workflowIndex,
  workflowCount,
  onRenameWorkflow,
  onPrevWorkflow,
  onNextWorkflow,
  onNewWorkflow,
  onDeleteWorkflow,
  onCanvasHydrated,
}: PlaygroundInnerProps) {
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
        <div className="playground-header__actions">
          <button
            type="button"
            className={`graph-view-toggle${workflowLive ? ' graph-view-toggle--active' : ''}`}
            onClick={workflowLive ? onStopLive : onGoLive}
            disabled={viewMode !== 'workflow' || liveBusy || nodeCount === 0}
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
            className={`graph-view-toggle${viewMode === 'graph' ? ' graph-view-toggle--active' : ''}`}
            onClick={onToggleGraph}
            title={viewMode === 'graph' ? 'Back to workflow canvas' : 'View user & agentic graphs'}
          >
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
              <circle cx="4" cy="4" r="2" />
              <circle cx="12" cy="4" r="2" />
              <circle cx="8" cy="12" r="2" />
              <path d="M5.5 4.5L7 10M10.5 4.5L9 10" />
            </svg>
            {viewMode === 'graph' ? 'Workflow' : 'Graph'}
          </button>
          <Link href="/simulate" className="graph-view-toggle" title="Paper trade Polymarket & Kalshi strategies">
            Paper Trading
          </Link>
        </div>
      </header>
      <div className="playground-body">
        {viewMode === 'workflow' && storageReady && <NodePalette />}
        {!storageReady ? (
          <div className="playground-canvas playground-canvas--loading">Loading saved workflow…</div>
        ) : viewMode === 'graph' ? (
          <GraphSection />
        ) : (
          <WorkflowCanvas
            key={canvasBootKey}
            onCountsChange={onCountsChange}
            onCanvasChange={onCanvasChange}
            onCanvasHydrated={onCanvasHydrated}
            initialNodes={loadCanvas?.nodes ?? []}
            initialEdges={loadCanvas?.edges ?? []}
            loadCanvas={
              loadCanvas
                ? { key: loadCanvas.key, nodes: loadCanvas.nodes, edges: loadCanvas.edges }
                : null
            }
            activeWorkflowName={activeWorkflowName}
            workflowIndex={workflowIndex}
            workflowCount={workflowCount}
            workflowLive={workflowLive}
            onRenameWorkflow={onRenameWorkflow}
            onPrevWorkflow={onPrevWorkflow}
            onNextWorkflow={onNextWorkflow}
            onNewWorkflow={onNewWorkflow}
            onDeleteWorkflow={onDeleteWorkflow}
          />
        )}
      </div>
    </div>
  );
}

function PlaygroundWithState() {
  const searchParams = useSearchParams();
  const [nodeCount, setNodeCount] = useState(0);
  const [viewMode, setViewMode] = useState<PlaygroundView>('workflow');
  const [workflowLive, setWorkflowLive] = useState(false);
  const [liveBusy, setLiveBusy] = useState(false);
  const [liveError, setLiveError] = useState<string | null>(null);
  const [savedWorkflows, setSavedWorkflows] = useState<SavedWorkflow[]>([]);
  const [activeWorkflowId, setActiveWorkflowIdState] = useState('');
  const [activeWorkflowName, setActiveWorkflowName] = useState('Workflow');
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
    const normalized = normalizeWorkflowCanvas(workflow.canvas.nodes, workflow.canvas.edges);
    canvasSnapshotRef.current = {
      nodes: normalized.nodes,
      edges: normalized.edges,
    };
    setNodeCount(normalized.nodes.length);
    setLoadCanvas({
      key: Date.now(),
      nodes: normalized.nodes,
      edges: normalized.edges,
    });
    setCanvasBootKey(workflow.id);
  }, []);

  useEffect(() => {
    const { workflows, activeId } = ensureDefaultWorkflows();
    const urlWorkflowId = searchParams.get('workflow');
    const urlView = searchParams.get('view');
    if (urlView === 'graph') {
      setViewMode('graph');
    }
    const pickId =
      urlWorkflowId && workflows.some((w) => w.id === urlWorkflowId) ? urlWorkflowId : activeId;
    if (pickId && pickId !== activeId) {
      setActiveWorkflowId(pickId);
    }
    const active = getWorkflowById(pickId ?? activeId);
    setSavedWorkflows(workflows);
    setActiveWorkflowIdState(pickId ?? activeId);
    activeWorkflowIdRef.current = pickId ?? activeId;
    if (active) {
      loadWorkflowIntoCanvas(active);
    }
    setStorageReady(true);
  }, [loadWorkflowIntoCanvas, searchParams]);

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

  const onCountsChange = useCallback((nodes: number, _edges: number) => {
    setNodeCount(nodes);
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

  const workflowIndex = savedWorkflows.findIndex((wf) => wf.id === activeWorkflowId);
  const workflowCount = savedWorkflows.length;

  const onPrevWorkflow = useCallback(() => {
    if (workflowIndex <= 0) return;
    onSelectWorkflow(savedWorkflows[workflowIndex - 1].id);
  }, [onSelectWorkflow, savedWorkflows, workflowIndex]);

  const onNextWorkflow = useCallback(() => {
    if (workflowIndex < 0 || workflowIndex >= savedWorkflows.length - 1) return;
    onSelectWorkflow(savedWorkflows[workflowIndex + 1].id);
  }, [onSelectWorkflow, savedWorkflows, workflowIndex]);

  const onDeleteWorkflow = useCallback(() => {
    const id = activeWorkflowIdRef.current;
    if (!id) return;
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
  }, [flushPersist, loadWorkflowIntoCanvas, persistActiveCanvas]);

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
      config: autoEmitCot ? { autoEmitCot: true } : {},
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

  const onToggleGraph = useCallback(() => {
    setViewMode((v) => (v === 'graph' ? 'workflow' : 'graph'));
  }, []);

  useEffect(() => {
    void fetchWorkflowLiveStatus().then((s) => setWorkflowLive(Boolean(s.running)));
  }, []);

  return (
    <PlaygroundInner
      nodeCount={nodeCount}
      viewMode={viewMode}
      onToggleGraph={onToggleGraph}
      onCountsChange={onCountsChange}
      onGoLive={onGoLive}
      onStopLive={onStopLive}
      workflowLive={workflowLive}
      liveBusy={liveBusy}
      liveError={liveError}
      onCanvasChange={onCanvasChange}
      loadCanvas={loadCanvas}
      canvasBootKey={canvasBootKey}
      storageReady={storageReady}
      activeWorkflowName={activeWorkflowName}
      workflowIndex={workflowIndex}
      workflowCount={workflowCount}
      onRenameWorkflow={onRenameWorkflow}
      onPrevWorkflow={onPrevWorkflow}
      onNextWorkflow={onNextWorkflow}
      onNewWorkflow={onNewWorkflow}
      onDeleteWorkflow={onDeleteWorkflow}
      onCanvasHydrated={onCanvasHydrated}
    />
  );
}

export function Playground() {
  return (
    <AgentFeedProvider>
      <ReactFlowProvider>
        <PlaygroundWithState />
      </ReactFlowProvider>
    </AgentFeedProvider>
  );
}
