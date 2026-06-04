import type { Edge, Node } from '@xyflow/react';

export type SnapshotNode = { id: string; type: string };
export type SnapshotEdge = { source: string; target: string; type: string };

const LAYER: Record<string, number> = {
  user: 0,
  agent: 1,
  protocol: 2,
  market: 3,
  trade: 4,
  outcome: 5,
  feedback: 5,
  observation: 3,
};

const LAYER_HEIGHT = 100;
const NODE_WIDTH = 170;
const SIBLING_GAP = 24;
const CORRELATED_COLOR = '#868e96';

function layerOf(type: string): number {
  const key = type.toLowerCase();
  return LAYER[key] ?? 3;
}

function isCorrelatedEdge(type: string): boolean {
  return /CORRELATED/i.test(type);
}

function findUserRoot(nodes: SnapshotNode[]): string | null {
  const user = nodes.find((n) => n.type.toLowerCase() === 'user' || /^user_/i.test(n.id));
  return user?.id ?? nodes[0]?.id ?? null;
}

/** Place correlated markets as side siblings of their anchor market (same row). */
function placeCorrelatedSideBranches(
  rawEdges: SnapshotEdge[],
  nodeMap: Map<string, SnapshotNode>,
  positions: Map<string, { x: number; y: number }>,
): void {
  const sideCountByAnchor = new Map<string, number>();

  for (const e of rawEdges) {
    if (!isCorrelatedEdge(e.type)) continue;
    const anchor = e.source;
    const target = e.target;
    if (!positions.has(anchor) || !nodeMap.has(target)) continue;
    if (nodeMap.get(target)!.type.toLowerCase() !== 'market') continue;

    const anchorPos = positions.get(anchor)!;
    const idx = sideCountByAnchor.get(anchor) ?? 0;
    sideCountByAnchor.set(anchor, idx + 1);

    if (!positions.has(target)) {
      positions.set(target, {
        x: anchorPos.x + (NODE_WIDTH + SIBLING_GAP) * (idx + 1),
        y: anchorPos.y,
      });
    }
  }
}

/** Build a user-rooted tree; correlated markets = dotted side branches from anchor market. */
export function layoutTree(
  rawNodes: SnapshotNode[],
  rawEdges: SnapshotEdge[],
  accent: string,
): { nodes: Node[]; edges: Edge[] } {
  if (!rawNodes.length) return { nodes: [], edges: [] };

  const nodeMap = new Map(rawNodes.map((n) => [n.id, n]));
  const rootId = findUserRoot(rawNodes);
  if (!rootId) {
    return layoutFallbackGrid(rawNodes, rawEdges, accent);
  }

  const children = new Map<string, { target: string; type: string }[]>();
  for (const e of rawEdges) {
    if (!nodeMap.has(e.source) || !nodeMap.has(e.target)) continue;
    if (isCorrelatedEdge(e.type)) continue;
    const list = children.get(e.source) ?? [];
    list.push({ target: e.target, type: e.type });
    children.set(e.source, list);
  }

  for (const [, list] of children) {
    list.sort((a, b) => layerOf(nodeMap.get(a.target)!.type) - layerOf(nodeMap.get(b.target)!.type));
  }

  const positions = new Map<string, { x: number; y: number }>();
  const placed = new Set<string>();

  function assignSubtree(nodeId: string, depth: number, xCenter: number, span: number): number {
    if (placed.has(nodeId)) return xCenter;
    placed.add(nodeId);
    positions.set(nodeId, { x: xCenter, y: depth * LAYER_HEIGHT });

    const kids = (children.get(nodeId) ?? []).filter((k) => !placed.has(k.target));
    if (!kids.length) return span;

    let cursor = xCenter - ((kids.length - 1) * (NODE_WIDTH + SIBLING_GAP)) / 2;
    for (const kid of kids) {
      const w = assignSubtree(kid.target, depth + 1, cursor, NODE_WIDTH + SIBLING_GAP);
      cursor += w;
    }
    return Math.max(span, kids.length * (NODE_WIDTH + SIBLING_GAP));
  }

  assignSubtree(rootId, 0, 0, NODE_WIDTH);
  placeCorrelatedSideBranches(rawEdges, nodeMap, positions);

  let orphanX = 0;
  for (const n of rawNodes) {
    if (positions.has(n.id)) continue;
    const layer = layerOf(n.type);
    positions.set(n.id, { x: orphanX, y: layer * LAYER_HEIGHT });
    orphanX += NODE_WIDTH + SIBLING_GAP;
  }

  const nodes: Node[] = rawNodes
    .filter((n) => positions.has(n.id))
    .map((n) => {
      const pos = positions.get(n.id)!;
      const t = n.type.toLowerCase();
      const isAgent = t === 'agent';
      const isTrade = t === 'trade';
      const isUser = t === 'user';
      const isMarket = t === 'market';
      return {
        id: n.id,
        data: { label: `${n.id}\n(${n.type})` },
        position: { x: pos.x, y: pos.y },
        style: {
          background: isUser ? '#364fc7' : isAgent ? '#2b8a3e' : isTrade ? '#e67700' : '#212529',
          color: '#fff',
          border: `2px solid ${isAgent || isUser || isTrade ? accent : isMarket ? '#495057' : '#495057'}`,
          fontSize: 10,
          padding: 8,
          borderRadius: 8,
          width: NODE_WIDTH,
          textAlign: 'center' as const,
        },
      };
    });

  const placedIds = new Set(nodes.map((n) => n.id));
  const edges: Edge[] = rawEdges
    .filter((e) => placedIds.has(e.source) && placedIds.has(e.target))
    .map((e, i) => {
      const correlated = isCorrelatedEdge(e.type);
      return {
        id: `e-${i}-${e.source}-${e.target}`,
        source: e.source,
        target: e.target,
        label: correlated ? 'correlated' : e.type.replace(/_/g, ' '),
        animated: !correlated && /BUY|SELL|OBSERVED/i.test(e.type),
        style: {
          stroke: correlated ? CORRELATED_COLOR : /HAS_AGENT|OBSERVED/i.test(e.type) ? '#63e6be' : accent,
          strokeWidth: correlated ? 1.5 : 2,
          strokeDasharray: correlated ? '6 4' : undefined,
        },
      };
    });

  return { nodes, edges };
}

function layoutFallbackGrid(
  rawNodes: SnapshotNode[],
  rawEdges: SnapshotEdge[],
  accent: string,
): { nodes: Node[]; edges: Edge[] } {
  const cols = Math.ceil(Math.sqrt(rawNodes.length));
  const nodes: Node[] = rawNodes.map((n, i) => ({
    id: n.id,
    data: { label: `${n.id}\n(${n.type})` },
    position: { x: (i % cols) * 200, y: Math.floor(i / cols) * 90 },
    style: {
      background: '#212529',
      color: '#fff',
      border: `1px solid ${accent}`,
      fontSize: 10,
      padding: 6,
      borderRadius: 6,
      width: 160,
    },
  }));
  const edges: Edge[] = rawEdges.map((e, i) => {
    const correlated = isCorrelatedEdge(e.type);
    return {
      id: `e-${i}`,
      source: e.source,
      target: e.target,
      label: e.type,
      style: {
        stroke: correlated ? CORRELATED_COLOR : accent,
        strokeDasharray: correlated ? '6 4' : undefined,
      },
    };
  });
  return { nodes, edges };
}
