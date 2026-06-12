'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import Image from 'next/image';
import {
  ReactFlow,
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  ReactFlowProvider,
  addEdge,
  useNodesState,
  useEdgesState,
  useReactFlow,
  type Connection,
  type Edge,
} from '@xyflow/react';
import { createNodeData, DND_TYPE, getNodeId } from '@/lib/dnd';
import { runWorkflow } from '@/lib/workflow-runner';
import { getPaletteItem, nodeTypes as registeredNodeTypes } from '@/nodes';
import type { WorkflowNode } from '@/nodes/types';
import { NodePalette } from './NodePalette';
import { AgentMarketplace } from './AgentMarketplace';
import { PublishWorkflowModal } from './PublishWorkflowModal';
import { InstalledAgentsProvider } from '@/lib/marketplace';
import { AgentFeedProvider, useAgentFeed } from '@/lib/agent-feed';

const CotGraphView = dynamic(
  () => import('./CotGraphView').then((mod) => mod.CotGraphView),
  {
    ssr: false,
    loading: () => <div className="cot-graph-view cot-graph-view--loading">Loading graph…</div>,
  },
);

function minimapNodeColor(node: WorkflowNode): string {
  return node.data?.accent ?? '#5b8def';
}

type FlowCanvasProps = {
  onCountsChange: (nodes: number, edges: number) => void;
  runSignal: number;
  onRunStateChange: (running: boolean) => void;
  onCanvasChange?: (nodes: WorkflowNode[], edges: Edge[]) => void;
  loadCanvas?: { key: number; nodes: WorkflowNode[]; edges: Edge[] } | null;
};

function FlowCanvas({
  onCountsChange,
  runSignal,
  onRunStateChange,
  onCanvasChange,
  loadCanvas,
}: FlowCanvasProps) {
  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  const { screenToFlowPosition } = useReactFlow();
  const { agentFeeds } = useAgentFeed();
  const [nodes, setNodes, onNodesChange] = useNodesState<WorkflowNode>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const nodesRef = useRef<WorkflowNode[]>([]);
  const edgesRef = useRef<Edge[]>([]);
  const runningRef = useRef(false);
  const nodeTypes = useMemo(() => registeredNodeTypes, []);

  useEffect(() => {
    nodesRef.current = nodes;
  }, [nodes]);

  useEffect(() => {
    edgesRef.current = edges;
  }, [edges]);

  useEffect(() => {
    onCountsChange(nodes.length, edges.length);
  }, [nodes, edges, onCountsChange]);

  useEffect(() => {
    onCanvasChange?.(nodes, edges);
  }, [nodes, edges, onCanvasChange]);

  useEffect(() => {
    if (!loadCanvas) return;
    setNodes(loadCanvas.nodes);
    setEdges(loadCanvas.edges);
  }, [loadCanvas?.key, loadCanvas, setNodes, setEdges]);

  useEffect(() => {
    if (!runSignal || runningRef.current) return;
    runningRef.current = true;
    onRunStateChange(true);

    const patchNode = (nodeId: string, patch: Partial<WorkflowNode['data']>) => {
      setNodes((current) =>
        current.map((node) =>
          node.id === nodeId ? { ...node, data: { ...node.data, ...patch } } : node,
        ),
      );
    };

    void runWorkflow({
      nodes: nodesRef.current,
      edges: edgesRef.current,
      patchNode,
      feedSignals: agentFeeds,
    }).finally(() => {
      runningRef.current = false;
      onRunStateChange(false);
    });
  }, [agentFeeds, onRunStateChange, runSignal, setNodes]);

  const onConnect = useCallback(
    (connection: Connection) => {
      setEdges((eds) => addEdge({ ...connection, animated: true }, eds));
    },
    [setEdges],
  );

  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  }, []);

  const onDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();

      const type = event.dataTransfer.getData(DND_TYPE);
      if (!type) return;

      const item = getPaletteItem(type);
      if (!item) return;

      const position = screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      });

      const newNode: WorkflowNode = {
        id: getNodeId(),
        type,
        position,
        data: createNodeData(item),
      };

      setNodes((nds) => nds.concat(newNode));
    },
    [screenToFlowPosition, setNodes],
  );

  return (
    <div
      ref={reactFlowWrapper}
      className="playground-canvas"
      onDrop={onDrop}
      onDragOver={onDragOver}
    >
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        colorMode="dark"
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        deleteKeyCode={['Backspace', 'Delete']}
        defaultViewport={{ x: 0, y: 0, zoom: 0.9 }}
        snapToGrid
        snapGrid={[16, 16]}
        panOnScroll
        defaultEdgeOptions={{
          animated: true,
          style: { stroke: 'rgba(91, 141, 239, 0.55)' },
        }}
        proOptions={{ hideAttribution: true }}
      >
        <Background
          variant={BackgroundVariant.Dots}
          bgColor="#000000"
          color="#5c6578"
          gap={24}
          size={1.5}
        />
        <Controls position="bottom-left" showInteractive />
        <MiniMap
          position="bottom-right"
          className="playground-minimap"
          nodeColor={minimapNodeColor}
          maskColor="rgba(0, 0, 0, 0.82)"
          pannable
          zoomable
          style={{ margin: 0 }}
        />
      </ReactFlow>
    </div>
  );
}

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
        </div>
      </header>
      <div className="playground-body">
        {!showGraph && <NodePalette />}
        {showGraph ? (
          <CotGraphView />
        ) : (
          <FlowCanvas
            onCountsChange={onCountsChange}
            runSignal={runSignal}
            onRunStateChange={onRunStateChange}
            onCanvasChange={onCanvasChange}
            loadCanvas={loadCanvas}
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
