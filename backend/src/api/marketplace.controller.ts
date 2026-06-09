import { Body, Controller, Get, NotFoundException, Param, Post } from '@nestjs/common';
import { getAutonomousAgent } from '@cot-kb/agents';
import { AutonomousAgentStreamService } from '../autonomous/autonomous-agent-stream.service';
import { MARKETPLACE_CATALOG } from '../autonomous/agent-catalog';

@Controller('api/marketplace')
export class MarketplaceController {
  constructor(private readonly streams: AutonomousAgentStreamService) {}

  @Get('agents')
  catalog() {
    return { agents: MARKETPLACE_CATALOG };
  }

  @Get('agents/:agentId/status')
  agentStatus(@Param('agentId') agentId: string) {
    this.requireAutonomous(agentId);
    return this.streams.status(agentId);
  }

  @Post('agents/:agentId/start')
  startAgent(
    @Param('agentId') agentId: string,
    @Body() body: Record<string, unknown>,
  ) {
    this.requireAutonomous(agentId);
    return this.streams.start(agentId, body);
  }

  @Post('agents/:agentId/stop')
  stopAgent(@Param('agentId') agentId: string) {
    this.requireAutonomous(agentId);
    return this.streams.stop(agentId);
  }

  private requireAutonomous(agentId: string) {
    const def = getAutonomousAgent(agentId);
    if (!def) {
      throw new NotFoundException(`Unknown autonomous agent: ${agentId}`);
    }
    return def;
  }
}
