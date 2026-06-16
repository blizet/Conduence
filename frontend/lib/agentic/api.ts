const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

export function agenticApiUrl(path: string): string {
  const normalized = path.startsWith('/') ? path : `/${path}`;
  return `${API_BASE}/api/agentic${normalized}`;
}

export function agenticFetch(path: string, init?: RequestInit): Promise<Response> {
  return fetch(agenticApiUrl(path), init);
}
