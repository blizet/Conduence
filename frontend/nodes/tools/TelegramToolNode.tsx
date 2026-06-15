'use client';

import type { NodeProps } from '@xyflow/react';
import { GlassNode } from '../shared/GlassNode';
import { executionToolHandles } from '../shared/toolHandles';
import type { WorkflowNode } from '../types';

function TelegramIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4">
      <path d="M2.5 7.5L13 3.5 10.5 13.5 7.5 9.5 5.5 11.5 4.5 9.5 7.5 7.5 2.5 7.5z" />
    </svg>
  );
}

export function TelegramToolNode({ data, selected }: NodeProps<WorkflowNode>) {
  return (
    <GlassNode
      label={data.label}
      description={data.description}
      category="tool"
      accent={data.accent}
      icon={<TelegramIcon />}
      selected={selected}
      shape="execution"
      handles={executionToolHandles()}
    />
  );
}
