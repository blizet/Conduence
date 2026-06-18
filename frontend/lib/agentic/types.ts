import type { ConversationTokenUsage } from "./tokens.js";

export type { ConversationTokenUsage };
export type NodeType = "event" | "asset" | "market" | "concept";

export interface GraphNode {
  id: string;
  label: string;
  type: NodeType;
}

export interface GraphEdge {
  id: string;
  source: string;
  target: string;
  label: string;
  /**
   * Signed edge weight in [-1, 1].
   * 0 to 1 = directly proportional; -1 to 0 = inversely proportional.
   * null until the user confirms in chat.
   */
  weight: number | null;
  /** Sign hint from relationship text when weight is still unset */
  expectedSign?: 1 | -1;
}

export interface WeightedGraph {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface PendingWeightQuestion {
  edgeId: string;
  sourceLabel: string;
  targetLabel: string;
  expectedSign: 1 | -1;
  question: string;
}

export interface LlmGraphResponse {
  assistant_message: string;
  nodes?: Array<{ id: string; label: string; type: NodeType }>;
  edges?: Array<{
    id: string;
    source: string;
    target: string;
    label: string;
    weight?: number | null;
    expected_sign?: 1 | -1;
  }>;
  weight_updates?: Array<{ edge_id: string; weight: number }>;
}

export interface ChatApiResponse {
  sessionId: string;
  message: string;
  graph: WeightedGraph;
  pendingWeights: PendingWeightQuestion[];
  graphComplete: boolean;
  tokenUsage: ConversationTokenUsage;
  supermemoryLoaded?: boolean;
  changedNodeIds?: string[];
  addedNodeIds?: string[];
  updatedNodeIds?: string[];
  changedEdgeIds?: string[];
  addedEdgeIds?: string[];
  updatedEdgeIds?: string[];
}

export interface ForceGraphNode {
  id: string;
  label: string;
  type: NodeType;
}

export interface ForceGraphLink {
  source: string;
  target: string;
  id: string;
  label: string;
  weight: number | null;
  color: string;
  width: number;
}
