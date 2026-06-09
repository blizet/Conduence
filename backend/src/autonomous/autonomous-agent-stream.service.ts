import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import {
  getAutonomousAgent,
  type AutonomousAgentConfig,
} from '@cot-kb/agents';
import { EventsGateway } from '../ws/events.gateway';
import { SignalProducerService } from '../kafka/signal-producer.service';

type AgentSession = {
  running: boolean;
  emittedCount: number;
  lastSignal: unknown;
  lastError?: string;
  feedTopic: string;
  eventType: string;
};

@Injectable()
export class AutonomousAgentStreamService implements OnModuleDestroy {
  private readonly logger = new Logger(AutonomousAgentStreamService.name);
  private readonly sessions = new Map<string, AgentSession>();
  private readonly stopFlags = new Map<string, boolean>();

  constructor(
    private readonly producer: SignalProducerService,
    private readonly events: EventsGateway,
  ) {}

  onModuleDestroy() {
    for (const agentId of this.sessions.keys()) {
      this.stopFlags.set(agentId, true);
    }
  }

  status(agentId: string) {
    const def = getAutonomousAgent(agentId);
    if (!def) {
      return { ok: false, error: `Unknown autonomous agent: ${agentId}` };
    }

    const session = this.sessions.get(agentId);
    return {
      ok: true,
      agentId,
      running: session?.running ?? false,
      emittedCount: session?.emittedCount ?? 0,
      lastSignal: session?.lastSignal ?? null,
      lastError: session?.lastError,
      feedTopic: def.feedTopic,
      eventType: def.eventType,
    };
  }

  async start(
    agentId: string,
    config: AutonomousAgentConfig = {},
  ): Promise<{ ok: boolean; running?: boolean; feedTopic?: string; error?: string }> {
    const def = getAutonomousAgent(agentId);
    if (!def) {
      return { ok: false, error: `Unknown autonomous agent: ${agentId}` };
    }

    const existing = this.sessions.get(agentId);
    if (existing?.running) {
      return { ok: true, running: true, feedTopic: def.feedTopic };
    }

    try {
      await def.validateConfig(config);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { ok: false, error: message };
    }

    this.stopFlags.set(agentId, false);
    this.sessions.set(agentId, {
      running: true,
      emittedCount: 0,
      lastSignal: null,
      feedTopic: def.feedTopic,
      eventType: def.eventType,
    });

    void this.runLoop(agentId, def, config);
    this.logger.log(`Autonomous stream started agent=${agentId} topic=${def.feedTopic}`);
    return { ok: true, running: true, feedTopic: def.feedTopic };
  }

  stop(agentId: string): { ok: boolean; running: boolean } {
    this.stopFlags.set(agentId, true);
    const session = this.sessions.get(agentId);
    if (session) session.running = false;
    this.logger.log(`Autonomous stream stop requested agent=${agentId}`);
    return { ok: true, running: false };
  }

  private async runLoop(
    agentId: string,
    def: NonNullable<ReturnType<typeof getAutonomousAgent>>,
    config: AutonomousAgentConfig,
  ): Promise<void> {
    try {
      for await (const signal of def.streamSignals(config)) {
        if (this.stopFlags.get(agentId)) break;
        await this.emit(agentId, def.feedTopic, def.eventType, signal);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(`Autonomous stream failed agent=${agentId}: ${message}`);
      const session = this.sessions.get(agentId);
      if (session) {
        session.lastError = message;
        session.running = false;
      }
    } finally {
      this.stopFlags.set(agentId, true);
      const session = this.sessions.get(agentId);
      if (session) session.running = false;
    }
  }

  private async emit(
    agentId: string,
    feedTopic: string,
    eventType: string,
    signal: unknown,
  ): Promise<void> {
    const session = this.sessions.get(agentId);
    if (session) {
      session.lastSignal = signal;
      session.emittedCount += 1;
      session.lastError = undefined;
    }

    const updatedAt = new Date().toISOString();
    const envelope = {
      event_type: eventType,
      agent_id: agentId,
      updated_at: updatedAt,
      payload: signal,
    };

    try {
      await this.producer.publishAgentFeed(envelope, feedTopic);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.warn(`Kafka publish failed agent=${agentId}: ${message}`);
      if (session) session.lastError = message;
    }

    this.events.broadcast({
      type: 'agent.feed',
      agent_id: agentId,
      event_type: eventType,
      topic: feedTopic,
      updated_at: updatedAt,
      payload: signal,
    });
  }
}
