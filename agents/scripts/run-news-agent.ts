import { config } from 'dotenv';
import { resolve } from 'path';
import { newsAgent } from '../src/news-agent';

config({ path: resolve(__dirname, '../.env') });

const limit = Number(process.env.NEWS_ARTICLE_LIMIT ?? 20);

newsAgent.run(process.env.COINDESK_API_KEY, limit).catch((err) => {
  console.error('[news-agent] fatal:', err instanceof Error ? err.message : err);
  process.exit(1);
});
