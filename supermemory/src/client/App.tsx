import { useCallback, useEffect, useRef, useState } from "react";

import type { ChatApiResponse, ChatMessage, ConversationTokenUsage, WeightedGraph } from "../shared/types";
import { emptyConversationUsage } from "../shared/tokens";
import { GraphView } from "./GraphView";
import { LlmSettingsPanel, useLlmSettings, type ProviderOption } from "./LlmSettings";
import { TokenUsagePanel } from "./TokenUsage";

function ChatPanel({
  messages,
  onSend,
  loading,
  pendingCount,
  graphComplete,
  tokenUsage,
  llmSettings,
  onLlmSettingsChange,
  providers,
  envFallbackConfigured,
  supermemoryConfigured,
  supermemoryLoaded,
}: {
  messages: ChatMessage[];
  onSend: (text: string) => void;
  loading: boolean;
  pendingCount: number;
  graphComplete: boolean;
  tokenUsage: ConversationTokenUsage;
  llmSettings: ReturnType<typeof useLlmSettings>[0];
  onLlmSettingsChange: ReturnType<typeof useLlmSettings>[1];
  providers: ProviderOption[];
  envFallbackConfigured: boolean;
  supermemoryConfigured: boolean;
  supermemoryLoaded: boolean;
}) {
  const [input, setInput] = useState("");
  const messagesRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = messagesRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages, loading]);

  const submit = useCallback(() => {
    const text = input.trim();
    if (!text || loading) return;
    setInput("");
    onSend(text);
  }, [input, loading, onSend]);

  return (
    <section className="chat-panel">
      <header>
        <h1>Weighted causal graph</h1>
        <p className="muted">
          Talk in natural language. Weights run from <strong>-1 to 1</strong>: positive = direct,
          negative = inverse.
        </p>
        {pendingCount > 0 && (
          <p className="badge warn">{pendingCount} relationship(s) need a weight</p>
        )}
        {supermemoryConfigured && (
          <p className="badge ok">
            Supermemory {supermemoryLoaded ? "· graph restored" : "· connected"}
          </p>
        )}
        {graphComplete && <p className="badge ok">Graph complete — all edges weighted</p>}
        <TokenUsagePanel usage={tokenUsage} />
        <LlmSettingsPanel
          settings={llmSettings}
          onChange={onLlmSettingsChange}
          providers={providers}
          envFallbackConfigured={envFallbackConfigured}
        />
      </header>

      <div className="messages" ref={messagesRef}>
        {messages.map((m, i) => (
          <div key={i} className={`bubble ${m.role}`}>
            {m.content.split("\n").map((line, j) => (
              <p key={j}>{line}</p>
            ))}
          </div>
        ))}
        {loading && <div className="bubble assistant typing">Thinking…</div>}
      </div>

      <form
        className="composer"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <textarea
          rows={3}
          placeholder="e.g. Iran war continues → oil up, BTC/ETH/crypto down. For weights: 1:0.8 2:-0.7 3:-0.6"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              submit();
            }
          }}
        />
        <button type="submit" disabled={loading || !input.trim()}>
          Send
        </button>
      </form>
    </section>
  );
}

