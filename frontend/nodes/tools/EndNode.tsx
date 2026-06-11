'use client';

import type { NodeProps } from '@xyflow/react';
import { GlassNode } from '../shared/GlassNode';
import type { WorkflowNode } from '../types';

function StopIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
      <rect x="4" y="4" width="8" height="8" rx="1" />
    </svg>
  );
}

export function EndNode({ data, selected }: NodeProps<WorkflowNode>) {
  return (
    <GlassNode
      label={data.label}
      description={data.description}
      category="tool"
      accent={data.accent}
      icon={<StopIcon />}
      selected={selected}
      shape="terminal"
      handles={[{ type: 'target', position: 'left' }]}
    />
  );
}
