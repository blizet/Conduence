/**
 * Wipe CoT Docker volumes (Redis, FalkorDB, Redpanda, Neo4j). Run from repo root:
 *   npm run clear-all
 */
import { execSync } from 'child_process';
import { join } from 'path';

const root = join(__dirname, '../..');

console.log('Stopping containers and removing volumes...');
execSync('docker compose down -v', { cwd: root, stdio: 'inherit' });
console.log('Done. Start fresh: docker compose up -d');
