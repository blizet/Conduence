'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { DataSet } from 'vis-data';
import { Network } from 'vis-network';
import 'vis-network/styles/vis-network.min.css';
import {
  DEFAULT_GRAPH_ID,
  NODE_TYPE_LABELS,
  SAMPLE_SNAPSHOT,
  computeDegrees,
  fetchGraphNodeDetail,
  fetchGraphSnapshot,
  resolveNodeColor,
  shortLabel,
  type GraphNodeDetail,
  type GraphSnapshot,
  type GraphSnapshotNode,
} from '@/lib/cot-graph';
import { CotGraphNodeDetail } from './CotGraphNodeDetail';

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

function snapshotToVis(snapshot: GraphSnapshot) {
  const degrees = computeDegrees(snapshot);
  const nodes: VisNode[] = snapshot.nodes.map((node) => {
      const bg = resolveNodeColor(node);
      const degree = degrees.get(node.id) ?? 0;
      const typeKey =
        node.type === 'market' && node.marketRole === 'correlated_peer'
          ? 'correlated_market'
          : node.type;
      return {
        id: node.id,
        label: shortLabel(node.id),
        color: {
          background: bg,
          border: bg,
          highlight: { background: '#ffffff', border: bg },
        },
        size: Math.min(28, 10 + degree * 2.5),
        font: { size: 0, color: '#ffffff' },
        title: `${node.id} (${node.type})`,
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
      title: edge.type,
      dashes: edge.type.includes('CORRELATED'),
      width: edge.type.startsWith('OPEN') || edge.type.startsWith('CLOSE') ? 2.5 : 1.5,
      color: { opacity: 0.65 },
      arrows: { to: { enabled: true, scaleFactor: 0.45 } },
    }));

  return { nodes, edges };
}

type SelectedNode = {
  id: string;
  typeLabel: string;
  color: string;
  degree: number;
  neighbors: { id: string; label: string; color: string }[];
};

function typeKeyForNode(node: GraphSnapshotNode | undefined, fallback: string): string {
  if (!node) return fallback;
  if (node.type === 'market' && node.marketRole === 'correlated_peer') return 'correlated_market';
  return node.type;
}

function GraphIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
      <circle cx="4" cy="4" r="2" />
      <circle cx="12" cy="4" r="2" />
      <circle cx="8" cy="12" r="2" />
      <path d="M5.5 4.5L7 10M10.5 4.5L9 10" />
    </svg>
  );
}

