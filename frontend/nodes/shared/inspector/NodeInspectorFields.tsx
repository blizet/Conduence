'use client';

import type { Edge } from '@xyflow/react';
import type { WorkflowNode } from '@/nodes/types';
import { useNodeData } from '../useNodeData';
import {
  ArbitrageAgentInspectorFields,
  CotBuilderInspectorFields,
  LlmInspectorFields,
  NewsAgentInspectorFields,
  OutputInspectorFields,
  RiskAnalyzerInspectorFields,
  SportsScannerInspectorFields,
} from './AgentInspectorFields';
import { CatalogToolFields } from './CatalogToolFields';
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
    case 'cotBuilder':
      return <CotBuilderInspectorFields data={data} accent={accent} onPatch={onPatch} />;
    case 'workflowOutput':
    case 'output':
      return <OutputInspectorFields data={data} />;
    case 'llm':
      return <LlmInspectorFields data={data} accent={accent} onPatch={onPatch} />;
    case 'newsAgent':
      return <NewsAgentInspectorFields data={data} accent={accent} onPatch={onPatch} />;
    case 'arbitrageAgent':
      return <ArbitrageAgentInspectorFields data={data} accent={accent} onPatch={onPatch} />;
    case 'riskAnalyzer':
      return <RiskAnalyzerInspectorFields data={data} accent={accent} onPatch={onPatch} />;
    case 'sportsScanner':
      return <SportsScannerInspectorFields data={data} accent={accent} onPatch={onPatch} />;
    default:
      return <p className="node-field__hint">No configurable parameters for this node type.</p>;
  }
}
