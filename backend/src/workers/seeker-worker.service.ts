import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';

import { Consumer, Kafka, KafkaMessage, logLevel } from 'kafkajs';

import { transformWhaleToSeekerDelta } from '../agents/seeker';

import { FalkorDbService } from '../falkordb/falkordb.service';

import { decodeHeader } from '../lib/kafka-headers';

import {

  KAFKA_HEADER_PUBLISHER_ID,

  MARKET_SIGNALS_TOPIC,

  SEEKER_WORKER_GROUP,

  WORKER_TARGETS,

} from '../lib/event-sourced.config';

import { CotDeltaEnvelope } from '../kafka/signal-producer.service';

import { EventsGateway } from '../ws/events.gateway';



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

        try {

          await this.handleWhaleSignal(message);

        } catch (err) {

          this.logger.error(`Seeker worker failed: ${err}`);

        }

      },

    });

    this.logger.log(

      `Seeker worker subscribed to ${MARKET_SIGNALS_TOPIC} ` +

        `(publisher=${WORKER_TARGETS.publisher.agentId}, graph=${WORKER_TARGETS.seeker.graphId}, fromBeginning=${fromBeginning})`,

    );

  }



  async onModuleDestroy() {

    await this.consumer?.disconnect();

  }



  private async handleWhaleSignal(message: KafkaMessage) {

    const publisherId = decodeHeader(message.headers, KAFKA_HEADER_PUBLISHER_ID);

    if (publisherId !== WORKER_TARGETS.publisher.agentId) return;



    const envelope = JSON.parse(message.value!.toString()) as CotDeltaEnvelope;

    const seekerPayload = transformWhaleToSeekerDelta(

      envelope.payload,

      WORKER_TARGETS.seeker.graphId,

    );

    const result = await this.falkordb.mergeCotDelta(seekerPayload);



    this.events.broadcast({

      type: 'decision.ingested',

      decision_id: seekerPayload.decision_id!,

      graph_id: WORKER_TARGETS.seeker.graphId,

      updated_at: seekerPayload.updated_at,

      falkordb: result,

      worker: 'seeker',

      source_topic: MARKET_SIGNALS_TOPIC,

      publisher_id: publisherId,

    });



    this.logger.log(

      `Seeker MERGE whale ${seekerPayload.decision_id} → ${result.graph}`,

    );

  }

}


