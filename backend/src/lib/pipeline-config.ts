import { graphIdFor, graphIdToTopic, userSlugFromNodeId } from './graph-topology';

/** Publisher and seeker are different end-users with separate graphs. */
export const PUBLISHER_USER_NODE_ID = process.env.COT_PUBLISHER_USER_ID ?? 'user_117';
export const SEEKER_USER_NODE_ID = process.env.COT_SEEKER_USER_ID ?? 'User_902';

export const PUBLISHER_USER_SLUG = userSlugFromNodeId(PUBLISHER_USER_NODE_ID);
export const SEEKER_USER_SLUG = userSlugFromNodeId(SEEKER_USER_NODE_ID);

export const PUBLISHER_GRAPH_ID =
  process.env.PUBLISHER_GRAPH_ID ?? graphIdFor(PUBLISHER_USER_SLUG, 'publisher');
export const SEEKER_GRAPH_ID =
  process.env.SEEKER_GRAPH_ID ?? graphIdFor(SEEKER_USER_SLUG, 'seeker');

export const PUBLISHER_AGENT_ID = `${PUBLISHER_USER_SLUG}.publisher`;
export const SEEKER_AGENT_ID = `${SEEKER_USER_SLUG}.seeker`;

/** @deprecated Per-user topics replaced by market.signals.public */
export const PUBLISHER_KAFKA_TOPIC =
  process.env.KAFKA_PUBLISHER_TOPIC ?? graphIdToTopic(PUBLISHER_GRAPH_ID);

/** @deprecated Use PUBLISHER_USER_NODE_ID */
export const DEFAULT_USER_NODE_ID = PUBLISHER_USER_NODE_ID;
