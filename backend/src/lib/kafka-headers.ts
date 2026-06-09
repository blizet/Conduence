import type { IHeaders } from 'kafkajs';

export function decodeHeader(headers: IHeaders | undefined, key: string): string | undefined {
  if (!headers?.[key]) return undefined;
  const v = headers[key];
  if (Array.isArray(v)) {
    const first = v[0];
    return Buffer.isBuffer(first) ? first.toString('utf-8') : String(first);
  }
  return Buffer.isBuffer(v) ? v.toString('utf-8') : String(v);
}
