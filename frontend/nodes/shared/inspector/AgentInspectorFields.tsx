'use client';

import { useCallback, useEffect, useState } from 'react';
import { useAgentFeed } from '@/lib/agent-feed';
import {
  defaultModelForProvider,
  normalizeProvider,
  type LlmProvider,
} from '@/lib/llm-providers';
import { fetchWorkflowLiveStatus } from '@/lib/workflow-live';
import {
  DEFAULT_COT_CORRELATED_JSON,
  DEFAULT_COT_DECISION_JSON,
  DEFAULT_COT_GRAPH_ID,
  DEFAULT_COT_USER_NODE_ID,
  DEFAULT_LLM_SYSTEM_PROMPT,
  DEFAULT_LLM_USER_PROMPT,
} from '../../constants';
import { FetchResultPanel } from '../FetchResultPanel';
import { GuideField } from './GuideField';
import { LabeledInput, LabeledInputRow } from '../LabeledField';
import { LlmProviderFields } from '../LlmProviderFields';
import { PromptField } from '../PromptField';
import { stopNodeKeyPropagation } from '../useNodeData';
import { MARKET_CATEGORIES, type WorkflowNodeData } from '../../types';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

type InspectorFieldsProps = {
  data: WorkflowNodeData;
  accent: string;
  onPatch: (patch: Partial<WorkflowNodeData>) => void;
};

