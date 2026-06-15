import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { DataSet } from "vis-data";
import { Network } from "vis-network";
import "vis-network/styles/vis-network.min.css";

import type { GraphEdge, WeightedGraph } from "../shared/types";
import { clampWeight, formatWeight, formatWeightShort, proportionalityLabel } from "../shared/weight";
import { NODE_TYPE_LABELS, buildTypeLegend, graphToVis } from "./graph-viz";

type SelectedNode = {
  id: string;
  label: string;
  typeLabel: string;
  color: string;
  degree: number;
  neighbors: Array<{ id: string; label: string; color: string }>;
};

type SelectedEdge = {
  id: string;
  label: string;
  sourceLabel: string;
  targetLabel: string;
  weight: number | null;
  expectedSign: 1 | -1;
};

export function GraphView({
  graph,
  onWeightChange,
}: {
  graph: WeightedGraph;
  onWeightChange?: (edgeId: string, weight: number) => Promise<void>;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const networkRef = useRef<Network | null>(null);
  const selectedEdgeIdRef = useRef<string | null>(null);
  const [selectedNode, setSelectedNode] = useState<SelectedNode | null>(null);
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  const [draftWeight, setDraftWeight] = useState(0);
  const [savingWeight, setSavingWeight] = useState(false);

  const legend = useMemo(() => buildTypeLegend(graph), [graph]);
  const hasGraph = graph.nodes.length > 0;

  const selectedEdge = useMemo((): SelectedEdge | null => {
    if (!selectedEdgeId) return null;
    const edge = graph.edges.find((e) => e.id === selectedEdgeId);
    if (!edge) return null;
    const labelById = new Map(graph.nodes.map((n) => [n.id, n.label]));
    return {
      id: edge.id,
      label: edge.label,
      sourceLabel: labelById.get(edge.source) ?? edge.source,
      targetLabel: labelById.get(edge.target) ?? edge.target,
      weight: edge.weight,
      expectedSign: edge.expectedSign ?? 1,
    };
  }, [graph, selectedEdgeId]);

  useEffect(() => {
    selectedEdgeIdRef.current = selectedEdgeId;
  }, [selectedEdgeId]);

  useEffect(() => {
    if (!selectedEdge) return;
    setDraftWeight(selectedEdge.weight ?? (selectedEdge.expectedSign === -1 ? -0.5 : 0.5));
  }, [selectedEdge?.id, selectedEdge?.weight, selectedEdge?.expectedSign]);

  const selectEdge = useCallback((edge: GraphEdge, network: Network) => {
    setSelectedNode(null);
    setSelectedEdgeId(edge.id);
    network.selectEdges([edge.id]);
    network.selectNodes([]);
  }, []);

  const fitGraph = useCallback(() => {
    networkRef.current?.fit({ animation: { duration: 400, easingFunction: "easeInOutQuad" } });
  }, []);

  const applyWeight = useCallback(async () => {
    if (!selectedEdge || !onWeightChange) return;
    setSavingWeight(true);
    try {
      await onWeightChange(selectedEdge.id, clampWeight(draftWeight));
    } finally {
      setSavingWeight(false);
    }
  }, [draftWeight, onWeightChange, selectedEdge]);

  useEffect(() => {
    if (!hasGraph || !containerRef.current) return;

    const { nodes, edges } = graphToVis(graph);
    const nodesDS = new DataSet(nodes);
    const edgesDS = new DataSet(edges);

    if (networkRef.current) {
      networkRef.current.destroy();
      networkRef.current = null;
    }

    const network = new Network(
      containerRef.current,
      { nodes: nodesDS, edges: edgesDS },
      {
        layout: { improvedLayout: true },
        physics: {
          enabled: true,
          solver: "forceAtlas2Based",
          forceAtlas2Based: {
            gravitationalConstant: -80,
            centralGravity: 0.01,
            springLength: 160,
            springConstant: 0.06,
            damping: 0.5,
            avoidOverlap: 1,
          },
          stabilization: { iterations: 250, fit: true },
        },
        interaction: {
          hover: true,
          tooltipDelay: 80,
          navigationButtons: true,
          keyboard: { enabled: false },
          selectConnectedEdges: false,
        },
        nodes: {
          shape: "dot",
          borderWidth: 2,
          shadow: { enabled: true, size: 8, x: 0, y: 0, color: "rgba(0,0,0,0.35)" },
        },
        edges: {
          smooth: { enabled: true, type: "continuous", roundness: 0.25 },
          selectionWidth: 2,
        },
      },
    );

    network.once("stabilizationIterationsDone", () => {
      network.setOptions({ physics: { enabled: false } });
      network.fit({ animation: { duration: 500, easingFunction: "easeInOutQuad" } });
    });

    network.on("click", (params) => {
      if (params.edges.length) {
        const edgeId = String(params.edges[0]);
        const edge = graph.edges.find((e) => e.id === edgeId);
        if (edge) selectEdge(edge, network);
        return;
      }

      if (params.nodes.length) {
        setSelectedEdgeId(null);
        network.selectEdges([]);

        const nodeId = String(params.nodes[0]);
        const visNode = nodesDS.get(nodeId);
        if (!visNode) return;

        const snapNode = graph.nodes.find((n) => n.id === nodeId);
        const neighborIds = network.getConnectedNodes(nodeId) as string[];
        const neighbors = neighborIds.map((nid) => {
          const nb = nodesDS.get(nid);
          return {
            id: nid,
            label: (nb?.label as string) ?? nid,
            color: nb?.color?.background ?? "#555",
          };
        });

        setSelectedNode({
          id: nodeId,
          label: snapNode?.label ?? nodeId,
          typeLabel: NODE_TYPE_LABELS[snapNode?.type ?? ""] ?? snapNode?.type ?? "Node",
          color: visNode.color.background,
          degree: neighborIds.length,
          neighbors,
        });
        return;
      }

      setSelectedNode(null);
      setSelectedEdgeId(null);
      network.selectEdges([]);
    });

    if (selectedEdgeIdRef.current) {
      const stillExists = graph.edges.some((e) => e.id === selectedEdgeIdRef.current);
      if (stillExists) {
        network.selectEdges([selectedEdgeIdRef.current]);
      }
    }

    networkRef.current = network;

    return () => {
      network.destroy();
      networkRef.current = null;
    };
  }, [graph, hasGraph, selectEdge]);

  if (!hasGraph) {
    return (
      <div className="cot-graph-view cot-graph-view--empty">
        <div className="graph-empty">
          <p>Your weighted graph will appear here.</p>
          <p className="muted">Describe causal links in chat to build the graph.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="cot-graph-view">
      <div ref={containerRef} className="cot-graph-view__canvas" />
      <aside className="cot-graph-view__sidebar">
        <div className="cot-graph-sidebar__section">
          <div className="cot-graph-sidebar__label">Graph</div>
          <div className="cot-graph-stats">
            <span>{graph.nodes.length} nodes</span>
            <span>{graph.edges.length} edges</span>
          </div>
          <button type="button" className="cot-graph-fit-btn" onClick={fitGraph}>
            Fit to view
          </button>
        </div>

        <div className="cot-graph-sidebar__section cot-graph-sidebar__info">
          <h3>Edge weight</h3>
          {selectedEdge ? (
            <div className="cot-graph-edge-editor">
              <div className="cot-graph-field">
                <b>Relationship</b>
                <span>
                  {selectedEdge.sourceLabel} → {selectedEdge.targetLabel}
                </span>
              </div>
              <div className="cot-graph-field">
                <b>Current</b> {formatWeight(selectedEdge.weight)}
              </div>
              <p className="cot-graph-edge-hint muted">
                {proportionalityLabel(selectedEdge.expectedSign)}
              </p>
              <label className="cot-graph-weight-label" htmlFor="edge-weight-slider">
                New weight ({formatWeightShort(clampWeight(draftWeight))})
              </label>
              <input
                id="edge-weight-slider"
                type="range"
                className="cot-graph-weight-slider"
                min={-1}
                max={1}
                step={0.05}
                value={draftWeight}
                onChange={(e) => setDraftWeight(Number(e.target.value))}
              />
              <div className="cot-graph-weight-input-row">
                <input
                  type="number"
                  className="cot-graph-weight-input"
                  min={-1}
                  max={1}
                  step={0.05}
                  value={draftWeight}
                  onChange={(e) => {
                    const n = Number(e.target.value);
                    if (!Number.isNaN(n)) setDraftWeight(clampWeight(n));
                  }}
                />
                <button
                  type="button"
                  className="btn-primary cot-graph-weight-save"
                  disabled={savingWeight || !onWeightChange}
                  onClick={() => void applyWeight()}
                >
                  {savingWeight ? "Saving…" : "Apply"}
                </button>
              </div>
            </div>
          ) : (
            <p className="cot-graph-empty">Click an edge to set its weight</p>
          )}
        </div>

        <div className="cot-graph-sidebar__section cot-graph-sidebar__legend">
          <h3>Node types</h3>
          {legend.map((item) => (
            <div key={item.type} className="cot-graph-legend-item">
              <span className="cot-graph-legend-dot" style={{ background: item.color }} />
              <span className="cot-graph-legend-label">{item.label}</span>
              <span className="cot-graph-legend-count">{item.count}</span>
            </div>
          ))}
        </div>

        <div className="cot-graph-sidebar__section cot-graph-sidebar__legend">
          <h3>Edge weights</h3>
          <div className="cot-graph-edge-legend">
            <span><i className="edge-sample edge-sample--pos" /> Direct (+)</span>
            <span><i className="edge-sample edge-sample--neg" /> Inverse (−)</span>
            <span><i className="edge-sample edge-sample--unset" /> Unset</span>
          </div>
          <ul className="cot-graph-edge-list">
            {graph.edges.map((e) => {
              const src = graph.nodes.find((n) => n.id === e.source)?.label ?? e.source;
              const tgt = graph.nodes.find((n) => n.id === e.target)?.label ?? e.target;
              const pos = (e.weight ?? e.expectedSign ?? 1) >= 0;
              const active = e.id === selectedEdgeId;
              return (
                <li key={e.id} className={`${pos ? "pos" : "neg"}${active ? " active" : ""}`}>
                  <button
                    type="button"
                    className="cot-graph-edge-list-btn"
                    onClick={() => {
                      setSelectedEdgeId(e.id);
                      networkRef.current?.selectEdges([e.id]);
                      networkRef.current?.selectNodes([]);
                      setSelectedNode(null);
                    }}
                  >
                    {short(src)} → {short(tgt)}: <strong>{formatWeightShort(e.weight)}</strong>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>

        <div className="cot-graph-sidebar__section cot-graph-sidebar__info">
          <h3>Node info</h3>
          {selectedNode ? (
            <div className="cot-graph-sidebar__info-body">
              <div className="cot-graph-field"><b>Label</b> {selectedNode.label}</div>
              <div className="cot-graph-field cot-graph-field--type">
                <b>Type</b>
                <span className="cot-graph-type-badge">
                  <span className="cot-graph-legend-dot" style={{ background: selectedNode.color }} />
                  {selectedNode.typeLabel}
                </span>
              </div>
              <div className="cot-graph-field"><b>Connections</b> {selectedNode.degree}</div>
              {selectedNode.neighbors.length > 0 && (
                <div className="cot-graph-neighbors">
                  {selectedNode.neighbors.map((nb) => (
                    <button
                      key={nb.id}
                      type="button"
                      className="cot-graph-neighbor"
                      style={{ borderLeftColor: nb.color }}
                      onClick={() => networkRef.current?.focus(nb.id, { scale: 1.2, animation: true })}
                    >
                      {nb.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <p className="cot-graph-empty">Click a node to inspect</p>
          )}
        </div>
      </aside>
    </div>
  );
}

function short(text: string): string {
  return text.length > 18 ? `${text.slice(0, 17)}…` : text;
}
