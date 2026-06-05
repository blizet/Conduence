import type { DecisionEvent, GraphEdge } from '../schemas/decision.schema';
import type { EdgeOperation } from './graph-delta';
import { expandEdgeOperations } from './graph-delta';

export type GraphQueryFn = (
  query: string,
  options?: { params?: Record<string, string | number | string[]> },
) => Promise<unknown>;

export type CypherDeltaResult = {
  nodes: number;
  edges: number;
  nodesCreated: number;
  edgesCreated: number;
  nodesSkipped: number;
  edgeOpsSkipped: number;
};

/** node_type → FalkorDB label (e.g. market → Market, correlated_market → CorrelatedMarket). */
export function cypherNodeLabel(nodeType: string): string {
  const t = nodeType.trim().toLowerCase();
  if (!t) return 'Entity';
  if (t === 'correlated_market') return 'CorrelatedMarket';
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

async function countQuery(query: GraphQueryFn, cypher: string): Promise<number> {
  const result = (await query(cypher)) as { data?: unknown[] };
  const row = result?.data?.[0];
  if (Array.isArray(row)) return Number(row[0] ?? 0);
  if (row && typeof row === 'object' && 'c' in row) return Number((row as { c: number }).c);
  return 0;
}

/**
 * MERGE only the provided nodes and edge operations (caller applies graph diff).
 */
export async function executeCypherDelta(
  query: GraphQueryFn,
  payload: DecisionEvent,
  options?: { edgeOps?: EdgeOperation[]; nodesSkipped?: number; edgeOpsSkipped?: number },
): Promise<CypherDeltaResult> {
  const timestamp = payload.updated_at;
  const edgesBefore = await countQuery(query, 'MATCH ()-[r]->() RETURN count(r) AS c');

  for (const node of payload.nodes) {
    const props = node.properties ?? {};
    const anchor = props.anchor === true ? 1 : 0;
    const correlatedPeer = props.correlated_peer === true ? 1 : 0;

    await query(
      `MERGE (n:${cypherNodeLabel(node.node_type)} {node_id: $node_id}) ` +
        `ON CREATE SET n.created_at = $timestamp, n.node_type = $node_type, ` +
        `              n.anchor = $anchor, n.correlated_peer = $correlated_peer ` +
        `ON MATCH SET n.last_seen_at = $timestamp, n.node_type = $node_type, ` +
        `             n.anchor = ($anchor > 0), n.correlated_peer = ($correlated_peer > 0)`,
      {
        params: {
          node_id: node.node_id,
          timestamp,
          node_type: node.node_type,
          anchor,
          correlated_peer: correlatedPeer,
        },
      },
    );
  }

  const edgeOps = options?.edgeOps ?? expandEdgeOperations(payload.edges);

  for (const op of edgeOps) {
    const edge = op.edge;
    const meta = edge.metadata ?? {};
    const relType = op.relType;
    const edgeTimestamp = String(meta.timestamp ?? timestamp);
    const tags = Array.isArray(meta.tags) ? (meta.tags as string[]) : [];

    const params = {
      source_id: op.source,
      target_id: op.target,
      thesis: String(meta.thesis ?? ''),
      conviction: Number(meta.conviction_level ?? 0),
      tags,
      timestamp: edgeTimestamp,
    };

    if (op.isReverse) {
      await query(
        `MATCH (s) WHERE s.node_id = $source_id ` +
          `MATCH (t) WHERE t.node_id = $target_id ` +
          `MERGE (s)-[r:${relType}]->(t) ` +
          `ON CREATE SET r.timestamp = $timestamp ` +
          `ON MATCH SET r.last_updated = $timestamp`,
        { params },
      );
      continue;
    }

    await query(
      `MATCH (s) WHERE s.node_id = $source_id ` +
        `MATCH (t) WHERE t.node_id = $target_id ` +
        `MERGE (s)-[r:${relType}]->(t) ` +
        `ON CREATE SET r.thesis = $thesis, r.conviction = $conviction, ` +
        `              r.tags = $tags, r.timestamp = $timestamp ` +
        `ON MATCH SET r.last_updated = $timestamp`,
      { params },
    );
  }

  const edgesAfter = await countQuery(query, 'MATCH ()-[r]->() RETURN count(r) AS c');
  const edgeDelta = edgesAfter - edgesBefore;

  return {
    nodes: payload.nodes.length,
    edges: edgeOps.length,
    nodesCreated: payload.nodes.length,
    edgesCreated: edgeDelta,
    nodesSkipped: options?.nodesSkipped ?? 0,
    edgeOpsSkipped: options?.edgeOpsSkipped ?? 0,
  };
}
