/**
 * Normalize all dec-trd_* JSON + batch through normalizeDecision (fixes open leaves).
 * Run: npx tsx scripts/sync-open-close-json.ts
 */
import { readFileSync, writeFileSync, readdirSync } from 'fs';
import { join } from 'path';
import { normalizeDecision } from '../src/lib/normalize';
import { DecisionEventSchema } from '../src/schemas/decision.schema';

const REPO = join(__dirname, '../..');
const DIR = join(REPO, 'data/decisions');
const BATCH = join(REPO, 'data/sample/decisions-batch.json');

function main() {
  const files = readdirSync(DIR)
    .filter((f) => /^dec-trd_\d+(-(open|close))?\.json$/.test(f))
    .sort((a, b) => {
      const openA = a.endsWith('-open.json');
      const openB = b.endsWith('-open.json');
      if (openA !== openB) return openA ? -1 : 1;
      return a.localeCompare(b, undefined, { numeric: true });
    });

  const events = files.map((f) => {
    const raw = JSON.parse(readFileSync(join(DIR, f), 'utf-8'));
    const normalized = normalizeDecision(DecisionEventSchema.parse(raw));
    writeFileSync(join(DIR, f), JSON.stringify(normalized, null, 2) + '\n');
    return normalized;
  });

  writeFileSync(BATCH, JSON.stringify(events, null, 2) + '\n');
  console.log(`Synced ${events.length} files → ${DIR} and ${BATCH}`);
}

main();
