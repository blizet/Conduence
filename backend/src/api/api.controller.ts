import { Body, Controller, Get, Headers, Param, Post } from '@nestjs/common';
import { FalkorDbService } from '../falkordb/falkordb.service';
import { SignalIngressService } from '../ingress/signal-ingress.service';
import { MARKET_SIGNALS_TOPIC } from '../lib/event-sourced.config';
import { listAutonomousAgentFeedTopics } from '../autonomous/agent-catalog';
import { PUBLISHER_AGENT_ID } from '../lib/pipeline-config';
@Controller('api')
export class ApiController {
  constructor(
    private readonly ingress: SignalIngressService,
    private readonly falkordb: FalkorDbService,
  ) {}

  @Get('health')
  health() {
    return { ok: true, service: 'cot-backend', architecture: 'event-sourced' };
  }

  @Get('topics')
  topics() {
    return {
      topics: [MARKET_SIGNALS_TOPIC, ...listAutonomousAgentFeedTopics()],
    };
  }

  @Get('graphs')
  listGraphs() {
    return this.falkordb.listGraphs();
  }

  @Get('graphs/:graphId/snapshot')
  snapshot(@Param('graphId') graphId: string) {
    return this.falkordb.getGraphSnapshot(graphId);
  }

  /**
   * Publisher ingress — produce CoT delta to Redpanda only (no FalkorDB/Redis).
   * FalkorDB MERGE runs in PublisherWorker after consume.
   */
  @Post('signals/cot')
  async publishCotSignal(
    @Body() body: unknown,
    @Headers('x-publisher-id') publisherIdHeader?: string,
  ) {
    const publisherId = publisherIdHeader?.trim() || PUBLISHER_AGENT_ID;
    const result = await this.ingress.publishPublisherCotDelta(body, publisherId);
    return {
      produced: true,
      topic: result.topic,
      graph_id: result.graph_id,
      decision_id: result.decision_id,
      publisher_id: publisherId,
    };
  }

  /** @deprecated Use POST /api/signals/cot */
  @Post('decisions')
  async publishDecisionLegacy(@Body() body: unknown) {
    return this.publishCotSignal(body);
  }

  /**
   * @deprecated Direct DB ingest removed — use event-sourced POST /api/signals/cot.
   */
  @Post('decisions/ingest')
  ingestDirectDeprecated() {
    return {
      error:
        'Direct ingest disabled. POST /api/signals/cot to produce to Redpanda; workers MERGE into FalkorDB.',
      alternative: '/api/signals/cot',
    };
  }
}
