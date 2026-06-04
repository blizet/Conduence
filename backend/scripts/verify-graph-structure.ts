/**
 * Inspect publisher graph structure: chains, orphans, user→market leaks.
 * Run: npx tsx scripts/verify-graph-structure.ts
 */
import { FalkorDB } from 'falkordb';
import { graphName } from '../src/lib/normalize';
import { parseFalkorRows, rowString } from '../src/falkordb/falkordb-rows';

const GRAPH_ID = process.env.PUBLISHER_GRAPH_ID ?? 'user_117.publisher.v1';

async function queryRows(
  graph: { query: (c: string) => Promise<unknown> },
  cypher: string,
): Promise<Record<string, string>[]> {
  const result = (await graph.query(cypher)) as { headers?: string[]; data?: unknown[] };
  return parseFalkorRows(result).map((row) => ({
    a: rowString(row, 'a', 'a.node_id', 'source', 'n.node_id'),
    b: rowString(row, 'b', 'b.node_id', 'target', 'm.node_id'),
    type: rowString(row, 'type', 'type(r)', 'rel'),
    t: rowString(row, 't', 'node_type', 'type'),
    id: rowString(row, 'id', 'node_id'),
    c: rowString(row, 'c', 'count'),
  }));
}

async function main() {
  const client = await FalkorDB.connect({ socket: { host: 'localhost', port: 6380 } });
  const key = graphName(GRAPH_ID);
  const graph = client.selectGraph(key);

  const nodeTypes = await queryRows(
    graph,
    'MATCH (n) WHERE n.node_id IS NOT NULL RETURN n.node_id AS id, n.node_type AS t ORDER BY t, id LIMIT 200',
  );

  const trades = nodeTypes.filter((r) => r.t === 'trade');
  const markets = nodeTypes.filter((r) => r.t === 'market');

  const userToMarket = await queryRows(
    graph,
    `MATCH (u)-[r]->(m) WHERE u.node_type = 'user' AND m.node_type = 'market' RETURN u.node_id AS a, m.node_id AS b, type(r) AS type LIMIT 50`,
  );

  const userToProtocol = await queryRows(
    graph,
    `MATCH (u)-[r]->(p) WHERE u.node_type = 'user' AND p.node_type = 'protocol' RETURN u.node_id AS a, p.node_id AS b, type(r) AS type LIMIT 20`,
  );

  const marketToTrade = await queryRows(
    graph,
    `MATCH (m)-[r]->(t) WHERE m.node_type = 'market' AND t.node_type = 'trade' RETURN m.node_id AS a, t.node_id AS b, type(r) AS type LIMIT 50`,
  );

  const tradeToLeaves = await queryRows(
    graph,
    `MATCH (t)-[r]->(x) WHERE t.node_type = 'trade' RETURN t.node_id AS a, x.node_id AS b, x.node_type AS t, type(r) AS type LIMIT 50`,
  );

  const correlated = await queryRows(
    graph,
    `MATCH (m1)-[r]->(m2) WHERE m1.node_type = 'market' AND m2.node_type = 'market' RETURN m1.node_id AS a, m2.node_id AS b, type(r) AS type LIMIT 30`,
  );

  const tradesNoIncoming = await queryRows(
    graph,
    `MATCH (t) WHERE t.node_type = 'trade' AND NOT ()-[]->(t) RETURN t.node_id AS id LIMIT 30`,
  );

  const report = {
    graph: key,
    nodeCounts: {
      trade: trades.length,
      market: markets.length,
      total: nodeTypes.length,
    },
    userToMarket: userToMarket.length,
    userToMarketSamples: userToMarket.slice(0, 5),
    userToProtocol: userToProtocol.length,
    marketToTrade: marketToTrade.length,
    marketToTradeSamples: marketToTrade.slice(0, 8),
    tradeToLeavesSamples: tradeToLeaves.slice(0, 8),
    correlatedMarketEdges: correlated.length,
    tradesWithNoIncoming: tradesNoIncoming.map((r) => r.id),
    tradeIds: trades.map((r) => r.id).slice(0, 10),
  };

  console.log(JSON.stringify(report, null, 2));

  const logPath =
    '/Users/sarthakdengre/Documents/MeProjects/verbose-train/.cursor/debug-cae35d.log';
  const line = JSON.stringify({
    sessionId: 'cae35d',
    location: 'verify-graph-structure.ts',
    message: 'graph_structure_audit',
    hypothesisId: 'H1-H5',
    data: report,
    timestamp: Date.now(),
    runId: 'structure-audit',
  });
  try {
    require('fs').appendFileSync(logPath, line + '\n');
  } catch {
    /* ignore */
  }

  await client.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
