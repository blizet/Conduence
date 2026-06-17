'use client';

import type { ReactNode } from 'react';
import type { WalletCotNodeDetail } from '@/lib/wallet-graph';

function formatUsd(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '—';
  return `$${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 })}`;
}

function formatNum(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '—';
  return value.toLocaleString(undefined, { maximumFractionDigits: 4 });
}

function formatTimestamp(value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === '') return '—';
  const date = typeof value === 'number'
    ? new Date(value > 1e12 ? value : value * 1000)
    : new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString();
}

function MetaRow({ label, value }: { label: string; value: ReactNode }) {
  if (value === null || value === undefined || value === '' || value === '—') return null;
  return (
    <div className="cot-graph-info-meta__row">
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

type WalletCotNodeInspectorProps = {
  detail: WalletCotNodeDetail | null;
  nodeId: string | null;
  degree: number;
  neighbors: Array<{ id: string; label: string }>;
};

export function WalletCotNodeInspector({
  detail,
  nodeId,
  degree,
  neighbors,
}: WalletCotNodeInspectorProps) {
  if (!nodeId) {
    return <p className="wallet-lab-hint">Click a node to inspect market, volume, capital, and trade details.</p>;
  }

  if (!detail) {
    return (
      <dl className="cot-graph-info-meta">
        <MetaRow label="ID" value={<code>{nodeId}</code>} />
        <MetaRow label="Degree" value={degree} />
        <MetaRow label="Note" value="No enriched metadata for this node." />
      </dl>
    );
  }

  const nodeType = detail.nodeType;

  return (
    <div className="wallet-lab-node-detail">
      <dl className="cot-graph-info-meta">
        <MetaRow label="Type" value={nodeType} />
        <MetaRow label="Origin" value={detail.origin} />
        <MetaRow label="ID" value={<code>{nodeId}</code>} />
        <MetaRow label="Degree" value={degree} />

        {nodeType === 'market' ? (
          <>
            <MetaRow label="Market" value={detail.market} />
            <MetaRow label="Platform" value={detail.platform} />
            <MetaRow label="Trades" value={detail.tradeCount} />
            <MetaRow label="Volume" value={formatNum(detail.totalVolume)} />
            <MetaRow label="Capital" value={formatUsd(detail.totalCapital)} />
            {detail.categories?.length ? (
              <MetaRow label="Themes" value={detail.categories.join(', ')} />
            ) : null}
          </>
        ) : null}

        {nodeType === 'trade' ? (
          <>
            <MetaRow label="Market" value={detail.market} />
            <MetaRow label="Platform" value={detail.platform} />
            <MetaRow label="Action" value={detail.action} />
            <MetaRow label="Side" value={detail.side} />
            <MetaRow label="Outcome" value={detail.outcome} />
            <MetaRow label="Price" value={formatUsd(detail.price)} />
            <MetaRow label="Volume" value={formatNum(detail.volume ?? detail.size)} />
            <MetaRow label="Capital" value={formatUsd(detail.capital ?? detail.usd)} />
            <MetaRow label="Timestamp" value={formatTimestamp(detail.timestamp)} />
            <MetaRow label="Tx hash" value={detail.txHash ? <code>{detail.txHash}</code> : null} />
          </>
        ) : null}

        {nodeType === 'user' ? (
          <>
            <MetaRow label="Wallet" value={<code>{detail.wallet}</code>} />
            <MetaRow label="Trades" value={detail.tradeCount} />
            <MetaRow label="Total volume" value={formatNum(detail.totalVolume)} />
            <MetaRow label="Total capital" value={formatUsd(detail.totalCapital)} />
            {detail.platforms?.length ? (
              <MetaRow label="Platforms" value={detail.platforms.join(', ')} />
            ) : null}
          </>
        ) : null}

        {nodeType === 'protocol' ? (
          <>
            <MetaRow label="Platform" value={detail.platform} />
            <MetaRow label="Trades" value={detail.tradeCount} />
            <MetaRow label="Capital" value={formatUsd(detail.totalCapital)} />
          </>
        ) : null}

        {nodeType === 'feedback' ? (
          <MetaRow label="Linked trade" value={detail.linkedTradeId ? <code>{detail.linkedTradeId}</code> : null} />
        ) : null}
      </dl>

      {detail.thesis ? (
        <div className="wallet-lab-node-detail__block">
          <h4>Thesis</h4>
          <p>{detail.thesis}</p>
        </div>
      ) : null}

      {nodeType === 'market' && detail.trades?.length ? (
        <div className="wallet-lab-node-detail__block">
          <h4>Trades on this market</h4>
          <ul className="wallet-lab-trade-list">
            {detail.trades.map((trade) => (
              <li key={trade.tradeId}>
                <strong>{trade.action ?? 'Trade'}</strong>
                <span>{formatUsd(trade.capital)} · vol {formatNum(trade.volume)}</span>
                <span className="wallet-lab-trade-list__meta">{formatTimestamp(trade.timestamp)}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {neighbors.length > 0 ? (
        <div className="wallet-lab-node-detail__block">
          <h4>Connected nodes</h4>
          <ul className="wallet-lab-neighbor-list">
            {neighbors.map((n) => (
              <li key={n.id}>
                <code>{n.label}</code>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
