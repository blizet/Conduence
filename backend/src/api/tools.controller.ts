import { Body, Controller, Post } from '@nestjs/common';
import { coinDeskAgent } from '@cot-kb/agents';

function requireApiKey(apiKey?: string): string | { error: string } {
  const key = apiKey?.trim();
  if (!key) {
    return { error: 'apiKey is required — provide your CoinDesk Data API key' };
  }
  return key;
}

@Controller('api/agents')
export class AgentsController {
  /** Latest Articles — POST /news/v1/article/list */
  @Post('coindesk/articles/list')
  async latestArticles(
    @Body()
    body: {
      apiKey: string;
      limit?: number;
      language?: string;
      sourceId?: string;
      categories?: string[];
      excludeCategories?: string[];
      toTimestamp?: number;
    },
  ) {
    const key = requireApiKey(body.apiKey);
    if (typeof key !== 'string') return key;
    return coinDeskAgent.fetchLatestArticles({
      apiKey: key,
      limit: body.limit,
      language: body.language,
      sourceId: body.sourceId,
      categories: body.categories,
      excludeCategories: body.excludeCategories,
      toTimestamp: body.toTimestamp,
    });
  }

  /** @deprecated Use coindesk/articles/list */
  @Post('coindesk/news')
  async coindeskNews(@Body() body: { apiKey: string; limit?: number }) {
    const key = requireApiKey(body.apiKey);
    if (typeof key !== 'string') return key;
    return coinDeskAgent.fetchNews({ apiKey: key, limit: body.limit });
  }

  /** Sources — POST /news/v1/source/list */
  @Post('coindesk/sources')
  async coindeskSources(
    @Body() body: { apiKey: string; language?: string; sourceType?: string; status?: string },
  ) {
    const key = requireApiKey(body.apiKey);
    if (typeof key !== 'string') return key;
    return coinDeskAgent.fetchSources(key, {
      language: body.language,
      sourceType: body.sourceType,
      status: body.status,
    });
  }

  /** Categories — POST /news/v1/category/list */
  @Post('coindesk/categories')
  async coindeskCategories(@Body() body: { apiKey: string; status?: string }) {
    const key = requireApiKey(body.apiKey);
    if (typeof key !== 'string') return key;
    return coinDeskAgent.fetchCategories(key, { status: body.status });
  }

  /** Single Article — POST /news/v1/article/get */
  @Post('coindesk/article/get')
  async coindeskArticleGet(
    @Body() body: { apiKey: string; sourceId: string; guid: string },
  ) {
    const key = requireApiKey(body.apiKey);
    if (typeof key !== 'string') return key;
    if (!body.sourceId?.trim() || !body.guid?.trim()) {
      return { error: 'sourceId and guid are required' };
    }
    return coinDeskAgent.fetchArticle({
      apiKey: key,
      sourceId: body.sourceId,
      guid: body.guid,
    });
  }

  /** News Search — POST /news/v1/search */
  @Post('coindesk/search')
  async coindeskSearch(
    @Body()
    body: {
      apiKey: string;
      query: string;
      limit?: number;
      language?: string;
      sourceIds?: string[];
      languages?: string[];
    },
  ) {
    const key = requireApiKey(body.apiKey);
    if (typeof key !== 'string') return key;
    if (!body.query?.trim()) {
      return { error: 'query is required' };
    }
    return coinDeskAgent.search({
      apiKey: key,
      query: body.query.trim(),
      limit: body.limit,
      language: body.language,
      sourceIds: body.sourceIds,
      languages: body.languages,
    });
  }
}