export function App() {
  const [sessionId, setSessionId] = useState<string | undefined>();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [graph, setGraph] = useState<WeightedGraph>({ nodes: [], edges: [] });
  const [pendingCount, setPendingCount] = useState(0);
  const [graphComplete, setGraphComplete] = useState(false);
  const [loading, setLoading] = useState(false);
  const [tokenUsage, setTokenUsage] = useState<ConversationTokenUsage>(emptyConversationUsage());
  const [llmSettings, setLlmSettings] = useLlmSettings();
  const [health, setHealth] = useState<{
    envFallbackConfigured: boolean;
    supermemoryConfigured: boolean;
    providers: ProviderOption[];
  } | null>(null);
  const [supermemoryLoaded, setSupermemoryLoaded] = useState(false);

  useEffect(() => {
    fetch("/api/health")
      .then((r) => r.json())
      .then((data) =>
        setHealth({
          envFallbackConfigured: Boolean(data.envFallbackConfigured),
          supermemoryConfigured: Boolean(data.supermemoryConfigured),
          providers: data.providers ?? [],
        }),
      )
      .catch(() =>
        setHealth({ envFallbackConfigured: false, supermemoryConfigured: false, providers: [] }),
      );

    fetch("/api/reset", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" })
      .then((r) => r.json())
      .then((data) => {
        setSessionId(data.sessionId);
        setMessages(data.messages ?? []);
        setGraph(data.graph ?? { nodes: [], edges: [] });
        setTokenUsage(data.tokenUsage ?? emptyConversationUsage());
        setSupermemoryLoaded(Boolean(data.supermemoryLoaded));
      })
      .catch(() => undefined);
  }, []);

  const send = useCallback(
    async (text: string) => {
      setLoading(true);
      setMessages((prev) => [...prev, { role: "user", content: text }]);
      try {
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sessionId, message: text, llm: llmSettings }),
        });
        const data = (await res.json()) as ChatApiResponse & { error?: string };
        if (!res.ok) throw new Error(data.error ?? "Chat failed");
        setSessionId(data.sessionId);
        setMessages((prev) => [...prev, { role: "assistant", content: data.message }]);
        setGraph(data.graph);
        setPendingCount(data.pendingWeights.length);
        setGraphComplete(data.graphComplete);
        setTokenUsage(data.tokenUsage ?? emptyConversationUsage());
        setSupermemoryLoaded(Boolean(data.supermemoryLoaded));
      } catch (err) {
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content: err instanceof Error ? err.message : "Something went wrong.",
          },
        ]);
      } finally {
        setLoading(false);
      }
    },
    [sessionId, llmSettings],
  );

  const reset = useCallback(
    async (options?: { fresh?: boolean }) => {
      const res = await fetch("/api/reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, fresh: options?.fresh ?? false }),
      });
      const data = await res.json();
      setSessionId(data.sessionId);
      setMessages(data.messages);
      setGraph(data.graph);
      setPendingCount(0);
      setGraphComplete(false);
      setTokenUsage(data.tokenUsage ?? emptyConversationUsage());
      setSupermemoryLoaded(Boolean(data.supermemoryLoaded));
    },
    [sessionId],
  );

  const setEdgeWeight = useCallback(
    async (edgeId: string, weight: number) => {
      if (!sessionId) return;
      const res = await fetch("/api/edge-weight", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, edgeId, weight }),
      });
      if (!res.ok) return;
      const data = (await res.json()) as ChatApiResponse;
      setGraph(data.graph);
      setPendingCount(data.pendingWeights.length);
      setGraphComplete(data.graphComplete);
    },
    [sessionId],
  );

  const hasLlmKey = Boolean(llmSettings.apiKey?.trim()) || Boolean(health?.envFallbackConfigured);

  return (
    <div className="app">
      {!hasLlmKey && (
        <div className="banner">
          Choose a provider below and paste your API key (Gemini, OpenAI, or Claude), or set{" "}
          <code>LLM_API_KEY</code> in <code>supermemory/.env</code> as a server fallback.
        </div>
      )}
      <div className="layout">
        <ChatPanel
          messages={messages}
          onSend={send}
          loading={loading}
          pendingCount={pendingCount}
          graphComplete={graphComplete}
          tokenUsage={tokenUsage}
          llmSettings={llmSettings}
          onLlmSettingsChange={setLlmSettings}
          providers={health?.providers ?? []}
          envFallbackConfigured={health?.envFallbackConfigured ?? false}
          supermemoryConfigured={health?.supermemoryConfigured ?? false}
          supermemoryLoaded={supermemoryLoaded}
        />
        <div className="graph-panel">
          <div className="graph-toolbar">
            <div className="graph-toolbar__title">
              <span className="graph-toolbar__label">Live graph</span>
              <span className="graph-toolbar__meta">
                {graph.nodes.length} nodes · {graph.edges.length} edges
              </span>
            </div>
            <div className="graph-toolbar__actions">
              <button
                type="button"
                className="btn-secondary"
                onClick={() => reset({ fresh: true })}
                title="Start a blank session without restoring Supermemory"
              >
                New session
              </button>
              {health?.supermemoryConfigured && (
                <button
                  type="button"
                  className="btn-primary"
                  onClick={() => reset({ fresh: false })}
                  title="New session and restore graph from Supermemory"
                >
                  Restore from Supermemory
                </button>
              )}
            </div>
          </div>
          <GraphView graph={graph} onWeightChange={setEdgeWeight} />
        </div>
      </div>
    </div>
  );
}
