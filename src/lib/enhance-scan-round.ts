/** Limit expensive AI review to a user-sized round; untouched entries remain eligible for the next run. */
export const DEFAULT_ENHANCE_SCAN_LIMIT = 150 as const;
export type EnhanceScanLimit = 100 | 150 | 300 | "all";

export function selectEnhanceScanRound<T>(eligible: readonly T[], limit: EnhanceScanLimit): T[] {
  return limit === "all" ? Array.from(eligible) : eligible.slice(0, limit);
}
