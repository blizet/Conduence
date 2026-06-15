import type {
  ForceGraphLink,
  ForceGraphNode,
  GraphEdge,
  GraphNode,
  LlmGraphResponse,
  PendingWeightQuestion,
  WeightedGraph,
} from "../shared/types.js";
import {
  clampWeight,
  edgeColor,
  edgeWidth,
  formatWeightShort,
} from "../shared/weight.js";

function slugify(label: string): string {
  return label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 48);
}

function uniqueId(base: string, existing: Set<string>): string {
  let id = base || "node";
  let i = 2;
  while (existing.has(id)) {
    id = `${base}_${i++}`;
  }
  existing.add(id);
  return id;
}

export function createEmptyGraph(): WeightedGraph {
  return { nodes: [], edges: [] };
}

export function applyLlmDelta(graph: WeightedGraph, delta: LlmGraphResponse): WeightedGraph {
  const nodeIds = new Set(graph.nodes.map((n) => n.id));
  const edgeIds = new Set(graph.edges.map((e) => e.id));
  const nodes = [...graph.nodes];
  const edges = [...graph.edges];

  for (const raw of delta.nodes ?? []) {
    const id = raw.id || uniqueId(slugify(raw.label), nodeIds);
    const idx = nodes.findIndex((n) => n.id === id);
    const node: GraphNode = { id, label: raw.label, type: raw.type };
    if (idx >= 0) nodes[idx] = node;
    else nodes.push(node);
  }

  for (const raw of delta.edges ?? []) {
    const id = raw.id || uniqueId(`${raw.source}_to_${raw.target}`, edgeIds);
    const idx = edges.findIndex((e) => e.id === id);
    const edge: GraphEdge = {
      id,
      source: raw.source,
      target: raw.target,
      label: raw.label,
      weight: raw.weight == null ? null : clampWeight(raw.weight),
      expectedSign: raw.expected_sign === -1 ? -1 : 1,
    };
    if (idx >= 0) {
      edges[idx] = {
        ...edges[idx],
        ...edge,
        weight: edge.weight ?? edges[idx].weight,
        expectedSign: edge.expectedSign ?? edges[idx].expectedSign,
      };
    } else {
      edges.push(edge);
    }
  }

  for (const update of delta.weight_updates ?? []) {
    const idx = edges.findIndex((e) => e.id === update.edge_id);
    if (idx >= 0) {
      edges[idx] = { ...edges[idx], weight: clampWeight(update.weight) };
    }
  }

  return { nodes, edges };
}

export function pendingWeightQuestions(graph: WeightedGraph): PendingWeightQuestion[] {
  const labelById = new Map(graph.nodes.map((n) => [n.id, n.label]));
  return graph.edges
    .filter((e) => e.weight == null)
    .map((edge) => {
      const sourceLabel = labelById.get(edge.source) ?? edge.source;
      const targetLabel = labelById.get(edge.target) ?? edge.target;
      const expectedSign = edge.expectedSign ?? 1;
      return {
        edgeId: edge.id,
        sourceLabel,
        targetLabel,
        expectedSign,
        question: "",
      };
    });
}

/** One compact numbered block — no paragraphs */
export function formatBatchWeightPrompt(pending: PendingWeightQuestion[]): string {
  if (!pending.length) return "";
  const lines = pending.map((q, i) => {
    const dir = q.expectedSign === 1 ? "direct" : "inverse";
    return `${i + 1}. ${q.sourceLabel} → ${q.targetLabel} (${dir})`;
  });
  return [
    "Weights [-1,1]. Reply numbered in one message (e.g. 1:0.8 2:-0.7 3:-0.6):",
    ...lines,
  ].join("\n");
}

export function graphIsComplete(graph: WeightedGraph): boolean {
  return graph.edges.length > 0 && graph.edges.every((e) => e.weight != null);
}

export function toForceGraph(graph: WeightedGraph): {
  nodes: ForceGraphNode[];
  links: ForceGraphLink[];
} {
  const nodes: ForceGraphNode[] = graph.nodes.map((n) => ({
    id: n.id,
    label: n.label,
    type: n.type,
  }));

  const links: ForceGraphLink[] = graph.edges.map((e) => ({
    id: e.id,
    source: e.source,
    target: e.target,
    label: e.label,
    weight: e.weight,
    color: edgeColor(e.weight),
    width: edgeWidth(e.weight),
  }));

  return { nodes, links };
}

export function graphSummary(graph: WeightedGraph): string {
  const nodes = graph.nodes.map((n) => `${n.id}:${n.label}`).join("; ") || "none";
  const edges =
    graph.edges
      .map((e) => {
        const w = formatWeightShort(e.weight);
        const d = e.expectedSign === -1 ? "-" : "+";
        return `${e.id}:${e.source}→${e.target}[${d}]${w}`;
      })
      .join("; ") || "none";
  return `nodes=${nodes}\nedges=${edges}`;
}
