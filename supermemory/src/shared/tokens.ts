export interface TurnTokenUsage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  /** Estimated LLM cost in USD for this turn */
  costUsd: number;
}

export type RawTurnTokenUsage = Omit<TurnTokenUsage, "costUsd">;

export interface ConversationTokenUsage {
  llmTurns: number;
  lastTurn: TurnTokenUsage | null;
  session: TurnTokenUsage;
}

export function emptyTurnUsage(): TurnTokenUsage {
  return { inputTokens: 0, outputTokens: 0, totalTokens: 0, costUsd: 0 };
}

export function emptyConversationUsage(): ConversationTokenUsage {
  return { llmTurns: 0, lastTurn: null, session: emptyTurnUsage() };
}

export function addTurnUsage(
  current: ConversationTokenUsage,
  turn: TurnTokenUsage | null,
): ConversationTokenUsage {
  if (!turn) return current;
  return {
    llmTurns: current.llmTurns + 1,
    lastTurn: turn,
    session: {
      inputTokens: current.session.inputTokens + turn.inputTokens,
      outputTokens: current.session.outputTokens + turn.outputTokens,
      totalTokens: current.session.totalTokens + turn.totalTokens,
      costUsd: current.session.costUsd + turn.costUsd,
    },
  };
}

export function formatTokenCount(n: number): string {
  return n.toLocaleString();
}

export function withCostUsd(usage: RawTurnTokenUsage, costUsd: number): TurnTokenUsage {
  return { ...usage, costUsd };
}
