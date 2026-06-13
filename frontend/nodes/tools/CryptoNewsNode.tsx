'use client';

import type { NodeProps } from '@xyflow/react';
import { GlassNode } from '../shared/GlassNode';
import { ApiKeyField } from '../shared/ApiKeyField';
import { LabeledInput, LabeledInputRow } from '../shared/LabeledField';
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
        <ApiKeyField
          label="CryptoNews API key"
          value={data.apiKey ?? ''}
          onChange={(apiKey) =>
            updateData({ apiKey, toolAccessMode: 'private', toolEndpoint: 'ticker_news' })
          }
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
      </div>
    </GlassNode>
  );
}
