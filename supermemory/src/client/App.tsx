import { useCallback, useEffect, useRef, useState } from "react";

import type { ChatApiResponse, ChatMessage, ConversationTokenUsage, WeightedGraph } from "../shared/types";
import { emptyConversationUsage } from "../shared/tokens";
import { GraphView } from "./GraphView";
import { LlmSettingsPanel, useLlmSettings, type ProviderOption } from "./LlmSettings";
import { TokenUsagePanel } from "./TokenUsage";

function MessageIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
      <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" strokeLinejoin="round" />
    </svg>
  );
}

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
  open,
  onToggleOpen,
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
  open: boolean;
  onToggleOpen: () => void;
}) {
  const [input, setInput] = useState("");
  const [sessionOpen, setSessionOpen] = useState(false);
  const messagesRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const el = messagesRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages, loading]);

  useEffect(() => {
    if (open) {
      const t = window.setTimeout(() => textareaRef.current?.focus(), 320);
      return () => window.clearTimeout(t);
    }
  }, [open]);

  const submit = useCallback(() => {
    const text = input.trim();
    if (!text || loading) return;
    setInput("");
    onSend(text);
  }, [input, loading, onSend]);

  return (
    <div className="chat-widget">
      <div
        className={`chat-window glass-panel${open ? " chat-window--open" : ""}`}
        aria-hidden={!open}
      >
        <div className="chat-window__header">
          <div className="chat-window__intro">
            <span className="chat-window__label">Build graph</span>
            <p className="chat-window__hint">
              Describe causal links in natural language. Weights run <strong>−1 to 1</strong> — positive
              direct, negative inverse.
            </p>
          </div>
          <button
            type="button"
            className="chat-window__minimize"
            onClick={onToggleOpen}
            title="Minimize chat"
            aria-label="Minimize chat"
          >
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M3 8h10" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        <div className="chat-window__status">
          {pendingCount > 0 && (
            <span className="status-pill status-pill--warn">{pendingCount} need weight</span>
          )}
          {supermemoryConfigured && (
            <span className="status-pill status-pill--ok">
              Supermemory {supermemoryLoaded ? "· restored" : "· connected"}
            </span>
          )}
          {graphComplete && <span className="status-pill status-pill--ok">Graph complete</span>}
        </div>

        <div className="chat-window__messages" ref={messagesRef}>
          {messages.length === 0 && !loading && (
            <div className="chat-window__empty">
              <p>Start by describing relationships between markets, assets, or events.</p>
              <p className="muted">
                e.g. &ldquo;Iran conflict continues → oil up, BTC and ETH down&rdquo;
              </p>
            </div>
          )}
          {messages.map((m, i) => (
            <div key={i} className={`chat-bubble chat-bubble--${m.role}`}>
              {m.content.split("\n").map((line, j) => (
                <p key={j}>{line}</p>
              ))}
            </div>
          ))}
          {loading && <div className="chat-bubble chat-bubble--assistant chat-bubble--typing">Thinking…</div>}
        </div>

        <form
          className="chat-window__composer"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <textarea
            ref={textareaRef}
            rows={3}
            placeholder="Describe causal links or set weights: 1:0.8 2:-0.7"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                submit();
              }
            }}
          />
          <button type="submit" className="btn-primary" disabled={loading || !input.trim()}>
            Send
          </button>
        </form>

        <div className="chat-window__session">
          <button
            type="button"
            className="session-drawer__toggle"
            onClick={() => setSessionOpen((v) => !v)}
            aria-expanded={sessionOpen}
          >
            <svg
              className={`session-drawer__chevron${sessionOpen ? " session-drawer__chevron--open" : ""}`}
              width="10"
              height="10"
              viewBox="0 0 10 10"
              fill="currentColor"
            >
              <path d="M3 1.5L7.5 5 3 8.5V1.5z" />
            </svg>
            <span className="session-drawer__title">Session &amp; LLM</span>
            {tokenUsage.llmTurns > 0 && (
              <span className="session-drawer__meta">{tokenUsage.llmTurns} calls</span>
            )}
          </button>
          {sessionOpen && (
            <div className="session-drawer__body">
              <TokenUsagePanel usage={tokenUsage} />
              <LlmSettingsPanel
                settings={llmSettings}
                onChange={onLlmSettingsChange}
                providers={providers}
                envFallbackConfigured={envFallbackConfigured}
              />
            </div>
          )}
        </div>
      </div>

      {!open && (
        <button
          type="button"
          className="chat-fab"
          onClick={onToggleOpen}
          title="Open chat"
          aria-label="Open chat"
          aria-expanded={false}
        >
          <span className="chat-fab__icon">
            <MessageIcon />
          </span>
          {pendingCount > 0 && (
            <span className="chat-fab__badge" aria-label={`${pendingCount} pending weights`}>
              {pendingCount > 9 ? "9+" : pendingCount}
            </span>
          )}
        </button>
      )}
    </div>
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
  const [chatOpen, setChatOpen] = useState(false);
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
    <div className="playground-root">
      {!hasLlmKey && (
        <div className="app-banner">
          Choose a provider in <strong>Session &amp; LLM</strong> and paste your API key, or set{" "}
          <code>LLM_API_KEY</code> in <code>supermemory/.env</code> as a server fallback.
        </div>
      )}
      <div className="playground-shell">
        <header className="playground-header">
          <img
            src="/conduence-logo.png"
            alt="Conduence"
            className="playground-header__logo"
            width={250}
            height={50}
          />
          <div className="playground-header__actions">
            {health?.supermemoryConfigured && (
              <button
                type="button"
                className="graph-view-toggle graph-view-toggle--active"
                onClick={() => reset({ fresh: false })}
                title="New session and restore graph from Supermemory"
              >
                Restore
              </button>
            )}
          </div>
        </header>

        <main className="app-workspace">
          <div className="graph-stage">
            <GraphView graph={graph} onWeightChange={setEdgeWeight} />
          </div>
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
            open={chatOpen}
            onToggleOpen={() => setChatOpen((v) => !v)}
          />
        </main>
      </div>
    </div>
  );
}
