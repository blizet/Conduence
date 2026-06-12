'use client';

import type { NodeProps } from '@xyflow/react';
import { FetchResultPanel } from '../shared/FetchResultPanel';
import { GlassNode } from '../shared/GlassNode';
import { useToolFetch } from '../shared/useToolFetch';
import { LabeledInput, LabeledInputRow } from '../shared/LabeledField';
import { ToolAccessFields } from '../shared/ToolAccessFields';
import { stopNodeKeyPropagation, useNodeData } from '../shared/useNodeData';
import type { WorkflowNode } from '../types';

function CryptoNewsIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4">
      <path d="M2 4h12v8H2z" />
      <path d="M5 7h6M5 9h4" />
    </svg>
  );
}

export function CryptoNewsNode({ id, data, selected }: NodeProps<WorkflowNode>) {
  const updateData = useNodeData(id);
  const { busy, runFetch } = useToolFetch('cryptonews', data, updateData);

  return (
    <GlassNode
      label={data.label}
      description={data.description}
      category="tool"
      accent={data.accent}
      icon={<CryptoNewsIcon />}
      selected={selected}
      wide
      handles={[
        { type: 'target', position: 'left' },
        { type: 'source', position: 'right' },
      ]}
    >
      <div onKeyDown={stopNodeKeyPropagation}>
        <ToolAccessFields
          toolId="cryptonews"
          accessMode={data.toolAccessMode ?? 'private'}
          endpoint={data.toolEndpoint ?? 'ticker_news'}
          apiKey={data.apiKey ?? ''}
          onAccessModeChange={(toolAccessMode) => updateData({ toolAccessMode })}
          onEndpointChange={(toolEndpoint) => updateData({ toolEndpoint })}
          onApiKeyChange={(apiKey) => updateData({ apiKey })}
        />
        <LabeledInputRow>
          <LabeledInput
            label="Tickers"
            inline
            placeholder="BTC,ETH"
            value={data.cryptonewsTickers ?? ''}
            onChange={(v) => updateData({ cryptonewsTickers: v })}
          />
          <LabeledInput
            label="Article count"
            inline
            placeholder="10"
            value={data.cryptonewsItems ?? ''}
            onChange={(v) => updateData({ cryptonewsItems: v })}
          />
        </LabeledInputRow>
        <LabeledInputRow>
          <LabeledInput
            label="Sentiment filter"
            inline
            placeholder="Optional"
            value={data.cryptonewsSentiment ?? ''}
            onChange={(v) => updateData({ cryptonewsSentiment: v })}
          />
          <LabeledInput
            label="Keywords"
            inline
            placeholder="Optional"
            value={data.cryptonewsKeywords ?? ''}
            onChange={(v) => updateData({ cryptonewsKeywords: v })}
          />
        </LabeledInputRow>
        <button
          type="button"
          className="node-add-btn"
          style={{ borderColor: `${data.accent}55`, color: data.accent, marginTop: 6 }}
          disabled={busy}
          onClick={() => void runFetch()}
        >
          {busy ? 'Fetching…' : 'Fetch CryptoNews'}
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
