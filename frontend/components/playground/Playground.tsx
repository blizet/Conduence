'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
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
  return node.data?.accent ?? '#22d3ee';
}

type FlowCanvasProps = {
  onCountsChange: (nodes: number, edges: number) => void;
  runSignal: number;
  onRunStateChange: (running: boolean) => void;
};

function FlowCanvas({ onCountsChange, runSignal, onRunStateChange }: FlowCanvasProps) {
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
          style: { stroke: 'rgba(34, 211, 238, 0.5)' },
        }}
        proOptions={{ hideAttribution: true }}
      >
        <Background
          variant={BackgroundVariant.Dots}
          bgColor="#ededf0"
          color="#b6b8c2"
          gap={24}
          size={1.5}
        />
        <Controls position="bottom-left" showInteractive />
        <MiniMap
          position="bottom-right"
          className="playground-minimap"
          nodeColor={minimapNodeColor}
          maskColor="rgba(5, 5, 8, 0.75)"
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
  onToggleGraph: () => void;
  onToggleMarketplace: () => void;
  onCloseMarketplace: () => void;
  onCountsChange: (nodes: number, edges: number) => void;
  onRunWorkflow: () => void;
  runBusy: boolean;
  runSignal: number;
  onRunStateChange: (running: boolean) => void;
};

function PlaygroundInner({
  nodeCount,
  edgeCount,
  showGraph,
  showMarketplace,
  onToggleGraph,
  onToggleMarketplace,
  onCloseMarketplace,
  onCountsChange,
  onRunWorkflow,
  runBusy,
  runSignal,
  onRunStateChange,
}: PlaygroundInnerProps) {
  return (
    <div className="playground-shell">
      <AgentMarketplace open={showMarketplace} onClose={onCloseMarketplace} />
      <header className="playground-header">
        <span className="playground-header__title">Workflow Playground</span>
        <div className="playground-header__actions">
          <span className="playground-header__stats">
            {nodeCount} nodes · {edgeCount} edges
          </span>
          <button
            type="button"
            className="graph-view-toggle marketplace-toggle"
            onClick={onToggleMarketplace}
            title="Mind agent marketplace"
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
  const [runBusy, setRunBusy] = useState(false);
  const [runSignal, setRunSignal] = useState(0);

  const onCountsChange = useCallback((nodes: number, edges: number) => {
    setNodeCount(nodes);
    setEdgeCount(edges);
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
      onToggleGraph={onToggleGraph}
      onToggleMarketplace={onToggleMarketplace}
      onCloseMarketplace={onCloseMarketplace}
      onCountsChange={onCountsChange}
      onRunWorkflow={onRunWorkflow}
      runBusy={runBusy}
      runSignal={runSignal}
      onRunStateChange={onRunStateChange}
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
