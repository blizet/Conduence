import {
  MAIN_AGENT_ID,
  MAIN_GRAPH_ID,
  PUBLISHER_AGENT_ID,
  PUBLISHER_GRAPH_ID,
  SEEKER_AGENT_ID,
  SEEKER_GRAPH_ID,
} from './pipeline-config';

/** Public event stream — all CoT deltas; no DB writes on produce. */
export const MARKET_SIGNALS_TOPIC =
  process.env.MARKET_SIGNALS_TOPIC ?? 'market.signals.public';

export const KAFKA_HEADER_PUBLISHER_ID = 'publisher_id';
export const KAFKA_HEADER_SEEKER_ID = 'seeker_id';
export const KAFKA_HEADER_AGENT_ROLE = 'agent_role';

export const PUBLISHER_WORKER_GROUP =
  process.env.PUBLISHER_WORKER_GROUP_ID ?? 'cot-publisher-worker';
export const SEEKER_WORKER_GROUP =
  process.env.SEEKER_WORKER_GROUP_ID ?? 'cot-seeker-worker';
export const MAIN_WORKER_GROUP =
  process.env.MAIN_WORKER_GROUP_ID ?? 'cot-main-worker';

export const EVENT_TYPE_COT_DELTA = 'cot.delta' as const;

export const WORKER_TARGETS = {
  publisher: {
    agentId: PUBLISHER_AGENT_ID,
    graphId: PUBLISHER_GRAPH_ID,
  },
  seeker: {
    agentId: SEEKER_AGENT_ID,
    graphId: SEEKER_GRAPH_ID,
  },
  main: {
    agentId: MAIN_AGENT_ID,
    graphId: MAIN_GRAPH_ID,
  },
};

