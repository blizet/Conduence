import { existsSync } from 'fs';
import { join } from 'path';
import { config } from 'dotenv';

const ENV_CANDIDATES = [
  join(process.cwd(), '.env'),
  join(process.cwd(), '..', '.env'),
  join(process.cwd(), 'backend', '.env'),
];

let loaded = false;

/** Load backend/.env (or repo-root .env) before reading process.env in agent scripts. */
export function loadEnv(): void {
  if (loaded) return;
  for (const path of ENV_CANDIDATES) {
    if (existsSync(path)) {
      config({ path });
      loaded = true;
      return;
    }
  }
}

loadEnv();
