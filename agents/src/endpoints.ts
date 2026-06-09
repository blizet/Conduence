/** CoinDesk Data API — News v1 endpoints (https://data.coindesk.com) */
const COINDESK_BASE = 'https://data-api.coindesk.com';
const NEWS_V1 = `${COINDESK_BASE}/news/v1`;

export const COINDESK_NEWS = {
  base: COINDESK_BASE,
  /** Latest Articles — real-time stream of recent articles */
  articleList: `${NEWS_V1}/article/list`,
  /** Sources — all news sources available through the API */
  sourceList: `${NEWS_V1}/source/list`,
  /** Categories — listing of all news categories */
  categoryList: `${NEWS_V1}/category/list`,
  /** Single Article — by source ID + article GUID */
  articleGet: `${NEWS_V1}/article/get`,
  /** News Search — keyword search with relevance scoring */
  search: `${NEWS_V1}/search`,
} as const;

/** @deprecated Use COINDESK_NEWS — kept for internal callers */
export const COINDESK = COINDESK_NEWS;

export type CoinDeskQueryParams = Record<string, string | number | undefined>;

/** Append query string; skips undefined/null/empty values. */
export function coindeskUrl(path: string, params?: CoinDeskQueryParams): string {
  if (!params) return path;
  const qs = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === '') continue;
    qs.set(key, String(value));
  }
  const query = qs.toString();
  return query ? `${path}?${query}` : path;
}
