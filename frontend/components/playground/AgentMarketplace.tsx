'use client';

import { useCallback, useEffect, useState } from 'react';
import { useAgentFeed } from '@/lib/agent-feed';
import { isExternalAgent, useInstalledAgents, type MarketplaceAgent } from '@/lib/marketplace';
import {
  fetchMarketplaceWorkflow,
  fetchMarketplaceWorkflows,
  type MarketplaceWorkflowListing,
} from '@/lib/workflow-marketplace';
import type { Edge } from '@xyflow/react';
import type { WorkflowNode } from '@/nodes/types';
import { fetchWorkflowLiveStatus } from '@/lib/workflow-live';
import { WrapperGuideModal } from './WrapperGuideModal';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';
const TWILIGHT_ACCENT = '#5b8def';

type AgentMarketplaceProps = {
  open: boolean;
  onClose: () => void;
  onInstallWorkflow?: (canvas: { nodes: WorkflowNode[]; edges: Edge[] }) => void;
  workflowRefreshSignal?: number;
};

type AgentLiveStatus = {
  live?: boolean;
  lastSeen?: string | null;
};

function WrapperInfoIcon({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      className="marketplace-info-btn"
      onClick={onClick}
      title="How to convert your autonomous agent with the HTTP wrapper"
      aria-label="Wrapper setup guide"
    >
      <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
        <circle cx="8" cy="8" r="6.25" />
        <path d="M8 7.2V11" strokeLinecap="round" />
        <circle cx="8" cy="5.1" r="0.75" fill="currentColor" stroke="none" />
      </svg>
    </button>
  );
}

function liveLabel(agent: MarketplaceAgent, feedLive: boolean, status?: AgentLiveStatus): string {
  if (!agent.autonomous) return '';
  if (isExternalAgent(agent)) {
    const live = status?.live ?? feedLive;
    return live ? 'Live · receiving publisher feed' : 'Offline · waiting for publisher';
  }
  return feedLive ? 'Live · streaming to Redpanda' : '';
}

