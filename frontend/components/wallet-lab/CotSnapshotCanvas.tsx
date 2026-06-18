'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { DataSet } from 'vis-data';
import { Network } from 'vis-network';
import 'vis-network/styles/vis-network.min.css';
import {
  NODE_TYPE_LABELS,
  buildTypeLegend,
  computeDegrees,
  resolveNodeColor,
  shortLabel,
  type GraphSnapshot,
  type GraphSnapshotNode,
} from '@/lib/cot-graph';
import type { WalletCotNodeDetail } from '@/lib/wallet-graph';
import { WalletCotNodeInspector } from './WalletCotNodeInspector';

type VisNode = {
  id: string;
  label: string;
  color: {
    background: string;
    border: string;
    highlight: { background: string; border: string };
  };
  size: number;
  font: { size: number; color: string };
  title: string;
  _nodeType: string;
};

type VisEdge = {
  id: number;
  from: string;
  to: string;
  title: string;
  dashes: boolean;
  width: number;
  color: { opacity: number; color?: string };
  arrows: { to: { enabled: boolean; scaleFactor: number } };
};

function typeKeyForNode(node: GraphSnapshotNode | undefined, fallback: string): string {
  if (!node) return fallback;
  if (node.type === 'market' && node.marketRole === 'correlated_peer') return 'correlated_market';
  return node.type;
}

function dedupeSnapshotNodes(nodes: GraphSnapshotNode[]): GraphSnapshotNode[] {
  const byId = new Map<string, GraphSnapshotNode>();
  for (const node of nodes) {
    const id = String(node.id ?? '').trim();
    if (!id) continue;
    byId.set(id, node);
  }
  return [...byId.values()];
}

function snapshotToVis(snapshot: GraphSnapshot) {
  const uniqueNodes = dedupeSnapshotNodes(snapshot.nodes);
  const degrees = computeDegrees({ ...snapshot, nodes: uniqueNodes });
  const nodes: VisNode[] = uniqueNodes.map((node) => {
    const bg = resolveNodeColor(node);
    const degree = degrees.get(node.id) ?? 0;
    const typeKey = typeKeyForNode(node, node.type);
    const displayLabel = node.label ? shortLabel(node.label, 28) : shortLabel(node.id);
    return {
      id: node.id,
      label: displayLabel,
      color: {
        background: bg,
        border: bg,
        highlight: { background: '#ffffff', border: bg },
      },
      size: Math.min(28, 10 + degree * 2.5),
      font: { size: 0, color: '#ffffff' },
      title: node.label ? `${node.label} (${node.type})` : `${node.id} (${node.type})`,
      _nodeType: typeKey,
    };
  });

  const nodeIds = new Set(nodes.map((n) => n.id));
  const edges: VisEdge[] = snapshot.edges
    .filter((edge) => nodeIds.has(edge.source) && nodeIds.has(edge.target))
    .map((edge, index) => ({
      id: index,
      from: edge.source,
      to: edge.target,
      title: edge.label ?? edge.type,
      dashes: edge.type.includes('CORRELATED'),
      width: edge.type.includes('CORRELATED') ? 2 : edge.type.startsWith('OPEN') || edge.type.startsWith('CLOSE') ? 2.5 : 1.5,
      color: {
        opacity: edge.type.includes('CORRELATED') ? 0.85 : 0.65,
        color: edge.type.includes('CORRELATED') ? '#EDC948' : undefined,
      },
      arrows: { to: { enabled: !edge.type.includes('CORRELATED'), scaleFactor: 0.45 } },
    }));

  return { nodes, edges };
}

type CotSnapshotCanvasProps = {
  snapshot: GraphSnapshot | null;
  nodeDetails?: Record<string, WalletCotNodeDetail>;
  emptyMessage?: string;
};

