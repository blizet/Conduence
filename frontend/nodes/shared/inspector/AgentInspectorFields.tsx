'use client';

import { useEffect, useState } from 'react';
import type { Edge } from '@xyflow/react';
import type { WorkflowNode } from '@/nodes/types';
import { useAgentFeed } from '@/lib/agent-feed';
import type { LlmProvider } from '@/lib/llm-providers';
import { fetchWorkflowLiveStatus, type WorkflowLiveStatus } from '@/lib/workflow-live';
import type { GraphObservability, GraphObservabilityLlmUsage } from '@/lib/observability-types';
import { formatTokens, formatUsd, hasLlmUsage, mergeLlmUsage } from '@/lib/llm-usage';
import {
  DEFAULT_COT_GRAPH_ID,
  DEFAULT_LLM_SYSTEM_PROMPT,
  DEFAULT_LLM_USER_PROMPT,
} from '../../constants';
import { FetchResultPanel } from '../FetchResultPanel';
import { LlmProviderFields } from '../LlmProviderFields';
import { PromptField } from '../PromptField';
import { stopNodeKeyPropagation } from '../useNodeData';
import type { WorkflowNodeData } from '../../types';

type InspectorFieldsProps = {
  data: WorkflowNodeData;
  accent: string;
  onPatch: (patch: Partial<WorkflowNodeData>) => void;
};

export function LlmInspectorFields({ data, onPatch }: InspectorFieldsProps) {
  const contextGraph = data.contextGraph ?? 'correlation';
  const graphId = data.graphId ?? DEFAULT_COT_GRAPH_ID;

  return (
    <div onKeyDown={stopNodeKeyPropagation}>
      <p className="node-field__hint">
        Context: {contextGraph}
        {contextGraph === 'decision' ? ` · ${graphId}` : ''}
      </p>
      <LlmProviderFields
        provider={data.llmProvider}
        model={data.model}
        apiKey={data.apiKey}
        temperature={data.temperature}
        maxTokens={data.maxTokens}
        showSampling
        onProviderChange={(p: LlmProvider) => onPatch({ llmProvider: p })}
        onModelChange={(v) => onPatch({ model: v })}
        onApiKeyChange={(v) => onPatch({ apiKey: v })}
        onTemperatureChange={(v) => onPatch({ temperature: v })}
        onMaxTokensChange={(v) => onPatch({ maxTokens: v })}
      />
      <PromptField
        label="System prompt"
        value={data.systemPrompt ?? DEFAULT_LLM_SYSTEM_PROMPT}
        rows={3}
        onChange={(v) => onPatch({ systemPrompt: v })}
      />
      <PromptField
        label="User prompt"
        value={data.userPrompt ?? DEFAULT_LLM_USER_PROMPT}
        rows={2}
        onChange={(v) => onPatch({ userPrompt: v })}
      />
      <FetchResultPanel
        status={data.workflowStatus}
        error={data.workflowError}
        result={data.workflowResult}
        durationMs={data.workflowDurationMs}
        label="Orchestrator result"
      />
    </div>
  );
}

