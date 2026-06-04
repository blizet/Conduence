/**
 * Relabel correlated-only nodes from :Market to :CorrelatedMarket (no position on that market).
 * Run: npx tsx scripts/relabel-correlated-markets.ts
 */
import { FalkorDB } from 'falkordb';

const GRAPH = process.env.FALKOR_GRAPH ?? 'user_117_publisher_v1';
const TRADE_RELS = ['OPEN_YES', 'OPEN_NO', 'CLOSE_YES', 'CLOSE_NO'];

async function main() {
  const client = await FalkorDB.connect({
    socket: {
      host: process.env.FALKORDB_HOST ?? 'localhost',
      port: Number(process.env.FALKORDB_PORT ?? 6380),
    },
  });
  const graph = client.selectGraph(GRAPH);

  const relList = TRADE_RELS.join('|');
  const countRes = await graph.query(
    `MATCH (m:Market) WHERE NOT (m)-[:${relList}]->(:Trade) ` +
      `AND (m)-[:CORRELATED_MARKET]-() RETURN count(m) AS c`,
  );
  const toRelabel = Number(countRes.data?.[0]?.[0] ?? 0);
  console.log(`Correlated-only Market nodes to relabel: ${toRelabel}`);

  if (toRelabel > 0) {
    await graph.query(
      `MATCH (m:Market) WHERE NOT (m)-[:${relList}]->(:Trade) ` +
        `AND (m)-[:CORRELATED_MARKET]-() ` +
        `SET m:CorrelatedMarket, m.node_type = 'correlated_market', m.correlated_peer = true ` +
        `REMOVE m:Market`,
    );
  }

  const cm = await graph.query(`MATCH (c:CorrelatedMarket) RETURN count(c) AS c`);
  const mk = await graph.query(
    `MATCH (m:Market)-[r]->(t:Trade) RETURN count(DISTINCT m) AS c`,
  );
  console.log(
    JSON.stringify(
      {
        correlatedMarketNodes: Number(cm.data?.[0]?.[0] ?? 0),
        anchorMarketsWithTrade: Number(mk.data?.[0]?.[0] ?? 0),
      },
      null,
      2,
    ),
  );

  await client.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
