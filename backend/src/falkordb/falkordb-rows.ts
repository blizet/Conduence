/** Normalize FalkorDB query rows (array or keyed object) into plain field maps. */
export type FalkorRow = Record<string, string | number | null | undefined>;

export function parseFalkorRows(result: {
  headers?: string[];
  data?: unknown[];
}): FalkorRow[] {
  const { headers, data } = result;
  if (!data?.length) return [];

  return data.map((row) => {
    if (Array.isArray(row)) {
      const obj: FalkorRow = {};
      headers?.forEach((header, i) => {
        obj[header] = row[i] as string | number | null | undefined;
      });
      return obj;
    }
    return row as FalkorRow;
  });
}

export function rowString(row: FalkorRow, ...keys: string[]): string {
  for (const key of keys) {
    const v = row[key];
    if (v !== undefined && v !== null && v !== '') return String(v);
  }
  return '';
}
