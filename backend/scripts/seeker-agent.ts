/**
 * @deprecated Seeker ingestion runs in NestJS SeekerWorker (market.signals.public).
 * This script only logs a reminder — no separate consumer needed.
 */
import { MARKET_SIGNALS_TOPIC } from '../src/lib/event-sourced.config';
import { SEEKER_GRAPH_ID, SEEKER_USER_NODE_ID } from '../src/lib/pipeline-config';

console.log(
  `[seeker-agent] Seeker user=${SEEKER_USER_NODE_ID} graph=${SEEKER_GRAPH_ID}`,
);
console.log(
  `[seeker-agent] Ingestion is handled by backend SeekerWorker on topic ${MARKET_SIGNALS_TOPIC}.`,
);
console.log('[seeker-agent] Ensure `npm run dev:backend` is running; no action required here.');
