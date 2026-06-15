import Supermemory from "supermemory";

import type { GraphEdge, GraphNode, NodeType, WeightedGraph } from "../shared/types.js";
import { clampWeight } from "../shared/weight.js";

export const CAUSAL_GRAPH_ENTITY_CONTEXT = `Weighted causal market/geopolitics graph.
Nodes: events, assets, markets. Edges: directed cause→effect with signed weight in [-1,1].
+weight = direct (0 to 1), -weight = inverse (-1 to 0). Update when user revises a link.`;

let client: Supermemory | null = null;
const containerContextSet = new Set<string>();

/** Same init as supermemory/test.ts — reads SUPERMEMORY_API_KEY from env */
export function getSupermemoryClient(): Supermemory | null {
  if (!process.env.SUPERMEMORY_API_KEY?.trim()) return null;
  if (!client) client = new Supermemory();
  return client;
}

export function isSupermemoryConfigured(): boolean {
  return Boolean(process.env.SUPERMEMORY_API_KEY?.trim());
}

type ProfileResult = Awaited<ReturnType<Supermemory["profile"]>>;

/** Mirrors supermemory/test.ts context formatting */
export function formatProfileContext(profile: ProfileResult): string {
  const staticLines = profile.profile?.static?.join("\n") ?? "";
  const dynamicLines = profile.profile?.dynamic?.join("\n") ?? "";
  const results = (profile.searchResults?.results ?? []) as Array<{ memory?: string }>;
  const memories = results.map((r) => r.memory).filter(Boolean).join("\n");

  const parts: string[] = [];
  if (staticLines) parts.push(`Static profile:\n${staticLines}`);
  if (dynamicLines) parts.push(`Dynamic profile:\n${dynamicLines}`);
  if (memories) parts.push(`Relevant memories:\n${memories}`);
  return parts.join("\n\n");
}

export async function fetchSupermemoryContext(
  containerTag: string,
  query: string,
): Promise<{ context: string | null; memories: string[] }> {
  const sm = getSupermemoryClient();
  if (!sm) return { context: null, memories: [] };
  try {
    await ensureContainerContext(containerTag);
    const profile = await sm.profile({ containerTag, q: query });
    const results = (profile.searchResults?.results ?? []) as Array<{ memory?: string }>;
    const memories = results.map((r) => r.memory).filter(Boolean) as string[];
    return { context: formatProfileContext(profile), memories };
  } catch (err) {
    console.warn("Supermemory profile failed:", err instanceof Error ? err.message : err);
    return { context: null, memories: [] };
  }
}

async function ensureContainerContext(containerTag: string): Promise<void> {
  if (containerContextSet.has(containerTag)) return;
  const sm = getSupermemoryClient();
  if (!sm) return;
  try {
    const tags = sm as Supermemory & {
      containerTags?: { update: (tag: string, body: { entityContext: string }) => Promise<unknown> };
    };
    if (tags.containerTags?.update) {
      await tags.containerTags.update(containerTag, { entityContext: CAUSAL_GRAPH_ENTITY_CONTEXT });
    }
    containerContextSet.add(containerTag);
  } catch {
    containerContextSet.add(containerTag);
  }
}

function slugify(label: string): string {
  return label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 48);
}

function inferNodeType(label: string): NodeType {
  const l = label.toLowerCase();
  if (/war|election|policy|trump|iran|conflict|event/.test(l)) return "event";
  if (/oil|btc|bitcoin|eth|crypto|gold|stock|asset/.test(l)) return "asset";
  if (/market|price|index|sector/.test(l)) return "market";
  return "concept";
}

function upsertNode(nodes: Map<string, GraphNode>, label: string): string {
  const id = slugify(label);
  if (!nodes.has(id)) {
    nodes.set(id, { id, label, type: inferNodeType(label) });
  }
  return id;
}

