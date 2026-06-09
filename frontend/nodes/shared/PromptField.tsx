'use client';

import { stopNodeKeyPropagation } from './useNodeData';

type PromptFieldProps = {
  label: string;
  value: string;
  placeholder?: string;
  rows?: number;
  onChange: (value: string) => void;
};

export function PromptField({
  label,
  value,
  placeholder,
  rows = 3,
  onChange,
}: PromptFieldProps) {
  return (
    <div className="node-field" onKeyDown={stopNodeKeyPropagation}>
      <div className="node-field__label">{label}</div>
      <textarea
        className="node-textarea"
        rows={rows}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={stopNodeKeyPropagation}
      />
    </div>
  );
}
