import { Module } from '@nestjs/common';
import { AgentsController, ToolsController } from './api/tools.controller';
import { MarketplaceController } from './api/marketplace.controller';
import { ApiController } from './api/api.controller';
import { FalkorDbService } from './falkordb/falkordb.service';
import { SignalProducerService } from './kafka/signal-producer.service';
import { SignalIngressService } from './ingress/signal-ingress.service';
import { MainWorkerService } from './workers/main-worker.service';
import { EventsGateway } from './ws/events.gateway';
import { AutonomousAgentStreamService } from './autonomous/autonomous-agent-stream.service';

@Module({
  controllers: [ApiController, AgentsController, ToolsController, MarketplaceController],
  providers: [
    FalkorDbService,
    SignalProducerService,
    SignalIngressService,
    MainWorkerService,
    EventsGateway,
    AutonomousAgentStreamService,
  ],
  exports: [FalkorDbService, SignalProducerService, SignalIngressService, EventsGateway],
})
export class AppModule {}
