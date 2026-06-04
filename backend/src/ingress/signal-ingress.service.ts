import { Injectable } from '@nestjs/common';
import { SignalProducerService } from '../kafka/signal-producer.service';
import { EventsGateway } from '../ws/events.gateway';
import { PUBLISHER_AGENT_ID } from '../lib/pipeline-config';

@Injectable()
export class SignalIngressService {
  constructor(
    private readonly producer: SignalProducerService,
    private readonly events: EventsGateway,
  ) {}

  /**
   * Publisher ingress: produce to Redpanda only. FalkorDB is updated by PublisherWorker.
   */
  async publishPublisherCotDelta(raw: unknown, publisherId = PUBLISHER_AGENT_ID) {
    const result = await this.producer.publishCotDelta(raw, {
      publisher_id: publisherId,
      agent_role: 'publisher',
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
