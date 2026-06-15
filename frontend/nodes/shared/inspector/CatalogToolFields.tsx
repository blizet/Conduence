'use client';

import {
  getAvailableEndpoints,
  getToolCatalog,
  resolveDefaultEndpoint,
} from '@/lib/tool-endpoints';
import { LabeledInput, LabeledSelect } from '../LabeledField';
import { ToolApiKeyField } from '../ToolApiKeyField';
import type { WorkflowNodeData } from '../../types';

type CatalogToolFieldsProps = {
  toolId: string;
  data: WorkflowNodeData;
  onPatch: (patch: Partial<WorkflowNodeData>) => void;
};

function endpointValue(toolId: string, data: WorkflowNodeData): string {
  if (toolId === 'defillama') {
    return data.defillamaMode ?? data.toolEndpoint ?? 'protocols';
  }
  return data.toolEndpoint ?? getToolCatalog(toolId)?.defaultEndpoint ?? '';
}

function patchEndpoint(toolId: string, endpoint: string): Partial<WorkflowNodeData> {
  if (toolId === 'defillama') {
    return { defillamaMode: endpoint as WorkflowNodeData['defillamaMode'], toolEndpoint: endpoint };
  }
  return { toolEndpoint: endpoint };
}

export function CatalogToolFields({ toolId, data, onPatch }: CatalogToolFieldsProps) {
  const catalog = getToolCatalog(toolId);
  const apiKey = data.apiKey ?? '';
  const available = getAvailableEndpoints(toolId, apiKey);
  const currentEndpoint = resolveDefaultEndpoint(toolId, apiKey, endpointValue(toolId, data));

  const endpointOptions = available.map((e) => ({ value: e.id, label: e.label }));

  return (
    <>
      {catalog && endpointOptions.length > 0 ? (
        <LabeledSelect
          label="Endpoint"
          value={currentEndpoint}
          options={endpointOptions}
          onChange={(v) => onPatch(patchEndpoint(toolId, v))}
        />
      ) : null}

      {toolId === 'defillama' ? (
        <>
          {['protocol', 'tvl', 'inflows'].includes(currentEndpoint) ? (
            <LabeledInput
              label="Protocol slug"
              placeholder="e.g. aave, lido, uniswap"
              value={data.defillamaProtocol ?? ''}
              onChange={(v) => onPatch({ defillamaProtocol: v })}
            />
          ) : null}
          {currentEndpoint === 'chain' ? (
            <LabeledInput
              label="Chain name"
              placeholder="e.g. Ethereum, Arbitrum, Base"
              value={data.defillamaChain ?? ''}
              onChange={(v) => onPatch({ defillamaChain: v })}
            />
          ) : null}
          {currentEndpoint === 'tokenProtocols' ? (
            <LabeledInput
              label="Token symbol"
              placeholder="e.g. usdt"
              value={data.defillamaSymbol ?? ''}
              onChange={(v) => onPatch({ defillamaSymbol: v })}
            />
          ) : null}
          {currentEndpoint === 'inflows' ? (
            <LabeledInput
              label="Timestamp"
              placeholder="Unix timestamp for inflows window"
              value={data.defillamaTimestamp ?? ''}
              onChange={(v) => onPatch({ defillamaTimestamp: v })}
            />
          ) : null}
        </>
      ) : null}

      {toolId === 'coingecko' ? (
        <LabeledInput
          label="Coin IDs"
          placeholder="bitcoin,ethereum,solana"
          value={data.coingeckoIds ?? ''}
          onChange={(v) => onPatch({ coingeckoIds: v })}
        />
      ) : null}

      {toolId === 'coinmarketcap' ? (
        <>
          <LabeledInput
            label="Symbols"
            placeholder="BTC,ETH,SOL"
            value={data.cmcSymbols ?? ''}
            onChange={(v) => onPatch({ cmcSymbols: v })}
          />
          <LabeledInput
            label="Convert currency"
            placeholder="USD"
            value={data.cmcConvert ?? 'USD'}
            onChange={(v) => onPatch({ cmcConvert: v })}
          />
        </>
      ) : null}

      {toolId === 'cryptonews' ? (
        <>
          <LabeledInput
            label="Tickers"
            placeholder="BTC,ETH"
            value={data.cryptonewsTickers ?? ''}
            onChange={(v) => onPatch({ cryptonewsTickers: v })}
          />
          <LabeledInput
            label="Max items"
            placeholder="5"
            value={data.cryptonewsItems ?? ''}
            onChange={(v) => onPatch({ cryptonewsItems: v })}
          />
          <LabeledInput
            label="Sentiment filter"
            placeholder="positive, negative, neutral"
            value={data.cryptonewsSentiment ?? ''}
            onChange={(v) => onPatch({ cryptonewsSentiment: v })}
          />
          <LabeledInput
            label="Keywords"
            placeholder="ETF, regulation"
            value={data.cryptonewsKeywords ?? ''}
            onChange={(v) => onPatch({ cryptonewsKeywords: v })}
          />
        </>
      ) : null}

      {toolId === 'cryptoquant' ? (
        <>
          <LabeledInput
            label="Metric path"
            placeholder="btc/exchange-flows/netflow"
            value={data.cryptoquantMetric ?? ''}
            onChange={(v) => onPatch({ cryptoquantMetric: v })}
          />
          <LabeledInput
            label="Symbol"
            placeholder="btc"
            value={data.cryptoquantSymbol ?? ''}
            onChange={(v) => onPatch({ cryptoquantSymbol: v })}
          />
          <LabeledInput
            label="Window"
            placeholder="day"
            value={data.cryptoquantWindow ?? ''}
            onChange={(v) => onPatch({ cryptoquantWindow: v })}
          />
          <LabeledInput
            label="Exchange"
            placeholder="binance"
            value={data.cryptoquantExchange ?? ''}
            onChange={(v) => onPatch({ cryptoquantExchange: v })}
          />
        </>
      ) : null}

      {toolId === 'tavily' ? (
        <>
          <LabeledInput
            label="Search query"
            placeholder="bitcoin ETF flows today"
            value={data.tavilyQuery ?? ''}
            onChange={(v) => onPatch({ tavilyQuery: v })}
          />
          <LabeledSelect
            label="Search depth"
            value={data.tavilySearchDepth ?? 'basic'}
            options={[
              { value: 'basic', label: 'Basic' },
              { value: 'advanced', label: 'Advanced' },
            ]}
            onChange={(v) => onPatch({ tavilySearchDepth: v as 'basic' | 'advanced' })}
          />
          <LabeledInput
            label="Max results"
            placeholder="5"
            value={data.tavilyMaxResults ?? ''}
            onChange={(v) => onPatch({ tavilyMaxResults: v })}
          />
          <LabeledInput
            label="Extract URLs"
            placeholder="https://… (comma-separated)"
            value={data.tavilyUrls ?? ''}
            onChange={(v) => onPatch({ tavilyUrls: v })}
          />
        </>
      ) : null}

      {toolId === 'polymarketGamma' ? (
        <>
          <LabeledInput
            label="Keywords"
            placeholder="bitcoin election"
            value={data.gammaKeywords ?? ''}
            onChange={(v) => onPatch({ gammaKeywords: v })}
          />
          <LabeledInput
            label="Limit"
            placeholder="8"
            value={data.gammaLimit ?? ''}
            onChange={(v) => onPatch({ gammaLimit: v })}
          />
          <LabeledInput
            label="Min volume"
            placeholder="10000"
            value={data.gammaMinVolume ?? ''}
            onChange={(v) => onPatch({ gammaMinVolume: v })}
          />
          <LabeledInput
            label="Min liquidity"
            placeholder="5000"
            value={data.gammaMinLiquidity ?? ''}
            onChange={(v) => onPatch({ gammaMinLiquidity: v })}
          />
          <LabeledInput
            label="Max spread"
            placeholder="0.05"
            value={data.gammaMaxSpread ?? ''}
            onChange={(v) => onPatch({ gammaMaxSpread: v })}
          />
        </>
      ) : null}

      {toolId === 'polymarketWallet' ? (
        <>
          <LabeledInput
            label="Wallet address"
            placeholder="0x…"
            value={data.pmWallet ?? ''}
            onChange={(v) => onPatch({ pmWallet: v })}
          />
          <LabeledSelect
            label="Action"
            value={data.pmWalletAction ?? 'trades'}
            options={[
              { value: 'trades', label: 'Recent trades' },
              { value: 'positions', label: 'Open positions' },
            ]}
            onChange={(v) => onPatch({ pmWalletAction: v as 'trades' | 'positions' })}
          />
          <LabeledInput
            label="Limit"
            placeholder="10"
            value={data.pmWalletLimit ?? ''}
            onChange={(v) => onPatch({ pmWalletLimit: v })}
          />
        </>
      ) : null}

      <ToolApiKeyField
        toolId={toolId}
        apiKey={apiKey}
        onApiKeyChange={(key) => onPatch({ apiKey: key })}
      />
    </>
  );
}
