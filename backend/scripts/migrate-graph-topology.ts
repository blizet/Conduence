/**
 * One-time migration: eth.market.v1 + publisher_agent → per-user publisher/seeker graphs.
 * Run: npx tsx scripts/migrate-graph-topology.ts
 */
import { readFileSync, writeFileSync, readdirSync } from 'fs';
import { join } from 'path';
import {
  agentNodeId,
  graphIdFor,
  primaryUserNodeId,
  userSlugFromNodeId,
} from '../src/lib/graph-topology';

const decisionsDir = join(__dirname, '../../data/decisions');
const LEGACY_AGENT = 'publisher_agent';
const LEGACY_GRAPH = 'eth.market.v1';

type JsonDoc = {
  graph_id: string;
  nodes: { node_id: string; node_type: string; properties?: Record<string, unknown>; label?: string }[];
  edges: Record<string, unknown>[];
  [key: string]: unknown;
};

function migratePublisher(doc: JsonDoc): JsonDoc {
  const userNodeId = primaryUserNodeId(doc.nodes);
  if (!userNodeId) throw new Error(`No user node in ${doc.graph_id}`);
  const userSlug = userSlugFromNodeId(userNodeId);
  const agentId = agentNodeId(userSlug, 'publisher');
  const graphId = graphIdFor(userSlug, 'publisher');

  const nodes = doc.nodes.map((n) => {
    if (n.node_id === LEGACY_AGENT) {
      return {
        ...n,
        node_id: agentId,
        properties: { ...n.properties, role: 'publisher', display_name: 'Publisher Agent' },
      };
    }
    return n;
  });

  const edges = doc.edges.map((e) => {
    const edge = { ...e } as Record<string, unknown>;
    if (edge.source === LEGACY_AGENT) edge.source = agentId;
    if (edge.target === LEGACY_AGENT) edge.target = agentId;
    if (Array.isArray(edge.targets)) {
      edge.targets = (edge.targets as string[]).map((t) =>
        t === LEGACY_AGENT ? agentId : t,
      );
    }
    return edge;
  });

  const hasAgentEdge = edges.some(
    (e) => e.source === userNodeId && e.target === agentId && e.relationship_type === 'HAS_AGENT',
  );
  if (!hasAgentEdge) {
    edges.unshift({
      source: userNodeId,
      target: agentId,
      relationship_type: 'HAS_AGENT',
      metadata: { role: 'publisher' },
    });
  }

  return { ...doc, graph_id: graphId, nodes, edges };
}

const SEEKER_USER = process.env.COT_SEEKER_USER_ID ?? 'User_902';
const PUBLISHER_USER = process.env.COT_PUBLISHER_USER_ID ?? 'User_771';

function buildSeekerStub(userNodeId: string = SEEKER_USER): JsonDoc {
  const userSlug = userSlugFromNodeId(userNodeId);
  const agentId = agentNodeId(userSlug, 'seeker');
  const publisherGraph = graphIdFor(userSlugFromNodeId(PUBLISHER_USER), 'publisher');
  return {
    schema_version: '1.0',
    operation: 'assert',
    graph_id: graphIdFor(userSlug, 'seeker'),
    decision_id: `dec-seek-${userNodeId}`,
    updated_at: new Date().toISOString(),
    nodes: [
      { node_id: userNodeId, node_type: 'user', properties: {}, label: 'User' },
      {
        node_id: agentId,
        node_type: 'agent',
        properties: {
          role: 'seeker',
          display_name: 'Seeker Agent',
          watches_graph: publisherGraph,
        },
        label: 'Agent',
      },
    ],
    edges: [
      {
        source: userNodeId,
        target: agentId,
        relationship_type: 'HAS_AGENT',
        metadata: { role: 'seeker' },
      },
      {
        source: agentId,
        target: userNodeId,
        relationship_type: 'QUERIES_GRAPH',
        metadata: { graph_id: publisherGraph },
      },
    ],
  };
}

function main() {
  const files = readdirSync(decisionsDir).filter((f) => f.endsWith('.json') && f.startsWith('dec-trd_'));

  for (const file of files.sort()) {
    const path = join(decisionsDir, file);
    const doc = migratePublisher(JSON.parse(readFileSync(path, 'utf-8')) as JsonDoc);
    writeFileSync(path, JSON.stringify(doc, null, 2) + '\n');
    console.log(`publisher ${file} → ${doc.graph_id}`);
  }

  const seekFile = `dec-seek-${SEEKER_USER}.json`;
  const stub = buildSeekerStub(SEEKER_USER);
  writeFileSync(join(decisionsDir, seekFile), JSON.stringify(stub, null, 2) + '\n');
  console.log(`seeker ${seekFile} → ${stub.graph_id} (watches ${PUBLISHER_USER})`);

  console.log(`\nDone: ${files.length} publisher decisions + 1 seeker user stub.`);
}

main();
