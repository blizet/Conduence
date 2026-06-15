'use client';

import type { NodeProps } from '@xyflow/react';
import { GlassNode } from '../shared/GlassNode';
import type { WorkflowNode } from '../types';

function CotIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
      <circle cx="4" cy="4" r="2" />
      <circle cx="12" cy="4" r="2" />
      <circle cx="8" cy="12" r="2" />
      <path d="M5.5 5.5L7 10M10.5 5.5L9 10M6 4h4" />
    </svg>
  );
}

export function CotBuilderNode({ data, selected }: NodeProps<WorkflowNode>) {
  return (
    <GlassNode
      label={data.label}
      description={data.description}
      category="tool"
      accent={data.accent}
      icon={<CotIcon />}
      selected={selected}
      handles={[
        { type: 'target', position: 'left', id: 'in-decision', style: { top: '35%' } },
        { type: 'target', position: 'left', id: 'in-correlated', style: { top: '65%' } },
        { type: 'source', position: 'top', id: 'out-up' },
        { type: 'source', position: 'right', id: 'out-cot' },
      ]}
    />
  );
}
