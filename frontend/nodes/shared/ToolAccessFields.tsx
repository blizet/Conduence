'use client';

import {
  accessModeHint,
  endpointRequiresKey,
  getAvailableEndpoints,
  resolveDefaultEndpoint,
  shouldShowApiKeyField,
  type ToolAccessMode,
} from '@/lib/tool-endpoints';
import { ApiKeyField } from './ApiKeyField';
import { LabeledSelect } from './LabeledField';
import { stopNodeKeyPropagation } from './useNodeData';

type ToolAccessFieldsProps = {
  toolId: string;
  accessMode?: ToolAccessMode;
  endpoint?: string;
  apiKey?: string;
  onAccessModeChange: (mode: ToolAccessMode) => void;
  onEndpointChange: (endpoint: string) => void;
  onApiKeyChange: (key: string) => void;
};

export function ToolAccessFields({
  toolId,
  accessMode = 'public',
  endpoint = '',
  apiKey = '',
  onAccessModeChange,
  onEndpointChange,
  onApiKeyChange,
}: ToolAccessFieldsProps) {
  const resolvedEndpoint = resolveDefaultEndpoint(toolId, accessMode, apiKey, endpoint);
  const available = getAvailableEndpoints(toolId, accessMode, apiKey);
  const showKey = shouldShowApiKeyField(toolId, accessMode, resolvedEndpoint, apiKey);
  const hint = accessModeHint(toolId, accessMode, apiKey);

  return (
    <div onKeyDown={stopNodeKeyPropagation}>
      <LabeledSelect
        label="Access"
        value={accessMode}
        options={[
          { value: 'public', label: 'Public — no API key' },
          { value: 'private', label: 'Private — API key required' },
        ]}
        onChange={(v) => {
          const mode = v as ToolAccessMode;
          onAccessModeChange(mode);
          onEndpointChange(resolveDefaultEndpoint(toolId, mode, apiKey, resolvedEndpoint));
        }}
      />
      {available.length > 0 && (
        <LabeledSelect
          label="Endpoint"
          value={resolvedEndpoint}
          options={available.map((item) => ({
            value: item.id,
            label: item.label,
          }))}
          onChange={onEndpointChange}
        />
      )}
      <div className="node-field__hint" style={{ marginBottom: 4 }}>
        {hint}
      </div>
      {showKey && (
        <ApiKeyField
          label="API key"
          value={apiKey}
          placeholder={
            accessMode === 'public' && !endpointRequiresKey(toolId, resolvedEndpoint)
              ? 'Optional — unlocks all endpoints'
              : 'Required for private endpoints'
          }
          onChange={onApiKeyChange}
        />
      )}
    </div>
  );
}
