/**
 * Sync data/decisions/dec-trd_*.json from the Gemini CoT batch.
 * Run: npm run sync-gemini
 */
import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { loadGeminiDeltas, resolveGeminiDeltasPath } from '../src/lib/gemini-deltas';

const decisionsDir = join(__dirname, '../../data/decisions');

async function main() {
  const path = resolveGeminiDeltasPath();
  const deltas = loadGeminiDeltas();
  mkdirSync(decisionsDir, { recursive: true });

  let written = 0;
  for (const event of deltas) {
    const file = `${event.decision_id}.json`;
    writeFileSync(join(decisionsDir, file), `${JSON.stringify(event, null, 2)}\n`, 'utf-8');
    console.log(`  wrote ${file}`);
    written += 1;
  }

  console.log(`Synced ${written} decisions from ${path} → ${decisionsDir}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
