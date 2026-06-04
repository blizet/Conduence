import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Kafka, Producer, logLevel } from 'kafkajs';
import { DecisionEventSchema } from '../schemas/decision.schema';
import {
  EVENT_TYPE_COT_DELTA,
  KAFKA_HEADER_AGENT_ROLE,
  KAFKA_HEADER_PUBLISHER_ID,
  KAFKA_HEADER_SEEKER_ID,
  MARKET_SIGNALS_TOPIC,
} from '../lib/event-sourced.config';
import { normalizeDecision } from '../lib/normalize';

export type CotDeltaEnvelope = {
  event_type: typeof EVENT_TYPE_COT_DELTA;
  graph_id: string;
  decision_id: string;
  updated_at: string;
  payload: ReturnType<typeof DecisionEventSchema.parse>;
};

@Injectable()
export class SignalProducerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SignalProducerService.name);
  private kafka!: Kafka;
  private producer!: Producer;

  async onModuleInit() {
    const brokers = (process.env.KAFKA_BROKERS ?? 'localhost:19092').split(',');
    this.kafka = new Kafka({
      clientId: 'cot-signal-producer',
      brokers,
      logLevel: logLevel.WARN,
    });
    this.producer = this.kafka.producer();
    await this.producer.connect();
    this.logger.log(`Signal producer ready → ${MARKET_SIGNALS_TOPIC}`);
  }

  async onModuleDestroy() {
    await this.producer?.disconnect();
  }

  /**
   * Event-sourced egress: serialize CoT delta and produce to Redpanda only (no FalkorDB/Redis).
   */
  async publishCotDelta(
    raw: unknown,
    headers: { publisher_id?: string; seeker_id?: string; agent_role?: string },
  ): Promise<CotDeltaEnvelope & { topic: string }> {
    const event = normalizeDecision(DecisionEventSchema.parse(raw));
    const envelope: CotDeltaEnvelope = {
      event_type: EVENT_TYPE_COT_DELTA,
      graph_id: event.graph_id,
      decision_id: event.decision_id!,
      updated_at: event.updated_at,
      payload: event,
    };

    const kafkaHeaders: Record<string, string> = {};
    if (headers.publisher_id) {
      kafkaHeaders[KAFKA_HEADER_PUBLISHER_ID] = headers.publisher_id;
    }
    if (headers.seeker_id) {
      kafkaHeaders[KAFKA_HEADER_SEEKER_ID] = headers.seeker_id;
    }
    if (headers.agent_role) {
      kafkaHeaders[KAFKA_HEADER_AGENT_ROLE] = headers.agent_role;
    }

    await this.producer.send({
      topic: MARKET_SIGNALS_TOPIC,
      messages: [
        {
          key: envelope.graph_id,
          value: JSON.stringify(envelope),
          headers: kafkaHeaders,
        },
      ],
    });

    this.logger.log(
      `Produced ${envelope.decision_id} → ${MARKET_SIGNALS_TOPIC} key=${envelope.graph_id}`,
    );
    return { ...envelope, topic: MARKET_SIGNALS_TOPIC };
  }
}