export function CotGraphView() {
  const containerRef = useRef<HTMLDivElement>(null);
  const networkRef = useRef<Network | null>(null);
  const nodesRef = useRef<DataSet<VisNode> | null>(null);

  const [graphId, setGraphId] = useState(DEFAULT_GRAPH_ID);
  const [snapshot, setSnapshot] = useState<GraphSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [usingSample, setUsingSample] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<SelectedNode | null>(null);
  const [nodeDetail, setNodeDetail] = useState<GraphNodeDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const loadSnapshot = useCallback(async (id: string) => {
    setLoading(true);
    setError(null);
    setUsingSample(false);
    try {
      const data = await fetchGraphSnapshot(id);
      setSnapshot(data.nodes.length > 0 ? data : SAMPLE_SNAPSHOT);
      if (data.nodes.length === 0) setUsingSample(true);
    } catch (err) {
      setSnapshot(SAMPLE_SNAPSHOT);
      setUsingSample(true);
      setError(err instanceof Error ? err.message : 'Using sample graph');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadSnapshot(graphId);
  }, [graphId, loadSnapshot]);

  useEffect(() => {
    if (!selected?.id) {
      setNodeDetail(null);
      return;
    }

    let cancelled = false;
    setDetailLoading(true);
    void fetchGraphNodeDetail(graphId, selected.id, { useSampleFallback: usingSample })
      .then((detail) => {
        if (!cancelled) setNodeDetail(detail);
      })
      .finally(() => {
        if (!cancelled) setDetailLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [graphId, selected?.id, usingSample]);

  const searchResults = useMemo(() => {
    if (!snapshot || search.trim().length < 1) return [];
    const q = search.trim().toLowerCase();
    return snapshot.nodes
      .filter((n) => n.id.toLowerCase().includes(q) || n.type.toLowerCase().includes(q))
      .slice(0, 12);
  }, [snapshot, search]);

  useEffect(() => {
    if (!snapshot || !containerRef.current) return;

    const { nodes, edges } = snapshotToVis(snapshot);
    const nodesDS = new DataSet(nodes);
    const edgesDS = new DataSet(edges);
    nodesRef.current = nodesDS;

    if (networkRef.current) {
      networkRef.current.destroy();
      networkRef.current = null;
    }

    const network = new Network(
      containerRef.current,
      { nodes: nodesDS, edges: edgesDS },
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
        interaction: {
          hover: true,
          tooltipDelay: 100,
          hideEdgesOnDrag: true,
          navigationButtons: false,
          keyboard: false,
        },
        nodes: { shape: 'dot', borderWidth: 1.5 },
        edges: { smooth: { enabled: true, type: 'continuous', roundness: 0.2 }, selectionWidth: 3 },
      },
    );

    network.once('stabilizationIterationsDone', () => {
      network.setOptions({ physics: { enabled: false } });
    });

    network.on('click', (params) => {
      if (params.nodes.length === 0) {
        setSelected(null);
        return;
      }
      const nodeId = String(params.nodes[0]);
      const visNode = nodesDS.get(nodeId);
      if (!visNode) return;

      const snapNode = snapshot.nodes.find((n) => n.id === nodeId);
      const typeKey = typeKeyForNode(snapNode, visNode._nodeType);
      const neighborIds = network.getConnectedNodes(nodeId) as string[];
      const neighbors = neighborIds.map((nid) => {
        const nb = nodesDS.get(nid);
        return {
          id: nid,
          label: nb ? nb.label : nid,
          color: nb ? nb.color.background : '#555',
        };
      });

      setSelected({
        id: nodeId,
        typeLabel: NODE_TYPE_LABELS[typeKey] ?? typeKey,
        color: visNode.color.background,
        degree: neighborIds.length,
        neighbors,
      });
    });

    networkRef.current = network;

    return () => {
      network.destroy();
      networkRef.current = null;
      nodesRef.current = null;
    };
  }, [snapshot]);

  const focusNode = useCallback(
    (nodeId: string) => {
      const network = networkRef.current;
      const nodesDS = nodesRef.current;
      if (!network || !nodesDS || !snapshot) return;

      network.focus(nodeId, { scale: 1.4, animation: true });
      network.selectNodes([nodeId]);

      const visNode = nodesDS.get(nodeId);
      if (!visNode) return;

      const snapNode = snapshot.nodes.find((n) => n.id === nodeId);
      const typeKey = typeKeyForNode(snapNode, visNode._nodeType);
      const neighborIds = network.getConnectedNodes(nodeId) as string[];
      const neighbors = neighborIds.map((nid) => {
        const nb = nodesDS.get(nid);
        return {
          id: nid,
          label: nb ? nb.label : nid,
          color: nb ? nb.color.background : '#555',
        };
      });

      setSelected({
        id: nodeId,
        typeLabel: NODE_TYPE_LABELS[typeKey] ?? typeKey,
        color: visNode.color.background,
        degree: neighborIds.length,
        neighbors,
      });
    },
    [snapshot],
  );

  return (
    <div className="cot-graph-view">
      <div ref={containerRef} className="cot-graph-view__canvas">
        {loading && (
          <div className="cot-graph-view__loading">
            <GraphIcon />
            <span>Loading graph…</span>
          </div>
        )}
      </div>

      <aside className="cot-graph-view__sidebar dark-scroll">
        <div className="cot-graph-sidebar__section">
          <div className="cot-graph-sidebar__label">Graph ID</div>
          <input
            className="cot-graph-sidebar__input"
            value={graphId}
            onChange={(e) => setGraphId(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void loadSnapshot(graphId);
            }}
            onBlur={() => void loadSnapshot(graphId)}
          />
          {usingSample && (
            <div className="cot-graph-sidebar__hint">
              {error ? `${error} — showing sample CoT chain` : 'Empty graph — showing sample CoT chain'}
            </div>
          )}
        </div>

        <div className="cot-graph-sidebar__section">
          <input
            className="cot-graph-sidebar__input"
            type="search"
            placeholder="Search nodes…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            autoComplete="off"
          />
          {searchResults.length > 0 && (
            <div className="cot-graph-sidebar__search-results">
              {searchResults.map((node: GraphSnapshotNode) => (
                <button
                  key={node.id}
                  type="button"
                  className="cot-graph-sidebar__search-item"
                  style={{ borderLeftColor: resolveNodeColor(node) }}
                  onClick={() => {
                    focusNode(node.id);
                    setSearch('');
                  }}
                >
                  {node.id}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="cot-graph-sidebar__section cot-graph-sidebar__info">
          <h3>Node info</h3>
          {selected ? (
            <div className="cot-graph-sidebar__info-body">
              <div className="cot-graph-field">
                <b>ID</b> {selected.id}
              </div>
              <div className="cot-graph-field cot-graph-field--type">
                <b>Type</b>
                <span className="cot-graph-type-badge">
                  <span
                    className="cot-graph-legend-dot"
                    style={{ background: selected.color }}
                    aria-hidden
                  />
                  {selected.typeLabel}
                </span>
              </div>
              <div className="cot-graph-field">
                <b>Degree</b> {selected.degree}
              </div>
              {selected.neighbors.length > 0 && (
                <>
                  <div className="cot-graph-field cot-graph-field--muted">
                    Neighbors ({selected.neighbors.length})
                  </div>
                  <div className="cot-graph-neighbors">
                    {selected.neighbors.map((nb) => (
                      <button
                        key={nb.id}
                        type="button"
                        className="cot-graph-neighbor"
                        style={{ borderLeftColor: nb.color }}
                        onClick={() => focusNode(nb.id)}
                      >
                        {nb.label}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          ) : (
            <p className="cot-graph-empty">Click a node to inspect it</p>
          )}
        </div>

        <CotGraphNodeDetail
          detail={nodeDetail}
          loading={detailLoading}
          nodeId={selected?.id ?? null}
        />

        {snapshot && (
          <div className="cot-graph-sidebar__stats">
            {snapshot.nodes.length} nodes · {snapshot.edges.length} edges
          </div>
        )}
      </aside>
    </div>
  );
}
