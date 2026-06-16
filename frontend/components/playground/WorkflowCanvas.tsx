'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ReactFlow,
  Background,
  BackgroundVariant,
  Controls,
  addEdge,
  useNodesState,
  useEdgesState,
  useReactFlow,
  useOnSelectionChange,
  type Connection,
  type Edge,
} from '@xyflow/react';
import { createNodeData, DND_TYPE, getNodeId, normalizeWorkflowCanvas } from '@/lib/dnd';
import { runWorkflow } from '@/lib/workflow-runner';
import { getPaletteItem, nodeTypes as registeredNodeTypes } from '@/nodes';
import type { WorkflowNode } from '@/nodes/types';
import { useAgentFeed } from '@/lib/agent-feed';
import { NodeInspectorPanel } from './NodeInspectorPanel';
import { PlaygroundMinimap } from './PlaygroundMinimap';
import { WorkflowDock } from './WorkflowDock';

export type WorkflowCanvasProps = {
  onCountsChange?: (nodes: number, edges: number) => void;
  runSignal?: number;
  onRunStateChange?: (running: boolean) => void;
  onCanvasChange?: (nodes: WorkflowNode[], edges: Edge[]) => void;
  onCanvasHydrated?: () => void;
  initialNodes?: WorkflowNode[];
  initialEdges?: Edge[];
  loadCanvas?: { key: string | number; nodes: WorkflowNode[]; edges: Edge[] } | null;
  activeWorkflowName?: string;
  workflowIndex?: number;
  workflowCount?: number;
  workflowLive?: boolean;
  onRenameWorkflow?: (name: string) => void;
  onPrevWorkflow?: () => void;
  onNextWorkflow?: () => void;
  onNewWorkflow?: () => void;
  onDeleteWorkflow?: () => void;
  readOnly?: boolean;
  workflowBadge?: string;
};

