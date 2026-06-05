import './load-env';
import { MAIN_AGENT_ID } from './main-agent.config';
import type { DecisionEvent } from '../schemas/decision.schema';

const api = process.env.COT_API_URL ?? 'http://localhost:4000';

export type CotIngressResult = {
  produced: boolean;
  topic: string;
  graph_id: string;
  decision_id: string;
  publisher_id: string;
};

export async function publishCotToIngress(
  event: DecisionEvent,
  publisherId = MAIN_AGENT_ID,
): Promise<CotIngressResult> {
  const res = await fetch(`${api}/api/signals/cot`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-publisher-id': publisherId,
    },
    body: JSON.stringify(event),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`CoT ingress failed ${res.status}: ${text}`);
  }
  return res.json() as Promise<CotIngressResult>;
}
