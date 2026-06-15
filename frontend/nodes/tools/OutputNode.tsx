'use client';

import type { NodeProps } from '@xyflow/react';
import { GlassNode } from '../shared/GlassNode';
import type { WorkflowNode } from '../types';

function OutputIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M3 8h7M10 5l3 3-3 3" />
      <rect x="1" y="3" width="4" height="10" rx="1" />
    </svg>
  );
}

export function OutputNode({ data, selected }: NodeProps<WorkflowNode>) {
  return (
    <GlassNode
      label={data.label}
      description={data.description}
      category="tool"
      accent={data.accent}
      icon={<OutputIcon />}
      selected={selected}
      shape="triangle-up"
      handles={[{ type: 'target', position: 'left' }]}
    />
  );
}
