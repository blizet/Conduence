import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import { Server } from 'ws';

export type WsEvent =
  | {
      type: 'decision.ingested';
      decision_id: string;
      graph_id: string;
      updated_at: string;
      falkordb: unknown;
      worker?: string;
      verification?: unknown;
    }
  | {
      type: 'cot.produced';
      decision_id: string;
      graph_id: string;
      updated_at: string;
      topic: string;
      stage: 'redpanda';
    }
  | { type: 'connected'; message: string };

@WebSocketGateway({ path: '/ws', cors: { origin: '*' } })
export class EventsGateway implements OnGatewayConnection, OnGatewayDisconnect {
  private readonly logger = new Logger(EventsGateway.name);

  @WebSocketServer()
  server!: Server;

  handleConnection() {
    this.logger.log('Dashboard client connected');
  }

  handleDisconnect() {
    this.logger.log('Dashboard client disconnected');
  }

  broadcast(event: WsEvent) {
    const payload = JSON.stringify(event);
    this.server?.clients.forEach((client) => {
      if (client.readyState === 1) client.send(payload);
    });
  }
}
