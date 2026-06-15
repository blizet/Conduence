/**
 * Smoke test: Supermemory profile + add (run with `npx tsx test.ts` from supermemory/).
 * Uses the same client + profile pattern as src/server/supermemory.ts
 */
import { config } from "dotenv";

config();

import {
  fetchSupermemoryContext,
  getSupermemoryClient,
  isSupermemoryConfigured,
  graphFromMemories,
  persistToSupermemory,
} from "./src/server/supermemory.js";
import { createEmptyGraph } from "./src/server/graph.js";

const USER_ID = process.env.CONTAINER_TAG ?? "cot-graph-user";

if (!isSupermemoryConfigured()) {
  console.error("SUPERMEMORY_API_KEY missing in supermemory/.env");
  process.exit(1);
}

const client = getSupermemoryClient();
console.log("Supermemory client:", client ? "ok" : "failed");

const query = "If the Iran war continues, oil keeps rising while Bitcoin and ETH fall.";
const { context, memories } = await fetchSupermemoryContext(USER_ID, query);

console.log("Supermemory context:\n", context);

const graph = graphFromMemories(memories);
console.log("\nParsed graph from memories:", JSON.stringify(graph, null, 2));

await persistToSupermemory(
  USER_ID,
  query,
  "Test turn stored from test.ts",
  graph.nodes.length ? graph : createEmptyGraph(),
);

console.log("\nStored turn in Supermemory (container:", USER_ID, ")");
