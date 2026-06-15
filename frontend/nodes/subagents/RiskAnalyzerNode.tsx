'use client';

import type { NodeProps } from '@xyflow/react';
import { subagentInputHandles } from '../shared/agentInputHandles';
import { GlassNode } from '../shared/GlassNode';
import type { WorkflowNode } from '../types';

function RiskIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4">
      <path d="M8 2.5l5.5 9.5H2.5L8 2.5z" />
      <path d="M8 6.5v3M8 11h.01" />
    </svg>
  );
}

export function RiskAnalyzerNode({ data, selected }: NodeProps<WorkflowNode>) {
  return (
    <GlassNode
      label={data.label}
      description={data.description}
      category="subagent"
      accent={data.accent}
      icon={<RiskIcon />}
      selected={selected}
      handles={subagentInputHandles('out-risk')}
    />
  );
}
