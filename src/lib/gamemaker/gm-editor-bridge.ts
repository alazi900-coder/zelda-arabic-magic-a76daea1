/**
 * جسر محرر GameMaker — يربط بين محلل IFF وواجهة المحرر
 * يوفر دوال استخراج وإعادة بناء متوافقة مع نظام المحرر الموحد
 */

import type { ExtractedEntry, EditorState } from "@/components/editor/types";
import {
  parseGameMakerIFF,
  extractGameMakerEntries,
  buildGameMakerIFF,
  type GameMakerIFFDocument,
} from "./gm-iff-parser";

export const GM_BUFFER_KEY = "gamemakerSourceBuffer";
export const GM_META_KEY = "gamemakerMeta";

export interface GameMakerMeta {
  filename: string;
  extractedAt: string;
  stats: { totalStrings: number; translatableStrings: number };
}

/**
 * استخراج النصوص من ملف GameMaker
 */
export function extractGameMakerStrings(buffer: ArrayBuffer): {
  doc: GameMakerIFFDocument;
  entries: ExtractedEntry[];
  stats: { totalStrings: number; translatableStrings: number };
} {
  const doc = parseGameMakerIFF(buffer);
  const result = extractGameMakerEntries(doc);
  
  return {
    doc: result.doc,
    entries: result.entries,
    stats: result.stats,
  };
}

/**
 * بناء ملف GameMaker معرّب من حالة المحرر
 */
export async function buildGameMakerFromState(
  translations: Record<string, string>,
  entries?: ExtractedEntry[]
): Promise<{
  buffer: ArrayBuffer;
  filename: string;
  translatedCount: number;
  originalSize: number;
}> {
  // استيراد دالة الوصول للتخزين المحلي
  const { idbGet } = await import("@/lib/idb-storage");
  
  const buffer = await idbGet<ArrayBuffer>(GM_BUFFER_KEY);
  if (!buffer) {
    throw new Error("لا يوجد ملف مصدر — ارفع ملف game.droid أو ملف GameMaker آخر أولاً");
  }
  
  const meta = await idbGet<GameMakerMeta>(GM_META_KEY);
  
  // محلل الملف الأصلي
  const doc = parseGameMakerIFF(buffer);
  
  // تطبيق الترجمات
  const result = buildGameMakerIFF(doc, translations);
  
  return {
    buffer: result.buffer,
    filename: meta?.filename || "game_ar.droid",
    translatedCount: result.translatedCount,
    originalSize: buffer.byteLength,
  };
}

/**
 * تحويل اسم الملف إلى نسخة معرّبة
 */
export function getArabicFilename(originalName: string): string {
  const ext = originalName.split(".").pop() || "droid";
  const base = originalName.replace(new RegExp(`\\.${ext}$`), "");
  return `${base}_ar.${ext}`;
}