export function OutputInspectorFields({
  data,
}: {
  data: WorkflowNodeData;
  node: WorkflowNode;
  nodes: WorkflowNode[];
  edges: Edge[];
  feedSignals?: Record<
    string,
    {
      latest?: unknown;
      running?: boolean;
      count?: number;
      llmUsage?: GraphObservabilityLlmUsage;
      langsmith?: GraphObservability['langsmith'];
    }
  >;
}) {
  const { orchestratorUsage, orchestratorLangsmith } = useAgentFeed();
  const [workflowLive, setWorkflowLive] = useState(false);
  const [workflowDetail, setWorkflowDetail] = useState<WorkflowLiveStatus | null>(null);

  useEffect(() => {
    const sync = () =>
      void fetchWorkflowLiveStatus().then((s) => {
        setWorkflowLive(Boolean(s.running));
        setWorkflowDetail(s);
      });
    sync();
    const t = setInterval(sync, 8000);
    return () => clearInterval(t);
  }, []);

  const hasBatchPayload = Boolean(data.outputPayload);
  const displayPayload = data.outputPayload ?? '';
  const hasPayload = Boolean(displayPayload);

  const polledOrchestratorUsage = workflowDetail?.orchestrator?.llmUsage;
  const combinedUsage = mergeLlmUsage(
    orchestratorUsage ?? polledOrchestratorUsage,
    data.outputLlmUsage,
  );
  const langsmith =
    data.outputLangsmith ??
    orchestratorLangsmith ??
    workflowDetail?.orchestrator?.langsmith;
  const showUsage = hasLlmUsage(combinedUsage);

  let statusLabel = data.outputStatus ? `Status: ${data.outputStatus}` : 'Waiting for workflow run';
  if (workflowLive) {
    statusLabel = 'Live · orchestrator running';
  }

  return (
    <div>
      <p className="node-field__hint">
        {statusLabel}
        {data.outputSource && !hasBatchPayload ? ` · Source: ${data.outputSource}` : ''}
        {data.outputDurationMs != null && !hasBatchPayload
          ? ` · ${data.outputDurationMs < 1000 ? `${data.outputDurationMs} ms` : `${(data.outputDurationMs / 1000).toFixed(2)} s`}`
          : ''}
      </p>
      {showUsage ? (
        <div className="node-field">
          <div className="node-field__label">LLM cost (session)</div>
          {langsmith?.url ? (
            <a
              className="cot-graph-detail__link"
              href={langsmith.url}
              target="_blank"
              rel="noopener noreferrer"
            >
              Open trace in LangSmith ↗
            </a>
          ) : (
            <p className="node-field__hint">
              {langsmith?.status === 'connected'
                ? 'LangSmith tracing enabled — cost is estimated from provider token rates.'
                : 'Estimated from token usage · enable LANGCHAIN_TRACING_V2 for live traces.'}
            </p>
          )}
          <div className="cot-graph-detail__metrics">
            <div className="cot-graph-detail__metric">
              <span className="cot-graph-detail__metric-label">Input tokens</span>
              <span>{formatTokens(combinedUsage.total_input_tokens)}</span>
            </div>
            <div className="cot-graph-detail__metric">
              <span className="cot-graph-detail__metric-label">Output tokens</span>
              <span>{formatTokens(combinedUsage.total_output_tokens)}</span>
            </div>
            <div className="cot-graph-detail__metric">
              <span className="cot-graph-detail__metric-label">Cost</span>
              <span>{formatUsd(combinedUsage.total_cost_usd)}</span>
            </div>
            {combinedUsage.calls?.length ? (
              <div className="cot-graph-detail__metric">
                <span className="cot-graph-detail__metric-label">LLM calls</span>
                <span>{combinedUsage.calls.length}</span>
              </div>
            ) : null}
          </div>
          {combinedUsage.calls && combinedUsage.calls.length > 0 ? (
            <ul className="cot-graph-detail__list cot-graph-detail__list--compact">
              {combinedUsage.calls.slice(-6).map((call, index) => (
                <li key={`${call.agent_id ?? 'llm'}-${index}`}>
                  {call.agent_id ?? 'llm'} · {call.provider}/{call.model} · in{' '}
                  {formatTokens(call.input_tokens)} / out {formatTokens(call.output_tokens)} ·{' '}
                  {formatUsd(call.cost_usd)}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
      {hasPayload ? (
        <div className="node-field">
          <div className="node-field__label">Output payload</div>
          <textarea
            className="node-textarea node-fetch-result"
            rows={12}
            readOnly
            value={displayPayload}
          />
        </div>
      ) : (
        <p className="node-field__hint">
          Run workflow or Go Live with an Orchestrator wired to this node.
        </p>
      )}
    </div>
  );
}
