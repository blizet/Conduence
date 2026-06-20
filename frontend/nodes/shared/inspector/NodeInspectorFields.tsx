'use client';

import type { Edge } from '@xyflow/react';
import type { WorkflowNode } from '@/nodes/types';
import { useNodeData } from '../useNodeData';
import {
  ArbitrageAgentInspectorFields,
  LlmInspectorFields,
  NewsAgentInspectorFields,
  OutputInspectorFields,
  RiskAnalyzerInspectorFields,
} from './AgentInspectorFields';
import { CatalogToolFields } from './CatalogToolFields';
import { MonitorToolFields } from './MonitorToolFields';
import { PaperTradingInspectorFields } from './PaperTradingInspectorFields';
import { ClobInspectorFields, KalshiInspectorFields, TelegramInspectorFields } from './VenueToolFields';

const CATALOG_TOOLS = new Set([
  'defillama',
  'coingecko',
  'coinmarketcap',
  'cryptonews',
  'cryptoquant',
  'tavily',
  'polymarketGamma',
  'polymarketWallet',
]);

const MONITOR_TOOLS = new Set(['xMonitor', 'walletMonitor']);

type NodeInspectorFieldsProps = {
  node: WorkflowNode;
  nodes: WorkflowNode[];
  edges: Edge[];
  feedSignals?: Record<string, { latest?: unknown }>;
};

export function NodeInspectorFields({ node, nodes, edges, feedSignals }: NodeInspectorFieldsProps) {
  const onPatch = useNodeData(node.id);
  const { data } = node;
  const type = node.type ?? '';
  const accent = data.accent;

  if (CATALOG_TOOLS.has(type)) {
    return <CatalogToolFields toolId={type} data={data} onPatch={onPatch} />;
  }

  if (MONITOR_TOOLS.has(type)) {
    return <MonitorToolFields toolId={type as 'xMonitor' | 'walletMonitor'} data={data} onPatch={onPatch} />;
  }

  switch (type) {
    case 'clob':
      return (
        <ClobInspectorFields
          nodeId={node.id}
          data={data}
          accent={accent}
          nodes={nodes}
          edges={edges}
          feedSignals={feedSignals}
          onPatch={onPatch}
        />
      );
    case 'kalshi':
      return (
        <KalshiInspectorFields
          nodeId={node.id}
          data={data}
          accent={accent}
          nodes={nodes}
          edges={edges}
          feedSignals={feedSignals}
          onPatch={onPatch}
        />
      );
    case 'telegram':
      return (
        <TelegramInspectorFields
          nodeId={node.id}
          data={data}
          accent={accent}
          nodes={nodes}
          edges={edges}
          feedSignals={feedSignals}
          onPatch={onPatch}
        />
      );
    case 'paperTrading':
      return (
        <PaperTradingInspectorFields
          nodeId={node.id}
          data={data}
          accent={accent}
          nodes={nodes}
          edges={edges}
          feedSignals={feedSignals}
          onPatch={onPatch}
        />
      );
    case 'workflowOutput':
    case 'output':
      return (
        <OutputInspectorFields
          data={data}
          node={node}
          nodes={nodes}
          edges={edges}
          feedSignals={feedSignals}
        />
      );
    case 'llm':
      return <LlmInspectorFields data={data} accent={accent} onPatch={onPatch} />;
    case 'newsAgent':
      return <NewsAgentInspectorFields data={data} accent={accent} onPatch={onPatch} />;
    case 'arbitrageAgent':
      return <ArbitrageAgentInspectorFields data={data} accent={accent} onPatch={onPatch} />;
    case 'riskAnalyzer':
      return <RiskAnalyzerInspectorFields data={data} accent={accent} onPatch={onPatch} />;
    default:
      return <p className="node-field__hint">No configurable parameters for this node type.</p>;
  }
}
