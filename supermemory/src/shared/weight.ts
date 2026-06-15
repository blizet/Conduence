const WORD_MAGNITUDES: Record<string, number> = {
  none: 0,
  negligible: 0.1,
  weak: 0.25,
  low: 0.3,
  mild: 0.35,
  moderate: 0.5,
  medium: 0.55,
  strong: 0.75,
  high: 0.8,
  very: 0.85,
  extreme: 0.95,
  certain: 1,
  full: 1,
};

export function clampWeight(value: number): number {
  if (Number.isNaN(value)) return 0;
  return Math.max(-1, Math.min(1, value));
}

function parseMagnitude(text: string): number | null {
  const fraction = text.match(/(\d+(?:\.\d+)?)\s*\/\s*10/);
  if (fraction) return clampWeight(Number(fraction[1]) / 10);

  const percent = text.match(/(\d+(?:\.\d+)?)\s*%/);
  if (percent) return clampWeight(Number(percent[1]) / 100);

  const signed = text.match(/([+-])\s*(\d+(?:\.\d+)?)/);
  if (signed) {
    const n = Number(signed[2]);
    const mag = n > 1 && n <= 10 ? n / 10 : n;
    return clampWeight(signed[1] === "-" ? -mag : mag);
  }

  const plain = text.match(/\b(\d+(?:\.\d+)?)\b/);
  if (plain) {
    const n = Number(plain[1]);
    if (n > 1 && n <= 10) return clampWeight(n / 10);
    if (n >= 0 && n <= 1) return clampWeight(n);
  }

  for (const [word, magnitude] of Object.entries(WORD_MAGNITUDES)) {
    if (text.includes(word)) return magnitude;
  }

  return null;
}

export function parseBatchWeightAnswers(
  raw: string,
  pending: Array<{ edgeId: string; expectedSign: 1 | -1 }>,
): Array<{ edge_id: string; weight: number }> {
  if (!pending.length) return [];

  const updates: Array<{ edge_id: string; weight: number }> = [];
  const seen = new Set<string>();

  const numbered = [...raw.matchAll(/(?:^|[\n,;])\s*(\d+)\s*[.:)]\s*([^\n,;]+)/g)];
  for (const match of numbered) {
    const idx = Number(match[1]) - 1;
    if (idx < 0 || idx >= pending.length) continue;
    const weight = parseWeightInput(match[2], pending[idx].expectedSign);
    if (weight == null) continue;
    const edgeId = pending[idx].edgeId;
    if (seen.has(edgeId)) continue;
    seen.add(edgeId);
    updates.push({ edge_id: edgeId, weight });
  }
  if (updates.length) return updates;

  const parts = raw
    .split(/[,;\n]+/)
    .map((s) => s.trim())
    .filter((s) => s && !/^\d+\s*[.:)]/.test(s));
  if (parts.length > 1) {
    for (let i = 0; i < Math.min(parts.length, pending.length); i++) {
      const weight = parseWeightInput(parts[i], pending[i].expectedSign);
      if (weight == null) continue;
      updates.push({ edge_id: pending[i].edgeId, weight });
    }
    if (updates.length) return updates;
  }

  if (pending.length === 1) {
    const weight = parseWeightInput(raw, pending[0].expectedSign);
    if (weight != null) return [{ edge_id: pending[0].edgeId, weight }];
  }

  return updates;
}

export function parseWeightInput(
  raw: string,
  expectedSign: 1 | -1 = 1,
): number | null {
  const text = raw.trim().toLowerCase();
  if (!text) return null;

  const inverse =
    text.includes("inverse") ||
    text.includes("inversely") ||
    text.includes("negative") ||
    text.includes("falls") ||
    text.includes("fall") ||
    text.includes("decline") ||
    text.includes("drop") ||
    text.includes("down");

  const direct =
    text.includes("direct") ||
    text.includes("positive") ||
    text.includes("rises") ||
    text.includes("rise") ||
    text.includes("increase") ||
    text.includes("up");

  let sign: 1 | -1 = expectedSign;
  if (inverse && !direct) sign = -1;
  else if (direct && !inverse) sign = 1;

  const explicitNegative = /^-/.test(raw.trim()) || text.includes("minus");
  const magnitude = parseMagnitude(text);
  if (magnitude == null) return null;

  if (explicitNegative) return clampWeight(-Math.abs(magnitude));
  if (/^\+/.test(raw.trim())) return clampWeight(Math.abs(magnitude));

  // Signed number already handled in parseMagnitude
  if (raw.trim().match(/^[+-]/)) return clampWeight(magnitude);

  return clampWeight(sign * Math.abs(magnitude));
}

export function edgeColor(weight: number | null): string {
  if (weight == null) return "#94a3b8";
  if (weight > 0) return "#22c55e";
  if (weight < 0) return "#ef4444";
  return "#64748b";
}

export function edgeWidth(weight: number | null): number {
  if (weight == null) return 1.5;
  return 1.5 + Math.abs(weight) * 5;
}

export function proportionalityLabel(expectedSign: 1 | -1): string {
  return expectedSign === 1
    ? "directly proportional (weight 0 to 1)"
    : "inversely proportional (weight -1 to 0)";
}

export function formatWeight(weight: number | null): string {
  if (weight == null) return "unset";
  const pct = Math.round(Math.abs(weight) * 100);
  if (weight > 0) return `+${weight.toFixed(2)} (direct, ${pct}%)`;
  if (weight < 0) return `${weight.toFixed(2)} (inverse, ${pct}%)`;
  return "0 (no effect)";
}

export function formatWeightShort(weight: number | null): string {
  if (weight == null) return "unset";
  if (weight === 0) return "0";
  return weight > 0 ? `+${weight.toFixed(2)}` : weight.toFixed(2);
}
