import { prepareGoldenSun2BuildText } from "./goldensun2-editor-bridge";
import { goldenSun2TextToBytes, GS2_TEXT_FILE } from "./goldensun2-huffman-rom";

export interface GoldenSun2BuildIssue {
  key: string;
  index: number;
  original: string;
  current: string;
  fix: string;
  type: "auto-clean" | "blocking";
  issue: string;
  removed: number;
}

/**
 * Independent of the AI's linguistic assessment: run the SAME source-aware
 * normalization as the actual ROM builder, then check its encoder.
 * This detects controls that generic/AI deep scanning cannot see.
 */
export function scanGoldenSun2BuildTranslations(
  entries: readonly { msbtFile: string; index: number; original: string }[],
  translations: Readonly<Record<string, string>>,
): GoldenSun2BuildIssue[] {
  const findings: GoldenSun2BuildIssue[] = [];
  for (const entry of entries) {
    if (entry.msbtFile !== GS2_TEXT_FILE) continue;
    const key = entry.msbtFile + ":" + entry.index;
    const current = translations[key];
    if (!current || current === entry.original) continue;
    const prepared = prepareGoldenSun2BuildText(entry.original, current);
    const removed = prepared.removedHiddenControls + prepared.removedInvisibleFormatting;
    let blocking = !prepared.valid;
    let reason = !prepared.valid ? "الوسوم التقنية لا تطابق النص الأصلي بعد التنظيف" : "";
    if (!blocking) {
      try {
        const bytes = goldenSun2TextToBytes(prepared.text);
        if (bytes.includes(0) || bytes.length > 1999) {
          blocking = true;
          reason = "ترجمة غير قابلة للبناء: بايت صفري أو تجاوز حد 1999 بايت";
        }
      } catch (error) {
        blocking = true;
        reason = error instanceof Error ? error.message : String(error);
      }
    }
    if (!blocking && removed === 0) continue;
    findings.push({
      key, index: entry.index, original: entry.original, current,
      fix: blocking ? "" : prepared.text, removed,
      type: blocking ? "blocking" : "auto-clean",
      issue: blocking
        ? "مانع بناء Golden Sun II — النص #" + entry.index + ": " + reason
        : "النص #" + entry.index + ": " + removed +
          " رمز مخفي زائد لا يوجد في الأصل؛ سيُزال تلقائيًا عند بناء ROM.",
    });
  }
  return findings;
}
