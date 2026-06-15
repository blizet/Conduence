import type { ConversationTokenUsage, TurnTokenUsage } from "../shared/tokens";
import { formatTokenCount } from "../shared/tokens";
import { formatUsd } from "../shared/pricing";

function TurnRow({ label, usage }: { label: string; usage: TurnTokenUsage }) {
  return (
    <div className="token-row">
      <span className="token-label">{label}</span>
      <div className="token-values">
        <strong className="token-cost" title="Estimated cost in US dollars">
          {formatUsd(usage.costUsd)}
        </strong>
        <span className="token-detail" title="Input / prompt tokens">
          In {formatTokenCount(usage.inputTokens)}
        </span>
        <span className="token-detail" title="Output / completion tokens">
          Out {formatTokenCount(usage.outputTokens)}
        </span>
      </div>
    </div>
  );
}

export function TokenUsagePanel({ usage }: { usage: ConversationTokenUsage }) {
  if (usage.llmTurns === 0) {
    return (
      <section className="token-usage">
        <h2>LLM cost (USD)</h2>
        <p className="muted small">No LLM calls yet this session.</p>
      </section>
    );
  }

  return (
    <section className="token-usage">
      <h2>
        LLM cost (USD)
        <span className="token-turns">{usage.llmTurns} call{usage.llmTurns === 1 ? "" : "s"}</span>
      </h2>
      <p className="token-session-total" title="Total estimated spend this conversation">
        {formatUsd(usage.session.costUsd)}
      </p>
      {usage.lastTurn && <TurnRow label="Last message" usage={usage.lastTurn} />}
      <TurnRow label="Session total" usage={usage.session} />
      <p className="muted small">Estimates from published per-token rates; actual billing may differ.</p>
    </section>
  );
}
