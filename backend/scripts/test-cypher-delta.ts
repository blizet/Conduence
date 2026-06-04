/**
 * Quick FalkorDB smoke test for executeCypherDelta.
 * Run: npx tsx scripts/test-cypher-delta.ts
 */
import { FalkorDB } from 'falkordb';
import { readFileSync } from 'fs';
import { join } from 'path';
import { executeCypherDelta } from '../src/falkordb/cypher-delta';
import { normalizeDecision } from '../src/lib/normalize';
import { DecisionEventSchema } from '../src/schemas/decision.schema';

async function main() {
  const raw = JSON.parse(
    readFileSync(join(__dirname, '../../data/decisions/dec-trd_001.json'), 'utf-8'),
  );
  const event = normalizeDecision(DecisionEventSchema.parse(raw));

  const client = await FalkorDB.connect({ socket: { host: 'localhost', port: 6380 } });
  const graph = client.selectGraph('test_cypher_delta_v1');

  try {
    await graph.delete();
  } catch {
    /* graph may not exist */
  }

  const result = await executeCypherDelta(
    (cypher, options) => graph.query(cypher, options),
    event,
  );
  console.log('merge result:', result);

  const count = await graph.query(
    'MATCH (n) WHERE n.node_id IS NOT NULL RETURN count(n) AS c',
  );
  console.log('node count:', count.data);

  await client.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
