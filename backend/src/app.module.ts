import { Module } from '@nestjs/common';
import { ApiController } from './api/api.controller';
import { FalkorDbService } from './falkordb/falkordb.service';
import { SignalProducerService } from './kafka/signal-producer.service';
import { SignalIngressService } from './ingress/signal-ingress.service';
import { MainWorkerService } from './workers/main-worker.service';
import { PublisherWorkerService } from './workers/publisher-worker.service';
import { SeekerWorkerService } from './workers/seeker-worker.service';
import { EventsGateway } from './ws/events.gateway';

@Module({
  controllers: [ApiController],
  providers: [
    FalkorDbService,
    SignalProducerService,
    SignalIngressService,
    PublisherWorkerService,
    MainWorkerService,
    SeekerWorkerService,
    EventsGateway,
  ],
  exports: [FalkorDbService, SignalProducerService, SignalIngressService, EventsGateway],
})
export class AppModule {}
