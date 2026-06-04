import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Consumer, Kafka, logLevel } from 'kafkajs';
import { FalkorDbService } from '../falkordb/falkordb.service';
import { decodeHeader } from '../lib/kafka-headers';
import {
  KAFKA_HEADER_PUBLISHER_ID,
  MARKET_SIGNALS_TOPIC,
  SEEKER_WORKER_GROUP,
  WORKER_TARGETS,
} from '../lib/event-sourced.config';
import {
  PUBLISHER_GRAPH_ID,
  PUBLISHER_USER_NODE_ID,
  SEEKER_AGENT_ID,
  SEEKER_GRAPH_ID,
  SEEKER_USER_NODE_ID,
} from '../lib/pipeline-config';
import { CotDeltaEnvelope } from '../kafka/signal-producer.service';
import { EventsGateway } from '../ws/events.gateway';
import type { DecisionEvent } from '../schemas/decision.schema';

@Injectable()
export class SeekerWorkerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SeekerWorkerService.name);
  private kafka!: Kafka;
  private consumer!: Consumer;

  constructor(
    private readonly falkordb: FalkorDbService,
    private readonly events: EventsGateway,
  ) {}

  async onModuleInit() {
    const brokers = (process.env.KAFKA_BROKERS ?? 'localhost:19092').split(',');
    this.kafka = new Kafka({
      clientId: 'cot-seeker-worker',
      brokers,
      logLevel: logLevel.WARN,
    });
    this.consumer = this.kafka.consumer({ groupId: SEEKER_WORKER_GROUP });
    await this.consumer.connect();
    const fromBeginning = process.env.COT_KAFKA_FROM_BEGINNING !== '0';
    await this.consumer.subscribe({ topic: MARKET_SIGNALS_TOPIC, fromBeginning });
    await this.consumer.run({
      eachMessage: async ({ message }) => {
        if (!message.value) return;
        const publisherId = decodeHeader(message.headers, KAFKA_HEADER_PUBLISHER_ID);
        if (!publisherId) return;

        try {
          const envelope = JSON.parse(message.value.toString()) as CotDeltaEnvelope;
          const observation = this.buildSeekerObservation(envelope, publisherId);
          const verification = await this.falkordb.verifyCotDelta(
            SEEKER_GRAPH_ID,
            observation,
          );
          const result = await this.falkordb.mergeCotDelta(observation);
          this.events.broadcast({
            type: 'decision.ingested',
            decision_id: observation.decision_id!,
            graph_id: SEEKER_GRAPH_ID,
            updated_at: observation.updated_at,
            falkordb: result,
            verification,
            worker: 'seeker',
          });
          this.logger.log(
            `Seeker worker verified=${verification.verified} MERGE ${observation.decision_id} → ${result.graph}`,
          );
        } catch (err) {
          this.logger.error(`Seeker worker failed: ${err}`);
        }
      },
    });
    this.logger.log(
      `Seeker worker subscribed to ${MARKET_SIGNALS_TOPIC} (fromBeginning=${fromBeginning})`,
    );
  }

  async onModuleDestroy() {
    await this.consumer?.disconnect();
  }

  private buildSeekerObservation(
    envelope: CotDeltaEnvelope,
    publisherId: string,
  ): DecisionEvent {
    const tradeEdge = envelope.payload.edges.find((e) => e.Action && e.target);
    const obsId = `obs-${envelope.decision_id}`;
    return {
      graph_id: SEEKER_GRAPH_ID,
      schema_version: '1.0',
      operation: 'assert',
      decision_id: `seek-observe-${envelope.decision_id}`,
      updated_at: envelope.updated_at,
      nodes: [
        {
          node_id: SEEKER_USER_NODE_ID,
          node_type: 'user',
          properties: { role: 'seeker_user' },
          label: 'User',
        },
        {
          node_id: SEEKER_AGENT_ID,
          node_type: 'agent',
          properties: {
            role: 'seeker',
            watches_graph: PUBLISHER_GRAPH_ID,
            watches_user: PUBLISHER_USER_NODE_ID,
          },
          label: 'Agent',
        },
        {
          node_id: obsId,
          node_type: 'feedback',
          properties: {
            kind: 'observation',
            publisher_id: publisherId,
            publisher_decision_id: envelope.decision_id,
            trade_id: tradeEdge?.target,
            thesis: tradeEdge?.metadata?.thesis,
          },
          label: 'Observation',
        },
      ],
      edges: [
        {
          source: SEEKER_USER_NODE_ID,
          target: SEEKER_AGENT_ID,
          relationship_type: 'HAS_AGENT',
          metadata: { role: 'seeker' },
        },
        {
          source: SEEKER_AGENT_ID,
          target: obsId,
          relationship_type: 'OBSERVED_DECISION',
          metadata: {
            publisher_graph: envelope.graph_id,
            publisher_decision_id: envelope.decision_id,
            trade_action: tradeEdge?.Action,
          },
        },
      ],
    };
  }
}
