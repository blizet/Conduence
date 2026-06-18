import type { WeightedGraph } from "@/lib/agentic/types";
import { formatWeightShort } from "@/lib/agentic/weight";

/** CoT graph palette (from frontend/lib/cot-graph.ts) */
export const NODE_TYPE_COLORS: Record<string, string> = {
  event: "#F28E2B",
  asset: "#E15759",
  market: "#4E79A7",
  concept: "#B07AA1",
};

export const NODE_TYPE_LABELS: Record<string, string> = {
  event: "Event",
  asset: "Asset",
  market: "Market",
  concept: "Concept",
};

/** Pastel palette with wide hue separation — easy to tell apart on dark canvas */
export const ID_GROUP_PALETTE = [
  "#82b888", // green
  "#c99868", // orange
  "#78a8d8", // blue
  "#d08898", // rose
  "#68b0a8", // teal
  "#c8b058", // gold
  "#a888d0", // purple
  "#c87858", // rust
  "#60a8c8", // cyan
  "#a8c068", // chartreuse
  "#c878a8", // magenta
  "#7888c8", // indigo
  "#b078c8", // violet
  "#b08878", // tan
  "#58a8b0", // aqua
  "#b0a848", // olive
  "#9870a8", // plum
  "#68b088", // jade
  "#c87878", // salmon
  "#7890a0", // steel
  "#d0a848", // amber
  "#88a878", // moss
  "#7098c8", // cornflower
  "#c87090", // raspberry
];

export function nodeIdPrefix(id: string): string {
  const idx = id.lastIndexOf("_");
  return idx > 0 ? id.slice(0, idx) : id;
}

export function collectGroupIds(graph: WeightedGraph): string[] {
  const groups = new Set<string>();
  for (const node of graph.nodes) {
    groups.add(nodeIdPrefix(node.id));
  }
  return [...groups].sort((a, b) => a.localeCompare(b));
}

function hashGroupId(groupId: string): number {
  let hash = 0;
  for (let i = 0; i < groupId.length; i += 1) {
    hash = (hash * 31 + groupId.charCodeAt(i)) >>> 0;
  }
  return hash;
}

export function buildGroupColorMap(groupIds: string[]): Map<string, string> {
  const map = new Map<string, string>();
  const usedIndices = new Set<number>();

  for (const groupId of groupIds) {
    let index = hashGroupId(groupId) % ID_GROUP_PALETTE.length;
    let attempts = 0;
    while (usedIndices.has(index) && attempts < ID_GROUP_PALETTE.length) {
      index = (index + 7) % ID_GROUP_PALETTE.length;
      attempts += 1;
    }
    usedIndices.add(index);
    map.set(groupId, ID_GROUP_PALETTE[index]);
  }

  return map;
}

export function groupColorForNode(nodeId: string, colorMap: Map<string, string>): string {
  return colorMap.get(nodeIdPrefix(nodeId)) ?? ID_GROUP_PALETTE[0];
}

/** Same-group edges use group color; cross-group edges inherit source group color. */
export function groupColorForEdge(
  source: string,
  target: string,
  colorMap: Map<string, string>,
): string {
  const sourceGroup = nodeIdPrefix(source);
  const targetGroup = nodeIdPrefix(target);
  if (sourceGroup === targetGroup) {
    return colorMap.get(sourceGroup) ?? ID_GROUP_PALETTE[0];
  }
  return colorMap.get(sourceGroup) ?? colorMap.get(targetGroup) ?? ID_GROUP_PALETTE[0];
}