export function LlmInspectorFields({ data, accent, onPatch }: InspectorFieldsProps) {
  const { filterByCategories } = useAgentFeed();
  const newsFilterCategories = data.newsFilterCategories ?? [];
  const filteredNews = filterByCategories(newsFilterCategories);
  const contextGraph = data.contextGraph ?? 'correlation';
  const graphId = data.graphId ?? DEFAULT_COT_GRAPH_ID;

  const toggleNewsCategory = (category: string) => {
    const next = newsFilterCategories.includes(category)
      ? newsFilterCategories.filter((c) => c !== category)
      : [...newsFilterCategories, category];
    onPatch({ newsFilterCategories: next });
  };

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
      <div className="node-field">
        <GuideField field="News filter">
          <div className="node-field__label">News filter</div>
          <div className="node-chips">
            {MARKET_CATEGORIES.map((category) => {
              const active = newsFilterCategories.includes(category);
              return (
                <button
                  key={category}
                  type="button"
                  className={`node-chip${active ? ' node-chip--active' : ''}`}
                  style={
                    active
                      ? { borderColor: accent, background: `${accent}22`, color: accent }
                      : undefined
                  }
                  onClick={() => toggleNewsCategory(category)}
                >
                  {category}
                </button>
              );
            })}
          </div>
          <p className="node-field__hint">
            {newsFilterCategories.length === 0
              ? 'All categories'
              : filteredNews
                ? `Matched: ${filteredNews.headline.slice(0, 48)}…`
                : 'No match in stream yet'}
          </p>
        </GuideField>
      </div>
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

export function NewsAgentInspectorFields({ data, accent, onPatch }: InspectorFieldsProps) {
  const { latestNews, newsCount, newsStreamRunning, newsStreamError, feedTopic } = useAgentFeed();
  const [workflowLive, setWorkflowLive] = useState(false);
  const llmProvider = normalizeProvider(data.llmProvider);
  const llmApiKey = data.llmApiKey ?? '';
  const llmModel = data.model ?? defaultModelForProvider(llmProvider);
  const llmReady = Boolean(llmProvider && llmApiKey.trim() && llmModel.trim());
  const managedByWorkflow = workflowLive;

  useEffect(() => {
    void fetchWorkflowLiveStatus().then((s) => setWorkflowLive(Boolean(s.running)));
    const t = setInterval(() => {
      void fetchWorkflowLiveStatus().then((s) => setWorkflowLive(Boolean(s.running)));
    }, 8000);
    return () => clearInterval(t);
  }, []);

  return (
    <div onKeyDown={stopNodeKeyPropagation}>
      <p className="node-field__hint">
        Required — sentiment, categories, keywords, thesis (SYSTEM_PROMPT is fixed)
      </p>
      <LlmProviderFields
        provider={llmProvider}
        model={llmModel}
        apiKey={llmApiKey}
        apiKeyLabel="LLM API key"
        onProviderChange={(p: LlmProvider) =>
          onPatch({ llmProvider: p, model: defaultModelForProvider(p) })
        }
        onModelChange={(m) => onPatch({ model: m })}
        onApiKeyChange={(k) => onPatch({ llmApiKey: k })}
      />
      <PromptField
        label="User prompt (strategy focus)"
        value={data.userPrompt ?? ''}
        rows={2}
        placeholder="e.g. Focus on ETF flows and regulation headlines…"
        onChange={(v) => onPatch({ userPrompt: v })}
      />
      <div className="node-field">
        <div className="node-field__label">Sub-agent feed</div>
        <div className="node-status-row">
          <span
            className={`node-live-dot${newsStreamRunning || managedByWorkflow ? ' node-live-dot--on' : ''}`}
            style={{ color: newsStreamRunning || managedByWorkflow ? accent : undefined }}
          />
          <span className="node-field__hint">
            {managedByWorkflow
              ? 'Managed by workflow Go Live'
              : newsStreamRunning
                ? `Live · ${feedTopic ?? 'agent.feeds.newsAgent.public'}`
                : llmReady
                  ? 'Use Go Live on the header or Marketplace'
                  : 'Set LLM provider, API key, and model'}
          </span>
        </div>
        <GuideField field="Simulate mode">
          <label className="node-checkbox-row">
            <input
              type="checkbox"
              checked={Boolean(data.simulate)}
              disabled={newsStreamRunning || managedByWorkflow}
              onChange={(e) => onPatch({ simulate: e.target.checked })}
            />
            Simulate mode — canned headlines, still calls LLM
          </label>
        </GuideField>
        {newsStreamError ? (
          <p className="node-field__hint" style={{ color: '#f87171', marginTop: 4 }}>
            {newsStreamError}
          </p>
        ) : null}
      </div>
      {latestNews ? (
        <div className="node-field">
          <div className="node-field__label">Latest signal ({newsCount} total)</div>
          <div className="node-feed-preview">
            <span className="node-feed-preview__sentiment">{latestNews.sentiment}</span>
            {latestNews.categories.slice(0, 2).join(', ')}
            <div className="node-feed-preview__headline">{latestNews.headline}</div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

type ArbitrageEvent = {
  summary?: string;
  thesis?: string;
  opportunity?: { net_edge?: number; match_confidence?: number };
};

function isArbitrageEvent(value: unknown): value is ArbitrageEvent {
  return Boolean(value) && typeof value === 'object' && 'summary' in (value as object);
}

export function ArbitrageAgentInspectorFields({ data, accent, onPatch }: InspectorFieldsProps) {
  const { agentFeeds, refreshAgentStatus } = useAgentFeed();
  const [workflowLive, setWorkflowLive] = useState(false);
  const feed = agentFeeds.arbitrageAgent;
  const running = feed?.running ?? false;
  const latest = isArbitrageEvent(feed?.latest) ? feed.latest : null;
  const llmProvider = normalizeProvider(data.llmProvider);
  const llmApiKey = data.llmApiKey ?? '';
  const llmModel = data.model ?? defaultModelForProvider(llmProvider);
  const llmReady = Boolean(llmProvider && llmApiKey.trim() && llmModel.trim());
  const managedByWorkflow = workflowLive;

  useEffect(() => {
    void refreshAgentStatus('arbitrageAgent');
    void fetchWorkflowLiveStatus().then((s) => setWorkflowLive(Boolean(s.running)));
    const t = setInterval(() => {
      void fetchWorkflowLiveStatus().then((s) => setWorkflowLive(Boolean(s.running)));
    }, 8000);
    return () => clearInterval(t);
  }, [refreshAgentStatus]);

  return (
    <div onKeyDown={stopNodeKeyPropagation}>
      <p className="node-field__hint">
        Required — used to verify that two markets resolve on the same fact and to write the thesis
      </p>
      <LlmProviderFields
        provider={llmProvider}
        model={llmModel}
        apiKey={llmApiKey}
        apiKeyLabel="LLM API key"
        onProviderChange={(p: LlmProvider) =>
          onPatch({ llmProvider: p, model: defaultModelForProvider(p) })
        }
        onModelChange={(m) => onPatch({ model: m })}
        onApiKeyChange={(k) => onPatch({ llmApiKey: k })}
      />
      <PromptField
        label="User prompt (strategy focus)"
        value={data.userPrompt ?? ''}
        rows={2}
        placeholder="e.g. Only crypto threshold markets with >$50K liquidity…"
        onChange={(v) => onPatch({ userPrompt: v })}
      />
      <div className="node-field">
        <div className="node-field__label">Polymarket × Kalshi scanner</div>
        <div className="node-status-row">
          <span
            className={`node-live-dot${running || managedByWorkflow ? ' node-live-dot--on' : ''}`}
            style={{ color: running || managedByWorkflow ? accent : undefined }}
          />
          <span className="node-field__hint">
            {managedByWorkflow
              ? 'Managed by workflow Go Live'
              : running
                ? `Live · ${feed?.feedTopic ?? 'agent.feeds.arbitrageAgent.public'}`
                : llmReady
                  ? 'Use Go Live on the header to start scanning'
                  : 'Set LLM provider, API key, and model to enable'}
          </span>
        </div>
        <GuideField field="Simulate mode">
          <label className="node-checkbox-row">
            <input
              type="checkbox"
              checked={data.simulate ?? false}
              disabled={running || managedByWorkflow}
              onChange={(e) => onPatch({ simulate: e.target.checked })}
            />
            Simulate mode — offline fixtures, still calls LLM
          </label>
        </GuideField>
        {feed?.error ? (
          <p className="node-field__hint" style={{ color: '#f87171', marginTop: 4 }}>
            {feed.error}
          </p>
        ) : null}
      </div>
      {latest ? (
        <div className="node-field">
          <div className="node-field__label">Latest opportunity ({feed?.count ?? 0} total)</div>
          <div className="node-feed-preview">
            {latest.opportunity ? (
              <span className="node-feed-preview__sentiment">
                +{((latest.opportunity.net_edge ?? 0) * 100).toFixed(1)}c · conf{' '}
                {latest.opportunity.match_confidence ?? '—'}
              </span>
            ) : null}
            <div className="node-feed-preview__headline">{latest.summary}</div>
            {latest.thesis ? <p className="node-field__hint">{latest.thesis}</p> : null}
          </div>
        </div>
      ) : null}
      <p className="node-field__hint">
        Gates: same event (LLM) · exact thresholds · ask-priced legs · fees · net edge ≥ 1.5c
      </p>
    </div>
  );
}

type RiskEvent = {
  summary?: string;
  thesis?: string;
  action?: string;
  size_usd?: number;
  price?: number;
  count?: number;
  gates_failed?: string[];
};

function isRiskEvent(value: unknown): value is RiskEvent {
  return Boolean(value) && typeof value === 'object' && 'action' in (value as object);
}

export function RiskAnalyzerInspectorFields({ data, accent, onPatch }: InspectorFieldsProps) {
  const { agentFeeds, refreshAgentStatus } = useAgentFeed();
  const [workflowLive, setWorkflowLive] = useState(false);
  const feed = agentFeeds.riskAnalyzer;
  const running = feed?.running ?? false;
  const latest = isRiskEvent(feed?.latest) ? feed.latest : null;
  const managedByWorkflow = workflowLive;

  useEffect(() => {
    void refreshAgentStatus('riskAnalyzer');
    void fetchWorkflowLiveStatus().then((s) => setWorkflowLive(Boolean(s.running)));
    const t = setInterval(() => {
      void fetchWorkflowLiveStatus().then((s) => setWorkflowLive(Boolean(s.running)));
    }, 8000);
    return () => clearInterval(t);
  }, [refreshAgentStatus]);

  return (
    <div onKeyDown={stopNodeKeyPropagation}>
      <p className="node-field__hint">
        Deterministic sizing — no LLM required. Fill trade proposal + risk limits below.
      </p>
      <LabeledInputRow>
        <LabeledInput
          label="Portfolio (USD)"
          guideField="Portfolio (USD)"
          inline
          placeholder="10000"
          value={data.portfolioUsd ?? '10000'}
          onChange={(v) => onPatch({ portfolioUsd: v })}
        />
        <LabeledInput
          label="Max open risk (USD)"
          inline
          placeholder="optional"
          value={data.maxOpenRiskUsd ?? ''}
          onChange={(v) => onPatch({ maxOpenRiskUsd: v })}
        />
      </LabeledInputRow>
      <LabeledInputRow>
        <LabeledInput
          label="Risk % min"
          guideField="Risk % min / max"
          inline
          placeholder="0.02"
          value={data.riskPctMin ?? '0.02'}
          onChange={(v) => onPatch({ riskPctMin: v })}
        />
        <LabeledInput
          label="Risk % max"
          inline
          placeholder="0.05"
          value={data.riskPctMax ?? '0.05'}
          onChange={(v) => onPatch({ riskPctMax: v })}
        />
      </LabeledInputRow>
      <LabeledInputRow>
        <LabeledInput
          label="Min confidence"
          guideField="Min confidence"
          inline
          placeholder="0.55"
          value={data.minConfidence ?? '0.55'}
          onChange={(v) => onPatch({ minConfidence: v })}
        />
        <LabeledInput
          label="Max liq fraction"
          inline
          placeholder="0.05"
          value={data.maxLiquidityFraction ?? '0.05'}
          onChange={(v) => onPatch({ maxLiquidityFraction: v })}
        />
      </LabeledInputRow>
      <div className="node-field">
        <GuideField field="Trade action / market / price">
          <div className="node-field__label">Trade proposal</div>
        </GuideField>
      </div>
      <LabeledInputRow>
        <div className="node-field node-field--inline">
          <div className="node-field__label">Action</div>
          <select
            className="node-input"
            value={data.tradeAction ?? 'BUY_YES'}
            onChange={(e) =>
              onPatch({ tradeAction: e.target.value as WorkflowNodeData['tradeAction'] })
            }
          >
            <option value="BUY_YES">BUY YES</option>
            <option value="BUY_NO">BUY NO</option>
            <option value="HOLD">HOLD</option>
          </select>
        </div>
        <div className="node-field node-field--inline">
          <div className="node-field__label">Venue</div>
          <select
            className="node-input"
            value={data.tradeVenue ?? 'polymarket'}
            onChange={(e) =>
              onPatch({ tradeVenue: e.target.value as WorkflowNodeData['tradeVenue'] })
            }
          >
            <option value="polymarket">Polymarket</option>
            <option value="kalshi">Kalshi</option>
          </select>
        </div>
      </LabeledInputRow>
      <LabeledInput
        label="Market ID / slug / ticker"
        placeholder="btc-100k-2026 or KXBTC-..."
        value={data.tradeMarketId ?? ''}
        onChange={(v) => onPatch({ tradeMarketId: v })}
      />
      <LabeledInput
        label="Market title (search fallback)"
        placeholder="Will Bitcoin exceed $100k?"
        value={data.tradeTitle ?? ''}
        onChange={(v) => onPatch({ tradeTitle: v })}
      />
      <LabeledInputRow>
        <LabeledInput
          label="Confidence (0–1)"
          inline
          placeholder="0.65"
          value={data.tradeConfidence ?? '0.65'}
          onChange={(v) => onPatch({ tradeConfidence: v })}
        />
        <LabeledInput
          label="Entry price"
          inline
          placeholder="0.62 or leave blank"
          value={data.tradePrice ?? ''}
          onChange={(v) => onPatch({ tradePrice: v })}
        />
      </LabeledInputRow>
      <PromptField
        label="Strategy notes"
        value={data.userPrompt ?? ''}
        rows={2}
        placeholder="e.g. Never size above $500 on low-liquidity markets…"
        onChange={(v) => onPatch({ userPrompt: v })}
      />
      <div className="node-field">
        <div className="node-field__label">Risk analyzer feed</div>
        <div className="node-status-row">
          <span
            className={`node-live-dot${running || managedByWorkflow ? ' node-live-dot--on' : ''}`}
            style={{ color: running || managedByWorkflow ? accent : undefined }}
          />
          <span className="node-field__hint">
            {managedByWorkflow
              ? 'Managed by workflow Go Live'
              : running
                ? `Live · ${feed?.feedTopic ?? 'agent.feeds.riskAnalyzer.public'}`
                : 'Use Go Live on the header to start sizing'}
          </span>
        </div>
        <GuideField field="Simulate mode">
          <label className="node-checkbox-row">
            <input
              type="checkbox"
              checked={Boolean(data.simulate)}
              disabled={running || managedByWorkflow}
              onChange={(e) => onPatch({ simulate: e.target.checked })}
            />
            Simulate mode — fixture liquidity, no live tools required
          </label>
        </GuideField>
        {feed?.error ? (
          <p className="node-field__hint" style={{ color: '#f87171', marginTop: 4 }}>
            {feed.error}
          </p>
        ) : null}
      </div>
      {latest ? (
        <div className="node-field">
          <div className="node-field__label">Latest sizing ({feed?.count ?? 0} total)</div>
          <div className="node-feed-preview">
            <span className="node-feed-preview__sentiment">
              {latest.action}
              {latest.size_usd ? ` · $${latest.size_usd.toLocaleString()}` : ''}
              {latest.price ? ` @ ${latest.price}` : ''}
            </span>
            <div className="node-feed-preview__headline">{latest.summary}</div>
            {latest.thesis ? <p className="node-field__hint">{latest.thesis}</p> : null}
            {latest.gates_failed?.length ? (
              <p className="node-field__hint" style={{ color: '#fbbf24' }}>
                Gates failed: {latest.gates_failed.join(', ')}
              </p>
            ) : null}
          </div>
        </div>
      ) : null}
      <p className="node-field__hint">
        Snap Polymarket Markets / Wallet or Kalshi for live liquidity and exposure caps
      </p>
    </div>
  );
}

type SportsSignal = {
  type?: string;
  ticker?: string;
  thesis?: string;
  summary?: string;
  side_team?: string;
  filter_report?: string[];
};

function isSportsSignal(value: unknown): value is SportsSignal {
  return Boolean(value) && typeof value === 'object';
}

export function SportsScannerInspectorFields({ accent }: InspectorFieldsProps) {
  const { agentFeeds, refreshAgentStatus } = useAgentFeed();
  const feed = agentFeeds['sportsScanner.user_demo'];
  const live = feed?.running ?? false;
  const latest = isSportsSignal(feed?.latest) ? feed.latest : null;

  useEffect(() => {
    void refreshAgentStatus('sportsScanner.user_demo');
    const timer = setInterval(() => void refreshAgentStatus('sportsScanner.user_demo'), 10000);
    return () => clearInterval(timer);
  }, [refreshAgentStatus]);

  return (
    <div onKeyDown={stopNodeKeyPropagation}>
      <div className="node-panel-section">
        <div className="node-status-row">
          <span className={`node-pill ${live ? 'node-pill--live' : 'node-pill--idle'}`}>
            {live ? 'Live · receiving' : 'Offline · waiting for publisher'}
          </span>
          {feed?.count ? <span className="node-meta">{feed.count} signals</span> : null}
        </div>
        {latest ? (
          <div className="node-feed-preview">
            <p className="node-feed-preview__title">
              {latest.ticker ?? '—'} · {latest.type ?? 'signal'}
              {latest.side_team ? ` · ${latest.side_team}` : ''}
            </p>
            <p className="node-feed-preview__body">
              {latest.thesis ?? latest.summary ?? 'No thesis on last signal'}
            </p>
            {latest.filter_report?.length ? (
              <ul className="node-feed-preview__list">
                {latest.filter_report.slice(0, 3).map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : (
          <p className="node-hint">
            Publisher runs kalshiSports with the HTTP wrapper. Install from marketplace to subscribe.
          </p>
        )}
      </div>
      <p className="node-field__hint" style={{ color: accent }}>
        No configurable parameters — signals arrive from the external publisher.
      </p>
    </div>
  );
}

export function CotBuilderInspectorFields({ data, accent, onPatch }: InspectorFieldsProps) {
  const [busy, setBusy] = useState(false);

  const buildAndEmit = useCallback(async () => {
    setBusy(true);
    const started = performance.now();
    onPatch({ cotStatus: 'Building…', workflowStatus: 'running', workflowResult: '', workflowDurationMs: undefined });
    try {
      const backendUrl = (data.backendUrl ?? API).replace(/\/$/, '');
      let decision: unknown;
      let correlated: unknown;
      try {
        decision = JSON.parse(data.decisionJson ?? DEFAULT_COT_DECISION_JSON);
      } catch {
        onPatch({ cotStatus: 'Invalid decision JSON' });
        return;
      }
      try {
        correlated = JSON.parse(data.correlatedJson ?? DEFAULT_COT_CORRELATED_JSON);
      } catch {
        onPatch({ cotStatus: 'Invalid correlated markets JSON' });
        return;
      }
      const buildRes = await fetch(`${backendUrl}/api/tools/cot/build`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          decision,
          correlated,
          graphId: data.graphId ?? DEFAULT_COT_GRAPH_ID,
          userNodeId: data.userNodeId ?? DEFAULT_COT_USER_NODE_ID,
        }),
      });
      const buildBody = (await buildRes.json()) as {
        hold?: boolean;
        message?: string;
        cot?: unknown;
        error?: string;
      };
      if (!buildRes.ok || buildBody.error) {
        onPatch({ cotStatus: buildBody.error ?? `Build failed (${buildRes.status})` });
        return;
      }
      if (buildBody.hold) {
        onPatch({ cotOutput: '', cotStatus: buildBody.message ?? 'HOLD — no CoT emitted' });
        return;
      }
      const durationMs = Math.round(performance.now() - started);
      const cotJson = JSON.stringify(buildBody.cot, null, 2);
      onPatch({
        cotOutput: cotJson,
        cotStatus: 'CoT graph built',
        workflowStatus: 'success',
        workflowError: '',
        workflowResult: cotJson,
        workflowDurationMs: durationMs,
      });
      if (data.autoEmit) {
        const emitRes = await fetch(`${backendUrl}/api/signals/cot`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(buildBody.cot),
        });
        const emitBody = (await emitRes.json()) as { topic?: string; error?: string };
        if (!emitRes.ok || emitBody.error) {
          onPatch({ cotStatus: emitBody.error ?? `Emit failed (${emitRes.status})` });
          return;
        }
        onPatch({
          cotStatus: emitBody.topic ? `Emitted → ${emitBody.topic}` : 'CoT emitted to event stream',
        });
      }
    } catch (err) {
      onPatch({ cotStatus: err instanceof Error ? err.message : 'Request failed' });
    } finally {
      setBusy(false);
    }
  }, [data, onPatch]);

  return (
    <div onKeyDown={stopNodeKeyPropagation}>
      <LabeledInputRow>
        <LabeledInput
          label="Graph ID"
          inline
          placeholder="user_771.main.v1"
          value={data.graphId ?? DEFAULT_COT_GRAPH_ID}
          onChange={(v) => onPatch({ graphId: v })}
        />
        <LabeledInput
          label="User node ID"
          inline
          placeholder="user_771"
          value={data.userNodeId ?? DEFAULT_COT_USER_NODE_ID}
          onChange={(v) => onPatch({ userNodeId: v })}
        />
      </LabeledInputRow>
      <LabeledInput
        label="Backend URL"
        placeholder="http://localhost:4000"
        value={data.backendUrl ?? ''}
        onChange={(v) => onPatch({ backendUrl: v })}
      />
      <GuideField field="Auto-emit to Redpanda">
        <label className="node-checkbox-row">
          <input
            type="checkbox"
            checked={data.autoEmit ?? false}
            onChange={(e) => onPatch({ autoEmit: e.target.checked })}
          />
          <span>Auto-emit to Redpanda after build</span>
        </label>
      </GuideField>
      <PromptField
        label="Decision JSON (from Orchestrator)"
        guideField="Decision JSON"
        value={data.decisionJson ?? DEFAULT_COT_DECISION_JSON}
        rows={4}
        onChange={(v) => onPatch({ decisionJson: v })}
      />
      <PromptField
        label="Correlated markets JSON"
        guideField="Correlated markets JSON"
        value={data.correlatedJson ?? DEFAULT_COT_CORRELATED_JSON}
        rows={3}
        onChange={(v) => onPatch({ correlatedJson: v })}
      />
      <button
        type="button"
        className="node-add-btn"
        style={{ borderColor: `${accent}55`, color: accent }}
        disabled={busy}
        onClick={() => void buildAndEmit()}
      >
        {busy ? 'Building…' : data.autoEmit ? 'Build & emit CoT' : 'Build CoT output'}
      </button>
      {data.cotStatus && !data.workflowResult ? (
        <p className="node-field__hint" style={{ marginTop: 4 }}>
          {data.cotStatus}
        </p>
      ) : null}
      <FetchResultPanel
        status={data.workflowStatus}
        error={data.workflowError ?? data.cotStatus}
        result={data.workflowResult ?? data.cotOutput}
        durationMs={data.workflowDurationMs}
        label="CoT output (DecisionEvent)"
      />
    </div>
  );
}

export function OutputInspectorFields({ data }: Pick<InspectorFieldsProps, 'data'>) {
  const hasPayload = Boolean(data.outputPayload);
  const statusLabel = data.outputStatus ? `Status: ${data.outputStatus}` : 'Waiting for workflow run';

  return (
    <div>
      <p className="node-field__hint">
        {statusLabel}
        {data.outputSource ? ` · Source: ${data.outputSource}` : ''}
        {data.outputDurationMs != null
          ? ` · ${data.outputDurationMs < 1000 ? `${data.outputDurationMs} ms` : `${(data.outputDurationMs / 1000).toFixed(2)} s`}`
          : ''}
      </p>
      {hasPayload ? (
        <div className="node-field">
          <div className="node-field__label">Output payload</div>
          <textarea
            className="node-textarea node-fetch-result"
            rows={8}
            readOnly
            value={data.outputPayload}
          />
        </div>
      ) : (
        <p className="node-field__hint">Run the workflow to populate this output node.</p>
      )}
    </div>
  );
}
