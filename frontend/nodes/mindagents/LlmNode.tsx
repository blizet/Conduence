'use client';

import type { NodeProps } from '@xyflow/react';
import { orchestratorInputHandles } from '../shared/agentInputHandles';
import { GlassNode } from '../shared/GlassNode';
import { LLM_OUTPUT_COUNT, type WorkflowNode } from '../types';

function LlmIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
      <circle cx="8" cy="8" r="5" />
      <path d="M8 5v3l2 2" />
      <path d="M5 3L3 1M11 3l2-2M5 13l-2 2M11 13l2 2" />
    </svg>
  );
}

export function LlmNode({ data, selected }: NodeProps<WorkflowNode>) {
  return (
    <GlassNode
      label={data.label}
      description={data.description}
      category="orchestrator"
      accent={data.accent}
      icon={<LlmIcon />}
      selected={selected}
      shape="agent"
      handles={orchestratorInputHandles(LLM_OUTPUT_COUNT)}
    />
  );
}
