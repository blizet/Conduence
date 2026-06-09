'use client';

import { useAgentFeed } from '@/lib/agent-feed';
import { useInstalledAgents } from '@/lib/marketplace';

type AgentMarketplaceProps = {
  open: boolean;
  onClose: () => void;
};

export function AgentMarketplace({ open, onClose }: AgentMarketplaceProps) {
  const { catalog, installed, install, uninstall } = useInstalledAgents();
  const {
    newsStreamRunning,
    newsStreamError,
    startNewsStream,
    stopNewsStream,
    getStoredApiKey,
  } = useAgentFeed();

  if (!open) return null;

  return (
    <div className="marketplace-overlay" onClick={onClose} role="presentation">
      <div
        className="marketplace-panel glass"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-labelledby="marketplace-title"
      >
        <header className="marketplace-panel__header">
          <div>
            <h2 id="marketplace-title" className="marketplace-panel__title">
              Mind Agent Marketplace
            </h2>
            <p className="marketplace-panel__subtitle">
              Install agents · autonomous feeds stream to dedicated Redpanda topics via backend
            </p>
          </div>
          <button type="button" className="marketplace-close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </header>

        <div className="marketplace-list dark-scroll">
          {catalog.map((agent) => {
            const isInstalled = installed.has(agent.id);
            return (
              <article key={agent.id} className="marketplace-card">
                <div className="marketplace-card__accent" style={{ background: agent.accent }} />
                <div className="marketplace-card__body">
                  <div className="marketplace-card__title-row">
                    <h3 className="marketplace-card__name">{agent.name}</h3>
                    {agent.core && <span className="marketplace-badge">Core</span>}
                    {agent.autonomous && (
                      <span className="marketplace-badge marketplace-badge--live">Autonomous</span>
                    )}
                  </div>
                  <p className="marketplace-card__desc">{agent.description}</p>
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

                    {agent.id === 'newsAgent' && isInstalled && (
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
                  </div>
                  {agent.id === 'newsAgent' && isInstalled && newsStreamRunning && (
                    <p className="marketplace-card__live">Live · streaming to Redpanda</p>
                  )}
                  {agent.id === 'newsAgent' && newsStreamError && (
                    <p className="marketplace-card__error">{newsStreamError}</p>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      </div>
    </div>
  );
}
