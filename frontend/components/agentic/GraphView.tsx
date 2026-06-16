import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { DataSet } from "vis-data";
import { Network } from "vis-network";
import "vis-network/styles/vis-network.min.css";

import type { GraphEdge, WeightedGraph } from "@/lib/agentic/types";
import { clampWeight, edgeColor, formatWeightShort } from "@/lib/agentic/weight";
import {
  NODE_TYPE_LABELS,
  buildGroupColorMap,
  collectGroupIds,
  computeDegrees,
  filterGraphByNodeIds,
  graphToVis,
  groupColorForNode,
  nodeIdPrefix,
} from "./graph-viz";

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
  sourceLabel: string;
  targetLabel: string;
  weight: number | null;
  expectedSign: 1 | -1;
};

type IdGroup = {
  id: string;
  count: number;
  color: string;
  nodeIds: string[];
};

function buildIdGroups(graph: WeightedGraph, groupColorMap: Map<string, string>): IdGroup[] {
  const groups = new Map<string, string[]>();

  for (const node of graph.nodes) {
    const groupId = nodeIdPrefix(node.id);
    const existing = groups.get(groupId);
    if (existing) {
      existing.push(node.id);
    } else {
      groups.set(groupId, [node.id]);
    }
  }

  return [...groups.entries()]
    .map(([id, nodeIds]) => ({
      id,
      count: nodeIds.length,
      color: groupColorMap.get(id) ?? "#9ca3af",
      nodeIds,
    }))
    .sort((a, b) => a.id.localeCompare(b.id));
}

function graphSignature(graph: WeightedGraph): string {
  return `${graph.nodes.length}|${graph.edges.length}|${graph.nodes.map((node) => node.id).join(",")}`;
}

