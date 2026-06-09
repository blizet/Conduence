import { COINDESK_NEWS, coindeskUrl } from './endpoints';
import type {
  CoinDeskArticle,
  CoinDeskArticleGetRequest,
  CoinDeskCategoriesRequest,
  CoinDeskLatestArticlesRequest,
  CoinDeskNewsRequest,
  CoinDeskNewsResult,
  CoinDeskSearchRequest,
  CoinDeskSourcesRequest,
} from './types';

const FETCH_TIMEOUT_MS = Number(process.env.AGENT_FETCH_TIMEOUT_MS ?? 15_000);

function parseArticles(payload: unknown): CoinDeskArticle[] {
  if (!payload || typeof payload !== 'object') return [];
  const obj = payload as Record<string, unknown>;
  const list = (obj.Data ?? obj.data ?? obj.articles ?? obj.items ?? []) as unknown[];
  if (!Array.isArray(list)) return [];

  return list
    .map((item): CoinDeskArticle | null => {
      if (!item || typeof item !== 'object') return null;
      const a = item as Record<string, unknown>;
      const title = String(a.TITLE ?? a.title ?? a.headline ?? '');
      if (!title) return null;
      return {
        id: a.ID ?? a.id ?? a.GUID ?? a.guid ? String(a.ID ?? a.id ?? a.GUID ?? a.guid) : undefined,
        guid: a.GUID ?? a.guid ? String(a.GUID ?? a.guid) : undefined,
        sourceId: a.SOURCE_ID ?? a.source_id ? String(a.SOURCE_ID ?? a.source_id) : undefined,
        title,
        url: a.URL ?? a.url ? String(a.URL ?? a.url) : undefined,
        publishedAt: a.PUBLISHED_ON ?? a.publishedAt ? String(a.PUBLISHED_ON ?? a.publishedAt) : undefined,
        source: a.SOURCE ?? a.source ? String(a.SOURCE ?? a.source) : undefined,
        summary: a.BODY ?? a.summary ? String(a.BODY ?? a.summary).slice(0, 280) : undefined,
      };
    })
    .filter((a): a is CoinDeskArticle => a !== null);
}

async function coindeskFetch(
  apiKey: string,
  path: string,
  params?: Record<string, string | number | undefined>,
): Promise<unknown> {
  const url = coindeskUrl(path, params);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        Accept: 'application/json',
      },
    });

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`CoinDesk ${res.status} ${path}${body ? `: ${body.slice(0, 120)}` : ''}`);
    }

    return res.json();
  } finally {
    clearTimeout(timer);
  }
}

/** Latest Articles — `/news/v1/article/list` */
export async function fetchLatestArticles(
  req: CoinDeskLatestArticlesRequest,
): Promise<CoinDeskNewsResult> {
  const payload = await coindeskFetch(req.apiKey, COINDESK_NEWS.articleList, {
    limit: req.limit ?? 20,
    language: req.language,
    source_id: req.sourceId,
    categories: req.categories?.join(','),
    exclude_categories: req.excludeCategories?.join(','),
    to_timestamp: req.toTimestamp,
  });

  return { articles: parseArticles(payload), raw: payload };
}

/** @deprecated Use fetchLatestArticles */
export async function fetchCoinDeskNews(req: CoinDeskNewsRequest): Promise<CoinDeskNewsResult> {
  return fetchLatestArticles(req);
}

/** Sources — `/news/v1/source/list` */
export async function fetchCoinDeskSources(req: CoinDeskSourcesRequest): Promise<unknown> {
  return coindeskFetch(req.apiKey, COINDESK_NEWS.sourceList, {
    language: req.language,
    source_type: req.sourceType,
    status: req.status,
  });
}

/** Categories — `/news/v1/category/list` */
export async function fetchCoinDeskCategories(req: CoinDeskCategoriesRequest): Promise<unknown> {
  return coindeskFetch(req.apiKey, COINDESK_NEWS.categoryList, {
    status: req.status,
  });
}

/** Single Article — `/news/v1/article/get` */
export async function fetchCoinDeskArticle(
  req: CoinDeskArticleGetRequest,
): Promise<{ article: CoinDeskArticle | null; raw: unknown }> {
  const payload = await coindeskFetch(req.apiKey, COINDESK_NEWS.articleGet, {
    source_id: req.sourceId,
    guid: req.guid,
  });

  const articles = parseArticles(payload);
  return {
    article: articles[0] ?? null,
    raw: payload,
  };
}

/** News Search — `/news/v1/search` */
export async function searchCoinDeskNews(
  req: CoinDeskSearchRequest,
): Promise<CoinDeskNewsResult> {
  const payload = await coindeskFetch(req.apiKey, COINDESK_NEWS.search, {
    q: req.query,
    query: req.query,
    limit: req.limit ?? 20,
    language: req.language,
    source_id: req.sourceIds?.join(','),
    languages: req.languages?.join(','),
  });

  return { articles: parseArticles(payload), raw: payload };
}

export const coinDeskAgent = {
  fetchLatestArticles,
  fetchNews: fetchCoinDeskNews,
  fetchSources: (apiKey: string, opts?: Omit<CoinDeskSourcesRequest, 'apiKey'>) =>
    fetchCoinDeskSources({ apiKey, ...opts }),
  fetchCategories: (apiKey: string, opts?: Omit<CoinDeskCategoriesRequest, 'apiKey'>) =>
    fetchCoinDeskCategories({ apiKey, ...opts }),
  fetchArticle: (req: CoinDeskArticleGetRequest) => fetchCoinDeskArticle(req),
  search: (req: CoinDeskSearchRequest) => searchCoinDeskNews(req),
};
