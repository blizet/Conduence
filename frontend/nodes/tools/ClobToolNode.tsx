'use client';

import { useCallback, useState } from 'react';
import type { NodeProps } from '@xyflow/react';
import { GlassNode } from '../shared/GlassNode';
import { ApiKeyField } from '../shared/ApiKeyField';
import { stopNodeKeyPropagation, useNodeData } from '../shared/useNodeData';
import type { ClobExecuteSide, ClobMode, ClobTokenSource, WorkflowNode } from '../types';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

const MODES: { id: ClobMode; label: string }[] = [
  { id: 'read', label: 'Read' },
  { id: 'execute', label: 'Execute' },
];

const TOKEN_SOURCES: { id: ClobTokenSource; label: string }[] = [
  { id: 'upstream', label: 'From LLM' },
  { id: 'manual', label: 'Manual' },
];

const EXECUTE_SIDES: { id: ClobExecuteSide; label: string }[] = [
  { id: 'BUY', label: 'Buy' },
  { id: 'SELL', label: 'Sell' },
  { id: 'BOTH', label: 'Both' },
];

function ClobIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M2 12V4h12v8H2z" />
      <path d="M5 8h6M8 5v6" />
    </svg>
  );
}

export function ClobToolNode({ id, data, selected }: NodeProps<WorkflowNode>) {
  const updateData = useNodeData(id);
  const [busy, setBusy] = useState(false);
  const mode = data.clobMode ?? 'read';
  const tokenSource = data.clobTokenSource ?? 'manual';
  const executeSide = data.executeSide ?? data.tradeSide ?? 'BOTH';
  const isExecute = mode === 'execute';
  const useUpstream = tokenSource === 'upstream';

  const runClob = useCallback(async () => {
    const tokenId = data.tokenId?.trim();
    if (!tokenId) {
      updateData({ clobStatus: 'Token ID required (manual mode)' });
      return;
    }

    setBusy(true);
    updateData({ clobStatus: isExecute ? 'Submitting…' : 'Fetching quote…' });

    try {
      const backendUrl = (data.backendUrl ?? API).replace(/\/$/, '');
      if (isExecute) {
        const size = Number(data.tradeSize ?? 0);
        const price = Number(data.tradePrice ?? 0);
        const side = executeSide === 'BOTH' ? (data.tradeSide ?? 'BUY') : executeSide;
        const res = await fetch(`${backendUrl}/api/tools/clob/execute`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            tokenId,
            side,
            size,
            price,
            apiKey: data.apiKey,
            apiSecret: data.apiSecret,
            apiPassphrase: data.apiPassphrase,
          }),
        });
        const body = (await res.json()) as { status?: string; message?: string; error?: string };
        updateData({
          clobStatus: body.message ?? body.error ?? body.status ?? 'Done',
        });
      } else {
        const res = await fetch(`${backendUrl}/api/tools/clob/quote`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tokenId }),
        });
        const body = await res.json();
        updateData({
          clobQuoteJson: JSON.stringify(body, null, 2),
          clobStatus: res.ok ? 'Quote fetched' : String(body.error ?? res.status),
        });
      }
    } catch (err) {
      updateData({ clobStatus: err instanceof Error ? err.message : 'Request failed' });
    } finally {
      setBusy(false);
    }
  }, [data, executeSide, isExecute, updateData]);

  return (
    <GlassNode
      label={data.label}
      description={data.description}
      category="tool"
      accent={data.accent}
      icon={<ClobIcon />}
      selected={selected}
      wide
      handles={[
        { type: 'target', position: 'left', id: 'in-decision', style: { top: '40%' } },
        { type: 'source', position: 'right' },
      ]}
    >
      <div onKeyDown={stopNodeKeyPropagation}>
        <div className="node-field">
          <div className="node-field__label">Mode</div>
          <div className="node-chips">
            {MODES.map(({ id: modeId, label }) => {
              const active = mode === modeId;
              return (
                <button
                  key={modeId}
                  type="button"
                  className={`node-chip${active ? ' node-chip--active' : ''}`}
                  style={
                    active
                      ? {
                          borderColor: data.accent,
                          background: `${data.accent}22`,
                          color: data.accent,
                        }
                      : undefined
                  }
                  onClick={() => updateData({ clobMode: modeId })}
                >
                  {label}
                </button>
              );
            })}
          </div>
        </div>

        <div className="node-field">
          <div className="node-field__label">Market / token source</div>
          <div className="node-chips">
            {TOKEN_SOURCES.map(({ id: sourceId, label }) => {
              const active = tokenSource === sourceId;
              return (
                <button
                  key={sourceId}
                  type="button"
                  className={`node-chip${active ? ' node-chip--active' : ''}`}
                  style={
                    active
                      ? {
                          borderColor: data.accent,
                          background: `${data.accent}22`,
                          color: data.accent,
                        }
                      : undefined
                  }
                  onClick={() => updateData({ clobTokenSource: sourceId })}
                >
                  {label}
                </button>
              );
            })}
          </div>
        </div>

        {useUpstream ? (
          <div className="node-field__hint">
            Connect LLM Analyzer → reads market_id, condition_id, action. Manual token ID used as fallback.
          </div>
        ) : null}

        <div className="node-field">
          <div className="node-field__label">Token ID</div>
          <input
            className="node-input"
            type="text"
            placeholder="CLOB token_id"
            value={data.tokenId ?? ''}
            onChange={(e) => updateData({ tokenId: e.target.value })}
            onKeyDown={stopNodeKeyPropagation}
          />
        </div>

        {isExecute ? (
          <>
            <div className="node-field">
              <div className="node-field__label">Execute side</div>
              <div className="node-chips">
                {EXECUTE_SIDES.map(({ id: sideId, label }) => {
                  const active = executeSide === sideId;
                  return (
                    <button
                      key={sideId}
                      type="button"
                      className={`node-chip${active ? ' node-chip--active' : ''}`}
                      style={
                        active
                          ? {
                              borderColor: data.accent,
                              background: `${data.accent}22`,
                              color: data.accent,
                            }
                          : undefined
                      }
                      onClick={() =>
                        updateData({
                          executeSide: sideId,
                          ...(sideId !== 'BOTH' ? { tradeSide: sideId } : {}),
                        })
                      }
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="node-input-row">
              <input
                className="node-input"
                type="text"
                placeholder="Size"
                value={data.tradeSize ?? ''}
                onChange={(e) => updateData({ tradeSize: e.target.value })}
                onKeyDown={stopNodeKeyPropagation}
              />
              <input
                className="node-input"
                type="text"
                placeholder="Price"
                value={data.tradePrice ?? ''}
                onChange={(e) => updateData({ tradePrice: e.target.value })}
                onKeyDown={stopNodeKeyPropagation}
              />
            </div>
            <ApiKeyField
              label="CLOB API key"
              value={data.apiKey ?? ''}
              onChange={(v) => updateData({ apiKey: v })}
            />
            <ApiKeyField
              label="CLOB secret"
              value={data.apiSecret ?? ''}
              placeholder="API secret…"
              onChange={(v) => updateData({ apiSecret: v })}
            />
            <ApiKeyField
              label="Passphrase"
              value={data.apiPassphrase ?? ''}
              placeholder="API passphrase…"
              onChange={(v) => updateData({ apiPassphrase: v })}
            />
          </>
        ) : null}

        <button
          type="button"
          className="node-add-btn"
          style={{ marginTop: 4, borderColor: `${data.accent}55`, color: data.accent }}
          disabled={busy}
          onClick={() => void runClob()}
        >
          {busy ? 'Working…' : isExecute ? 'Execute trade' : 'Fetch quote'}
        </button>

        {data.clobStatus && (
          <div className="node-field__hint" style={{ marginTop: 4 }}>
            {data.clobStatus}
          </div>
        )}
      </div>
    </GlassNode>
  );
}
