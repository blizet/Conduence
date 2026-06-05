/**
 * Seeker Agent — whale mirror runs in NestJS SeekerWorker.
 * Consumes market.signals.public (publisher whale trades only).
 */
import { MARKET_SIGNALS_TOPIC } from '../src/lib/event-sourced.config';
import { SEEKER_GRAPH_ID, SEEKER_USER_NODE_ID } from '../src/lib/pipeline-config';

console.log(
  `[seeker-agent] Seeker user=${SEEKER_USER_NODE_ID} graph=${SEEKER_GRAPH_ID}`,
);
console.log(`[seeker-agent] Ingestion: ${MARKET_SIGNALS_TOPIC} (publisher whale deltas)`);
console.log(
  '[seeker-agent] Run `npm run dev:backend` then `npm run seed` to populate the seeker graph.',
);
