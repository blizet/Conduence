'use client';

import { useCallback, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { GraphView } from '@/components/agentic/GraphView';
import '@/components/agentic/agentic-graph.css';
import { CotSnapshotCanvas } from './CotSnapshotCanvas';
import { fetchWalletGraphPreview, type WalletGraphPreview } from '@/lib/wallet-graph';

export function WalletGraphLab() {
  const [wallet, setWallet] = useState('');
  const [limit, setLimit] = useState(50);
  const [kalshiApiKeyId, setKalshiApiKeyId] = useState('');
  const [kalshiPrivateKeyPem, setKalshiPrivateKeyPem] = useState('');
  const [showKalshi, setShowKalshi] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<WalletGraphPreview | null>(null);

  const generate = useCallback(async () => {
    const trimmed = wallet.trim();
    if (!trimmed) {
      setError('Enter a Polymarket wallet address (0x…)');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const result = await fetchWalletGraphPreview({
        wallet: trimmed,
        limit,
        kalshiApiKeyId: kalshiApiKeyId.trim() || undefined,
        kalshiPrivateKeyPem: kalshiPrivateKeyPem.trim() || undefined,
      });
      setPreview(result);
    } catch (err) {
      setPreview(null);
      setError(err instanceof Error ? err.message : 'Failed to build graphs');
    } finally {
      setLoading(false);
    }
  }, [wallet, limit, kalshiApiKeyId, kalshiPrivateKeyPem]);

  const agenticStats = preview?.agenticGraph.stats;
  const cotStats = preview?.cotGraph.stats;

  return (
    <div className="wallet-lab-shell playground-shell">
      <header className="playground-header">
        <div className="playground-header__brand">
          <Image src="/conduence-logo.png" alt="" width={28} height={28} />
          <span>Wallet graph lab</span>
        </div>
        <div className="wallet-lab-header-actions">
          <Link href="/" className="graph-view-toggle" title="Back to workflow builder">
            Workflow
          </Link>
          <Link href="/simulate" className="graph-view-toggle" title="Paper trading">
            Paper trading
          </Link>
        </div>
      </header>

      <section className="wallet-lab-form">
        <div className="wallet-lab-form__row">
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
              min={5}
              max={500}
              value={limit}
              onChange={(e) => setLimit(Number(e.target.value) || 50)}
            />
          </label>
          <button
            type="button"
            className="wallet-lab-generate"
            onClick={() => void generate()}
            disabled={loading}
          >
            {loading ? 'Building…' : 'Build graphs'}
          </button>
        </div>

        <button
          type="button"
          className="wallet-lab-kalshi-toggle"
          onClick={() => setShowKalshi((v) => !v)}
        >
          {showKalshi ? 'Hide' : 'Add'} Kalshi credentials (optional)
        </button>

        {showKalshi ? (
          <div className="wallet-lab-form__row wallet-lab-form__row--kalshi">
            <label className="wallet-lab-field wallet-lab-field--grow">
              <span>Kalshi API key ID</span>
              <input
                type="text"
                value={kalshiApiKeyId}
                onChange={(e) => setKalshiApiKeyId(e.target.value)}
                spellCheck={false}
                autoComplete="off"
              />
            </label>
            <label className="wallet-lab-field wallet-lab-field--grow">
              <span>Kalshi private key (PEM)</span>
              <textarea
                rows={3}
                value={kalshiPrivateKeyPem}
                onChange={(e) => setKalshiPrivateKeyPem(e.target.value)}
                spellCheck={false}
                autoComplete="off"
              />
            </label>
          </div>
        ) : null}

        <p className="wallet-lab-form__hint">
          Paste a public Polymarket address — no MetaMask required. We fetch on-chain trade history and
          build an <strong>agentic correlation graph</strong> (weighted beliefs) and a <strong>CoT decision graph</strong>{' '}
          (user → market → trade chains) side by side.
        </p>

        {error ? <div className="app-banner">{error}</div> : null}
        {preview?.errors?.length ? (
          <div className="wallet-lab-warnings">
            {preview.errors.map((msg) => (
              <div key={msg}>{msg}</div>
            ))}
          </div>
        ) : null}
      </section>

      {preview ? (
        <section className="wallet-lab-stats">
          <span>{preview.tradeCount} trades</span>
          <span>Platforms: {preview.platforms.join(', ')}</span>
          <span>CoT graph: {preview.cotGraph.graph_id}</span>
          {agenticStats ? (
            <span>
              Agentic: {agenticStats.marketNodes ?? 0} markets, {agenticStats.inferredEdges ?? 0} inferred links
            </span>
          ) : null}
          {cotStats ? (
            <span>
              CoT: {cotStats.decisionCount ?? 0} decisions, {cotStats.correlationEdges ?? 0} market links
            </span>
          ) : null}
        </section>
      ) : null}

      <section className="wallet-lab-panels">
        <div className="wallet-lab-panel">
          <header className="wallet-lab-panel__head">
            <h2>CoT decision graph</h2>
            <p>Extracted trade history as decision chains — dashed yellow edges are correlated markets (same as agentic graph)</p>
          </header>
          <CotSnapshotCanvas
            snapshot={preview?.cotGraph.snapshot ?? null}
            nodeDetails={preview?.cotGraph.nodeDetails}
            emptyMessage="Enter a wallet and click Build graphs."
          />
        </div>

        <div className="wallet-lab-panel wallet-lab-panel--agentic">
          <header className="wallet-lab-panel__head">
            <h2>Agentic correlation graph</h2>
            <p>Markets you traded (extracted) + theme & co-trade links (inferred weights)</p>
          </header>
          <div className="wallet-lab-agentic-wrap">
            {preview?.agenticGraph.nodes.length ? (
              <GraphView graph={preview.agenticGraph} />
            ) : (
              <div className="wallet-lab-empty wallet-lab-empty--agentic">
                Enter a wallet and click Build graphs.
              </div>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
