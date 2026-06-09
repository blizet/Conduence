import { DATA } from '../endpoints';
import type { WhaleActivityResult, WhaleTrackRequest } from '../types';

const FETCH_TIMEOUT_MS = Number(process.env.TOOL_FETCH_TIMEOUT_MS ?? 15_000);

/** Playground/API wallet tracking by explicit addresses. */
export async function trackWhaleWalletsByAddress(
  req: Pick<WhaleTrackRequest, 'walletAddresses' | 'conditionId' | 'apiKey'>,
): Promise<WhaleActivityResult> {
  const entries: WhaleActivityResult['entries'] = [];
  const wallets = (req.walletAddresses ?? []).filter((w) => w.trim().length > 0);

  for (const wallet of wallets) {
    if (req.conditionId) {
      const url = `${DATA.recentTrades(req.conditionId)}&user=${encodeURIComponent(wallet)}`;
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
      try {
        const res = await fetch(url, {
          signal: controller.signal,
          headers: req.apiKey ? { Authorization: `Bearer ${req.apiKey}` } : undefined,
        });
        if (res.ok) {
          const trades = (await res.json()) as unknown[];
          if (Array.isArray(trades) && trades.length > 0) {
            const t = trades[0] as Record<string, unknown>;
            entries.push({
              wallet,
              pseudonym: String(t.pseudonym ?? ''),
              name: String(t.name ?? wallet),
              market: {
                id: String(t.conditionId ?? 'unknown'),
                venue: 'polymarket',
                title: String(t.title ?? ''),
                slug: String(t.slug ?? ''),
                conditionId: String(t.conditionId ?? ''),
              },
              side: (t.side as 'BUY' | 'SELL') ?? 'BUY',
              outcome: String(t.outcome ?? ''),
              size: Number(t.size ?? 0),
              price: Number(t.price ?? 0),
              timestamp: Number(t.timestamp ?? 0),
              transactionHash: String(t.transactionHash ?? ''),
            });
            continue;
          }
        }
      } catch {
        /* skip wallet on fetch error */
      } finally {
        clearTimeout(timer);
      }
    }

    entries.push({
      wallet,
      pseudonym: '',
      name: wallet,
      market: { id: 'unknown', venue: 'polymarket', title: '' },
      side: 'BUY',
      outcome: '',
      size: 0,
      price: 0,
      timestamp: 0,
      transactionHash: '',
    });
  }

  return { entries };
}
