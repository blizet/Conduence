'use client';

import { useState } from 'react';
import { getInspectorSetupGuide } from '@/lib/inspector-field-guides';

type InspectorSetupSectionProps = {
  nodeType: string;
};

export function InspectorSetupSection({ nodeType }: InspectorSetupSectionProps) {
  const [expanded, setExpanded] = useState(false);
  const guide = getInspectorSetupGuide(nodeType);
  if (!guide || guide.steps.length === 0) return null;

  return (
    <section className="inspector-panel__section inspector-panel__section--setup">
      <button
        type="button"
        className="inspector-setup__toggle"
        onClick={() => setExpanded((open) => !open)}
        aria-expanded={expanded}
      >
        <svg
          width="10"
          height="10"
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          className={`inspector-setup__chevron${expanded ? ' inspector-setup__chevron--open' : ''}`}
          aria-hidden
        >
          <path d="M6 4l4 4-4 4" />
        </svg>
        <span className="inspector-setup__title">{guide.title ?? 'Setup'}</span>
        <span className="inspector-setup__count">{guide.steps.length}</span>
      </button>
      {expanded ? (
        <ol className="inspector-setup-steps">
          {guide.steps.map((step, index) => (
            <li key={step.title} className="inspector-setup-steps__item">
              <span className="inspector-setup-steps__num">{index + 1}</span>
              <div className="inspector-setup-steps__body">
                <div className="inspector-setup-steps__title">{step.title}</div>
                <p className="inspector-setup-steps__detail">{step.detail}</p>
                {step.link ? (
                  <a
                    className="inspector-setup-steps__link"
                    href={step.link.href}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {step.link.label} ↗
                  </a>
                ) : null}
              </div>
            </li>
          ))}
        </ol>
      ) : null}
    </section>
  );
}
