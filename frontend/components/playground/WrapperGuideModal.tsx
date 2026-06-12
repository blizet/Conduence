'use client';

type WrapperGuideModalProps = {
  open: boolean;
  onClose: () => void;
  apiUrl?: string;
};

const STEPS = [
  {
    title: 'Register your agent',
    body: 'Request a marketplace listing and publisher API key. You receive an agent_id (e.g. sportsScanner.user_demo) and a dedicated Redpanda feed topic.',
  },
  {
    title: 'Add the HTTP wrapper to your agent',
    body: 'In any language, POST signals when your agent produces decisions. No SDK required — fetch, curl, or httpx is enough.',
  },
  {
    title: 'Run your agent 24/7 on your infrastructure',
    body: 'Keep your process alive (CLI, Docker, cloud worker). The platform does not start external agents — you control uptime.',
  },
  {
    title: 'Subscribers install from marketplace',
    body: 'Other users install your feed, wire it to the LLM Analyzer, and receive live signals over WebSocket. They never run your code.',
  },
];

export function WrapperGuideModal({ open, onClose, apiUrl = 'http://localhost:4000' }: WrapperGuideModalProps) {
  if (!open) return null;

  const agentId = 'sportsScanner.user_demo';
  const signalExample = `POST ${apiUrl}/api/feeds/${agentId}/signal
Authorization: Bearer <your_publisher_api_key>
Content-Type: application/json

{
  "payload": {
    "type": "trade_enter",
    "agent": "sportsScanner",
    "ticker": "KXSIM-ARS",
    "thesis": "Late-game +2 lead, 94c ask",
    "filter_report": ["PASS lead: Arsenal +2 @ 82'"],
    "ts": "2026-06-12T18:00:00Z"
  }
}`;

  const jsExample = `await fetch(\`\${process.env.COT_API_URL}/api/feeds/\${process.env.COT_AGENT_ID}/signal\`, {
  method: 'POST',
  headers: {
    Authorization: \`Bearer \${process.env.COT_PUBLISHER_KEY}\`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({ payload: yourSignal }),
});`;

  const pyExample = `httpx.post(
    f"{os.environ['COT_API_URL']}/api/feeds/{os.environ['COT_AGENT_ID']}/signal",
    json={"payload": your_signal},
    headers={"Authorization": f"Bearer {os.environ['COT_PUBLISHER_KEY']}"},
)`;

  return (
    <div className="wrapper-guide-overlay" onClick={onClose} role="presentation">
      <div
        className="wrapper-guide-panel glass"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-labelledby="wrapper-guide-title"
      >
        <header className="wrapper-guide-panel__header">
          <div>
            <h2 id="wrapper-guide-title" className="wrapper-guide-panel__title">
              Convert your autonomous agent into a mind agent
            </h2>
            <p className="wrapper-guide-panel__subtitle">
              HTTP wrapper only — works with Python, JavaScript, Go, or any stack
            </p>
          </div>
          <button type="button" className="marketplace-close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </header>

        <div className="wrapper-guide-body dark-scroll">
          <ol className="wrapper-guide-steps">
            {STEPS.map((step, index) => (
              <li key={step.title} className="wrapper-guide-step">
                <span className="wrapper-guide-step__num">{index + 1}</span>
                <div>
                  <h3>{step.title}</h3>
                  <p>{step.body}</p>
                </div>
              </li>
            ))}
          </ol>

          <section className="wrapper-guide-section">
            <h3>Signal contract (minimum)</h3>
            <ul className="wrapper-guide-list">
              <li>
                <code>type</code> — e.g. market_tick, trade_enter, news
              </li>
              <li>
                <code>ts</code> — ISO-8601 timestamp
              </li>
              <li>
                <code>thesis</code> or <code>summary</code> — reasoning for the LLM
              </li>
            </ul>
          </section>

          <section className="wrapper-guide-section">
            <h3>HTTP example</h3>
            <pre className="wrapper-guide-code">{signalExample}</pre>
          </section>

          <section className="wrapper-guide-section">
            <h3>JavaScript</h3>
            <pre className="wrapper-guide-code">{jsExample}</pre>
          </section>

          <section className="wrapper-guide-section">
            <h3>Python</h3>
            <pre className="wrapper-guide-code">{pyExample}</pre>
          </section>

          <section className="wrapper-guide-section">
            <h3>Reference implementation</h3>
            <p className="wrapper-guide-note">
              See <code>kalshiSports/cot_wrapper.py</code> — hooks in the scanner runner emit ticks and
              trade events to the platform feed.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
