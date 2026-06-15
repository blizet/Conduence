'use client';

import { stopNodeKeyPropagation } from './useNodeData';
import { useGuideFieldActive, useGuideFieldFocus } from './inspector/InspectorFieldGuideContext';

type ApiKeyFieldProps = {
  label?: string;
  value: string;
  placeholder?: string;
  guideField?: string;
  onChange: (value: string) => void;
};

export function ApiKeyField({
  label = 'API key',
  value,
  placeholder = 'Paste your API key…',
  guideField,
  onChange,
}: ApiKeyFieldProps) {
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
      <input
        className="node-input nodrag"
        type="password"
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={stopNodeKeyPropagation}
        onFocus={focus.onFocus}
        autoComplete="off"
      />
    </div>
  );
}
