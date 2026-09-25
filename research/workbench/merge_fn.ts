const SEVERITY_RANK: Record<string, number> = { high: 3, medium: 2, low: 1 };
const CATEGORY_RANK: Record<string, number> = { wrong: 4, reorder: 3, weak: 2, style: 1 };

function pickHigherRanked(a: unknown, b: unknown, rank: Record<string, number>): unknown {
  const ra = rank[(a as string) || ''] ?? 0;
  const rb = rank[(b as string) || ''] ?? 0;
  return rb > ra ? b : a;
}

function mergeStringList(existing: string | undefined, incoming: string | undefined, sep: string): string {
  const a = (existing || '').trim();
  const b = (incoming || '').trim();
  if (!a) return b;
  if (!b) return a;
  const parts = a.split(sep).map(s => s.trim()).filter(Boolean);
  if (parts.some(p => p === b)) return a;
  return `${a}${sep}${b}`;
}

function mergeAlternatives(a: unknown, b: unknown): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const arr of [a, b]) {
    if (!Array.isArray(arr)) continue;
    for (const item of arr) {
      if (typeof item !== 'string') continue;
      const t = item.trim();
      if (!t || seen.has(t)) continue;
      seen.add(t);
      out.push(t);
    }
  }
  return out;
}

function mergeIssueItems<T extends Record<string, unknown>>(existing: T, incoming: T): T {
  const merged: Record<string, unknown> = { ...existing };
  merged.issue = mergeStringList(existing.issue as string, incoming.issue as string, ' • ');
  merged.reason = mergeStringList(existing.reason as string, incoming.reason as string, ' • ');
  merged.detail = mergeStringList(existing.detail as string, incoming.detail as string, '\n');
  merged.fix_explanation = mergeStringList(
    (existing.fix_explanation as string) || (existing.fixExplanation as string),
    (incoming.fix_explanation as string) || (incoming.fixExplanation as string),
    '\n',
  );
  const sa = (existing.suggested as string) || (existing.suggestion as string) || '';
  const sb = (incoming.suggested as string) || (incoming.suggestion as string) || '';
  const finalSug = sb.trim().length > sa.trim().length ? sb : sa;
  if ('suggested' in existing || 'suggested' in incoming) merged.suggested = finalSug;
  if ('suggestion' in existing || 'suggestion' in incoming) merged.suggestion = finalSug;
  if ('alternatives' in existing || 'alternatives' in incoming) {
    merged.alternatives = mergeAlternatives(existing.alternatives, incoming.alternatives);
  }
  merged.category = pickHigherRanked(existing.category, incoming.category, CATEGORY_RANK);
  merged.severity = pickHigherRanked(existing.severity, incoming.severity, SEVERITY_RANK);
  merged.type = (existing.type as string) || (incoming.type as string);
  return merged as T;
}

