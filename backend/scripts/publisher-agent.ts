/**
 * Publisher agent — POSTs CoT deltas to ingress API (Redpanda-first, no FalkorDB).
 * Run: npm run publisher-agent  (requires backend on :4000)
 */
import {
  PUBLISHER_AGENT_ID,
  PUBLISHER_GRAPH_ID,
  PUBLISHER_USER_NODE_ID,
} from '../src/lib/pipeline-config';
import { MARKET_SIGNALS_TOPIC } from '../src/lib/event-sourced.config';
import { loadGeminiDeltas, resolveGeminiDeltasPath } from '../src/lib/gemini-deltas';
import type { DecisionEvent } from '../src/schemas/decision.schema';

const api = process.env.COT_API_URL ?? 'http://localhost:4000';
const intervalMs = Number(process.env.PUBLISHER_AGENT_INTERVAL_MS ?? 8000);
const simSuffix = process.env.PUBLISHER_AGENT_SIM_SUFFIX !== '0';

function loadPublisherSamples(): DecisionEvent[] {
  return loadGeminiDeltas({
    graphId: PUBLISHER_GRAPH_ID,
    userNodeId: PUBLISHER_USER_NODE_ID,
  });
}

async function publish(event: DecisionEvent) {
  const res = await fetch(`${api}/api/signals/cot`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-publisher-id': PUBLISHER_AGENT_ID,
    },
    body: JSON.stringify(event),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Ingress failed ${res.status}: ${text}`);
  }
  return res.json();
}

async function main() {
  const samples = loadPublisherSamples();
  if (samples.length === 0) {
    throw new Error(`No deltas in ${resolveGeminiDeltasPath()}`);
  }

  console.log(
    `[publisher] source=${resolveGeminiDeltasPath()} user=${PUBLISHER_USER_NODE_ID} graph=${PUBLISHER_GRAPH_ID} topic=${MARKET_SIGNALS_TOPIC} agent=${PUBLISHER_AGENT_ID} n=${samples.length} every ${intervalMs}ms`,
  );

  let i = 0;
  const tick = async () => {
    const event = structuredClone(samples[i % samples.length]);
    event.updated_at = new Date().toISOString();
    if (simSuffix) {
      event.decision_id = `${event.decision_id}-sim-${Date.now()}`;
    }
    const result = await publish(event);
    console.log(`[publisher] ${result.decision_id} → ${result.topic}`);
    i += 1;
  };

  await tick();
  setInterval(tick, intervalMs);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
