'use client';

import { useCallback, useEffect, useMemo, useRef } from 'react';
import {
  ReactFlow,
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
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
import { useAgentFeed } from '@/lib/agent-feed';

function minimapNodeColor(node: WorkflowNode): string {
  return node.data?.accent ?? '#5b8def';
}

export type WorkflowCanvasProps = {
  onCountsChange?: (nodes: number, edges: number) => void;
  runSignal?: number;
  onRunStateChange?: (running: boolean) => void;
  onCanvasChange?: (nodes: WorkflowNode[], edges: Edge[]) => void;
  loadCanvas?: { key: string | number; nodes: WorkflowNode[]; edges: Edge[] } | null;
};

export function WorkflowCanvas({
  onCountsChange,
  runSignal = 0,
  onRunStateChange,
  onCanvasChange,
  loadCanvas,
}: WorkflowCanvasProps) {
  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  const { screenToFlowPosition } = useReactFlow();
  const { agentFeeds } = useAgentFeed();
  const [nodes, setNodes, onNodesChange] = useNodesState<WorkflowNode>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const nodesRef = useRef<WorkflowNode[]>([]);
  const edgesRef = useRef<Edge[]>([]);
  const runningRef = useRef(false);
  const loadedKeyRef = useRef<string | number | null>(null);
  const skipCanvasSyncRef = useRef(false);
  const loadCanvasRef = useRef(loadCanvas);
  const nodeTypes = useMemo(() => registeredNodeTypes, []);

  loadCanvasRef.current = loadCanvas;

  useEffect(() => {
    nodesRef.current = nodes;
  }, [nodes]);

  useEffect(() => {
    edgesRef.current = edges;
  }, [edges]);

  useEffect(() => {
    onCountsChange?.(nodes.length, edges.length);
  }, [nodes.length, edges.length, onCountsChange]);

  // Hydrate canvas only when load key changes (workspace switch / marketplace import).
  useEffect(() => {
    const canvas = loadCanvasRef.current;
    if (!canvas) return;
    if (loadedKeyRef.current === canvas.key) return;
    loadedKeyRef.current = canvas.key;
    skipCanvasSyncRef.current = true;
    setNodes(canvas.nodes);
    setEdges(canvas.edges);
  }, [loadCanvas?.key, setNodes, setEdges]);

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
