'use client';

import type { NodeProps } from '@xyflow/react';
import { GlassNode } from '../shared/GlassNode';
import { executionToolHandles } from '../shared/toolHandles';
import type { WorkflowNode } from '../types';

function KalshiIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M3 4h10v8H3z" />
      <path d="M6 7h4M6 9.5h2.5" />
      <path d="M11 2.5v2M5 2.5v2" />
    </svg>
  );
}

export function KalshiToolNode({ data, selected }: NodeProps<WorkflowNode>) {
  return (
    <GlassNode
      label={data.label}
      description={data.description}
      category="tool"
      accent={data.accent}
      icon={<KalshiIcon />}
      selected={selected}
      shape="triangle-right"
      handles={executionToolHandles()}
    />
  );
}
