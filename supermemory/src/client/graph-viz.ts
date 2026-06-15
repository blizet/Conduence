import type { WeightedGraph } from "../shared/types";
import { formatWeightShort } from "../shared/weight";

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

export function edgeStrokeColor(weight: number | null, expectedSign?: 1 | -1): string {
  if (weight == null) return "rgba(91, 141, 239, 0.55)";
  if (weight > 0) return "rgba(34, 197, 94, 0.85)";
  if (weight < 0) return "rgba(239, 68, 68, 0.85)";
  return "rgba(148, 163, 184, 0.6)";
}

export function edgeStrokeWidth(weight: number | null): number {
  if (weight == null) return 1.5;
  return 1.5 + Math.abs(weight) * 3;
}

export type VisNode = {
  id: string;
  label: string;
  title: string;
  color: {
    background: string;
    border: string;
    highlight: { background: string; border: string };
  };
  size: number;
  font: { size: number; color: string; face: string };
  _nodeType: string;
};

export type VisEdge = {
  id: string;
  from: string;
  to: string;
  title: string;
  width: number;
  dashes: boolean;
  color: { color: string; opacity: number; highlight: string };
  arrows: { to: { enabled: boolean; scaleFactor: number } };
  label?: string;
  font: { size: number; color: string; strokeWidth: number; strokeColor: string };
};

export function graphToVis(graph: WeightedGraph): { nodes: VisNode[]; edges: VisEdge[] } {
  const degrees = computeDegrees(graph);
  const nodeIds = new Set(graph.nodes.map((n) => n.id));

  const nodes: VisNode[] = graph.nodes.map((node) => {
    const bg = NODE_TYPE_COLORS[node.type] ?? "#BAB0AC";
    const degree = degrees.get(node.id) ?? 0;
    return {
      id: node.id,
      label: shortLabel(node.label),
      title: `${node.label}\nType: ${NODE_TYPE_LABELS[node.type] ?? node.type}`,
      color: {
        background: bg,
        border: bg,
        highlight: { background: "#ffffff", border: bg },
      },
      size: Math.min(32, 14 + degree * 2.5),
      font: { size: 11, color: "#e8eaed", face: "Inter, system-ui, sans-serif" },
      _nodeType: node.type,
    };
  });

  const edges: VisEdge[] = graph.edges
    .filter((e) => nodeIds.has(e.source) && nodeIds.has(e.target))
    .map((edge) => {
      const color = edgeStrokeColor(edge.weight, edge.expectedSign);
      const weightLabel =
        edge.weight != null ? formatWeightShort(edge.weight) : "unset";
      return {
        id: edge.id,
        from: edge.source,
        to: edge.target,
        title: `${edge.label}\nWeight: ${weightLabel}`,
        width: edgeStrokeWidth(edge.weight),
        dashes: edge.weight == null,
        color: { color, opacity: 0.9, highlight: "#ffffff" },
        arrows: { to: { enabled: true, scaleFactor: 0.55 } },
        label: weightLabel,
        font: {
          size: 10,
          color: "#cbd5e1",
          strokeWidth: 4,
          strokeColor: "#000000",
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
