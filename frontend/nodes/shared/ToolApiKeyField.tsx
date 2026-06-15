'use client';

import { accessHint, shouldShowToolApiKeyField } from '@/lib/tool-access';
import { ApiKeyField } from './ApiKeyField';
import { GuideField } from './inspector/GuideField';
import { stopNodeKeyPropagation } from './useNodeData';

type ToolApiKeyFieldProps = {
  toolId: string;
  apiKey?: string;
  onApiKeyChange: (key: string) => void;
};

export function ToolApiKeyField({ toolId, apiKey = '', onApiKeyChange }: ToolApiKeyFieldProps) {
  if (!shouldShowToolApiKeyField(toolId)) {
    return (
      <GuideField field="Endpoint">
        <div onKeyDown={stopNodeKeyPropagation}>
          <p className="node-field__hint">
            Public endpoints only — LLM selects parameters from the tool registry at compile time.
          </p>
        </div>
      </GuideField>
    );
  }

  const missing = !apiKey.trim();
  return (
    <GuideField field="API key">
      <div onKeyDown={stopNodeKeyPropagation}>
        <ApiKeyField
          label="API key"
          guideField="API key"
          value={apiKey}
          placeholder={missing ? 'Required to unlock private endpoints' : 'Set — all endpoints available'}
          onChange={onApiKeyChange}
        />
        <p className={`node-field__hint${missing ? ' node-field__hint--warn' : ''}`}>
          {accessHint(toolId, apiKey)}
        </p>
      </div>
    </GuideField>
  );
}
