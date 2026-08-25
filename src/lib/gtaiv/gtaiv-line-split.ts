import { balanceChunk } from "@/lib/balance-lines";
import { hasArabicText } from "@/lib/risen-line-split";
import type { ExtractedEntry } from "@/components/editor/types";

export const GTAIV_LINE_BREAK_TOKEN = "~n~";

export interface GtaIvLineSplitPlan {
  targetKeys: string[];
  updates: Record<string, string>;
  snapshot: Record<string, string>;
}

function splitBalancedSegment(segment: string, limit: number): string[] {
  if (segment.length <= limit) return [segment];

  const tokens: string[] = [];
  const shielded = segment.replace(/~[^~]+~/g, (token) => {
    const index = tokens.push(token) - 1;
    return `\uE200${index.toString(36)}\uE201`;
  });
  const balanced = balanceChunk(shielded, limit, limit).split("\n");
  return balanced.map((line) => line.replace(/\uE200([0-9a-z]+)\uE201/g, (_match, index) => (
    tokens[parseInt(index, 36)] ?? _match
  )));
}

/**
 * Splits only rows whose English source has no pre-existing `~n~` token. This
 * leaves author-provided control-token layouts untouched while allowing the
 * user-created GTA IV line breaks to be safely merged again.
 */
export function planGtaIvLineSplit(
  entries: Pick<ExtractedEntry, "msbtFile" | "index" | "original">[],
  translations: Record<string, string>,
  limit: number,
): GtaIvLineSplitPlan {
  const targetKeys: string[] = [];
  const updates: Record<string, string> = {};
  const snapshot: Record<string, string> = {};

  for (const entry of entries) {
    const key = `${entry.msbtFile}:${entry.index}`;
    const current = translations[key] || "";
    if (!current.trim() || !hasArabicText(current) || entry.original.includes(GTAIV_LINE_BREAK_TOKEN)) continue;
    const segments = current.split(GTAIV_LINE_BREAK_TOKEN);
    if (!segments.some((segment) => segment.length > limit)) continue;

    const next = segments.flatMap((segment) => splitBalancedSegment(segment, limit)).join(GTAIV_LINE_BREAK_TOKEN);
    if (next === current) continue;
    targetKeys.push(key);
    snapshot[key] = current;
    updates[key] = next;
  }

  return { targetKeys, updates, snapshot };
}

/** Removes only `~n~` markers introduced on rows that had no source marker. */
export function planGtaIvLineJoin(
  entries: Pick<ExtractedEntry, "msbtFile" | "index" | "original">[],
  translations: Record<string, string>,
): GtaIvLineSplitPlan {
  const targetKeys: string[] = [];
  const updates: Record<string, string> = {};
  const snapshot: Record<string, string> = {};

  for (const entry of entries) {
    const key = `${entry.msbtFile}:${entry.index}`;
    const current = translations[key] || "";
    if (entry.original.includes(GTAIV_LINE_BREAK_TOKEN) || !current.includes(GTAIV_LINE_BREAK_TOKEN)) continue;
    targetKeys.push(key);
    snapshot[key] = current;
    updates[key] = current.split(GTAIV_LINE_BREAK_TOKEN).join(" ");
  }

  return { targetKeys, updates, snapshot };
}