export function AgentMarketplace({
  open,
  onClose,
  onInstallWorkflow,
  workflowRefreshSignal = 0,
}: AgentMarketplaceProps) {
  const { catalog, installed, install, uninstall } = useInstalledAgents();
  const {
    newsStreamRunning,
    newsStreamError,
    startNewsStream,
    stopNewsStream,
    getStoredApiKey,
    agentFeeds,
    startAgent,
    stopAgent,
    refreshAgentStatus,
  } = useAgentFeed();

  const [guideOpen, setGuideOpen] = useState(false);
  const [workflowLive, setWorkflowLive] = useState(false);
  const [workflows, setWorkflows] = useState<MarketplaceWorkflowListing[]>([]);
  const [workflowBusy, setWorkflowBusy] = useState<string | null>(null);
  const [externalStatus, setExternalStatus] = useState<Record<string, AgentLiveStatus>>({});
  const [schemaPreview, setSchemaPreview] = useState<string | null>(null);

  const loadWorkflows = useCallback(async () => {
    const list = await fetchMarketplaceWorkflows();
    setWorkflows(list);
  }, []);

  useEffect(() => {
    if (!open) return;
    void loadWorkflows();
    void fetchWorkflowLiveStatus().then((s) => setWorkflowLive(Boolean(s.running)));
  }, [open, loadWorkflows, workflowRefreshSignal]);

  const installWorkflow = async (workflowId: string) => {
    setWorkflowBusy(workflowId);
    try {
      const detail = await fetchMarketplaceWorkflow(workflowId);
      if (!detail?.canvas || !onInstallWorkflow) return;
      onInstallWorkflow({
        nodes: detail.canvas.nodes ?? [],
        edges: (detail.canvas.edges ?? []) as Edge[],
      });
      onClose();
    } finally {
      setWorkflowBusy(null);
    }
  };

  const externalAgents = catalog.filter((a) => isExternalAgent(a) && a.autonomous);

  const pollExternalStatus = useCallback(async () => {
    await Promise.all(
      externalAgents.map(async (agent) => {
        try {
          const res = await fetch(`${API_URL}/api/marketplace/agents/${agent.id}/status`, {
            cache: 'no-store',
          });
          if (!res.ok) return;
          const body = (await res.json()) as AgentLiveStatus & { ok?: boolean };
          setExternalStatus((prev) => ({
            ...prev,
            [agent.id]: { live: Boolean(body.live), lastSeen: body.lastSeen ?? null },
          }));
        } catch {
          /* backend optional */
        }
      }),
    );
  }, [externalAgents]);

  useEffect(() => {
    if (!open) return;
    for (const agent of catalog) {
      if (agent.autonomous) void refreshAgentStatus(agent.id);
    }
    void pollExternalStatus();
    const timer = setInterval(() => {
      void pollExternalStatus();
      for (const agent of externalAgents) void refreshAgentStatus(agent.id);
    }, 10000);
    return () => clearInterval(timer);
  }, [open, catalog, externalAgents, pollExternalStatus, refreshAgentStatus]);

  const viewSchema = async (agentId: string) => {
    try {
      const res = await fetch(`${API_URL}/api/marketplace/agents/${agentId}/schema`);
      if (!res.ok) return;
      const body = await res.json();
      setSchemaPreview(JSON.stringify(body, null, 2));
    } catch {
      setSchemaPreview('Schema unavailable — start the backend');
    }
  };

  if (!open) return null;

  return (
    <>
      <div className="marketplace-overlay" onClick={onClose} role="presentation">
        <div
          className="marketplace-panel glass"
          onClick={(e) => e.stopPropagation()}
          role="dialog"
          aria-labelledby="marketplace-title"
        >
          <header className="marketplace-panel__header">
            <div>
              <div className="marketplace-panel__title-row">
                <h2 id="marketplace-title" className="marketplace-panel__title">
                  Mind Agent Marketplace
                </h2>
                <WrapperInfoIcon onClick={() => setGuideOpen(true)} />
              </div>
              <p className="marketplace-panel__subtitle">
                Install mind agents and publisher workflows · workflows tagged below
              </p>
            </div>
            <button type="button" className="marketplace-close" onClick={onClose} aria-label="Close">
              ×
            </button>
          </header>

          <div className="marketplace-list dark-scroll">
            {catalog.map((agent) => {
              const isInstalled = installed.has(agent.id);
              const external = isExternalAgent(agent);
              const feed = agentFeeds[agent.id];
              const feedLive = Boolean(feed?.running);
              const status = externalStatus[agent.id];
              const live = liveLabel(agent, feedLive, status);
              const isLive = external ? Boolean(status?.live ?? feedLive) : feedLive;

              return (
                <article key={agent.id} className="marketplace-card">
                  <div className="marketplace-card__accent" style={{ background: agent.accent }} />
                  <div className="marketplace-card__body">
                    <div className="marketplace-card__title-row">
                      <h3 className="marketplace-card__name">{agent.name}</h3>
                      {agent.core && <span className="marketplace-badge">Core</span>}
                      {agent.autonomous && external && (
                        <span className="marketplace-badge marketplace-badge--external">External</span>
                      )}
                      {agent.autonomous && !external && (
                        <span className="marketplace-badge marketplace-badge--live">Hosted</span>
                      )}
                      {agent.autonomous && (
                        <span
                          className={`marketplace-badge ${isLive ? 'marketplace-badge--online' : 'marketplace-badge--offline'}`}
                        >
                          {isLive ? 'Live' : 'Offline'}
                        </span>
                      )}
                    </div>
                    <p className="marketplace-card__desc">{agent.description}</p>
                    {external && agent.publisher && (
                      <p className="marketplace-card__topic">Publisher · {agent.publisher}</p>
                    )}
                    {agent.autonomous && agent.feedTopic && (
                      <p className="marketplace-card__topic">Topic · {agent.feedTopic}</p>
                    )}
                    <div className="marketplace-card__actions">
                      {agent.core ? (
                        <span className="marketplace-installed-label">Always available</span>
                      ) : isInstalled ? (
                        <button
                          type="button"
                          className="marketplace-btn marketplace-btn--ghost"
                          onClick={() => uninstall(agent.id)}
                        >
                          Uninstall
                        </button>
                      ) : (
                        <button
                          type="button"
                          className="marketplace-btn"
                          style={{ borderColor: agent.accent, color: agent.accent }}
                          onClick={() => install(agent.id)}
                        >
                          Install
                        </button>
                      )}

                      {external && (
                        <>
                          <button
                            type="button"
                            className="marketplace-btn marketplace-btn--ghost"
                            onClick={() => void viewSchema(agent.id)}
                          >
                            View schema
                          </button>
                          <button
                            type="button"
                            className="marketplace-btn marketplace-btn--ghost"
                            onClick={() => setGuideOpen(true)}
                          >
                            Wrapper docs
                          </button>
                        </>
                      )}

                      {!external && agent.id === 'newsAgent' && isInstalled && !workflowLive && (
                        <button
                          type="button"
                          className={`marketplace-btn${newsStreamRunning ? ' marketplace-btn--stop' : ''}`}
                          onClick={() =>
                            void (newsStreamRunning
                              ? stopNewsStream()
                              : startNewsStream(getStoredApiKey()))
                          }
                        >
                          {newsStreamRunning ? 'Stop live feed' : 'Start live feed'}
                        </button>
                      )}

                      {!external && agent.autonomous && agent.id !== 'newsAgent' && isInstalled && !workflowLive && (
                        <button
                          type="button"
                          className={`marketplace-btn${agentFeeds[agent.id]?.running ? ' marketplace-btn--stop' : ''}`}
                          onClick={() =>
                            void (agentFeeds[agent.id]?.running
                              ? stopAgent(agent.id)
                              : startAgent(agent.id))
                          }
                        >
                          {agentFeeds[agent.id]?.running ? 'Stop live feed' : 'Start live feed'}
                        </button>
                      )}
                    </div>

                    {isInstalled && workflowLive && agent.autonomous && !external && (
                      <p className="marketplace-card__live marketplace-card__live--muted">
                        Managed by workflow Go Live
                      </p>
                    )}
                    {isInstalled && live && (
                      <p className={`marketplace-card__live${isLive ? '' : ' marketplace-card__live--muted'}`}>
                        {live}
                      </p>
                    )}
                    {external && isInstalled && status?.lastSeen && (
                      <p className="marketplace-card__topic">
                        Last signal · {new Date(status.lastSeen).toLocaleString()}
                      </p>
                    )}
                    {agent.id === 'newsAgent' && newsStreamError && (
                      <p className="marketplace-card__error">{newsStreamError}</p>
                    )}
                    {!external && agent.autonomous && agentFeeds[agent.id]?.error && (
                      <p className="marketplace-card__error">{agentFeeds[agent.id]?.error}</p>
                    )}
                  </div>
                </article>
              );
            })}

            {workflows.map((workflow) => (
              <article key={workflow.id} className="marketplace-card">
                <div className="marketplace-card__accent" style={{ background: TWILIGHT_ACCENT }} />
                <div className="marketplace-card__body">
                  <div className="marketplace-card__title-row">
                    <h3 className="marketplace-card__name">{workflow.name}</h3>
                    <span className="marketplace-badge marketplace-badge--workflow">Workflow</span>
                    {workflow.publishAsMindAgent && (
                      <span className="marketplace-badge marketplace-badge--live">Mind agent</span>
                    )}
                  </div>
                  {workflow.description && (
                    <p className="marketplace-card__desc">{workflow.description}</p>
                  )}
                  <p className="marketplace-card__topic">
                    {workflow.nodeCount ?? 0} nodes · {workflow.edgeCount ?? 0} edges
                    {workflow.publisher ? ` · ${workflow.publisher}` : ''}
                  </p>
                  {workflow.updatedAt && (
                    <p className="marketplace-card__topic">
                      Updated · {new Date(workflow.updatedAt).toLocaleString()}
                    </p>
                  )}
                  <div className="marketplace-card__actions">
                    <button
                      type="button"
                      className="marketplace-btn"
                      style={{ borderColor: TWILIGHT_ACCENT, color: TWILIGHT_ACCENT }}
                      disabled={workflowBusy === workflow.id}
                      onClick={() => void installWorkflow(workflow.id)}
                    >
                      {workflowBusy === workflow.id ? 'Loading…' : 'Load onto canvas'}
                    </button>
                  </div>
                </div>
              </article>
            ))}
          </div>

          {schemaPreview && (
            <div className="marketplace-schema-preview">
              <div className="marketplace-schema-preview__header">
                <span>Signal schema</span>
                <button type="button" className="marketplace-close" onClick={() => setSchemaPreview(null)}>
                  ×
                </button>
              </div>
              <pre className="marketplace-schema-preview__code dark-scroll">{schemaPreview}</pre>
            </div>
          )}
        </div>
      </div>

      <WrapperGuideModal open={guideOpen} onClose={() => setGuideOpen(false)} apiUrl={API_URL} />
    </>
  );
}
