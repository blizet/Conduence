'use client';

import type { NodeProps } from '@xyflow/react';
import { GlassNode } from '../shared/GlassNode';
import { executionToolHandles } from '../shared/toolHandles';
import type { WorkflowNode } from '../types';

function ClobIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M2 12V4h12v8H2z" />
      <path d="M5 8h6M8 5v6" />
    </svg>
  );
}

export function ClobToolNode({ data, selected }: NodeProps<WorkflowNode>) {
  return (
    <GlassNode
      label={data.label}
      description={data.description}
      category="tool"
      accent={data.accent}
      icon={<ClobIcon />}
      selected={selected}
      shape="triangle-right"
      handles={executionToolHandles()}
    />
  );
}