export function WorkflowCanvas({
  onCountsChange,
  runSignal = 0,
  onRunStateChange,
  onCanvasChange,
  onCanvasHydrated,
  initialNodes = [],
  initialEdges = [],
  loadCanvas,
  activeWorkflowName = 'Workflow',
  workflowIndex = 0,
  workflowCount = 1,
  workflowLive = false,
  onRenameWorkflow,
  onPrevWorkflow,
  onNextWorkflow,
  onNewWorkflow,
  onDeleteWorkflow,
  readOnly = false,
  workflowBadge,
}: WorkflowCanvasProps) {
  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  const { screenToFlowPosition } = useReactFlow();
  const { agentFeeds } = useAgentFeed();
  const [nodes, setNodes, onNodesChange] = useNodesState<WorkflowNode>(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>(initialEdges);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const nodesRef = useRef<WorkflowNode[]>([]);
  const edgesRef = useRef<Edge[]>([]);
  const runningRef = useRef(false);
  const loadedKeyRef = useRef<string | number | null>(null);
  const skipCanvasSyncRef = useRef(false);
  const loadCanvasRef = useRef(loadCanvas);
  const nodeTypes = useMemo(() => registeredNodeTypes, []);

  loadCanvasRef.current = loadCanvas;

  useOnSelectionChange({
    onChange: ({ nodes: selectedNodes }) => {
      setSelectedNodeId(selectedNodes.length === 1 ? selectedNodes[0].id : null);
    },
  });

  const selectedNode = useMemo(
    () => (selectedNodeId ? (nodes.find((node) => node.id === selectedNodeId) ?? null) : null),
    [nodes, selectedNodeId],
  );

  const onNodeClick = useCallback(
    (_: React.MouseEvent, node: WorkflowNode) => {
      setSelectedNodeId(node.id);
      setNodes((current) =>
        current.map((n) => ({
          ...n,
          selected: n.id === node.id,
        })),
      );
    },
    [setNodes],
  );

  const onPaneClick = useCallback(() => {
    setSelectedNodeId(null);
    setNodes((current) => current.map((n) => ({ ...n, selected: false })));
  }, [setNodes]);

  const onSelectionChange = useCallback(({ nodes: selectedNodes }: { nodes: WorkflowNode[] }) => {
    setSelectedNodeId(selectedNodes.length === 1 ? selectedNodes[0].id : null);
  }, []);

  useEffect(() => {
    nodesRef.current = nodes;
  }, [nodes]);

  useEffect(() => {
    edgesRef.current = edges;
  }, [edges]);

  useEffect(() => {
    if (selectedNodeId && !nodes.some((node) => node.id === selectedNodeId)) {
      setSelectedNodeId(null);
    }
  }, [nodes, selectedNodeId]);

  useEffect(() => {
    onCountsChange?.(nodes.length, edges.length);
  }, [nodes.length, edges.length, onCountsChange]);

  useEffect(() => {
    onCanvasHydrated?.();
  }, [onCanvasHydrated]);

  useEffect(() => {
    const canvas = loadCanvasRef.current;
    if (!canvas) return;
    if (loadedKeyRef.current === canvas.key) return;
    loadedKeyRef.current = canvas.key;
    skipCanvasSyncRef.current = true;
    const normalized = normalizeWorkflowCanvas(canvas.nodes, canvas.edges);
    setNodes(normalized.nodes);
    setEdges(normalized.edges);
    setSelectedNodeId(null);
    onCanvasHydrated?.();
  }, [loadCanvas?.key, onCanvasHydrated, setNodes, setEdges]);

  useEffect(() => {
    if (skipCanvasSyncRef.current) {
      skipCanvasSyncRef.current = false;
      return;
    }
    onCanvasChange?.(nodes, edges);
  }, [nodes, edges, onCanvasChange]);

  useEffect(() => {
    if (!runSignal || runningRef.current) return;
    runningRef.current = true;
    onRunStateChange?.(true);

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
      onRunStateChange?.(false);
    });
  }, [agentFeeds, onRunStateChange, runSignal, setNodes]);

  const onConnect = useCallback(
    (connection: Connection) => {
      if (readOnly) return;
      setEdges((eds) => addEdge({ ...connection, animated: true }, eds));
    },
    [readOnly, setEdges],
  );

  const onDragOver = useCallback(
    (event: React.DragEvent) => {
      if (readOnly) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = 'move';
    },
    [readOnly],
  );

  const onDrop = useCallback(
    (event: React.DragEvent) => {
      if (readOnly) return;
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
    [readOnly, screenToFlowPosition, setNodes],
  );

  return (
    <div className="playground-workspace">
      <div
        ref={reactFlowWrapper}
        className={`playground-canvas${readOnly ? ' playground-canvas--readonly' : ''}`}
        onDrop={onDrop}
        onDragOver={onDragOver}
      >
        {workflowBadge ? (
          <div className="simulate-workflow-badge" aria-label="Linked strategy">
            {workflowBadge}
          </div>
        ) : null}
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          colorMode="dark"
          onNodesChange={readOnly ? undefined : onNodesChange}
          onEdgesChange={readOnly ? undefined : onEdgesChange}
          onConnect={onConnect}
          onNodeClick={readOnly ? undefined : onNodeClick}
          onPaneClick={readOnly ? undefined : onPaneClick}
          onSelectionChange={readOnly ? undefined : onSelectionChange}
          deleteKeyCode={readOnly ? null : ['Backspace', 'Delete']}
          nodesDraggable={!readOnly}
          nodesConnectable={!readOnly}
          elementsSelectable={!readOnly}
          nodesFocusable={!readOnly}
          defaultViewport={{ x: 0, y: 0, zoom: 0.9 }}
          snapToGrid
          snapGrid={[16, 16]}
          panOnScroll
          defaultEdgeOptions={{
            animated: true,
            style: { stroke: 'rgba(91, 141, 239, 0.55)' },
          }}
          connectionRadius={36}
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
          <PlaygroundMinimap />
        </ReactFlow>
        {!readOnly ? (
          <NodeInspectorPanel
            node={selectedNode}
            nodes={nodes}
            edges={edges}
            feedSignals={agentFeeds}
          />
        ) : null}
        {onRenameWorkflow && onPrevWorkflow && onNextWorkflow && onNewWorkflow && onDeleteWorkflow ? (
          <WorkflowDock
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
        ) : null}
      </div>
    </div>
  );
}
