'use client';

import { ApiKeyField } from '../ApiKeyField';
import { LabeledInput, LabeledSelect } from '../LabeledField';
import type { WorkflowNodeData } from '../../types';

export const WALLET_MONITOR_CATEGORIES = [
  'geopolitics',
  'crypto',
  'finance',
  'economics',
  'politics',
  'sports',
  'entertainment',
  'science',
  'tech',
] as const;

type MonitorToolFieldsProps = {
  toolId: 'xMonitor' | 'walletMonitor';
  data: WorkflowNodeData;
  onPatch: (patch: Partial<WorkflowNodeData>) => void;
};

export function MonitorToolFields({ toolId, data, onPatch }: MonitorToolFieldsProps) {
  if (toolId === 'xMonitor') {
    return (
      <>
        <LabeledInput
          label="X usernames"
          placeholder="elonmusk, cz_binance, realDonaldTrump"
          value={data.xMonitorUsernames ?? ''}
          onChange={(v) => onPatch({ xMonitorUsernames: v })}
        />
        <LabeledInput
          label="Alert criteria"
          placeholder="breaking news, ETF approval, regulatory action, whale calls"
          value={data.xMonitorAlertCriteria ?? ''}
          onChange={(v) => onPatch({ xMonitorAlertCriteria: v })}
        />
        <LabeledInput
          label="Topics"
          placeholder="bitcoin, ethereum, solana, geopolitics"
          value={data.xMonitorTopics ?? ''}
          onChange={(v) => onPatch({ xMonitorTopics: v })}
        />
        <LabeledInput
          label="Max alerts"
          placeholder="10"
          value={data.xMonitorLimit ?? ''}
          onChange={(v) => onPatch({ xMonitorLimit: v })}
        />
        <ApiKeyField
          label="X Bearer token"
          guideField="X Bearer token"
          value={data.apiKey ?? ''}
          placeholder="Optional — or set X_BEARER_TOKEN in backend/.env"
          onChange={(key) => onPatch({ apiKey: key })}
        />
      </>
    );
  }

  const platform = data.walletMonitorPlatform ?? 'polymarket';

  return (
    <>
      <LabeledSelect
        label="Platform"
        value={platform}
        options={[
          { value: 'polymarket', label: 'Polymarket' },
          { value: 'kalshi', label: 'Kalshi' },
        ]}
        onChange={(v) => onPatch({ walletMonitorPlatform: v as 'polymarket' | 'kalshi' })}
      />
      {platform === 'polymarket' ? (
        <LabeledInput
          label="Wallet addresses"
          placeholder="0xabc…, 0xdef… (comma-separated)"
          value={data.walletMonitorWallets ?? ''}
          onChange={(v) => onPatch({ walletMonitorWallets: v })}
        />
      ) : (
        <p className="node-field__hint">
          Kalshi does not expose third-party wallet activity publicly. Add API key + PEM private key below to
          poll fills for the authenticated account.
        </p>
      )}
      <LabeledInput
        label="Categories"
        placeholder="geopolitics, crypto, politics"
        value={data.walletMonitorCategories ?? ''}
        onChange={(v) => onPatch({ walletMonitorCategories: v })}
      />
      <p className="node-field__hint">
        Supported: {WALLET_MONITOR_CATEGORIES.join(', ')}
      </p>
      <LabeledInput
        label="Suppress keywords"
        placeholder="russia-ukraine, israel-gaza"
        value={data.walletMonitorSuppressKeywords ?? ''}
        onChange={(v) => onPatch({ walletMonitorSuppressKeywords: v })}
      />
      <LabeledInput
        label="Max alerts"
        placeholder="20"
        value={data.walletMonitorLimit ?? ''}
        onChange={(v) => onPatch({ walletMonitorLimit: v })}
      />
      {platform === 'kalshi' ? (
        <>
          <ApiKeyField
            label="Kalshi API key ID"
            guideField="Kalshi API key ID"
            value={data.apiKey ?? ''}
            placeholder="Required for Kalshi fills"
            onChange={(key) => onPatch({ apiKey: key })}
          />
          <LabeledInput
            label="Kalshi PEM private key"
            placeholder="-----BEGIN RSA PRIVATE KEY-----"
            value={data.apiSecret ?? ''}
            onChange={(v) => onPatch({ apiSecret: v })}
          />
        </>
      ) : null}
    </>
  );
}
