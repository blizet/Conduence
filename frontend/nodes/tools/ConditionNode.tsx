'use client';

import type { NodeProps } from '@xyflow/react';
import { GlassNode } from '../shared/GlassNode';
import type { WorkflowNode } from '../types';

function BranchIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M8 2v4M8 10v4M8 6c-2 0-4 1-4 3M8 6c2 0 4 1 4 3" />
    </svg>
  );
}

export function ConditionNode({ data, selected }: NodeProps<WorkflowNode>) {
  return (
    <GlassNode
      label={data.label}
      description={data.description}
      category="tool"
      accent={data.accent}
      icon={<BranchIcon />}
      selected={selected}
      handles={[
        { type: 'target', position: 'left' },
        { type: 'source', position: 'right', id: 'true', label: 'true', style: { top: '35%' } },
        { type: 'source', position: 'right', id: 'false', label: 'false', style: { top: '65%' } },
      ]}
    />
  );
}
