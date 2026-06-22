export type GraphObservabilityAgent = {
  agent_id: string;
  role?: string;
  contribution?: string;
};

export type GraphObservabilityTool = {
  tool_id: string;
  ok?: boolean;
  error?: string;
  latency_ms?: number;
  cost_estimate_usd?: number;
};

export type GraphObservabilityLlmUsage = {
  total_input_tokens?: number;
  total_output_tokens?: number;
  total_cost_usd?: number;
  calls?: Array<{
    provider?: string;
    model?: string;
    agent_id?: string;
    input_tokens?: number;
    output_tokens?: number;
    cost_usd?: number;
    langsmith_span_id?: string;
  }>;
};

export type GraphObservability = {
  schema_version?: string;
  langsmith?: {
    project?: string;
    trace_id?: string | null;
    run_id?: string | null;
    url?: string | null;
    status?: string;
  };
  workflow?: {
    workflow_id?: string | null;
    signal_id?: string | null;
    path?: string;
  };
  agents?: GraphObservabilityAgent[];
  tools?: GraphObservabilityTool[];
  llm_usage?: GraphObservabilityLlmUsage;
  steps?: string[];
  duration_ms?: number;
  started_at?: string;
  finished_at?: string;
};
