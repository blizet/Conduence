'use client';

import { useCallback, useState } from 'react';
import type { NodeProps } from '@xyflow/react';
import {
  DEFAULT_WHALE_WALLET_SYSTEM_PROMPT,
  DEFAULT_WHALE_WALLET_USER_PROMPT,
} from '../constants';
import { GlassNode } from '../shared/GlassNode';
import { ApiKeyField } from '../shared/ApiKeyField';
import { SubagentPromptFields } from '../shared/SubagentPromptFields';
import { stopNodeKeyPropagation, useNodeData } from '../shared/useNodeData';
import type { WorkflowNode } from '../types';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

function WhaleIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M2 9c2-3 4-4 6-4s4 1 6 4" />
      <circle cx="12" cy="6" r="0.5" fill="currentColor" />
      <path d="M2 9v2c0 1 1 2 2 2h1" />
    </svg>
  );
}

export function WhaleWalletNode({ id, data, selected }: NodeProps<WorkflowNode>) {
  const updateData = useNodeData(id);
  const [busy, setBusy] = useState(false);
  const wallets = data.walletAddresses ?? [''];

  const updateWallet = (index: number, value: string) => {
    const next = [...wallets];
    next[index] = value;
    updateData({ walletAddresses: next });
  };

  const addWallet = () => {
    updateData({ walletAddresses: [...wallets, ''] });
  };

  const removeWallet = (index: number) => {
    if (wallets.length <= 1) return;
    updateData({ walletAddresses: wallets.filter((_, i) => i !== index) });
  };

  const trackWallets = useCallback(async () => {
    const addresses = wallets.map((w) => w.trim()).filter(Boolean);
    if (addresses.length === 0) {
      updateData({ whaleStatus: 'Add at least one wallet address' });
      return;
    }

    setBusy(true);
    updateData({ whaleStatus: 'Tracking…' });

    try {
      const backendUrl = (data.backendUrl ?? API).replace(/\/$/, '');
      const res = await fetch(`${backendUrl}/api/tools/whale/track`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          walletAddresses: addresses,
          conditionId: data.conditionId?.trim() || undefined,
          apiKey: data.apiKey?.trim() || undefined,
        }),
      });
      const body = await res.json();
      if (!res.ok) {
        updateData({ whaleStatus: String(body.error ?? `Track failed (${res.status})`) });
        return;
      }
      updateData({
        whaleOutput: JSON.stringify(body, null, 2),
        whaleStatus: `${body.entries?.length ?? 0} entries`,
      });
    } catch (err) {
      updateData({ whaleStatus: err instanceof Error ? err.message : 'Request failed' });
    } finally {
      setBusy(false);
    }
  }, [data.apiKey, data.backendUrl, data.conditionId, updateData, wallets]);

  return (
    <GlassNode
      label={data.label}
      description={data.description}
      category="subagent"
      accent={data.accent}
      icon={<WhaleIcon />}
      selected={selected}
      wide
      handles={[
        { type: 'target', position: 'left' },
        { type: 'source', position: 'right' },
      ]}
    >
      <div onKeyDown={stopNodeKeyPropagation}>
        <ApiKeyField
          label="Data API key (optional)"
          value={data.apiKey ?? ''}
          placeholder="Polymarket data API key…"
          onChange={(v) => updateData({ apiKey: v })}
        />
        <div className="node-field">
          <div className="node-field__label">Wallet addresses</div>
          {wallets.map((address, index) => (
            <div key={index} className="node-input-row">
              <input
                className="node-input"
                type="text"
                placeholder="0x…"
                value={address}
                onChange={(e) => updateWallet(index, e.target.value)}
                onKeyDown={stopNodeKeyPropagation}
              />
              {wallets.length > 1 && (
                <button
                  type="button"
                  className="node-icon-btn node-icon-btn--remove"
                  onClick={() => removeWallet(index)}
                  title="Remove wallet"
                >
                  ×
                </button>
              )}
            </div>
          ))}
          <button type="button" className="node-add-btn" onClick={addWallet} title="Add wallet">
            <span>+</span> Add wallet
          </button>
        </div>
        <div className="node-field">
          <div className="node-field__label">Condition ID (optional filter)</div>
          <input
            className="node-input"
            type="text"
            placeholder="Filter trades by market condition…"
            value={data.conditionId ?? ''}
            onChange={(e) => updateData({ conditionId: e.target.value })}
            onKeyDown={stopNodeKeyPropagation}
          />
        </div>
        <SubagentPromptFields
          systemPrompt={data.systemPrompt ?? ''}
          userPrompt={data.userPrompt ?? ''}
          defaultSystem={DEFAULT_WHALE_WALLET_SYSTEM_PROMPT}
          defaultUser={DEFAULT_WHALE_WALLET_USER_PROMPT}
          onSystemChange={(v) => updateData({ systemPrompt: v })}
          onUserChange={(v) => updateData({ userPrompt: v })}
        />
        <button
          type="button"
          className="node-add-btn"
          style={{ borderColor: `${data.accent}55`, color: data.accent }}
          disabled={busy}
          onClick={() => void trackWallets()}
        >
          {busy ? 'Tracking…' : 'Track whale wallets'}
        </button>
        {data.whaleStatus && (
          <div className="node-field__hint" style={{ marginTop: 4 }}>
            {data.whaleStatus}
          </div>
        )}
      </div>
    </GlassNode>
  );
}
