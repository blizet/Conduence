'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import type { ChatApiResponse, ChatMessage, ConversationTokenUsage, WeightedGraph } from '@/lib/agentic/types';
import { emptyConversationUsage } from '@/lib/agentic/tokens';
import { agenticFetch } from '@/lib/agentic/api';
import { GraphView } from './GraphView';
import { LlmSettingsPanel, useLlmSettings, type ProviderOption } from './LlmSettings';
import { TokenUsagePanel } from './TokenUsage';
import './agentic-graph.css';

function MessageIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
      <path
        d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"
        strokeLinejoin="round"
      />
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
  const [input, setInput] = useState('');
  const [sessionOpen, setSessionOpen] = useState(
    () => !llmSettings.apiKey?.trim() && !envFallbackConfigured,
  );
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
    setInput('');
    onSend(text);
  }, [input, loading, onSend]);

  return (
    <div className="chat-widget">
      <div
        className={`chat-window glass-panel${open ? ' chat-window--open' : ''}`}
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
          {!envFallbackConfigured && !llmSettings.apiKey?.trim() && (
            <span className="status-pill status-pill--warn">LLM API key required</span>
          )}
          {pendingCount > 0 && (
            <span className="status-pill status-pill--warn">{pendingCount} need weight</span>
          )}
          {supermemoryConfigured && (
            <span className="status-pill status-pill--ok">
              Supermemory {supermemoryLoaded ? '· restored' : '· connected'}
            </span>
          )}
          {graphComplete && <span className="status-pill status-pill--ok">Graph complete</span>}
        </div>

        {!envFallbackConfigured && !llmSettings.apiKey?.trim() && (
          <div className="chat-window__llm-setup">
            <p className="chat-window__llm-setup-title">Connect an LLM to start chatting</p>
            <LlmSettingsPanel
              settings={llmSettings}
              onChange={onLlmSettingsChange}
              providers={providers}
              envFallbackConfigured={envFallbackConfigured}
              defaultOpen
            />
          </div>
        )}

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
              {m.content.split('\n').map((line, j) => (
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
            placeholder="Describe relationships, answer follow-ups, or give weights in your own words…"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
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
              className={`session-drawer__chevron${sessionOpen ? ' session-drawer__chevron--open' : ''}`}
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
              {pendingCount > 9 ? '9+' : pendingCount}
            </span>
          )}
        </button>
      )}
    </div>
  );
}

type AgenticGraphViewProps = {
  userSlug: string;
};

export function AgenticGraphView({ userSlug }: AgenticGraphViewProps) {
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
  const [serviceError, setServiceError] = useState<string | null>(null);

  useEffect(() => {
    agenticFetch('/health')
      .then((r) => r.json())
      .then((data) => {
        setServiceError(null);
        setHealth({
          envFallbackConfigured: Boolean(data.envFallbackConfigured),
          supermemoryConfigured: Boolean(data.supermemoryConfigured),
          providers: data.providers ?? [],
        });
      })
      .catch(() => {
        setHealth({ envFallbackConfigured: false, supermemoryConfigured: false, providers: [] });
        setServiceError('Agentic graph service unavailable. Ensure the backend is running on port 4000.');
      });

    agenticFetch('/reset', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userSlug }),
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.error) {
          setServiceError(data.error);
          return;
        }
        setSessionId(data.sessionId);
        setMessages(data.messages ?? []);
        setGraph(data.graph ?? { nodes: [], edges: [] });
        setTokenUsage(data.tokenUsage ?? emptyConversationUsage());
        setSupermemoryLoaded(Boolean(data.supermemoryLoaded));
      })
      .catch(() => undefined);
  }, [userSlug]);

  const send = useCallback(
    async (text: string) => {
      setLoading(true);
      setMessages((prev) => [...prev, { role: 'user', content: text }]);
      try {
        const res = await agenticFetch('/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sessionId, message: text, llm: llmSettings, userSlug }),
        });
        const data = (await res.json()) as ChatApiResponse & { error?: string };
        if (!res.ok) throw new Error(data.error ?? 'Chat failed');
        setSessionId(data.sessionId);
        setMessages((prev) => [...prev, { role: 'assistant', content: data.message }]);
        setGraph(data.graph);
        setPendingCount(data.pendingWeights.length);
        setGraphComplete(data.graphComplete);
        setTokenUsage(data.tokenUsage ?? emptyConversationUsage());
        setSupermemoryLoaded(Boolean(data.supermemoryLoaded));
      } catch (err) {
        setMessages((prev) => [
          ...prev,
          {
            role: 'assistant',
            content: err instanceof Error ? err.message : 'Something went wrong.',
          },
        ]);
      } finally {
        setLoading(false);
      }
    },
    [sessionId, llmSettings, userSlug],
  );

  const reset = useCallback(
    async (options?: { fresh?: boolean }) => {
      const res = await agenticFetch('/reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, fresh: options?.fresh ?? false, userSlug }),
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
    [sessionId, userSlug],
  );

  const setEdgeWeight = useCallback(
    async (edgeId: string, weight: number) => {
      if (!sessionId) return;
      const res = await agenticFetch('/edge-weight', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, edgeId, weight, userSlug }),
      });
      if (!res.ok) return;
      const data = (await res.json()) as ChatApiResponse;
      setGraph(data.graph);
      setPendingCount(data.pendingWeights.length);
      setGraphComplete(data.graphComplete);
    },
    [sessionId, userSlug],
  );

  const hasLlmKey = Boolean(llmSettings.apiKey?.trim()) || Boolean(health?.envFallbackConfigured);

  useEffect(() => {
    if (!hasLlmKey) setChatOpen(true);
  }, [hasLlmKey]);

  return (
    <div className="cot-graph-view agentic-graph-view">
      <div className="agentic-graph-root">
        {serviceError ? (
          <div className="app-banner">{serviceError}</div>
        ) : null}
        {!hasLlmKey && !serviceError ? (
          <div className="app-banner">
            Choose a provider in <strong>Session &amp; LLM</strong> and paste your API key, or set{' '}
            <code>AGENTIC_LLM_API_KEY</code> in <code>backend/.env</code> as a server fallback.
          </div>
        ) : null}
        {health?.supermemoryConfigured ? (
          <div className="agentic-graph-toolbar">
            <button
              type="button"
              className="graph-view-toggle graph-view-toggle--active"
              onClick={() => reset({ fresh: false })}
              title="New session and restore graph from Supermemory"
            >
              Restore
            </button>
          </div>
        ) : null}
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
