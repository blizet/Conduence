'use client';

import type { NodeProps } from '@xyflow/react';
import { subagentInputHandles } from '../shared/agentInputHandles';
import { GlassNode } from '../shared/GlassNode';
import type { WorkflowNode } from '../types';

function SportsIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4">
      <circle cx="8" cy="8" r="5.5" />
      <path d="M3.5 8h9M8 3.5a5.5 5.5 0 010 9M8 3.5a5.5 5.5 0 000 9" />
    </svg>
  );
}

export function SportsScannerNode({ data, selected }: NodeProps<WorkflowNode>) {
  return (
    <GlassNode
      label={data.label}
      description={data.description ?? 'Kalshi soccer feed via HTTP wrapper'}
      category="subagent"
      accent={data.accent ?? '#4ade80'}
      icon={<SportsIcon />}
      selected={selected}
      handles={subagentInputHandles('out-sports')}
    />
  );
}
