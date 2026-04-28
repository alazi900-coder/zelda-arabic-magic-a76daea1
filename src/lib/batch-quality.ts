/**
 * Shared types for translation batch quality reporting.
 * Mirrors the shape returned by `supabase/functions/translate-entries/index.ts`
 * (`BatchQualityStats`). Kept in a separate file so both UI and tests can import.
 */

export interface BatchQualityError {
  key: string;
  reason: string;
  sample?: string;
}

export interface BatchQualityStats {
  total: number;
  returned: number;
  validJson: boolean;
  withArabic: number;
  placeholdersOk: number;
  newlineStripped: number;
  errors: BatchQualityError[];
}

export interface CumulativeQuality {
  batches: number;
  total: number;
  withArabic: number;
  placeholdersOk: number;
  newlineStripped: number;
  errors: BatchQualityError[];
}

export const emptyCumulative = (): CumulativeQuality => ({
  batches: 0, total: 0, withArabic: 0, placeholdersOk: 0, newlineStripped: 0, errors: [],
});
