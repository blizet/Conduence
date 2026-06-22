'use client';

import type { NodeProps } from '@xyflow/react';
import { orchestratorInputHandles } from '../shared/agentInputHandles';
import { GlassNode } from '../shared/GlassNode';
import { LLM_OUTPUT_COUNT, type WorkflowNode } from '../types';

const ORCHESTRATOR_DESCRIPTION =
  'Combines tool data and prompts into a trade decision.';

const ORCHESTRATOR_STEPS = [
  'Ingest wired Tools + Memory',
  'Plan & invoke tool calls',
  'Evaluate → LLM → decision JSON',
] as const;

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
      description={ORCHESTRATOR_DESCRIPTION}
      category="orchestrator"
      accent={data.accent}
      icon={<LlmIcon />}
      selected={selected}
      shape="agent"
      wide
      handles={orchestratorInputHandles(LLM_OUTPUT_COUNT)}
    >
      <ol className="glass-node__orchestrator-flow">
        {ORCHESTRATOR_STEPS.map((step, index) => (
          <li key={step} className="glass-node__orchestrator-step">
            <span className="glass-node__orchestrator-step-num">{index + 1}.</span>
            <span>{step}</span>
          </li>
        ))}
      </ol>
    </GlassNode>
  );
}
