const USER_ID_KEY = 'cot-user-id';

export function getOrCreateUserId(): string {
  if (typeof window === 'undefined') return 'user_local';
  const existing = window.localStorage.getItem(USER_ID_KEY);
  if (existing?.trim()) return existing.trim();
  const id = `user_${Math.random().toString(36).slice(2, 10)}`;
  window.localStorage.setItem(USER_ID_KEY, id);
  return id;
}
