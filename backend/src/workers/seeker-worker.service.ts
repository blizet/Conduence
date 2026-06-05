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
  PUBLISHER_USER_NODE_ID,
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
          const seekerDelta = this.buildSeekerDelta(envelope, publisherId);
          const verification = await this.falkordb.verifyCotDelta(
            SEEKER_GRAPH_ID,
            seekerDelta,
          );
          const result = await this.falkordb.mergeCotDelta(seekerDelta);
          this.events.broadcast({
            type: 'decision.ingested',
            decision_id: seekerDelta.decision_id!,
            graph_id: SEEKER_GRAPH_ID,
            updated_at: seekerDelta.updated_at,
            falkordb: result,
            verification,
            worker: 'seeker',
          });
          this.logger.log(
            `Seeker worker verified=${verification.verified} MERGE ${seekerDelta.decision_id} → ${result.graph}`,
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

  private buildSeekerDelta(
    envelope: CotDeltaEnvelope,
    publisherId: string,
  ): DecisionEvent {
    const publisherUserIds = new Set(
      envelope.payload.nodes
        .filter((n) => n.node_type === 'user')
        .map((n) => n.node_id),
    );
    publisherUserIds.add(PUBLISHER_USER_NODE_ID);

    const publisherAgentIds = new Set([publisherId]);

    const remapId = (id: string): string => {
      if (publisherUserIds.has(id)) return SEEKER_USER_NODE_ID;
      if (publisherAgentIds.has(id)) return SEEKER_USER_NODE_ID;
      return id;
    };

    const nodesById = new Map<string, DecisionEvent['nodes'][number]>();
    for (const node of envelope.payload.nodes) {
      const nodeId = remapId(node.node_id);
      const isSeekerUser = node.node_type === 'user' && nodeId === SEEKER_USER_NODE_ID;
      if (node.node_type === 'agent') continue;
      nodesById.set(nodeId, {
        ...node,
        node_id: nodeId,
        properties: {
          ...(node.properties ?? {}),
          ...(isSeekerUser ? { role: 'seeker_user' } : {}),
        },
      });
    }

    nodesById.set(SEEKER_USER_NODE_ID, {
      ...(nodesById.get(SEEKER_USER_NODE_ID) ?? {
        node_id: SEEKER_USER_NODE_ID,
        node_type: 'user',
        label: 'User',
      }),
      node_id: SEEKER_USER_NODE_ID,
      node_type: 'user',
      properties: {
        ...(nodesById.get(SEEKER_USER_NODE_ID)?.properties ?? {}),
        role: 'seeker_user',
      },
    });

    return {
      ...envelope.payload,
      graph_id: SEEKER_GRAPH_ID,
      decision_id: envelope.decision_id,
      nodes: [...nodesById.values()],
      edges: envelope.payload.edges
        .filter((edge) => edge.relationship_type !== 'HAS_AGENT')
        .map((edge) => ({
          ...edge,
          source: remapId(edge.source),
          target: edge.target ? remapId(edge.target) : undefined,
          targets: edge.targets?.map(remapId),
          metadata: {
            ...(edge.metadata ?? {}),
            source_publisher_id: publisherId,
            source_publisher_graph: envelope.graph_id,
            source_publisher_decision_id: envelope.decision_id,
          },
        })),
    };
  }
}
