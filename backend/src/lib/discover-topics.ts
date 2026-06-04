import { MARKET_SIGNALS_TOPIC } from './event-sourced.config';

/** @deprecated Use MARKET_SIGNALS_TOPIC — single public event stream. */
export function resolveKafkaTopics(): string[] {
  return [MARKET_SIGNALS_TOPIC];
}