export function GraphView({
  graph,
  onWeightChange,
}: {
  graph: WeightedGraph;
  onWeightChange?: (edgeId: string, weight: number) => Promise<void>;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const networkRef = useRef<Network | null>(null);
  const graphRef = useRef(graph);
  const visibleNodeIdsRef = useRef<Set<string>>(new Set());
  const selectedEdgeIdRef = useRef<string | null>(null);

  const [selectedNode, setSelectedNode] = useState<SelectedNode | null>(null);
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  const [visibleGroupIds, setVisibleGroupIds] = useState<Set<string> | null>(null);
  const [draftWeight, setDraftWeight] = useState(0);
  const [savingWeight, setSavingWeight] = useState(false);

  const hasGraph = graph.nodes.length > 0;
  const groupColorMap = useMemo(() => buildGroupColorMap(collectGroupIds(graph)), [graph]);
  const idGroups = useMemo(() => buildIdGroups(graph, groupColorMap), [graph, groupColorMap]);
  const allGroupIds = useMemo(() => idGroups.map((group) => group.id), [idGroups]);
  const allGroupIdSet = useMemo(() => new Set(allGroupIds), [allGroupIds]);
  const degrees = useMemo(() => computeDegrees(graph), [graph]);
  const signature = useMemo(() => graphSignature(graph), [graph]);

  const activeVisibleGroups = visibleGroupIds ?? allGroupIdSet;

  useEffect(() => {
    graphRef.current = graph;
  }, [graph]);

  useEffect(() => {
    setVisibleGroupIds(null);
  }, [signature]);

  const visibleNodeIds = useMemo(() => {
    const ids = new Set<string>();
    for (const group of idGroups) {
      if (!activeVisibleGroups.has(group.id)) continue;
      for (const nodeId of group.nodeIds) ids.add(nodeId);
    }
    return ids;
  }, [activeVisibleGroups, idGroups]);

  useEffect(() => {
    visibleNodeIdsRef.current = visibleNodeIds;
  }, [visibleNodeIds]);

  const filteredGraph = useMemo(
    () => filterGraphByNodeIds(graph, visibleNodeIds),
    [graph, visibleNodeIds],
  );

  const allGroupsVisible =
    idGroups.length > 0 && idGroups.every((group) => activeVisibleGroups.has(group.id));
  const someGroupsVisible = idGroups.some((group) => activeVisibleGroups.has(group.id));

  const selectedEdge = useMemo((): SelectedEdge | null => {
    if (!selectedEdgeId) return null;
    const edge = graph.edges.find((e) => e.id === selectedEdgeId);
    if (!edge) return null;
    const labelById = new Map(graph.nodes.map((n) => [n.id, n.label]));
    return {
      id: edge.id,
      sourceLabel: labelById.get(edge.source) ?? edge.source,
      targetLabel: labelById.get(edge.target) ?? edge.target,
      weight: edge.weight,
      expectedSign: edge.expectedSign ?? 1,
    };
  }, [graph, selectedEdgeId]);

  useEffect(() => {
    if (!selectedEdge) return;
    setDraftWeight(selectedEdge.weight ?? (selectedEdge.expectedSign === -1 ? -0.5 : 0.5));
  }, [selectedEdge?.id, selectedEdge?.weight, selectedEdge?.expectedSign]);

  useEffect(() => {
    selectedEdgeIdRef.current = selectedEdgeId;
  }, [selectedEdgeId]);

  const buildSelectedNode = useCallback((nodeId: string, network: Network): SelectedNode | null => {
    const visible = visibleNodeIdsRef.current;
    const neighborIds = (network.getConnectedNodes(nodeId) as string[]).filter((nid) =>
      visible.has(nid),
    );

    const nodeMeta = graphRef.current.nodes.find((n) => n.id === nodeId);
    const color = groupColorForNode(nodeId, groupColorMap);

    const labelById = new Map(graphRef.current.nodes.map((n) => [n.id, n.label]));
    const neighbors = neighborIds.map((nid) => {
      const snap = graphRef.current.nodes.find((n) => n.id === nid);
      return {
        id: nid,
        label: snap?.label ?? labelById.get(nid) ?? nid,
        color: groupColorForNode(nid, groupColorMap),
      };
    });

    return {
      id: nodeId,
      label: nodeMeta?.label ?? nodeId,
      typeLabel: NODE_TYPE_LABELS[nodeMeta?.type ?? ""] ?? nodeMeta?.type ?? "Node",
      color,
      degree: neighborIds.length,
      neighbors,
    };
  }, [groupColorMap]);

  const selectEdge = useCallback((edge: GraphEdge, network: Network) => {
    setSelectedNode(null);
    setSelectedEdgeId(edge.id);
    network.selectEdges([edge.id]);
    network.selectNodes([]);
  }, []);

  const selectNodeById = useCallback(
    (nodeId: string, options?: { focus?: boolean }) => {
      const network = networkRef.current;
      if (!network || !visibleNodeIdsRef.current.has(nodeId)) return;

      setSelectedEdgeId(null);
      network.selectEdges([]);
      network.selectNodes([nodeId]);
      setSelectedNode(buildSelectedNode(nodeId, network));

      if (options?.focus !== false) {
        network.focus(nodeId, { scale: 1.15, animation: { duration: 450, easingFunction: "easeInOutQuad" } });
      }
    },
    [buildSelectedNode],
  );

  const setGroupFilter = useCallback((next: Set<string>) => {
    setVisibleGroupIds(new Set(next));
    setSelectedNode(null);
    setSelectedEdgeId(null);
  }, []);

  const toggleGroupVisibility = useCallback(
    (groupId: string) => {
      setVisibleGroupIds((prev) => {
        const base = prev ?? allGroupIdSet;
        const next = new Set(base);
        if (next.has(groupId)) next.delete(groupId);
        else next.add(groupId);
        return next;
      });
    },
    [allGroupIdSet],
  );

  const selectOnlyGroup = useCallback(
    (groupId: string) => {
      setGroupFilter(new Set([groupId]));
    },
    [setGroupFilter],
  );

  const toggleSelectAllGroups = useCallback(() => {
    setGroupFilter(allGroupsVisible ? new Set() : new Set(allGroupIds));
  }, [allGroupIds, allGroupsVisible, setGroupFilter]);

  const fitGraph = useCallback(() => {
    networkRef.current?.fit({ animation: { duration: 400, easingFunction: "easeInOutQuad" } });
  }, []);

  const applyWeight = useCallback(
    async (value: number) => {
      if (!selectedEdge || !onWeightChange) return;
      const weight = clampWeight(value);
      setDraftWeight(weight);
      setSavingWeight(true);
      try {
        await onWeightChange(selectedEdge.id, weight);
      } finally {
        setSavingWeight(false);
      }
    },
    [onWeightChange, selectedEdge],
  );

  useEffect(() => {
    if (selectedNode && !visibleNodeIds.has(selectedNode.id)) {
      setSelectedNode(null);
    }
    if (selectedEdgeId) {
      const edge = graph.edges.find((e) => e.id === selectedEdgeId);
      if (
        !edge ||
        !visibleNodeIds.has(edge.source) ||
        !visibleNodeIds.has(edge.target)
      ) {
        setSelectedEdgeId(null);
      }
    }
  }, [graph.edges, selectedEdgeId, selectedNode, visibleNodeIds]);

  useEffect(() => {
    if (!hasGraph || !containerRef.current) return;

    const { nodes, edges } = graphToVis(filteredGraph);

    for (const edge of edges) {
      if (edge.id === selectedEdgeIdRef.current) {
        const fullEdge = graphRef.current.edges.find((item) => item.id === edge.id);
        edge.label = formatWeightShort(fullEdge?.weight ?? null);
      }
    }

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
        layout: { improvedLayout: false },
        physics: {
          enabled: true,
          solver: "forceAtlas2Based",
          forceAtlas2Based: {
            gravitationalConstant: -38,
            centralGravity: 0.004,
            springLength: 72,
            springConstant: 0.085,
            damping: 0.62,
            avoidOverlap: 0.55,
          },
          stabilization: { iterations: 220, fit: true },
        },
        interaction: {
          hover: true,
          tooltipDelay: 120,
          navigationButtons: false,
          keyboard: { enabled: false },
          selectConnectedEdges: false,
          zoomView: true,
          dragView: true,
        },
        nodes: {
          shape: "dot",
          borderWidth: 2.5,
          borderWidthSelected: 4,
          shadow: {
            enabled: true,
            size: 12,
            x: 0,
            y: 2,
            color: "rgba(0, 0, 0, 0.45)",
          },
        },
        edges: {
          smooth: { enabled: true, type: "dynamic", roundness: 0.35 },
          selectionWidth: 3,
          hoverWidth: 2,
        },
      },
    );

    network.once("stabilizationIterationsDone", () => {
      network.setOptions({ physics: { enabled: false } });
      network.fit({ animation: { duration: 600, easingFunction: "easeInOutQuad" } });
    });

    network.on("click", (params) => {
      if (params.edges.length) {
        const edgeId = String(params.edges[0]);
        const edge = graphRef.current.edges.find((e) => e.id === edgeId);
        if (edge) selectEdge(edge, network);
        return;
      }

      if (params.nodes.length) {
        const nodeId = String(params.nodes[0]);
        setSelectedEdgeId(null);
        network.selectEdges([]);
        network.selectNodes([nodeId]);
        setSelectedNode(buildSelectedNode(nodeId, network));
        return;
      }

      setSelectedNode(null);
      setSelectedEdgeId(null);
      network.selectEdges([]);
      network.selectNodes([]);
    });

    if (selectedEdgeIdRef.current) {
      const stillVisible = filteredGraph.edges.some((e) => e.id === selectedEdgeIdRef.current);
      if (stillVisible) {
        network.selectEdges([selectedEdgeIdRef.current]);
      }
    }

    networkRef.current = network;

    return () => {
      network.destroy();
      networkRef.current = null;
    };
  }, [filteredGraph, hasGraph, selectEdge, buildSelectedNode]);

  if (!hasGraph) {
    return (
      <div className="cot-graph-view cot-graph-view--empty">
        <div className="graph-empty">
          <p>Shared macro correlation graph — open Session &amp; LLM to chat about it.</p>
          <p className="muted">Click the message button at the bottom-left to describe relationships.</p>
        </div>
      </div>
    );
  }

  const visibleNodeCount = filteredGraph.nodes.length;
  const visibleEdgeCount = filteredGraph.edges.length;

  return (
    <div className="cot-graph-view">
      <div ref={containerRef} className="cot-graph-view__canvas cot-graph-view__canvas--agentic" />
      <aside className="cot-graph-view__sidebar">
        <div className="cot-graph-sidebar__section cot-graph-sidebar__info">
          <h3>Node info</h3>
          {selectedNode ? (
            <div className="cot-graph-info-panel">
              <div className="cot-graph-info-panel__title">{selectedNode.label}</div>
              <dl className="cot-graph-info-meta">
                <div className="cot-graph-info-meta__row">
                  <dt>Type</dt>
                  <dd>{selectedNode.typeLabel}</dd>
                </div>
                <div className="cot-graph-info-meta__row">
                  <dt>ID</dt>
                  <dd><code>{selectedNode.id}</code></dd>
                </div>
                <div className="cot-graph-info-meta__row">
                  <dt>Group</dt>
                  <dd><code>{nodeIdPrefix(selectedNode.id)}</code></dd>
                </div>
                <div className="cot-graph-info-meta__row">
                  <dt>Degree</dt>
                  <dd>{degrees.get(selectedNode.id) ?? selectedNode.degree}</dd>
                </div>
              </dl>
              {selectedNode.neighbors.length > 0 && (
                <div className="cot-graph-neighbors-block">
                  <div className="cot-graph-neighbors-block__title">
                    Neighbors ({selectedNode.neighbors.length})
                  </div>
                  <ul className="cot-graph-neighbors-list">
                    {selectedNode.neighbors.map((nb) => (
                      <li key={nb.id}>
                        <button
                          type="button"
                          className="cot-graph-neighbor-row"
                          style={{ borderLeftColor: nb.color }}
                          onClick={() => selectNodeById(nb.id)}
                        >
                          {nb.label}
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          ) : selectedEdge ? (
            <div className="cot-graph-info-panel">
              <div className="cot-graph-info-panel__title">Edge</div>
              <dl className="cot-graph-info-meta">
                <div className="cot-graph-info-meta__row">
                  <dt>From</dt>
                  <dd>{selectedEdge.sourceLabel}</dd>
                </div>
                <div className="cot-graph-info-meta__row">
                  <dt>To</dt>
                  <dd>{selectedEdge.targetLabel}</dd>
                </div>
              </dl>
              <div className="cot-graph-edge-editor">
                <div className="cot-graph-weight-slider-row">
                  <span className="cot-graph-weight-slider-row__label">Weight</span>
                  <span
                    className="cot-graph-weight-slider-row__value"
                    style={{ color: edgeColor(clampWeight(draftWeight)) }}
                  >
                    {formatWeightShort(clampWeight(draftWeight))}
                  </span>
                </div>
                <input
                  id="edge-weight-slider"
                  type="range"
                  className="cot-graph-weight-slider"
                  min={-1}
                  max={1}
                  step={0.05}
                  value={draftWeight}
                  disabled={savingWeight || !onWeightChange}
                  onChange={(e) => setDraftWeight(Number(e.target.value))}
                  onMouseUp={(e) => void applyWeight(Number(e.currentTarget.value))}
                  onTouchEnd={(e) => void applyWeight(Number(e.currentTarget.value))}
                  style={{ accentColor: edgeColor(clampWeight(draftWeight)) }}
                  aria-valuetext={formatWeightShort(clampWeight(draftWeight))}
                />
              </div>
            </div>
          ) : visibleNodeCount === 0 ? (
            <p className="cot-graph-empty">Select at least one ID below to show nodes on the graph.</p>
          ) : (
            <p className="cot-graph-empty">Click a node or edge on the graph to inspect it.</p>
          )}
        </div>

        <div className="cot-graph-sidebar__section cot-graph-sidebar__filter">
          <div className="cot-graph-sidebar__filter-header">
            <h3>IDs</h3>
            <div className="cot-graph-filter-meta">
              <span>{visibleNodeCount} nodes · {visibleEdgeCount} edges</span>
              <button type="button" className="cot-graph-fit-btn cot-graph-fit-btn--compact" onClick={fitGraph}>
                Fit
              </button>
            </div>
          </div>

          <label className="cot-graph-filter-row cot-graph-filter-row--select-all">
            <input
              type="checkbox"
              checked={allGroupsVisible}
              ref={(el) => {
                if (el) el.indeterminate = someGroupsVisible && !allGroupsVisible;
              }}
              onChange={toggleSelectAllGroups}
            />
            <span className="cot-graph-filter-row__label">Select All</span>
          </label>

          <ul className="cot-graph-filter-list">
            {idGroups.map((group) => {
              const checked = activeVisibleGroups.has(group.id);
              const solo = checked && activeVisibleGroups.size === 1;
              return (
                <li key={group.id} className={solo ? "active" : undefined}>
                  <div className="cot-graph-filter-row">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleGroupVisibility(group.id)}
                      aria-label={`Toggle ${group.id}`}
                    />
                    <button
                      type="button"
                      className="cot-graph-filter-row__body"
                      onClick={() => selectOnlyGroup(group.id)}
                      title={`Show only ${group.id}`}
                    >
                      <span
                        className="cot-graph-filter-row__dot"
                        style={{ background: group.color }}
                        aria-hidden
                      />
                      <span className="cot-graph-filter-row__label">{group.id}</span>
                      <span className="cot-graph-filter-row__count">{group.count}</span>
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      </aside>
    </div>
  );
}
