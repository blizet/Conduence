'use client';

import { stopNodeKeyPropagation } from './useNodeData';
import { useGuideFieldActive, useGuideFieldFocus } from './inspector/InspectorFieldGuideContext';

type PromptFieldProps = {
  label: string;
  value: string;
  placeholder?: string;
  rows?: number;
  guideField?: string;
  onChange: (value: string) => void;
};

export function PromptField({
  label,
  value,
  placeholder,
  rows = 3,
  guideField,
  onChange,
}: PromptFieldProps) {
  const fieldKey = guideField ?? label;
  const focus = useGuideFieldFocus(fieldKey);
  const active = useGuideFieldActive(fieldKey);

  return (
    <div
      className={['node-field', active ? 'node-field--guide-active' : ''].filter(Boolean).join(' ')}
      onKeyDown={stopNodeKeyPropagation}
      {...focus}
    >
      <div className="node-field__label">{label}</div>
      <textarea
        className="node-textarea nodrag nowheel"
        rows={rows}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={stopNodeKeyPropagation}
        onFocus={focus.onFocus}
      />
    </div>
  );
}