export function CotSnapshotCanvas({ snapshot, nodeDetails, emptyMessage }: CotSnapshotCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const networkRef = useRef<Network | null>(null);
  const nodesRef = useRef<DataSet<VisNode> | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [neighbors, setNeighbors] = useState<Array<{ id: string; label: string }>>([]);

  const hasGraph = Boolean(snapshot && dedupeSnapshotNodes(snapshot.nodes).length > 0);
  const legend = useMemo(
    () => (snapshot ? buildTypeLegend(snapshot) : []),
    [snapshot],
  );
  const degrees = useMemo(
    () => (snapshot ? computeDegrees(snapshot) : new Map<string, number>()),
    [snapshot],
  );

  const focusNode = useCallback(
    (nodeId: string) => {
      const network = networkRef.current;
      const nodesDS = nodesRef.current;
      if (!network || !nodesDS || !snapshot) return;
      network.selectNodes([nodeId]);
      network.focus(nodeId, { scale: 1.2, animation: { duration: 400, easingFunction: 'easeInOutQuad' } });
      const visNode = nodesDS.get(nodeId);
      const snapNode = snapshot.nodes.find((n) => n.id === nodeId);
      const neighborIds = network.getConnectedNodes(nodeId) as string[];
      setNeighbors(
        neighborIds.map((nid) => {
          const snap = snapshot.nodes.find((n) => n.id === nid);
          return { id: nid, label: snap?.label ?? nid };
        }),
      );
      setSelectedId(nodeId);
      void visNode;
      void snapNode;
    },
    [snapshot],
  );

  useEffect(() => {
    if (!containerRef.current || !hasGraph || !snapshot) return;

    const { nodes, edges } = snapshotToVis(snapshot);
    const dataNodes = new DataSet(nodes);
    const dataEdges = new DataSet(edges);
    nodesRef.current = dataNodes;

    if (networkRef.current) {
      networkRef.current.destroy();
      networkRef.current = null;
    }

    const network = new Network(
      containerRef.current,
      { nodes: dataNodes, edges: dataEdges },
      {
        physics: {
          enabled: true,
          solver: 'forceAtlas2Based',
          forceAtlas2Based: {
            gravitationalConstant: -60,
            centralGravity: 0.005,
            springLength: 120,
            springConstant: 0.08,
            damping: 0.4,
            avoidOverlap: 0.8,
          },
          stabilization: { iterations: 200, fit: true },
        },
        interaction: { hover: true, tooltipDelay: 120, hideEdgesOnDrag: true },
        nodes: { shape: 'dot', borderWidth: 1.5 },
        edges: { smooth: { enabled: true, type: 'continuous', roundness: 0.2 }, selectionWidth: 3 },
      },
    );

    network.once('stabilizationIterationsDone', () => {
      network.setOptions({ physics: { enabled: false } });
    });

    network.on('click', (params) => {
      if (!params.nodes?.length) {
        setSelectedId(null);
        setNeighbors([]);
        return;
      }
      focusNode(String(params.nodes[0]));
    });

    networkRef.current = network;
    network.fit({ animation: { duration: 300, easingFunction: 'easeInOutQuad' } });

    return () => {
      network.destroy();
      networkRef.current = null;
      nodesRef.current = null;
    };
  }, [hasGraph, snapshot, focusNode]);

  const selectedNode = snapshot?.nodes.find((n) => n.id === selectedId);
  const selectedDetail = selectedId && nodeDetails ? nodeDetails[selectedId] : null;
  const typeLabel = selectedNode
    ? NODE_TYPE_LABELS[typeKeyForNode(selectedNode, selectedNode.type)] ?? selectedNode.type
    : null;

  return (
    <div className="wallet-lab-cot">
      <div
        ref={containerRef}
        className="wallet-lab-cot__canvas cot-graph-view__canvas"
        aria-label="CoT decision graph"
      />
      {!hasGraph ? (
        <div className="wallet-lab-empty">{emptyMessage ?? 'CoT graph will appear here after you load a wallet.'}</div>
      ) : null}
      <aside className="wallet-lab-cot__sidebar cot-graph-view__sidebar">
        <div className="cot-graph-sidebar__section">
          <h3>{selectedId ? (typeLabel ?? 'Node') : 'Node info'}</h3>
          {selectedId && selectedNode?.label ? (
            <div className="cot-graph-info-panel__title">{selectedNode.label}</div>
          ) : null}
          <WalletCotNodeInspector
            detail={selectedDetail}
            nodeId={selectedId}
            degree={selectedId ? degrees.get(selectedId) ?? neighbors.length : 0}
            neighbors={neighbors}
          />
        </div>
        {legend.length > 0 ? (
          <div className="cot-graph-sidebar__section">
            <h3>Legend</h3>
            <ul className="cot-graph-legend">
              {legend.map((item) => (
                <li key={item.type}>
                  <span className="cot-graph-legend__swatch" style={{ background: item.color }} />
                  {item.label} ({item.count})
                </li>
              ))}
              <li>
                <span className="cot-graph-legend__swatch" style={{ background: '#EDC948' }} />
                Correlated markets (dashed)
              </li>
            </ul>
          </div>
        ) : null}
      </aside>
    </div>
  );
}
