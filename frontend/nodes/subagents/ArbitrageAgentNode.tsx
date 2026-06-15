'use client';

import type { NodeProps } from '@xyflow/react';
import { subagentInputHandles } from '../shared/agentInputHandles';
import { GlassNode } from '../shared/GlassNode';
import type { WorkflowNode } from '../types';

function ArbIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4">
      <path d="M8 2.5v11M5.5 13.5h5" />
      <path d="M3.5 4.5h9" />
      <path d="M3.5 4.5L2 8.5h3L3.5 4.5z" />
      <path d="M12.5 4.5L11 8.5h3l-1.5-4z" />
    </svg>
  );
}

export function ArbitrageAgentNode({ data, selected }: NodeProps<WorkflowNode>) {
  return (
    <GlassNode
      label={data.label}
      description={data.description}
      category="subagent"
      accent={data.accent}
      icon={<ArbIcon />}
      selected={selected}
      handles={subagentInputHandles('out-arb')}
    />
  );
}
