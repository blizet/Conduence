/** CoinDesk Data API — News v1 endpoints (https://data.coindesk.com) */
const COINDESK_BASE = 'https://data-api.coindesk.com';
const NEWS_V1 = `${COINDESK_BASE}/news/v1`;

export const COINDESK_NEWS = {
  base: COINDESK_BASE,
  articleList: `${NEWS_V1}/article/list`,
  sourceList: `${NEWS_V1}/source/list`,
  categoryList: `${NEWS_V1}/category/list`,
  articleGet: `${NEWS_V1}/article/get`,
  search: `${NEWS_V1}/search`,
} as const;

/** @deprecated Use COINDESK_NEWS */
export const COINDESK = COINDESK_NEWS;

export type CoinDeskQueryParams = Record<string, string | number | undefined>;

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
