'use client';

import type { GraphNodeDetail, GraphNodeDetailDecision, GraphObservability } from '@/lib/cot-graph';

type CotGraphNodeDetailProps = {
  detail: GraphNodeDetail | null;
  loading: boolean;
  nodeId: string | null;
};

function formatUsd(value: number | undefined): string {
  if (value === undefined || Number.isNaN(value)) return '—';
  return `$${value.toFixed(4)}`;
}

function formatTokens(value: number | undefined): string {
  if (value === undefined) return '—';
  return value.toLocaleString();
}

function ObservabilitySection({
  observability,
  loading,
}: {
  observability: GraphObservability | null | undefined;
  loading: boolean;
}) {
  if (loading) {
    return (
      <div className="cot-graph-detail__block">
        <h3>LangSmith observability</h3>
        <p className="cot-graph-detail__muted">Loading observability…</p>
      </div>
    );
  }

  if (!observability) {
    return (
      <div className="cot-graph-detail__block">
        <h3>LangSmith observability</h3>
        <p className="cot-graph-detail__muted">
          No execution trace for this node. Select a trade node (e.g. TRD_M001) or a node linked to
          a trade to see tokens, cost, and pipeline steps.
        </p>
      </div>
    );
  }

  const ls = observability.langsmith;
  const usage = observability.llm_usage;
  const agents = observability.agents ?? [];
  const tools = observability.tools ?? [];
  const steps = observability.steps ?? [];

  return (
    <div className="cot-graph-detail__block">
      <h3>LangSmith observability</h3>
      {ls?.url ? (
        <a
          className="cot-graph-detail__link"
          href={ls.url}
          target="_blank"
          rel="noopener noreferrer"
        >
          Open trace in LangSmith ↗
        </a>
      ) : (
        <p className="cot-graph-detail__muted">
          {ls?.status === 'pending_integration'
            ? 'Set LANGCHAIN_TRACING_V2=true and LANGCHAIN_API_KEY in backend/.env — LangGraph runs are auto-traced.'
            : ls?.status === 'connected'
              ? 'Tracing enabled — run a workflow to capture a live trace URL.'
              : 'No LangSmith trace URL for this decision yet.'}
        </p>
      )}
      {(ls?.project || ls?.run_id || ls?.trace_id) && (
        <div className="cot-graph-detail__kv">
          {ls.project && (
            <div>
              <b>Project</b> {ls.project}
            </div>
          )}
          {ls.trace_id && (
            <div>
              <b>Trace</b> <span className="cot-graph-detail__mono">{ls.trace_id}</span>
            </div>
          )}
          {ls.run_id && (
            <div>
              <b>Run</b> <span className="cot-graph-detail__mono">{ls.run_id}</span>
            </div>
          )}
        </div>
      )}

      {usage && (
        <div className="cot-graph-detail__metrics">
          <div className="cot-graph-detail__metric">
            <span className="cot-graph-detail__metric-label">Input tokens</span>
            <span>{formatTokens(usage.total_input_tokens)}</span>
          </div>
          <div className="cot-graph-detail__metric">
            <span className="cot-graph-detail__metric-label">Output tokens</span>
            <span>{formatTokens(usage.total_output_tokens)}</span>
          </div>
          <div className="cot-graph-detail__metric">
            <span className="cot-graph-detail__metric-label">Cost</span>
            <span>{formatUsd(usage.total_cost_usd)}</span>
          </div>
          {observability.duration_ms != null && (
            <div className="cot-graph-detail__metric">
              <span className="cot-graph-detail__metric-label">Duration</span>
              <span>{(observability.duration_ms / 1000).toFixed(2)}s</span>
            </div>
          )}
        </div>
      )}

      {agents.length > 0 && (
        <>
          <div className="cot-graph-detail__subhead">Agents</div>
          <ul className="cot-graph-detail__list">
            {agents.map((agent) => (
              <li key={`${agent.agent_id}-${agent.role}`}>
                <span className="cot-graph-detail__mono">{agent.agent_id}</span>
                {agent.contribution ? ` · ${agent.contribution}` : ''}
              </li>
            ))}
          </ul>
        </>
      )}

      {tools.length > 0 && (
        <>
          <div className="cot-graph-detail__subhead">Tools</div>
          <ul className="cot-graph-detail__list">
            {tools.map((tool) => (
              <li key={tool.tool_id}>
                <span className="cot-graph-detail__mono">{tool.tool_id}</span>
                {' · '}
                {tool.ok ? 'ok' : 'failed'}
                {tool.latency_ms != null ? ` · ${tool.latency_ms}ms` : ''}
                {tool.error ? ` · ${tool.error}` : ''}
              </li>
            ))}
          </ul>
        </>
      )}

      {steps.length > 0 && (
        <>
          <div className="cot-graph-detail__subhead">Pipeline steps</div>
          <ol className="cot-graph-detail__steps">
            {steps.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
        </>
      )}

      {usage?.calls && usage.calls.length > 0 && (
        <>
          <div className="cot-graph-detail__subhead">LLM calls</div>
          <ul className="cot-graph-detail__list cot-graph-detail__list--compact">
            {usage.calls.map((call, index) => (
              <li key={`${call.agent_id ?? 'llm'}-${index}`}>
                {call.agent_id ?? 'llm'} · {call.provider}/{call.model} · in{' '}
                {formatTokens(call.input_tokens)} / out {formatTokens(call.output_tokens)} ·{' '}
                {formatUsd(call.cost_usd)}
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

function DecisionSection({
  decision,
  nodeType,
  loading,
}: {
  decision: GraphNodeDetailDecision | null | undefined;
  nodeType?: string;
  loading: boolean;
}) {
  const title =
    nodeType === 'trade'
      ? 'Decision analysis'
      : nodeType === 'market'
        ? 'Linked decision'
        : nodeType === 'outcome' || nodeType === 'feedback'
          ? 'Decision context'
          : 'Decision analysis';

  if (loading) {
    return (
      <div className="cot-graph-detail__block">
        <h3>{title}</h3>
        <p className="cot-graph-detail__muted">Loading decision details…</p>
      </div>
    );
  }

  if (!decision) {
    return (
      <div className="cot-graph-detail__block">
        <h3>{title}</h3>
        <p className="cot-graph-detail__muted">
          No trade decision linked to this node. Click a trade or market node in the chain.
        </p>
      </div>
    );
  }

  return (
    <div className="cot-graph-detail__block">
      <h3>{title}</h3>
      <div className="cot-graph-detail__kv">
        {decision.decision_id && (
          <div>
            <b>Decision ID</b>{' '}
            <span className="cot-graph-detail__mono">{decision.decision_id}</span>
          </div>
        )}
        {decision.action && (
          <div>
            <b>Action</b> {decision.action}
          </div>
        )}
        {decision.conviction_level != null && decision.conviction_level > 0 && (
          <div>
            <b>Conviction</b> {decision.conviction_level}/10
          </div>
        )}
        {decision.market_id && (
          <div>
            <b>Market</b> {decision.market_id}
          </div>
        )}
        {decision.linked_trade_id && (
          <div>
            <b>Trade</b> {decision.linked_trade_id}
          </div>
        )}
        {decision.timestamp && (
          <div>
            <b>Time</b> {new Date(decision.timestamp).toLocaleString()}
          </div>
        )}
      </div>
      {decision.thesis && (
        <div className="cot-graph-detail__text">
          <div className="cot-graph-detail__subhead">Thesis</div>
          <p>{decision.thesis}</p>
        </div>
      )}
      {decision.reasoning && (
        <div className="cot-graph-detail__text">
          <div className="cot-graph-detail__subhead">Reasoning</div>
          <p>{decision.reasoning}</p>
        </div>
      )}
      {decision.tags && decision.tags.length > 0 && (
        <div className="cot-graph-detail__tags">
          {decision.tags.map((tag) => (
            <span key={tag} className="cot-graph-detail__tag">
              {tag}
            </span>
          ))}
        </div>
      )}
      {decision.summary && !decision.thesis && (
        <p className="cot-graph-detail__muted">{decision.summary}</p>
      )}
    </div>
  );
}

export function CotGraphNodeDetail({ detail, loading, nodeId }: CotGraphNodeDetailProps) {
  if (!nodeId) return null;

  return (
    <div className="cot-graph-sidebar__section cot-graph-detail dark-scroll">
      <DecisionSection
        decision={detail?.decision}
        nodeType={detail?.node?.type}
        loading={loading}
      />
      <ObservabilitySection observability={detail?.observability} loading={loading} />
    </div>
  );
}
