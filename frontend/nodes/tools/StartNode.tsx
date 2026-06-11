'use client';

import type { NodeProps } from '@xyflow/react';
import { GlassNode } from '../shared/GlassNode';
import type { WorkflowNode } from '../types';

function PlayIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
      <path d="M4 3.5v9l8-4.5-8-4.5z" />
    </svg>
  );
}

export function StartNode({ data, selected }: NodeProps<WorkflowNode>) {
  return (
    <GlassNode
      label={data.label}
      description={data.description}
      category="tool"
      accent={data.accent}
      icon={<PlayIcon />}
      selected={selected}
      shape="trigger"
      handles={[{ type: 'source', position: 'right' }]}
    />
  );
}
