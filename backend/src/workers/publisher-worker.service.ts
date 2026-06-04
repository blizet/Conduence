import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';

import { Consumer, Kafka, logLevel } from 'kafkajs';

import { FalkorDbService } from '../falkordb/falkordb.service';

import { decodeHeader } from '../lib/kafka-headers';

import {

  KAFKA_HEADER_PUBLISHER_ID,

  MARKET_SIGNALS_TOPIC,

  PUBLISHER_WORKER_GROUP,

  WORKER_TARGETS,

} from '../lib/event-sourced.config';

import { CotDeltaEnvelope } from '../kafka/signal-producer.service';

import { EventsGateway } from '../ws/events.gateway';



@Injectable()

export class PublisherWorkerService implements OnModuleInit, OnModuleDestroy {

  private readonly logger = new Logger(PublisherWorkerService.name);

  private readonly agentId = WORKER_TARGETS.publisher.agentId;

  private kafka!: Kafka;

  private consumer!: Consumer;



  constructor(

    private readonly falkordb: FalkorDbService,

    private readonly events: EventsGateway,

  ) {}



  async onModuleInit() {

    const brokers = (process.env.KAFKA_BROKERS ?? 'localhost:19092').split(',');

    this.kafka = new Kafka({

      clientId: 'cot-publisher-worker',

      brokers,

      logLevel: logLevel.WARN,

    });

    this.consumer = this.kafka.consumer({ groupId: PUBLISHER_WORKER_GROUP });

    await this.consumer.connect();

    const fromBeginning = process.env.COT_KAFKA_FROM_BEGINNING !== '0';
    await this.consumer.subscribe({ topic: MARKET_SIGNALS_TOPIC, fromBeginning });

    await this.consumer.run({

      eachMessage: async ({ message }) => {

        if (!message.value) return;

        const publisherId = decodeHeader(message.headers, KAFKA_HEADER_PUBLISHER_ID);

        if (publisherId !== this.agentId) return;



        try {

          const envelope = JSON.parse(message.value.toString()) as CotDeltaEnvelope;

          const result = await this.falkordb.mergeCotDelta(envelope.payload);

          this.events.broadcast({

            type: 'decision.ingested',

            decision_id: envelope.decision_id,

            graph_id: envelope.graph_id,

            updated_at: envelope.updated_at,

            falkordb: result,

            worker: 'publisher',

          });

          this.logger.log(

            `Publisher worker MERGE ${envelope.decision_id} → ${result.graph}`,

          );

        } catch (err) {

          this.logger.error(`Publisher worker failed: ${err}`);

        }

      },

    });

    this.logger.log(
      `Publisher worker subscribed to ${MARKET_SIGNALS_TOPIC} (agent=${this.agentId}, fromBeginning=${fromBeginning})`,
    );

  }



  async onModuleDestroy() {

    await this.consumer?.disconnect();

  }

}

