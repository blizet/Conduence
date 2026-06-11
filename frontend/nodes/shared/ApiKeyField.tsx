'use client';

import { stopNodeKeyPropagation } from './useNodeData';

type ApiKeyFieldProps = {
  label?: string;
  value: string;
  placeholder?: string;
  onChange: (value: string) => void;
};

export function ApiKeyField({
  label = 'API key',
  value,
  placeholder = 'Paste your API key…',
  onChange,
}: ApiKeyFieldProps) {
  return (
    <div className="node-field" onKeyDown={stopNodeKeyPropagation}>
      <div className="node-field__label">{label}</div>
      <input
        className="node-input nodrag"
        type="password"
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={stopNodeKeyPropagation}
        autoComplete="off"
      />
    </div>
  );
}
