/**
 * Markets without trades, user→market leaks, correlated-only markets.
 */
import { FalkorDB } from 'falkordb';
import { graphName } from '../src/lib/normalize';
import { parseFalkorRows, rowString } from '../src/falkordb/falkordb-rows';

const GRAPH_ID = process.env.PUBLISHER_GRAPH_ID ?? 'user_117.publisher.v1';

async function q(graph: { query: (c: string) => Promise<unknown> }, cypher: string) {
  const r = (await graph.query(cypher)) as { data?: unknown[] };
  return parseFalkorRows(r).map((row) => ({
    a: rowString(row, 'a', 'a.node_id', 'id', 'market_id'),
    b: rowString(row, 'b', 'b.node_id', 'target'),
    type: rowString(row, 'type', 'type(r)', 'rel'),
    c: rowString(row, 'c', 'count'),
  }));
}

async function main() {
  const client = await FalkorDB.connect({ socket: { host: 'localhost', port: 6380 } });
  const graph = client.selectGraph(graphName(GRAPH_ID));

  const userToMarket = await q(
    graph,
    `MATCH (u)-[r]->(m) WHERE u.node_type = 'user' AND m.node_type = 'market' RETURN u.node_id AS a, m.node_id AS b, type(r) AS type LIMIT 20`,
  );

  const allMarkets = await q(graph, `MATCH (m) WHERE m.node_type = 'market' RETURN m.node_id AS a`);
  const marketsWithTradeOut = await q(
    graph,
    `MATCH (m)-[r]->(t) WHERE m.node_type = 'market' AND t.node_type = 'trade' RETURN DISTINCT m.node_id AS a`,
  );
  const tradeOutSet = new Set(marketsWithTradeOut.map((x) => x.a));
  const marketsNoTradeSimple = allMarkets.filter((m) => !tradeOutSet.has(m.a));

  const protocolToMarket = await q(
    graph,
    `MATCH (p)-[r]->(m) WHERE p.node_type = 'protocol' AND m.node_type = 'market' AND type(r) = 'CONNECTED_TO' RETURN p.node_id AS a, m.node_id AS b`,
  );
  const marketWithProtocolOnly = protocolToMarket.filter((row) => !tradeOutSet.has(row.b));

  const correlatedTouches = await q(
    graph,
    `MATCH (m)-[r]-(m2) WHERE m.node_type = 'market' AND m2.node_type = 'market' AND type(r) = 'CORRELATED_MARKET' RETURN m.node_id AS a, m2.node_id AS b LIMIT 40`,
  );
  const protocolMarketSet = new Set(protocolToMarket.map((x) => x.b));
  const correlatedOnly = marketsNoTradeSimple.filter(
    (m) => !protocolMarketSet.has(m.a) && correlatedTouches.some((c) => c.a === m.a || c.b === m.a),
  );

  const tradeEdges = await q(
    graph,
    `MATCH (m)-[r]->(t) WHERE m.node_type = 'market' AND t.node_type = 'trade' RETURN m.node_id AS a, t.node_id AS b, type(r) AS type LIMIT 30`,
  );

  const report = {
    graph: graphName(GRAPH_ID),
    userToMarketCount: userToMarket.length,
    userToMarket,
    totalMarkets: allMarkets.length,
    marketsWithTradeEdge: tradeOutSet.size,
    marketsWithoutTradeEdge: marketsNoTradeSimple.length,
    marketsWithoutTradeEdgeSamples: marketsNoTradeSimple.map((x) => x.a).slice(0, 20),
    protocolToMarketButNoTrade: marketWithProtocolOnly.length,
    protocolToMarketButNoTradeSamples: marketWithProtocolOnly.slice(0, 12),
    correlatedOnlyNoProtocol: correlatedOnly.length,
    correlatedOnlySamples: correlatedOnly.map((x) => x.a).slice(0, 12),
    marketToTradeCount: tradeEdges.length,
    marketToTradeSamples: tradeEdges.slice(0, 8),
  };

  console.log(JSON.stringify(report, null, 2));
  await client.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
