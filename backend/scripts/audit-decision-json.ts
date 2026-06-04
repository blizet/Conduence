/**
 * Validate decision JSON: every market in nodes[] must be anchor (has Open/Close → trade).
 * Correlated peers must appear only in CORRELATED_MARKET targets[].
 */
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import { anchorMarketIds, normalizeDecision } from '../src/lib/normalize';
import { DecisionEventSchema } from '../src/schemas/decision.schema';

const DIR = join(__dirname, '../../data/decisions');

function main() {
  const files = readdirSync(DIR).filter((f) => /^dec-trd_\d+-(open|close)\.json$/.test(f));
  let errors = 0;
  const tradeIds = new Set<string>();

  for (const f of files.sort()) {
    const raw = JSON.parse(readFileSync(join(DIR, f), 'utf-8'));
    const event = normalizeDecision(DecisionEventSchema.parse(raw));
    const anchors = anchorMarketIds(event);
    const markets = event.nodes.filter((n) => n.node_type === 'market').map((n) => n.node_id);
    const trades = event.nodes.filter((n) => n.node_type === 'trade').map((n) => n.node_id);
    trades.forEach((t) => tradeIds.add(t));

    for (const m of markets) {
      if (!anchors.has(m)) {
        console.error(`${f}: market ${m} in nodes[] but not anchor (no Action→trade edge)`);
        errors++;
      }
    }
  }

  console.log(
    JSON.stringify(
      {
        files: files.length,
        uniqueTradeIds: tradeIds.size,
        tradeIds: [...tradeIds].sort(),
        errors,
        ok: errors === 0,
      },
      null,
      2,
    ),
  );
  process.exit(errors > 0 ? 1 : 0);
}

main();
