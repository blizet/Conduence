import { Injectable } from '@nestjs/common';
import { SignalProducerService } from '../kafka/signal-producer.service';
import { EventsGateway } from '../ws/events.gateway';
import { WORKER_TARGETS } from '../lib/event-sourced.config';
import { PUBLISHER_AGENT_ID } from '../lib/pipeline-config';

function agentRoleFor(publisherId: string): string {
  if (publisherId === WORKER_TARGETS.main.agentId) return 'main';
  if (publisherId === WORKER_TARGETS.seeker.agentId) return 'seeker';
  return 'publisher';
}

@Injectable()
export class SignalIngressService {
  constructor(
    private readonly producer: SignalProducerService,
    private readonly events: EventsGateway,
  ) {}

  /**
   * Produce CoT delta to Redpanda. FalkorDB MERGE runs in the matching worker after consume.
   */
  async publishPublisherCotDelta(raw: unknown, publisherId = PUBLISHER_AGENT_ID) {
    const result = await this.producer.publishCotDelta(raw, {
      publisher_id: publisherId,
      agent_role: agentRoleFor(publisherId),
    });
    this.events.broadcast({
      type: 'cot.produced',
      decision_id: result.decision_id,
      graph_id: result.graph_id,
      updated_at: result.updated_at,
      topic: result.topic,
      stage: 'redpanda',
    });
    return result;
  }
}
