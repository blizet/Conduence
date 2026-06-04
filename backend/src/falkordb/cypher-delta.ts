import type { DecisionEvent, GraphEdge } from '../schemas/decision.schema';

export type GraphQueryFn = (
  query: string,
  options?: { params?: Record<string, string | number | string[]> },
) => Promise<unknown>;

/** node_type "market" → label Market (matches Python .capitalize()) */
export function cypherNodeLabel(nodeType: string): string {
  const t = nodeType.trim().toLowerCase();
  if (!t) return 'Entity';
  return t.charAt(0).toUpperCase() + t.slice(1);
}

/** Safe relationship type for Cypher (e.g. BUY_YES, CORRELATED_MARKET) */
export function cypherRelType(edge: GraphEdge): string {
  if (edge.Action) {
    return edge.Action.replace(/\s+/g, '_').toUpperCase().replace(/[^A-Z0-9_]/g, '_');
  }
  const rel = edge.relationship_type ?? String(edge.metadata?.relationship_type ?? 'RELATED_TO');
  return rel.toUpperCase().replace(/[^A-Z0-9_]/g, '_') || 'RELATED_TO';
}

function targetIds(edge: GraphEdge): string[] {
  if (edge.target) return [edge.target];
  return [...(edge.targets ?? [])];
}

/**
 * Layer 1: node MERGE with created_at / last_seen_at
 * Layer 2: edge MERGE with thesis, conviction, tags, timestamp (+ bi-directional reverse)
 */
export async function executeCypherDelta(
  query: GraphQueryFn,
  payload: DecisionEvent,
): Promise<{ nodes: number; edges: number }> {
  const timestamp = payload.updated_at;
  let nodesWritten = 0;

  for (const node of payload.nodes) {
    const label = cypherNodeLabel(node.node_type);
    await query(
      `MERGE (n:${label} {node_id: $node_id}) ` +
        `ON CREATE SET n.created_at = $timestamp, n.node_type = $node_type ` +
        `ON MATCH SET n.last_seen_at = $timestamp, n.node_type = $node_type`,
      {
        params: {
          node_id: node.node_id,
          timestamp,
          node_type: node.node_type,
        },
      },
    );
    nodesWritten += 1;
  }

  let edgesWritten = 0;
  for (const edge of payload.edges) {
    const targets = targetIds(edge);
    const meta = edge.metadata ?? {};
    const relType = cypherRelType(edge);
    const edgeTimestamp = String(meta.timestamp ?? timestamp);
    const tags = Array.isArray(meta.tags) ? (meta.tags as string[]) : [];

    for (const targetId of targets) {
      const params = {
        source_id: edge.source,
        target_id: targetId,
        thesis: String(meta.thesis ?? ''),
        conviction: Number(meta.conviction_level ?? 0),
        tags,
        timestamp: edgeTimestamp,
      };

      await query(
        `MATCH (s) WHERE s.node_id = $source_id ` +
          `MATCH (t) WHERE t.node_id = $target_id ` +
          `MERGE (s)-[r:${relType}]->(t) ` +
          `ON CREATE SET r.thesis = $thesis, r.conviction = $conviction, ` +
          `              r.tags = $tags, r.timestamp = $timestamp ` +
          `ON MATCH SET r.last_updated = $timestamp`,
        { params },
      );
      edgesWritten += 1;

      if (edge.direction === 'bi-directional') {
        await query(
          `MATCH (s) WHERE s.node_id = $source_id ` +
            `MATCH (t) WHERE t.node_id = $target_id ` +
            `MERGE (t)-[r:${relType}]->(s) ` +
            `ON CREATE SET r.timestamp = $timestamp ` +
            `ON MATCH SET r.last_updated = $timestamp`,
          { params: { source_id: edge.source, target_id: targetId, timestamp: edgeTimestamp } },
        );
        edgesWritten += 1;
      }
    }
  }

  return { nodes: nodesWritten, edges: edgesWritten };
}
