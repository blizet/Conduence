'use client';

import { useCallback, useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { CotSnapshotCanvas } from '@/components/wallet-lab/CotSnapshotCanvas';
import '@/components/agentic/agentic-graph.css';
import {
  clampTradeLimit,
  fetchUserCotGraph,
  fetchUserProfile,
  getOrCreateUserId,
  importWallet,
  TRADE_LIMIT_DEFAULT,
  TRADE_LIMIT_MAX,
  TRADE_LIMIT_MIN,
  type UserCotGraph,
  type UserProfile,
} from '@/lib/user-profile';
import type { WalletCotNodeDetail } from '@/lib/wallet-graph';

const AgenticGraphView = dynamic(
  () => import('@/components/agentic/AgenticGraphView').then((m) => m.AgenticGraphView),
  {
    ssr: false,
    loading: () => <div className="cot-graph-view cot-graph-view--loading">Loading agentic graph…</div>,
  },
);

type GraphPanel = 'user' | 'agentic';

export function GraphSection() {
  const [userId] = useState(() => getOrCreateUserId());
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [cotGraph, setCotGraph] = useState<UserCotGraph | null>(null);
  const [panel, setPanel] = useState<GraphPanel>('user');
  const [wallet, setWallet] = useState('');
  const [tradeLimit, setTradeLimit] = useState(TRADE_LIMIT_DEFAULT);
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const p = await fetchUserProfile(userId);
      setProfile(p);
      if (p.imported && p.user_slug) {
        const graph = await fetchUserCotGraph(userId);
        setCotGraph(graph);
        if (p.wallet) setWallet(p.wallet);
        if (p.import_limit) setTradeLimit(clampTradeLimit(p.import_limit));
      } else {
        setCotGraph(null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load graph');
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const onImport = useCallback(async () => {
    const trimmed = wallet.trim();
    if (!trimmed) {
      setError('Enter a Polymarket wallet address (0x…)');
      return;
    }
    const limit = clampTradeLimit(tradeLimit);
    setTradeLimit(limit);
    setImporting(true);
    setError(null);
    try {
      const result = await importWallet({ userId, wallet: trimmed, limit });
      setProfile(result.profile);
      setCotGraph(result.cotGraph);
      setPanel('user');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Import failed');
    } finally {
      setImporting(false);
    }
  }, [userId, wallet, tradeLimit]);

  const userSlug = profile?.user_slug ?? '';
  const nodeDetails = (cotGraph?.nodeDetails ?? {}) as Record<string, WalletCotNodeDetail>;
  const showGraphs = Boolean(profile?.imported && cotGraph);

  if (loading) {
    return <div className="graph-section graph-section--loading">Loading graph…</div>;
  }

  if (!showGraphs) {
    return (
      <div className="graph-section graph-section--onboard">
        <div className="graph-onboard">
          <h2>Import your wallet</h2>
          <p>
            Connect with a Polymarket wallet address to build your <strong>user decision graph</strong>{' '}
            from trade history. The macro <strong>agentic template</strong> is available after import — extend it via chat.
          </p>
          <div className="graph-onboard__row">
            <label className="wallet-lab-field wallet-lab-field--grow">
              <span>Polymarket wallet</span>
              <input
                type="text"
                placeholder="0x…"
                value={wallet}
                onChange={(e) => setWallet(e.target.value)}
                spellCheck={false}
                autoComplete="off"
              />
            </label>
            <label className="wallet-lab-field">
              <span>Trade limit</span>
              <input
                type="number"
                min={TRADE_LIMIT_MIN}
                max={TRADE_LIMIT_MAX}
                value={tradeLimit}
                onChange={(e) => setTradeLimit(clampTradeLimit(Number(e.target.value)))}
              />
            </label>
          </div>
          <button type="button" className="wallet-lab-generate" onClick={() => void onImport()} disabled={importing}>
            {importing ? 'Importing…' : 'Import wallet & build graph'}
          </button>
          {error ? <div className="app-banner">{error}</div> : null}
          <p className="graph-onboard__hint">
            No MetaMask required — paste a public address. Fetch {TRADE_LIMIT_MIN}–{TRADE_LIMIT_MAX} recent trades; graph persists to FalkorDB.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="graph-section">
      <div className="graph-section__toolbar">
        <div className="graph-section__toggles">
          <button
            type="button"
            className={`graph-view-toggle${panel === 'user' ? ' graph-view-toggle--active' : ''}`}
            onClick={() => setPanel('user')}
          >
            User graph
          </button>
          <button
            type="button"
            className={`graph-view-toggle${panel === 'agentic' ? ' graph-view-toggle--active' : ''}`}
            onClick={() => setPanel('agentic')}
          >
            Agentic graph
          </button>
        </div>
        <div className="graph-section__meta">
          <span title={profile?.wallet}>{profile?.wallet?.slice(0, 6)}…{profile?.wallet?.slice(-4)}</span>
          <span>{profile?.trade_count ?? 0} trades imported</span>
          <label className="graph-section__limit" title="Number of recent trades to fetch from Polymarket">
            <span>Limit</span>
            <input
              type="number"
              min={TRADE_LIMIT_MIN}
              max={TRADE_LIMIT_MAX}
              value={tradeLimit}
              onChange={(e) => setTradeLimit(clampTradeLimit(Number(e.target.value)))}
              disabled={importing}
            />
          </label>
          <button
            type="button"
            className="graph-view-toggle"
            onClick={() => void onImport()}
            disabled={importing}
            title="Re-fetch trade history with the selected limit"
          >
            {importing ? 'Importing…' : 'Re-import'}
          </button>
          <button type="button" className="graph-view-toggle" onClick={() => void refresh()} title="Reload graphs">
            Refresh
          </button>
        </div>
      </div>

      {error ? <div className="app-banner">{error}</div> : null}

      <div className="graph-section__canvas">
        {panel === 'user' ? (
          <div className="graph-section__panel">
            <header className="wallet-lab-panel__head">
              <h2>User decision graph</h2>
              <p>CoT chain from your wallet — markets, trades, capital. Click nodes for details.</p>
            </header>
            <CotSnapshotCanvas snapshot={cotGraph?.snapshot ?? null} nodeDetails={nodeDetails} />
          </div>
        ) : (
          <div className="graph-section__panel graph-section__panel--agentic">
            <header className="wallet-lab-panel__head">
              <h2>Agentic graph</h2>
              <p>Macro correlation template — extend via Session &amp; LLM chat. Your edits persist per user.</p>
            </header>
            {userSlug ? (
              <AgenticGraphView userSlug={userSlug} />
            ) : (
              <div className="wallet-lab-empty">User slug missing — re-import wallet.</div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
