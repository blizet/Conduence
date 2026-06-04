/**
 * Reproduce duplicate-edge ingest: MERGE same decision twice, log edge growth.
 * Run: npx tsx scripts/debug-duplicate-edges.ts
 */
import { FalkorDB } from 'falkordb';
import { readFileSync } from 'fs';
import { join } from 'path';
import { executeCypherDelta } from '../src/falkordb/cypher-delta';
import { computeGraphDelta, snapshotFromRows } from '../src/falkordb/graph-delta';
import { normalizeDecision } from '../src/lib/normalize';
import { DecisionEventSchema } from '../src/schemas/decision.schema';

const LOG_PATH =
  '/Users/sarthakdengre/Documents/MeProjects/verbose-train/.cursor/debug-cae35d.log';

function debugLog(message: string, data: Record<string, unknown>, hypothesisId: string) {
  const line = JSON.stringify({
    sessionId: 'cae35d',
    location: 'debug-duplicate-edges.ts',
    message,
    hypothesisId,
    data,
    timestamp: Date.now(),
    runId: 'repro',
  });
  fetch('http://127.0.0.1:7496/ingest/dfb4dba9-5fc5-473a-8eb3-a5f301e7ab7b', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': 'cae35d' },
    body: line,
  }).catch(() => {});
  try {
    require('fs').appendFileSync(LOG_PATH, line + '\n');
  } catch {
    /* ignore */
  }
}

async function countEdges(query: (c: string) => Promise<unknown>): Promise<number> {
  const r = (await query('MATCH ()-[r]->() RETURN count(r) AS c')) as { data?: unknown[] };
  const row = r?.data?.[0];
  return Array.isArray(row) ? Number(row[0]) : 0;
}

async function findDuplicatePairs(
  query: (c: string) => Promise<unknown>,
): Promise<{ source: string; target: string; type: string; c: number }[]> {
  const r = (await query(
    'MATCH (a)-[r]->(b) WHERE a.node_id IS NOT NULL AND b.node_id IS NOT NULL ' +
      'RETURN a.node_id, b.node_id, type(r), count(r) AS c ORDER BY c DESC LIMIT 20',
  )) as { headers?: string[]; data?: unknown[] };
  const out: { source: string; target: string; type: string; c: number }[] = [];
  for (const row of r.data ?? []) {
    if (!Array.isArray(row)) continue;
    out.push({
      source: String(row[0]),
      target: String(row[1]),
      type: String(row[2]),
      c: Number(row[3]),
    });
  }
  return out.filter((x) => x.c > 1);
}

async function main() {
  const raw = JSON.parse(
    readFileSync(join(__dirname, '../../data/decisions/dec-trd_004.json'), 'utf-8'),
  );
  const event = normalizeDecision(DecisionEventSchema.parse(raw));

  const client = await FalkorDB.connect({ socket: { host: 'localhost', port: 6380 } });
  const graph = client.selectGraph('debug_dup_edges_cae35d');
  try {
    await graph.delete();
  } catch {
    /* empty */
  }

  const q = (cypher: string, options?: { params?: Record<string, string | number | string[]> }) =>
    graph.query(cypher, options);

  const loadSnapshot = async () => {
    const nodesR = (await q(
      'MATCH (n) WHERE n.node_id IS NOT NULL RETURN n.node_id AS id',
    )) as { data?: unknown[] };
    const edgesR = (await q(
      'MATCH (a)-[r]->(b) WHERE a.node_id IS NOT NULL AND b.node_id IS NOT NULL RETURN a.node_id, b.node_id, type(r)',
    )) as { data?: unknown[] };
    const nodes = (nodesR.data ?? []).map((row) => ({
      id: String(Array.isArray(row) ? row[0] : ''),
    }));
    const edges = (edgesR.data ?? []).map((row) => ({
      source: String(Array.isArray(row) ? row[0] : ''),
      target: String(Array.isArray(row) ? row[1] : ''),
      type: String(Array.isArray(row) ? row[2] : ''),
    }));
    return snapshotFromRows(nodes, edges);
  };

  const runIngest = async (label: string) => {
    const edgeCountBefore = await countEdges((c) => q(c));
    const snap = await loadSnapshot();

    const delta = computeGraphDelta(snap, event);
    await executeCypherDelta((cypher, options) => q(cypher, options), { ...event, nodes: delta.nodes }, {
      edgeOps: delta.edgeOps,
      nodesSkipped: delta.stats.nodesSkipped,
      edgeOpsSkipped: delta.stats.edgeOpsSkipped,
    });

    const edgeCountAfter = await countEdges((c) => q(c));
    const dups = await findDuplicatePairs((c) => q(c));
    debugLog(label, {
      edgeCountBefore,
      edgeCountAfter,
      edgeGrowth: edgeCountAfter - edgeCountBefore,
      deltaStats: delta.stats,
      duplicatePairs: dups,
    }, 'A-B');
  };

  await runIngest('ingest_1');
  await runIngest('ingest_2_same_payload');

  await client.close();
  console.log('Done — see .cursor/debug-cae35d.log');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
