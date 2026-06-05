/**
 * Main orchestrator — wires news, correlated markets, whale wallet, and Gemini CoT agents.
 * Run: npm run main-agent  (requires GEMINI_API_KEY in backend/.env)
 */
import '../src/lib/load-env';
import { mainAgent } from '../src/agents/main.agent';

mainAgent.run().catch((err) => {
  console.error(err);
  process.exit(1);
});
