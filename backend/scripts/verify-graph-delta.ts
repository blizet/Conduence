/**
 * Verify mergeCotDelta diff path: same decision twice → second ingest skips all ops.
 */
import { FalkorDB } from 'falkordb';
import { readFileSync } from 'fs';
import { join } from 'path';
import { executeCypherDelta } from '../src/falkordb/cypher-delta';
import { computeGraphDelta, snapshotFromRows } from '../src/falkordb/graph-delta';
import { parseFalkorRows, rowString } from '../src/falkordb/falkordb-rows';
import { graphName, normalizeDecision } from '../src/lib/normalize';
import { DecisionEventSchema } from '../src/schemas/decision.schema';

async function loadSnapshot(graph: { query: (c: string) => Promise<unknown> }) {
  const nodesR = (await graph.query(
    'MATCH (n) WHERE n.node_id IS NOT NULL RETURN n.node_id AS id',
  )) as { headers?: string[]; data?: unknown[] };
  const edgesR = (await graph.query(
    'MATCH (a)-[r]->(b) WHERE a.node_id IS NOT NULL AND b.node_id IS NOT NULL RETURN a.node_id AS source, b.node_id AS target, type(r) AS type',
  )) as { headers?: string[]; data?: unknown[] };
  const nodes = parseFalkorRows(nodesR).map((row) => ({
    id: rowString(row, 'id', 'n.node_id'),
  }));
  const edges = parseFalkorRows(edgesR).map((row) => ({
    source: rowString(row, 'source', 'a.node_id'),
    target: rowString(row, 'target', 'b.node_id'),
    type: rowString(row, 'type', 'type(r)'),
  }));
  return snapshotFromRows(nodes, edges);
}

async function main() {
  const raw = JSON.parse(
    readFileSync(join(__dirname, '../../data/decisions/dec-trd_004.json'), 'utf-8'),
  );
  const event = normalizeDecision(DecisionEventSchema.parse(raw));
  const client = await FalkorDB.connect({ socket: { host: 'localhost', port: 6380 } });
  const graph = client.selectGraph(graphName(event.graph_id));
  try {
    await graph.delete();
  } catch {
    /* empty */
  }

  for (let i = 1; i <= 2; i++) {
    const snap = await loadSnapshot(graph);
    const delta = computeGraphDelta(snap, event);
    await executeCypherDelta((cypher, options) => graph.query(cypher, options), {
      ...event,
      nodes: delta.nodes,
    }, {
      edgeOps: delta.edgeOps,
      nodesSkipped: delta.stats.nodesSkipped,
      edgeOpsSkipped: delta.stats.edgeOpsSkipped,
    });
    console.log(`run_${i}`, delta.stats);
  }

  const dup = (await graph.query(
    'MATCH (a)-[r]->(b) WHERE a.node_id IS NOT NULL AND b.node_id IS NOT NULL ' +
      'RETURN a.node_id, b.node_id, type(r), count(r) AS c ORDER BY c DESC LIMIT 5',
  )) as { data?: unknown[] };
  console.log('top_edges', dup.data);
  await client.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
