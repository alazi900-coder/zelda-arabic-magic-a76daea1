import type { ExtractedEntry } from "@/components/editor/types";
import { extractCrashlandsTags, validateCrashlandsTags } from "./crashlands-tags";

export const CRASHLANDS_SOURCE_GAME = "crashlands";
export const CRASHLANDS_FORMAT = "crashlands-arabic-editable-v1";
export interface CrashlandsJsonEntry { id: string; section: string; source: string; translation: string; technical_tokens?: string[] }

export function importCrashlandsJson(value: unknown) {
  const doc = value as { format?: string; entries?: unknown[] };
  if (doc?.format !== CRASHLANDS_FORMAT || !Array.isArray(doc.entries)) throw new Error("هذا ليس ملف JSON الخاص بـ Crashlands Arabic.");
  const seen = new Set<string>();
  const entries: ExtractedEntry[] = [];
  const translations: Record<string, string> = {};
  for (let i = 0; i < doc.entries.length; i++) {
    const row = doc.entries[i] as Partial<CrashlandsJsonEntry>;
    if (!row || typeof row.id !== "string" || typeof row.section !== "string" || typeof row.source !== "string" || typeof row.translation !== "string" || seen.has(row.id)) throw new Error(`صف Crashlands غير صالح عند الرقم ${i + 1}.`);
    seen.add(row.id);
    const entry: ExtractedEntry = { msbtFile: `crashlands/${row.section}/${i}`, index: i, label: row.id, original: row.source, maxBytes: Number.MAX_SAFE_INTEGER, crashlandsId: row.id, crashlandsSection: row.section };
    entries.push(entry); translations[`${entry.msbtFile}:${entry.index}`] = row.translation;
  }
  return { entries, translations };
}

export function exportCrashlandsJson(entries: ExtractedEntry[], translations: Record<string, string>) {
  const rows: CrashlandsJsonEntry[] = entries.filter(e => e.msbtFile.startsWith("crashlands/")).map(e => {
    const translation = translations[`${e.msbtFile}:${e.index}`] ?? "";
    const checked = translation ? validateCrashlandsTags(e.original, translation) : { valid: true };
    if (!checked.valid) throw new Error(`الرموز التقنية غير محفوظة في: ${e.label}`);
    return { id: e.crashlandsId ?? e.label, section: e.crashlandsSection ?? "other", source: e.original, translation, technical_tokens: extractCrashlandsTags(e.original) };
  });
  return { format: CRASHLANDS_FORMAT, game: "Crashlands v100.0.167", entry_count: rows.length, instructions: "عدّل translation فقط. لا تغيّر id أو source أو technical_tokens. حافظ على %r و# وبقية الرموز التقنية بالترتيب نفسه.", entries: rows };
}