export function withAlpha(hex: string, alpha: number): string {
  const normalized = hex.replace("#", "");
  const full =
    normalized.length === 3
      ? normalized
          .split("")
          .map((c) => c + c)
          .join("")
      : normalized;
  const r = Number.parseInt(full.slice(0, 2), 16);
  const g = Number.parseInt(full.slice(2, 4), 16);
  const b = Number.parseInt(full.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export function shortLabel(text: string, max = 20): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1)}…`;
}

export function computeDegrees(graph: WeightedGraph): Map<string, number> {
  const degrees = new Map<string, number>();
  for (const node of graph.nodes) degrees.set(node.id, 0);
  for (const edge of graph.edges) {
    degrees.set(edge.source, (degrees.get(edge.source) ?? 0) + 1);
    degrees.set(edge.target, (degrees.get(edge.target) ?? 0) + 1);
  }
  return degrees;
}

export function edgeStrokeWidth(weight: number | null): number {
  if (weight == null) return 1.25;
  return 1.25 + Math.abs(weight) * 3.5;
}

function visNodeColor(bg: string, borderWidth = 1.5) {
  return {
    background: bg,
    border: withAlpha(bg, 0.95),
    highlight: {
      background: withAlpha(bg, 0.95),
      border: withAlpha(bg, 0.85),
    },
    borderWidth,
  };
}

export type VisNode = {
  id: string;
  label: string;
  title: string;
  x?: number;
  y?: number;
  color: {
    background: string;
    border: string;
    highlight: { background: string; border: string };
  };
  size: number;
  font: { size: number; color: string; face: string; strokeWidth?: number; strokeColor?: string };
  _nodeType: string;
};

export type VisEdge = {
  id: string;
  from: string;
  to: string;
  title: string;
  width: number;
  dashes: boolean | number[];
  color: { color: string; opacity: number; highlight: string };
  arrows: { to: { enabled: boolean; scaleFactor: number } };
  label?: string;
  font: { size: number; color: string; strokeWidth: number; strokeColor: string };
};

export function computeGroupClusterPositions(graph: WeightedGraph): Map<string, { x: number; y: number }> {
  const positions = new Map<string, { x: number; y: number }>();
  const nodesByGroup = new Map<string, typeof graph.nodes>();

  for (const node of graph.nodes) {
    const groupId = nodeIdPrefix(node.id);
    const bucket = nodesByGroup.get(groupId);
    if (bucket) bucket.push(node);
    else nodesByGroup.set(groupId, [node]);
  }

  const groupIds = [...nodesByGroup.keys()].sort((a, b) => a.localeCompare(b));
  const groupCount = groupIds.length;
  const ringRadius = groupCount <= 1 ? 0 : Math.max(240, 130 * Math.sqrt(groupCount));

  groupIds.forEach((groupId, groupIndex) => {
    const members = [...(nodesByGroup.get(groupId) ?? [])].sort((a, b) => a.id.localeCompare(b.id));
    const memberCount = members.length;
    const groupAngle = groupCount <= 1 ? 0 : (2 * Math.PI * groupIndex) / groupCount - Math.PI / 2;
    const centerX = ringRadius * Math.cos(groupAngle);
    const centerY = ringRadius * Math.sin(groupAngle);
    const clusterRadius = Math.max(42, Math.min(110, 24 + memberCount * 5.5));

    members.forEach((node, nodeIndex) => {
      const nodeAngle =
        memberCount <= 1 ? 0 : (2 * Math.PI * nodeIndex) / memberCount - Math.PI / 2;
      const hash = hashGroupId(node.id);
      const jitterX = ((hash % 13) - 6) * 1.8;
      const jitterY = (((hash >> 4) % 13) - 6) * 1.8;
      positions.set(node.id, {
        x: centerX + clusterRadius * Math.cos(nodeAngle) + jitterX,
        y: centerY + clusterRadius * Math.sin(nodeAngle) + jitterY,
      });
    });
  });

  return positions;
}

const HIGHLIGHT_COLOR = "#F4D35E";
const HIGHLIGHT_EDGE = "#FFD166";

export function graphToVis(
  graph: WeightedGraph,
  options?: { highlightedNodeIds?: Set<string>; highlightedEdgeIds?: Set<string> },
): { nodes: VisNode[]; edges: VisEdge[] } {
  const highlightedNodes = options?.highlightedNodeIds ?? new Set<string>();
  const highlightedEdges = options?.highlightedEdgeIds ?? new Set<string>();
  const degrees = computeDegrees(graph);
  const nodeIds = new Set(graph.nodes.map((n) => n.id));
  const groupColorMap = buildGroupColorMap(collectGroupIds(graph));
  const clusterPositions = computeGroupClusterPositions(graph);

  const nodes: VisNode[] = graph.nodes.map((node) => {
    const bg = groupColorForNode(node.id, groupColorMap);
    const degree = degrees.get(node.id) ?? 0;
    const position = clusterPositions.get(node.id);
    const highlighted = highlightedNodes.has(node.id);
    const nodeColor = highlighted ? HIGHLIGHT_COLOR : bg;
    return {
      id: node.id,
      label: shortLabel(node.label, 16),
      title: `${node.id}\n${node.label}\nGroup: ${nodeIdPrefix(node.id)}`,
      x: position?.x,
      y: position?.y,
      color: visNodeColor(nodeColor, highlighted ? 3 : 1.5),
      size: Math.min(36, 16 + degree * 2.2) + (highlighted ? 6 : 0),
      font: {
        size: 12,
        color: "#f1f5f9",
        face: "Inter, system-ui, sans-serif",
        strokeWidth: 3,
        strokeColor: "rgba(0, 0, 0, 0.65)",
      },
      _nodeType: node.type,
    };
  });

  const edges: VisEdge[] = graph.edges
    .filter((e) => nodeIds.has(e.source) && nodeIds.has(e.target))
    .map((edge) => {
      const stroke = groupColorForEdge(edge.source, edge.target, groupColorMap);
      const weightLabel =
        edge.weight != null ? formatWeightShort(edge.weight) : "unset";
      const highlighted = highlightedEdges.has(edge.id);
      const edgeColor = highlighted ? HIGHLIGHT_EDGE : stroke;
      return {
        id: edge.id,
        from: edge.source,
        to: edge.target,
        title: `${edge.label}\nWeight: ${weightLabel}`,
        width: edgeStrokeWidth(edge.weight) + (highlighted ? 2 : 0),
        dashes: edge.weight == null ? [8, 6] : false,
        color: {
          color: withAlpha(edgeColor, highlighted ? 0.95 : edge.weight == null ? 0.5 : 0.78),
          opacity: 1,
          highlight: withAlpha(edgeColor, 0.92),
        },
        arrows: { to: { enabled: true, scaleFactor: 0.65 } },
        font: {
          size: 11,
          color: "#e2e8f0",
          strokeWidth: 5,
          strokeColor: "rgba(0, 0, 0, 0.75)",
        },
      };
    });

  return { nodes, edges };
}

export function buildTypeLegend(graph: WeightedGraph) {
  const counts = new Map<string, number>();
  for (const node of graph.nodes) {
    counts.set(node.type, (counts.get(node.type) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([type, count]) => ({
      type,
      label: NODE_TYPE_LABELS[type] ?? type,
      color: NODE_TYPE_COLORS[type] ?? "#BAB0AC",
      count,
    }))
    .sort((a, b) => b.count - a.count);
}

export function filterGraphByNodeIds(graph: WeightedGraph, visibleNodeIds: Set<string>): WeightedGraph {
  if (visibleNodeIds.size === 0) {
    return { nodes: [], edges: [] };
  }

  const nodes = graph.nodes.filter((node) => visibleNodeIds.has(node.id));
  const visible = new Set(nodes.map((node) => node.id));
  const edges = graph.edges.filter(
    (edge) => visible.has(edge.source) && visible.has(edge.target),
  );

  return { nodes, edges };
}
