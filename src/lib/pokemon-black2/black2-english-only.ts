import type { ExtractedEntry } from "@/components/editor/types";
import { black2EntryKeyFromId, validateBlack2Translation } from "./black2-json";

/**
 * The compact English-only export contains metadata + entries [{ id, english }].
 * This is deliberately a different on-disk schema from the full NARC/banks export.
 * Never invent banks, alter message IDs or rewrite the original English.
 */
export interface Black2EnglishOnlyRow {
  id: string;
  english: string;
  arabic?: string;
  [field: string]: unknown;
}

export interface Black2EnglishOnlyDocument {
  metadata: {
    game: string;
    source_rom?: string;
    count: number;
    [field: string]: unknown;
  };
  entries: Black2EnglishOnlyRow[];
  [field: string]: unknown;
}

/** Identify only the compact schema, leaving the existing full-bank parser intact. */
export function isBlack2EnglishOnlyDocument(value: unknown): value is Black2EnglishOnlyDocument {
  if (!value || typeof value !== "object") return false;
  const object = value as Partial<Black2EnglishOnlyDocument>;
  return object.metadata?.game === "Pokémon Black 2" &&
    Array.isArray(object.entries) && object.entries.length > 0 &&
    typeof object.entries[0]?.id === "string" &&
    typeof object.entries[0]?.english === "string" &&
    !("banks" in object);
}

/** Tags must remain on their original physical line, not merely in global order. */
export function validateBlack2EnglishOnlyTranslation(english: string, arabic: string): string | null {
  const failure = validateBlack2Translation(english, arabic);
  if (failure) return failure;
  if (!arabic.trim() || arabic === english) return null;
  const token = /\[(?:CTRL|CHAR):[^\]\r\n]+\]/g;
  const fromLines = english.split("\n");
  const toLines = arabic.split("\n");
  if (fromLines.length !== toLines.length) return "عدد فواصل الأسطر مختلف عن النص الأصلي";
  for (let i = 0; i < fromLines.length; i++) {
    const required = fromLines[i].match(token) ?? [];
    const found = toLines[i].match(token) ?? [];
    if (required.length !== found.length || required.some((tag, index) => tag !== found[index])) {
      return "انتقل وسم تحكم إلى سطر مختلف في السطر " + (i + 1);
    }
  }
  return null;
}

export function parseBlack2EnglishOnlyJson(text: string): {
  document: Black2EnglishOnlyDocument;
  entries: ExtractedEntry[];
  translations: Record<string, string>;
} {
  const parsed: unknown = JSON.parse(text.replace(/^\uFEFF/, ""));
  if (!isBlack2EnglishOnlyDocument(parsed)) {
    throw new Error("تنسيق ملف Black 2 غير مدعوم: يلزم metadata وentries تحتوي id وenglish");
  }
  const document = parsed;
  if (!Number.isSafeInteger(document.metadata.count) ||
      document.metadata.count !== document.entries.length ||
      !document.entries.length || document.entries.length > 150000) {
    throw new Error("عدد النصوص في metadata.count لا يطابق entries في ملف Black 2");
  }

  const seen = new Set<string>();
  const entries: ExtractedEntry[] = [];
  const translations: Record<string, string> = {};
  for (const row of document.entries) {
    if (!row || typeof row.id !== "string" || typeof row.english !== "string" ||
        (row.arabic !== undefined && typeof row.arabic !== "string")) {
      throw new Error("يوجد نص غير صالح في ملف Black 2");
    }
    const key = black2EntryKeyFromId(row.id);
    if (!key || seen.has(key)) {
      throw new Error("معرّف Black 2 غير صالح أو مكرر: " + row.id);
    }
    seen.add(key);
    const arabic = row.arabic ?? "";
    const invalid = validateBlack2EnglishOnlyTranslation(row.english, arabic);
    if (invalid) throw new Error("ترجمة غير آمنة في " + row.id + ": " + invalid);

    const index = Number(row.id.split(":")[3]);
    const fileKey = key.slice(0, key.lastIndexOf(":"));
    entries.push({
      msbtFile: fileKey,
      index,
      original: row.english,
      label: row.id.split(":")[0] + " · " + row.id,
      maxBytes: 65535, // JSON-only; no guessed NDS ROM message-size limit.
    });
    if (arabic.trim()) translations[key] = arabic;
  }
  return { document, entries, translations };
}

/** Round-trip the exact uploaded envelope and message order, adding only arabic to translated rows. */
export function exportBlack2EnglishOnlyJson(
  document: Black2EnglishOnlyDocument,
  entries: readonly ExtractedEntry[],
  translations: Readonly<Record<string, string>>,
): Black2EnglishOnlyDocument {
  if (!isBlack2EnglishOnlyDocument(document) ||
      entries.length !== document.entries.length ||
      document.metadata.count !== document.entries.length) {
    throw new Error("الملف المحفوظ لا يطابق مستند Black 2 الأصلي");
  }
  const byKey = new Map(entries.map(entry => [entry.msbtFile + ":" + entry.index, entry]));
  const seen = new Set<string>();
  const nextRows = document.entries.map(row => {
    const key = black2EntryKeyFromId(row.id);
    const entry = key ? byKey.get(key) : undefined;
    if (!key || !entry || seen.has(key) || entry.original !== row.english) {
      throw new Error("تغيّر مصدر النص أو معرّفه: " + row.id);
    }
    seen.add(key);
    const value = translations[key] ?? row.arabic ?? "";
    if (typeof value !== "string") throw new Error("ترجمة غير نصية: " + row.id);
    const invalid = validateBlack2EnglishOnlyTranslation(row.english, value);
    if (invalid) throw new Error("رُفض تصدير " + row.id + ": " + invalid);

    if (value.trim() && value !== row.english) return { ...row, arabic: value };
    if ("arabic" in row) return { ...row, arabic: "" };
    return row; // An untranslated entry remains { id, english } byte-for-byte by value.
  });
  return { ...document, entries: nextRows };
}
