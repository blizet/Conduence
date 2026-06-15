'use client';

import { findFieldGuideEntry, getInspectorFieldGuide } from '@/lib/inspector-field-guides';
import { useInspectorFieldGuide } from './InspectorFieldGuideContext';

type FieldGuideSectionProps = {
  nodeType: string;
};

export function FieldGuideSection({ nodeType }: FieldGuideSectionProps) {
  const ctx = useInspectorFieldGuide();
  const guide = getInspectorFieldGuide(nodeType);
  const activeField = ctx?.activeField ?? null;
  const entry = findFieldGuideEntry(nodeType, activeField);

  if (!guide || guide.fields.length === 0) return null;

  return (
    <section className="inspector-panel__section inspector-panel__section--guide">
      <h3 className="inspector-panel__section-title">Field guide</h3>
      {!activeField ? (
        <p className="inspector-field-guide__placeholder">
          Click or focus a parameter above to see details for that field.
        </p>
      ) : !entry ? (
        <p className="inspector-field-guide__placeholder">No guide entry for “{activeField}”.</p>
      ) : (
        <dl className="inspector-field-guide">
          <div className="inspector-field-guide__item inspector-field-guide__item--active">
            <dt className="inspector-field-guide__term">{entry.field}</dt>
            <dd className="inspector-field-guide__detail">
              <p>{entry.description}</p>
              {entry.howTo ? <p className="inspector-field-guide__how">{entry.howTo}</p> : null}
              {entry.link ? (
                <a
                  className="inspector-field-guide__link"
                  href={entry.link.href}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {entry.link.label} ↗
                </a>
              ) : null}
            </dd>
          </div>
        </dl>
      )}
    </section>
  );
}
