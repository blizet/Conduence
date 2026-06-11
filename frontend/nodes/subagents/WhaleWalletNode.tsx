'use client';

import { useCallback, useEffect, useState } from 'react';
import type { NodeProps } from '@xyflow/react';
import { useAgentFeed } from '@/lib/agent-feed';
import {
  DEFAULT_WHALE_WALLET_SYSTEM_PROMPT,
  DEFAULT_WHALE_WALLET_USER_PROMPT,
} from '../constants';
import { GlassNode } from '../shared/GlassNode';
import { ApiKeyField } from '../shared/ApiKeyField';
import { LlmProviderFields } from '../shared/LlmProviderFields';
import type { LlmProvider } from '@/lib/llm-providers';
import { SubagentPromptFields } from '../shared/SubagentPromptFields';
import { stopNodeKeyPropagation, useNodeData } from '../shared/useNodeData';
import type { WorkflowNode } from '../types';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';
const AGENT_ID = 'whaleWallet';

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
  const { agentFeeds, startAgent, stopAgent, refreshAgentStatus } = useAgentFeed();
  const updateData = useNodeData(id);
  const [busy, setBusy] = useState(false);
  const wallets = data.walletAddresses ?? [''];
  const feed = agentFeeds[AGENT_ID];
  const running = feed?.running ?? false;
  const simulate = data.simulate ?? false;

  useEffect(() => {
    void refreshAgentStatus(AGENT_ID);
  }, [refreshAgentStatus]);

  const toggleStream = () => {
    const addresses = wallets.map((w) => w.trim()).filter(Boolean);
    if (running) {
      stopAgent(AGENT_ID);
      return;
    }
    void startAgent(AGENT_ID, {
      walletAddresses: addresses,
      conditionId: data.conditionId?.trim() || undefined,
      apiKey: data.apiKey?.trim() || undefined,
      simulate,
      pollIntervalS: 30,
      llmProvider: data.llmProvider,
      llmApiKey: data.llmApiKey?.trim() || undefined,
      model: data.model,
      systemPrompt: data.systemPrompt,
      userPrompt: data.userPrompt,
    });
  };

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
        { type: 'target', position: 'left', id: 'in-tools' },
        { type: 'source', position: 'right', id: 'out-whale' },
      ]}
    >
      <div onKeyDown={stopNodeKeyPropagation}>
        <ApiKeyField
          label="Polymarket Data API key (optional)"
          value={data.apiKey ?? ''}
          placeholder="Polymarket data API key — not an LLM key"
          onChange={(v) => updateData({ apiKey: v })}
        />
        <LlmProviderFields
          provider={data.llmProvider}
          model={data.model}
          apiKey={data.llmApiKey}
          apiKeyLabel="LLM API key (harness)"
          onProviderChange={(p: LlmProvider) => updateData({ llmProvider: p })}
          onModelChange={(v) => updateData({ model: v })}
          onApiKeyChange={(v) => updateData({ llmApiKey: v })}
        />
        <div className="node-field">
          <div className="node-field__label">Wallet addresses</div>
          {wallets.map((address, index) => (
            <div key={index} className="node-input-row">
              <input
                className="node-input nodrag"
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
            className="node-input nodrag"
            type="text"
            placeholder="Filter trades by market condition…"
            value={data.conditionId ?? ''}
            onChange={(e) => updateData({ conditionId: e.target.value })}
            onKeyDown={stopNodeKeyPropagation}
          />
        </div>
        <div className="node-field">
          <div className="node-field__label">Snap tools (left handle)</div>
          <div className="node-field__hint">Polymarket Wallet tool → polls trades for signals</div>
        </div>
        <div className="node-field">
          <div className="node-field__label">Sub-agent feed</div>
          <div className="node-status-row">
            <span
              className={`node-live-dot${running ? ' node-live-dot--on' : ''}`}
              style={{ color: running ? data.accent : undefined }}
            />
            <span className="node-field__hint">
              {running
                ? `Polling · ${feed?.feedTopic ?? `agent.feeds.${AGENT_ID}.public`}`
                : 'Start to emit whale signals on new trades'}
            </span>
          </div>
          <label className="node-checkbox-row nodrag">
            <input
              type="checkbox"
              checked={simulate}
              disabled={running}
              onChange={(e) => updateData({ simulate: e.target.checked })}
            />
            Simulate — replay sample whale trades
          </label>
          <button type="button" className="node-btn nodrag" onClick={toggleStream}>
            {running ? 'Stop sub-agent' : 'Start sub-agent'}
          </button>
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
