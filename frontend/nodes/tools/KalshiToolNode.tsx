'use client';

import { useCallback, useState } from 'react';
import type { NodeProps } from '@xyflow/react';
import { clearFetchState, executeToolNode, toolResultPatch } from '@/lib/workflow-tools';
import { FetchResultPanel } from '../shared/FetchResultPanel';
import { GlassNode } from '../shared/GlassNode';
import { ApiKeyField } from '../shared/ApiKeyField';
import { LabeledInput, LabeledInputRow } from '../shared/LabeledField';
import { stopNodeKeyPropagation, useNodeData } from '../shared/useNodeData';
import type { KalshiAction, KalshiMode, KalshiSide, KalshiTradeSource, WorkflowNode } from '../types';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

const MODES: { id: KalshiMode; label: string }[] = [
  { id: 'read', label: 'Read' },
  { id: 'execute', label: 'Execute' },
];

const TRADE_SOURCES: { id: KalshiTradeSource; label: string }[] = [
  { id: 'upstream', label: 'From Orchestrator' },
  { id: 'manual', label: 'Manual' },
];

const SIDES: { id: KalshiSide; label: string }[] = [
  { id: 'yes', label: 'Yes' },
  { id: 'no', label: 'No' },
];

const ACTIONS: { id: KalshiAction; label: string }[] = [
  { id: 'buy', label: 'Buy' },
  { id: 'sell', label: 'Sell' },
];

function KalshiIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M3 4h10v8H3z" />
      <path d="M6 7h4M6 9.5h2.5" />
      <path d="M11 2.5v2M5 2.5v2" />
    </svg>
  );
}

export function KalshiToolNode({ id, data, selected }: NodeProps<WorkflowNode>) {
  const updateData = useNodeData(id);
  const [busy, setBusy] = useState(false);
  const mode = data.kalshiMode ?? 'read';
  const tradeSource = data.kalshiTradeSource ?? 'manual';
  const isExecute = mode === 'execute';
  const useUpstream = tradeSource === 'upstream';

  const runKalshi = useCallback(async () => {
    const ticker = data.kalshiTicker?.trim();
    if (!ticker) {
      updateData({ kalshiStatus: 'Market ticker required' });
      return;
    }

    setBusy(true);
    updateData({
      ...clearFetchState(),
      kalshiStatus: isExecute ? 'Submitting…' : 'Fetching quote…',
    });

    try {
      if (!isExecute) {
        const result = await executeToolNode('kalshi', data);
        updateData({
          ...toolResultPatch(result),
          kalshiQuoteJson: result.ok ? JSON.stringify(result.data ?? result, null, 2) : '',
          kalshiStatus: result.ok ? 'Quote fetched' : (result.error ?? 'Quote failed'),
        });
        return;
      }

      const backendUrl = (data.backendUrl ?? API).replace(/\/$/, '');
      const count = Number(data.kalshiCount ?? data.tradeSize ?? 0);
      const price = Number(data.kalshiPrice ?? data.tradePrice ?? 0);
      const started = performance.now();
      const res = await fetch(`${backendUrl}/api/tools/kalshi/execute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ticker,
          action: data.kalshiAction ?? 'buy',
          side: data.kalshiSide ?? 'yes',
          count,
          price,
          apiKey: data.apiKey,
          apiSecret: data.apiSecret,
        }),
      });
      const durationMs = Math.round(performance.now() - started);
      const body = (await res.json()) as Record<string, unknown>;
      const ok = res.ok && body.status !== 'error' && !body.error;
      updateData({
        ...toolResultPatch({
          ok,
          source: 'kalshi',
          request: { ticker, count, price },
          data: body,
          error: ok ? null : String(body.message ?? body.error ?? res.status),
          durationMs,
        }),
        kalshiStatus: String(body.message ?? body.error ?? body.status ?? (ok ? 'Done' : 'Failed')),
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Request failed';
      updateData({
        workflowStatus: 'error',
        workflowError: message,
        kalshiStatus: message,
      });
    } finally {
      setBusy(false);
    }
  }, [data, isExecute, updateData]);

  return (
    <GlassNode
      label={data.label}
      description={data.description}
      category="tool"
      accent={data.accent}
      icon={<KalshiIcon />}
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
                  onClick={() => updateData({ kalshiMode: modeId })}
                >
                  {label}
                </button>
              );
            })}
          </div>
        </div>

        {isExecute ? (
          <div className="node-field">
            <div className="node-field__label">Trade source</div>
            <div className="node-chips">
              {TRADE_SOURCES.map(({ id: sourceId, label }) => {
                const active = tradeSource === sourceId;
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
                    onClick={() => updateData({ kalshiTradeSource: sourceId })}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          </div>
        ) : null}

        {useUpstream && isExecute ? (
          <div className="node-field__hint">
            Connect Orchestrator → reads ticker, side, action, count, price from trade details.
          </div>
        ) : null}

        <div className="node-field">
          <div className="node-field__label">Market ticker</div>
          <input
            className="node-input nodrag"
            type="text"
            placeholder="e.g. KXBTC-25DEC31"
            value={data.kalshiTicker ?? ''}
            onChange={(e) => updateData({ kalshiTicker: e.target.value })}
            onKeyDown={stopNodeKeyPropagation}
          />
        </div>

        {isExecute ? (
          <>
            <div className="node-field">
              <div className="node-field__label">Side</div>
              <div className="node-chips">
                {SIDES.map(({ id: sideId, label }) => {
                  const active = (data.kalshiSide ?? 'yes') === sideId;
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
                      onClick={() => updateData({ kalshiSide: sideId })}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="node-field">
              <div className="node-field__label">Action</div>
              <div className="node-chips">
                {ACTIONS.map(({ id: actionId, label }) => {
                  const active = (data.kalshiAction ?? 'buy') === actionId;
                  return (
                    <button
                      key={actionId}
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
                      onClick={() => updateData({ kalshiAction: actionId })}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            </div>
            <LabeledInputRow>
              <LabeledInput
                label="Contracts"
                inline
                placeholder="10"
                value={data.kalshiCount ?? ''}
                onChange={(v) => updateData({ kalshiCount: v })}
              />
              <LabeledInput
                label="Limit (¢)"
                inline
                placeholder="50"
                value={data.kalshiPrice ?? ''}
                onChange={(v) => updateData({ kalshiPrice: v })}
              />
            </LabeledInputRow>
            <ApiKeyField
              label="Kalshi API key ID"
              value={data.apiKey ?? ''}
              onChange={(v) => updateData({ apiKey: v })}
            />
            <ApiKeyField
              label="Kalshi private key (PEM)"
              value={data.apiSecret ?? ''}
              placeholder="-----BEGIN RSA PRIVATE KEY-----…"
              onChange={(v) => updateData({ apiSecret: v })}
            />
          </>
        ) : null}

        <button
          type="button"
          className="node-add-btn"
          style={{ marginTop: 4, borderColor: `${data.accent}55`, color: data.accent }}
          disabled={busy}
          onClick={() => void runKalshi()}
        >
          {busy ? 'Working…' : isExecute ? 'Execute trade' : 'Fetch quote'}
        </button>

        <FetchResultPanel
          status={data.workflowStatus}
          error={data.workflowError}
          result={data.workflowResult}
          durationMs={data.workflowDurationMs}
        />
      </div>
    </GlassNode>
  );
}
