'use client';

import { useCallback, useRef, useState } from 'react';
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
  runBusy: boolean;
  runSignal: number;
  onRunStateChange: (running: boolean) => void;
  onCanvasChange: (nodes: WorkflowNode[], edges: Edge[]) => void;
  canvasSnapshot: { nodes: WorkflowNode[]; edges: Edge[] };
  onInstallWorkflow: (canvas: { nodes: WorkflowNode[]; edges: Edge[] }) => void;
  loadCanvas: { key: number; nodes: WorkflowNode[]; edges: Edge[] } | null;
  workflowRefreshSignal: number;
  onWorkflowPublished: () => void;
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
  runBusy,
  runSignal,
  onRunStateChange,
  onCanvasChange,
  canvasSnapshot,
  onInstallWorkflow,
  loadCanvas,
  workflowRefreshSignal,
  onWorkflowPublished,
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
            className="graph-view-toggle"
            onClick={onRunWorkflow}
            disabled={showGraph || runBusy}
            title={showGraph ? 'Switch to workflow canvas first' : 'Run connected workflow'}
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
        {!showGraph && <NodePalette />}
        {showGraph ? (
          <CotGraphView />
        ) : (
          <WorkflowCanvas
            onCountsChange={onCountsChange}
            runSignal={runSignal}
            onRunStateChange={onRunStateChange}
            onCanvasChange={onCanvasChange}
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
  const [runSignal, setRunSignal] = useState(0);
  const [workflowRefreshSignal, setWorkflowRefreshSignal] = useState(0);
  const [loadCanvas, setLoadCanvas] = useState<{
    key: number;
    nodes: WorkflowNode[];
    edges: Edge[];
  } | null>(null);
  const canvasSnapshotRef = useRef<{ nodes: WorkflowNode[]; edges: Edge[] }>({
    nodes: [],
    edges: [],
  });
  const [, bumpCanvasSnapshot] = useState(0);

  const onCountsChange = useCallback((nodes: number, edges: number) => {
    setNodeCount(nodes);
    setEdgeCount(edges);
  }, []);

  const onCanvasChange = useCallback((nodes: WorkflowNode[], edges: Edge[]) => {
    canvasSnapshotRef.current = { nodes, edges };
    bumpCanvasSnapshot((v) => v + 1);
  }, []);

  const onInstallWorkflow = useCallback((canvas: { nodes: WorkflowNode[]; edges: Edge[] }) => {
    setShowGraph(false);
    setShowMarketplace(false);
    setLoadCanvas({ key: Date.now(), ...canvas });
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
      runBusy={runBusy}
      runSignal={runSignal}
      onRunStateChange={onRunStateChange}
      onCanvasChange={onCanvasChange}
      canvasSnapshot={canvasSnapshotRef.current}
      onInstallWorkflow={onInstallWorkflow}
      loadCanvas={loadCanvas}
      workflowRefreshSignal={workflowRefreshSignal}
      onWorkflowPublished={onWorkflowPublished}
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
