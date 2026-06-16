'use client';

import type { NodeProps } from '@xyflow/react';
import { GlassNode } from '../shared/GlassNode';
import { executionToolHandles } from '../shared/toolHandles';
import type { WorkflowNode } from '../types';

function PaperTradingIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M2 4h12v9H2z" />
      <path d="M5 7h6M5 9.5h4" />
      <path d="M5 2.5v1.5M11 2.5v1.5" />
    </svg>
  );
}

export function PaperTradingNode({ data, selected }: NodeProps<WorkflowNode>) {
  return (
    <GlassNode
      label={data.label}
      description={data.description}
      category="tool"
      accent={data.accent}
      icon={<PaperTradingIcon />}
      selected={selected}
      shape="execution"
      handles={executionToolHandles()}
    />
  );
}
