/**
 * Rewrite publisher decisions: Open/Close lifecycle, clean correlated edges.
 * Run once: npx tsx scripts/migrate-decisions-lifecycle.ts
 */
import { readFileSync, writeFileSync, readdirSync, unlinkSync } from 'fs';
import { join } from 'path';

const REPO = join(__dirname, '../..');
const BATCH = join(REPO, 'data/sample/decisions-batch.json');
const DECISIONS_DIR = join(REPO, 'data/decisions');

/** Original trade id → position trade id to close (from legacy Sell events). */
const CLOSE_TRADE_OF: Record<string, string> = {
  TRD_003: 'TRD_001',
  TRD_005: 'TRD_004',
  TRD_007: 'TRD_006',
  TRD_010: 'TRD_008',
  TRD_012: 'TRD_009',
  TRD_014: 'TRD_011',
  TRD_017: 'TRD_013',
};

type RawNode = { node_id: string; node_type: string; properties?: object; label?: string };
type RawEdge = Record<string, unknown>;
type RawEvent = {
  graph_id: string;
  updated_at: string;
  nodes: RawNode[];
  edges: RawEdge[];
};

function mapAction(action: string, isClose: boolean): string {
  const m = action.match(/^(Buy|Sell|Open|Close)\s+(YES|NO)$/i);
  if (!m) return action;
  const verb = m[1].toLowerCase();
  const side = m[2].toUpperCase();
  if (verb === 'open' || verb === 'close') return `${verb[0].toUpperCase()}${verb.slice(1)} ${side}`;
  return isClose ? `Close ${side}` : `Open ${side}`;
}

function tradeIdFromEvent(event: RawEvent): string | null {
  for (const e of event.edges) {
    if (e.Action && typeof e.target === 'string') return e.target;
  }
  return null;
}

function primaryMarketForTrade(event: RawEvent, tradeId: string): string | null {
  for (const e of event.edges) {
    if (e.Action && e.target === tradeId && typeof e.source === 'string') return e.source;
  }
  return null;
}

function transformEvent(event: RawEvent): RawEvent {
  const originalTradeId = tradeIdFromEvent(event);
  if (!originalTradeId) return event;

  const closeOf = CLOSE_TRADE_OF[originalTradeId];
  const isClose = Boolean(closeOf);
  const tradeId = closeOf ?? originalTradeId;
  const nodeMap = new Map(event.nodes.map((n) => [n.node_id, n]));

  const cleanEdges: RawEdge[] = [];
  const endpointIds = new Set<string>();

  for (const e of event.edges) {
    if (e.metadata && (e.metadata as { direction?: string }).direction === 'reverse') continue;

    const edge: RawEdge = { ...e };
    if (edge.Action && typeof edge.Action === 'string') {
      edge.Action = mapAction(edge.Action, isClose);
      edge.metadata = {
        ...(edge.metadata as object),
        action: edge.Action,
        lifecycle: isClose ? 'close' : 'open',
      };
    }
    if (edge.source === originalTradeId) edge.source = tradeId;
    if (edge.target === originalTradeId) edge.target = tradeId;

    const src = String(edge.source ?? '');
    const tgt = typeof edge.target === 'string' ? edge.target : '';
    if (src) endpointIds.add(src);
    if (tgt) endpointIds.add(tgt);
    if (Array.isArray(edge.targets)) {
      for (const t of edge.targets) endpointIds.add(String(t));
    }

    if (!isClose) {
      if (src === tradeId && tgt) {
        const n = nodeMap.get(tgt);
        if (n && (n.node_type === 'outcome' || n.node_type === 'feedback')) continue;
      }
    } else if (edge.Action && edge.target === tradeId) {
      edge.metadata = {
        ...(edge.metadata as object),
        position_trade_id: tradeId,
        closes_decision: `dec-trd_${tradeId.replace('TRD_', '')}-open`,
      };
    }
    cleanEdges.push(edge);
  }

  const primaryMarket = primaryMarketForTrade(event, originalTradeId);
  const nodes: RawNode[] = [];
  for (const id of endpointIds) {
    let node = nodeMap.get(id);
    if (!node && id === tradeId) node = nodeMap.get(originalTradeId);
    if (node) {
      const nodeId =
        id === tradeId || node.node_id === originalTradeId ? tradeId : node.node_id;
      nodes.push({ ...node, node_id: nodeId });
    } else if (id === tradeId) {
      nodes.push({ node_id: tradeId, node_type: 'trade' });
    } else if (id.startsWith('OUT_')) {
      nodes.push({ node_id: id, node_type: 'outcome' });
    } else if (id.startsWith('FB_')) {
      nodes.push({ node_id: id, node_type: 'feedback' });
    } else if (id === 'user_117') {
      nodes.push({ node_id: id, node_type: 'user' });
    } else if (id === 'Polymarket' || id === 'Kalshi') {
      nodes.push({ node_id: id, node_type: 'protocol' });
    } else {
      nodes.push({ node_id: id, node_type: 'market' });
    }
  }

  const num = tradeId.replace('TRD_', '');
  return {
    schema_version: '1.0',
    graph_id: 'user_117.publisher.v1',
    updated_at: event.updated_at,
    operation: isClose ? 'revise' : 'assert',
    decision_id: isClose ? `dec-trd_${num}-close` : `dec-trd_${num}-open`,
    nodes,
    edges: cleanEdges,
  };
}

function main() {
  const raw = JSON.parse(readFileSync(BATCH, 'utf-8')) as RawEvent[];
  const transformed = raw.map(transformEvent);

  writeFileSync(BATCH, JSON.stringify(transformed, null, 2) + '\n');

  for (const f of readdirSync(DECISIONS_DIR)) {
    if (/^dec-trd_\d+(-open|-close)?\.json$/.test(f)) unlinkSync(join(DECISIONS_DIR, f));
  }

  for (const event of transformed) {
    const tid = tradeIdFromEvent(event);
    if (!tid) continue;
    const num = tid.replace('TRD_', '');
    const name =
      event.operation === 'revise' ? `dec-trd_${num}-close.json` : `dec-trd_${num}-open.json`;
    writeFileSync(join(DECISIONS_DIR, name), JSON.stringify(event, null, 2) + '\n');
  }

  console.log(`Migrated ${transformed.length} events → batch + ${transformed.length} decision files.`);
}

main();
