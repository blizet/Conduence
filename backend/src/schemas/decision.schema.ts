import { z } from 'zod';

export const NodeTypeSchema = z.enum([
  'user',
  'protocol',
  'market',
  'trade',
  'outcome',
  'feedback',
  'agent',
]);

export const GraphNodeSchema = z.object({
  node_id: z.string().min(1),
  node_type: NodeTypeSchema,
  properties: z.record(z.unknown()).optional(),
  label: z.string().optional(),
});

export const GraphEdgeSchema = z
  .object({
    source: z.string(),
    target: z.string().optional(),
    targets: z.array(z.string()).optional(),
    Action: z.string().optional(),
    relationship_type: z.string().optional(),
    direction: z.enum(['uni-directional', 'bi-directional']).optional(),
    metadata: z.record(z.unknown()).optional(),
  })
  .refine((e) => e.target !== undefined || (e.targets?.length ?? 0) > 0, {
    message: 'edge must have target or targets',
  });

export const DecisionEventSchema = z.object({
  schema_version: z.string().default('1.0'),
  decision_id: z.string().optional(),
  graph_id: z.string().min(1),
  updated_at: z.string(),
  operation: z.enum(['assert', 'revise', 'retract']).default('assert'),
  provenance: z
    .object({
      raw_sources: z.array(z.string()).optional(),
      wiki_pages: z.array(z.string()).optional(),
    })
    .optional(),
  nodes: z.array(GraphNodeSchema).min(1),
  edges: z.array(GraphEdgeSchema).min(1),
});

export const DecisionEnvelopeSchema = z.object({
  event_type: z.literal('decision.ingested'),
  graph_id: z.string(),
  decision_id: z.string(),
  updated_at: z.string(),
  payload: DecisionEventSchema,
});

export type DecisionEvent = z.infer<typeof DecisionEventSchema>;
export type DecisionEnvelope = z.infer<typeof DecisionEnvelopeSchema>;
export type GraphNode = z.infer<typeof GraphNodeSchema>;
export type GraphEdge = z.infer<typeof GraphEdgeSchema>;
