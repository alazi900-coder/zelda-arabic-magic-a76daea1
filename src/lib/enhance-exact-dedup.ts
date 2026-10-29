/**
 * Reduce redundant enhancement API calls without changing the model, rules,
 * original, translation, or game context of any request.
 *
 * Only duplicate an AI decision when original text, Arabic translation,
 * MSBT file/section and category are identical. Key remains unique per row.
 */
export interface EnhanceBatchEntry {
  key: string;
  original: string;
  translation: string;
  category?: string;
}

export function groupExactEnhanceEntries<T extends EnhanceBatchEntry>(
  entries: readonly T[],
): { unique: T[]; members: Map<string, T[]> } {
  const unique: T[] = [];
  const members = new Map<string, T[]>();
  const firstBySignature = new Map<string, string>();
  for (const entry of entries) {
    // E.g. "black2/.../section_0:245"; use the entire MSBT path, not only
    // a game name, so a context-sensitive identical phrase stays distinct.
    const separator = entry.key.lastIndexOf(":");
    const msbtFile = separator >= 0 ? entry.key.slice(0, separator) : entry.key;
    const signature = JSON.stringify([msbtFile, entry.original, entry.translation, entry.category ?? null]);
    const firstKey = firstBySignature.get(signature);
    if (firstKey === undefined) {
      firstBySignature.set(signature, entry.key);
      unique.push(entry);
      members.set(entry.key, [entry]);
    } else {
      members.get(firstKey)!.push(entry);
    }
  }
  return { unique, members };
}

/** Copy a finding to equivalent rows, preserving their actual distinct keys. */
export function expandExactEnhanceItems<T extends { key: string }>(
  items: readonly T[] | null | undefined,
  members: ReadonlyMap<string, readonly EnhanceBatchEntry[]>,
): T[] | undefined {
  if (!items) return undefined;
  return items.flatMap(item => {
    const group = members.get(item.key);
    return group ? group.map(entry => ({ ...item, key: entry.key })) : [item];
  });
}
