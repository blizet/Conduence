'use client';

import type { NodeProps } from '@xyflow/react';
import { GlassNode } from '../shared/GlassNode';
import { LabeledInput } from '../shared/LabeledField';
import { stopNodeKeyPropagation, useNodeData } from '../shared/useNodeData';
import type { WorkflowNode } from '../types';

function CoinGeckoIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4">
      <circle cx="8" cy="8" r="5.5" />
      <circle cx="6" cy="6.5" r="1.4" fill="currentColor" stroke="none" />
      <path d="M8 11c1.5 0 3-.6 4-1.8" />
    </svg>
  );
}

export function CoinGeckoNode({ id, data, selected }: NodeProps<WorkflowNode>) {
  const updateData = useNodeData(id);

  return (
    <GlassNode
      label={data.label}
      description={data.description}
      category="tool"
      accent={data.accent}
      icon={<CoinGeckoIcon />}
      selected={selected}
      wide
      handles={[
        { type: 'target', position: 'left' },
        { type: 'source', position: 'right' },
      ]}
    >
      <div onKeyDown={stopNodeKeyPropagation}>
        <LabeledInput
          label="CoinGecko IDs"
          placeholder="bitcoin, ethereum, solana"
          value={data.coingeckoIds ?? ''}
          onChange={(v) =>
            updateData({
              coingeckoIds: v,
              toolAccessMode: 'public',
              toolEndpoint: 'simple_price',
            })
          }
        />
        <div className="node-field__hint">Lowercase slugs — not ticker symbols (BTC → bitcoin)</div>
      </div>
    </GlassNode>
  );
}