/** Parse Supermemory memories (from profile/search) into a weighted graph */
export function graphFromMemories(memories: string[]): WeightedGraph {
  const nodes = new Map<string, GraphNode>();
  const edges = new Map<string, GraphEdge>();

  const cotEdgeRe =
    /cot_edge\|([^|]+)\|([^|]+)\|([^|]+)\|([^|]+)\|([-+]?\d*\.?\d+)\|(direct|inverse)/gi;
  const assignedRe =
    /edge ['"]([^'"]+)['"] → ['"]([^'"]+)['"][^.\n]*weight ([-+]?\d*\.?\d+)/gi;
  const causalRe = /causal link: ['"]([^'"]+)['"] → ['"]([^'"]+)['"]/gi;

  const text = memories.join("\n");

  for (const m of text.matchAll(cotEdgeRe)) {
    const [, sourceId, sourceLabel, targetId, targetLabel, weightRaw, dir] = m;
    const weight = clampWeight(Number(weightRaw));
    nodes.set(sourceId, { id: sourceId, label: sourceLabel, type: inferNodeType(sourceLabel) });
    nodes.set(targetId, { id: targetId, label: targetLabel, type: inferNodeType(targetLabel) });
    edges.set(`${sourceId}_to_${targetId}`, {
      id: `${sourceId}_to_${targetId}`,
      source: sourceId,
      target: targetId,
      label: `${sourceLabel} → ${targetLabel}`,
      weight,
      expectedSign: dir.toLowerCase() === "inverse" ? -1 : 1,
    });
  }

  for (const m of text.matchAll(assignedRe)) {
    const [, sourceLabel, targetLabel, weightRaw] = m;
    const source = upsertNode(nodes, sourceLabel);
    const target = upsertNode(nodes, targetLabel);
    const weight = clampWeight(Number(weightRaw));
    const id = `${source}_to_${target}`;
    edges.set(id, {
      id,
      source,
      target,
      label: `${sourceLabel} → ${targetLabel}`,
      weight,
      expectedSign: weight >= 0 ? 1 : -1,
    });
  }

  for (const m of text.matchAll(causalRe)) {
    const [, sourceLabel, targetLabel] = m;
    const source = upsertNode(nodes, sourceLabel);
    const target = upsertNode(nodes, targetLabel);
    const id = `${source}_to_${target}`;
    if (edges.has(id)) continue;
    const fall = /fall|decrease|down/.test(m[0].toLowerCase());
    edges.set(id, {
      id,
      source,
      target,
      label: `${sourceLabel} → ${targetLabel}`,
      weight: null,
      expectedSign: fall ? -1 : 1,
    });
  }

  return { nodes: [...nodes.values()], edges: [...edges.values()] };
}

export async function loadGraphFromSupermemory(containerTag: string): Promise<WeightedGraph> {
  const { memories } = await fetchSupermemoryContext(
    containerTag,
    "weighted causal graph edges and nodes",
  );
  return graphFromMemories(memories);
}

function formatCotEdgeLine(edge: GraphEdge, nodes: Map<string, GraphNode>): string {
  const src = nodes.get(edge.source);
  const tgt = nodes.get(edge.target);
  const dir = (edge.weight ?? edge.expectedSign ?? 1) >= 0 ? "direct" : "inverse";
  const w = edge.weight ?? 0;
  return `cot_edge|${edge.source}|${src?.label ?? edge.source}|${edge.target}|${tgt?.label ?? edge.target}|${w}|${dir}`;
}

/** Persist like test.ts: add turn + structured edge facts */
export async function persistToSupermemory(
  containerTag: string,
  lastUserMessage: string,
  lastAssistantMessage: string,
  graph: WeightedGraph,
): Promise<void> {
  const sm = getSupermemoryClient();
  if (!sm) return;

  try {
    await ensureContainerContext(containerTag);

    await sm.add({
      containerTag,
      content: `user: ${lastUserMessage}\nassistant: ${lastAssistantMessage}`,
    });

    const nodeMap = new Map(graph.nodes.map((n) => [n.id, n]));
    const weighted = graph.edges.filter((e) => e.weight != null);
    if (weighted.length) {
      const edgeLines = weighted.map((e) => formatCotEdgeLine(e, nodeMap)).join("\n");
      await sm.add({
        containerTag,
        content: `Confirmed causal edges (weight [-1,1]):\n${edgeLines}`,
      });
    }
  } catch (err) {
    console.warn("Supermemory add failed:", err instanceof Error ? err.message : err);
  }
}
