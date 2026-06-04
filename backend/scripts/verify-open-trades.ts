/**
 * List market→trade edges per TRD_* (open-only vs open+close).
 */
import { FalkorDB } from 'falkordb';
import { parseFalkorRows } from '../src/falkordb/falkordb-rows';

const GRAPH = 'user_117_publisher_v1';
const OPEN_ONLY = ['TRD_002', 'TRD_015', 'TRD_016', 'TRD_018', 'TRD_019', 'TRD_020'];

async function q(graph: Awaited<ReturnType<typeof FalkorDB.connect>>['selectGraph'], cypher: string) {
  const res = await graph.query(cypher);
  return parseFalkorRows(res);
}

async function main() {
  const client = await FalkorDB.connect({
    socket: { host: process.env.FALKORDB_HOST ?? 'localhost', port: Number(process.env.FALKORDB_PORT ?? 6380) },
  });
  const graph = client.selectGraph(GRAPH);

  const all = await q(
    graph,
    `MATCH (m)-[r]->(t) WHERE m.node_type = 'market' AND t.node_type = 'trade' RETURN m.node_id AS market, t.node_id AS trade, type(r) AS rel ORDER BY trade, rel`,
  );

  console.log(JSON.stringify({ allMarketTradeEdges: all }, null, 2));

  for (const tid of OPEN_ONLY) {
    const rows = await q(
      graph,
      `MATCH (m)-[r]->(t) WHERE t.node_id = '${tid}' RETURN m.node_id AS market, type(r) AS rel`,
    );
    console.log(tid, rows.length ? rows : 'MISSING');
  }

  const protocolNoTrade = await q(
    graph,
    `MATCH (p)-[:CONNECTED_TO]->(m) WHERE p.node_type = 'protocol' AND m.node_type = 'market' ` +
      `AND NOT (m)-[]->(:Trade) RETURN m.node_id AS market LIMIT 20`,
  );
  console.log('protocolMarketsWithoutOutgoingTrade:', protocolNoTrade);

  const counts = await q(graph, `MATCH ()-[r]->() RETURN count(r) AS c`);
  const snapLimit = await q(graph, `MATCH (a)-[r]->(b) RETURN a.node_id AS source, b.node_id AS target, type(r) AS type LIMIT 500`);
  console.log('totalEdges', counts[0]?.c, 'limit500returns', snapLimit.length);

  await client.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
