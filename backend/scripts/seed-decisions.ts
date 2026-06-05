import { Kafka } from 'kafkajs';
import {
  EVENT_TYPE_COT_DELTA,
  KAFKA_HEADER_AGENT_ROLE,
  KAFKA_HEADER_PUBLISHER_ID,
  MARKET_SIGNALS_TOPIC,
} from '../src/lib/event-sourced.config';
import {
  loadGeminiDeltas,
  resolveDecisionsDir,
  resolveGeminiDeltasPath,
} from '../src/lib/gemini-deltas';
import {
  PUBLISHER_AGENT_ID,
  PUBLISHER_GRAPH_ID,
  PUBLISHER_USER_NODE_ID,
} from '../src/lib/pipeline-config';

const brokers = (process.env.KAFKA_BROKERS ?? 'localhost:19092').split(',');

async function main() {
  const kafka = new Kafka({ clientId: 'cot-seed', brokers });
  const producer = kafka.producer();
  await producer.connect();

  const whaleSource = process.env.COT_SEED_DECISIONS_DIR
    ? resolveDecisionsDir()
    : resolveGeminiDeltasPath();
  const whaleEvents = loadGeminiDeltas({
    graphId: PUBLISHER_GRAPH_ID,
    userNodeId: PUBLISHER_USER_NODE_ID,
  });

  console.log(
    `Publishing ${whaleEvents.length} whale deltas from ${whaleSource} → ${MARKET_SIGNALS_TOPIC} (${PUBLISHER_GRAPH_ID})`,
  );

  for (const event of whaleEvents) {
    const envelope = {
      event_type: EVENT_TYPE_COT_DELTA,
      graph_id: event.graph_id,
      decision_id: event.decision_id!,
      updated_at: event.updated_at,
      payload: event,
    };
    await producer.send({
      topic: MARKET_SIGNALS_TOPIC,
      messages: [
        {
          key: event.graph_id,
          value: JSON.stringify(envelope),
          headers: {
            [KAFKA_HEADER_PUBLISHER_ID]: PUBLISHER_AGENT_ID,
            [KAFKA_HEADER_AGENT_ROLE]: 'publisher',
          },
        },
      ],
    });
    console.log(`  → whale ${envelope.decision_id} @ ${MARKET_SIGNALS_TOPIC}`);
  }

  await producer.disconnect();
  console.log(
    `Done (${whaleEvents.length} whale messages). ` +
      `Start backend so PublisherWorker consumes ${MARKET_SIGNALS_TOPIC}.`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
