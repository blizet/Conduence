'use client';

import type { NodeProps } from '@xyflow/react';
import { GlassNode } from '../shared/GlassNode';
import { ApiKeyField } from '../shared/ApiKeyField';
import { LabeledInput, LabeledInputRow } from '../shared/LabeledField';
import { stopNodeKeyPropagation, useNodeData } from '../shared/useNodeData';
import type { WorkflowNode } from '../types';

function CoinMarketCapIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4">
      <path d="M2.5 8a5.5 5.5 0 1 1 11 0" />
      <path d="M8 5v4m0 0l2-2m-2 2L6 7" />
    </svg>
  );
}

export function CoinMarketCapNode({ id, data, selected }: NodeProps<WorkflowNode>) {
  const updateData = useNodeData(id);

  return (
    <GlassNode
      label={data.label}
      description={data.description}
      category="tool"
      accent={data.accent}
      icon={<CoinMarketCapIcon />}
      selected={selected}
      wide
      handles={[
        { type: 'target', position: 'left' },
        { type: 'source', position: 'right' },
      ]}
    >
      <div onKeyDown={stopNodeKeyPropagation}>
        <ApiKeyField
          label="CoinMarketCap API key"
          value={data.apiKey ?? ''}
          onChange={(apiKey) => updateData({ apiKey, toolAccessMode: 'private', toolEndpoint: 'quotes_latest' })}
        />
        <LabeledInputRow>
          <LabeledInput
            label="Symbols"
            inline
            placeholder="BTC,ETH"
            value={data.cmcSymbols ?? ''}
            onChange={(v) => updateData({ cmcSymbols: v })}
          />
          <LabeledInput
            label="Quote currency"
            inline
            placeholder="USD"
            value={data.cmcConvert ?? ''}
            onChange={(v) => updateData({ cmcConvert: v })}
          />
        </LabeledInputRow>
      </div>
    </GlassNode>
  );
}
