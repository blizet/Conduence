import type { DecisionEvent } from '../schemas/decision.schema';

export type AgentRole = 'publisher' | 'seeker' | 'main';

export function userSlugFromNodeId(nodeId: string): string {
  const m = nodeId.match(/^User_(.+)$/i);
  if (m) return `user_${m[1].toLowerCase()}`;
  return nodeId.toLowerCase().replace(/[^a-z0-9]+/g, '_');
}

export function userNodeIdFromSlug(slug: string): string {
  /** Gemini / slug-style ids (e.g. user_117) stay as-is. */
  if (/^user_[a-z0-9_]+$/i.test(slug) && slug === slug.toLowerCase()) return slug;
  if (slug.startsWith('user_')) return `User_${slug.slice(5)}`;
  return slug;
}

export function agentNodeId(userSlug: string, role: AgentRole): string {
  return `${userSlug}.${role}`;
}

export function graphIdFor(userSlug: string, role: AgentRole, version = 'v1'): string {
  return `${userSlug}.${role}.${version}`;
}

export function parseGraphId(
  graphId: string,
): { userSlug: string; role: AgentRole; version: string } | null {
  const m = graphId.match(/^(.+)\.(publisher|seeker|main)\.(v\d+)$/);
  if (!m) return null;
  return { userSlug: m[1], role: m[2] as AgentRole, version: m[3] };
}

export function primaryUserNodeId(nodes: { node_type: string; node_id: string }[]): string | null {
  const user = nodes.find((n) => n.node_type === 'user');
  return user?.node_id ?? null;
}

export function resolveAgentContext(event: DecisionEvent): {
  userSlug: string;
  role: AgentRole;
  agentId: string;
  userNodeId: string;
} | null {
  const parsed = parseGraphId(event.graph_id);
  if (parsed) {
    return {
      userSlug: parsed.userSlug,
      role: parsed.role,
      agentId: agentNodeId(parsed.userSlug, parsed.role),
      userNodeId: userNodeIdFromSlug(parsed.userSlug),
    };
  }
  const userNodeId = primaryUserNodeId(event.nodes);
  if (!userNodeId) return null;
  const userSlug = userSlugFromNodeId(userNodeId);
  return {
    userSlug,
    role: 'publisher',
    agentId: agentNodeId(userSlug, 'publisher'),
    userNodeId,
  };
}
