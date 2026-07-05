// Shared guard for every write path that merges a batch of translations into
// EditorState directly (AI suggestions, cleanup tools, imports, AutoPilot),
// bypassing the single-key `updateTranslation` in useEditorState.ts — which
// already runs this same repair for manual edits. Without this, a Risen tag
// like <Exit> lost by an AI response or bulk cleanup tool would silently slip
// through every path except manual typing.
import type { EditorState } from "@/components/editor/types";
import { hasRisenTags, restoreRisenTags } from "./risen-tag-guard";
import { normalizeBreakStyleToSource } from "./balance-lines";

/**
 * Runs the Risen tag-repair + line-break-style normalization over a batch of
 * translations before merging it into state, exactly as `updateTranslation`
 * does for a single manual edit. Non-Risen entries only get the (safe, no-op
 * for \n-only text) break-style normalization, unchanged from today.
 */
export function mergeGuardedTranslations(
  prev: EditorState,
  updates: Record<string, string>
): Pick<EditorState, "translations" | "risenTagReviewKeys"> {
  const byKey = new Map(prev.entries.map((e) => [`${e.msbtFile}:${e.index}`, e]));
  const guarded: Record<string, string> = {};
  let reviewKeys: Set<string> | undefined;

  for (const [key, rawValue] of Object.entries(updates)) {
    const entry = byKey.get(key);
    let value = entry ? normalizeBreakStyleToSource(entry.original, rawValue) : rawValue;

    const isRisenEntry = !!entry && /\.tab$/i.test(entry.msbtFile);
    if (isRisenEntry && entry && hasRisenTags(entry.original) && value.trim()) {
      const repaired = restoreRisenTags(entry.original, value);
      value = repaired.text;
      if (repaired.needsReview) {
        if (!reviewKeys) reviewKeys = new Set(prev.risenTagReviewKeys);
        reviewKeys.add(key);
      }
    }
    guarded[key] = value;
  }

  return {
    translations: { ...prev.translations, ...guarded },
    risenTagReviewKeys: reviewKeys ?? prev.risenTagReviewKeys,
  };
}
