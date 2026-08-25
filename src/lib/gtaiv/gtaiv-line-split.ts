import { hasArabicText } from "@/lib/risen-line-split";
import type { ExtractedEntry } from "@/components/editor/types";

export const GTAIV_LINE_BREAK_TOKEN = "~n~";

/**
 * GTA IV stores a line-break marker inline as `~n~`. The editor deliberately
 * adds a real newline after that marker so translators get the same visible
 * line layout as Risen. The marker remains present and is collapsed again at
 * the GXT-build boundary; a bare user newline is never invented as a token.
 */
export function gtaIvRuntimeTextToEditorText(text: string): string {
  return text.replace(/(~n~)(?:\r\n|\r|\n)?/gi, "$1\n");
}

/** Converts only the editor-only newline following a GTA IV `~n~` back to GXT syntax. */
export function gtaIvEditorTextToRuntimeText(text: string): string {
  return text.replace(/(~n~)(?:\r\n|\r|\n)+/gi, "$1");
}

export interface GtaIvLineSplitPlan {
  targetKeys: string[];
  updates: Record<string, string>;
  snapshot: Record<string, string>;
}

/**
 * GTA IV's manual character-limit tool is deliberately sequential: fill the
 * current line through the last whole word that fits, then start the next one.
 * The generic visual balancer optimizes all lines together, which is useful for
 * cinematic text but can leave a short line in the middle of a 30-character
 * split. Here the selected number is a hard per-line target, not an average.
 */
function splitSequentialSegment(segment: string, limit: number): string[] {
  if (segment.length <= limit) return [segment];

  const tokens: string[] = [];
  const shielded = segment.replace(/~[^~]+~/g, (token) => {
    const index = tokens.push(token) - 1;
    return `\uE200${index.toString(36)}\uE201`;
  });
  const visualLength = (value: string) => value.replace(/\uE200[0-9a-z]+\uE201/g, "□").length;
  const words = shielded.replace(/\s+/g, " ").trim().split(" ").filter(Boolean);
  const lines: string[] = [];
  let line = "";

  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (line && visualLength(candidate) > limit) {
      lines.push(line);
      line = word;
    } else {
      line = candidate;
    }
  }
  if (line) lines.push(line);

  return lines.map((line) => line.replace(/\uE200([0-9a-z]+)\uE201/g, (_match, index) => (
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

    const next = segments.flatMap((segment) => splitSequentialSegment(segment, limit)).join(GTAIV_LINE_BREAK_TOKEN);
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
