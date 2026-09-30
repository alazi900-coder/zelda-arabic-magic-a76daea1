/**
 * Portable "English + Arabic" JSON — one object per line:
 *   { "id": "<msbtFile>:<index>", "source": "<English>", "arabic": "<Arabic or empty>" }
 *
 * Same shape as the GTA San Andreas and phone-game files, so it can be read
 * and edited outside the tool. Text is written and read back verbatim: no
 * reshaping, no bidi reordering, no marker stripping — the stored logical
 * text is what goes out, and exactly what comes in is what gets stored.
 *
 * Import never erases (an empty field is skipped) and refuses any line whose
 * technical tokens the deep scan flags as damaged for that game.
 */
import type { ExtractedEntry } from "@/components/editor/types";
import { detectIssues } from "@/lib/diagnostic-detect";

export interface PortableJsonRow {
  id: string;
  source: string;
  arabic: string;
}

export interface PortableJsonRejectedRow {
  id: string;
  source: string;
  arabic: string;
  reason: string;
}

export interface PortableJsonImport {
  updates: Record<string, string>;
  rejected: PortableJsonRejectedRow[];
  unchanged: number;
  empty: number;
  outsideFilter: number;
}

/** Deep-scan categories that mean a technical token was lost, altered, or reordered. */
const TOKEN_DAMAGE_CATEGORIES = new Set([
  "control_chars",
  "pua_chars",
  "unmatched_ruby",
  "broken_tag_syntax",
  "control_extra",
  "translated_tags",
  "tag_mismatch",
  "placeholder_mismatch",
  "corrupted_vars",
  "missing_vars",
  "pkm_var_mismatch",
  "gtaiv_runtime_token_mismatch",
  "gtaiv_dollar_amount_mismatch",
  "technical_mismatch",
  "tag_order_mismatch",
  "twom_tag_mismatch",
  "inazuma_tag_mismatch",
  "plat_tag_mismatch",
  "risen_tag_mismatch",
  "format_specifier_mismatch",
  "double_shaped",
  "null_char",
]);

const entryKey = (entry: Pick<ExtractedEntry, "msbtFile" | "index">) => `${entry.msbtFile}:${entry.index}`;

export function buildPortableJson(entries: readonly ExtractedEntry[], translations: Readonly<Record<string, string>>): PortableJsonRow[] {
  return entries.map((entry) => {
    const id = entryKey(entry);
    const translation = translations[id] ?? "";
    const translated = translation.trim() !== "" && translation !== entry.original;
    return { id, source: entry.original, arabic: translated ? translation : "" };
  });
}

function pickString(row: Record<string, unknown>, names: readonly string[]): string | undefined {
  for (const name of names) {
    if (typeof row[name] === "string") return row[name] as string;
  }
  return undefined;
}

/**
 * `allowedKeys` limits the import to the active filter (null = every line).
 * Lines are matched by `id`, else by GTA SA's `table` + `hash`, else by an
 * English `source` that belongs to exactly one line.
 */
export function parsePortableJson(
  rawText: string,
  entries: readonly ExtractedEntry[],
  translations: Readonly<Record<string, string>>,
  allowedKeys: ReadonlySet<string> | null,
): PortableJsonImport {
  const parsed: unknown = JSON.parse(rawText.replace(/^\uFEFF/, ""));
  const rows = Array.isArray(parsed)
    ? parsed
    : parsed && typeof parsed === "object" && Array.isArray((parsed as { entries?: unknown }).entries)
      ? (parsed as { entries: unknown[] }).entries
      : null;
  if (!rows) throw new Error("الملف ليس قائمة أسطر: المتوقع [ { \"source\": ..., \"arabic\": ... } ]");

  const byKey = new Map(entries.map((entry) => [entryKey(entry), entry]));
  const bySource = new Map<string, ExtractedEntry | null>();
  for (const entry of entries) bySource.set(entry.original, bySource.has(entry.original) ? null : entry);

  const result: PortableJsonImport = { updates: {}, rejected: [], unchanged: 0, empty: 0, outsideFilter: 0 };

  for (const raw of rows) {
    if (!raw || typeof raw !== "object") continue;
    const row = raw as Record<string, unknown>;
    const source = pickString(row, ["source", "english", "original", "en"]) ?? "";
    const arabic = pickString(row, ["arabic", "translation", "target", "ar"]) ?? "";
    let id = pickString(row, ["id", "key"]) ?? "";
    if (!id && typeof row.table === "string" && typeof row.hash === "string" && /^[0-9a-f]{1,8}$/i.test(row.hash)) {
      id = `gtasa/${row.table}:${parseInt(row.hash, 16)}`;
    }

    // An untranslated line may come back empty or as a copy of the English.
    if (arabic.trim() === "" || arabic === source) { result.empty++; continue; }

    let entry = id ? byKey.get(id) : undefined;
    if (!entry) {
      const bySourceMatch = bySource.get(source);
      if (bySourceMatch === null) {
        result.rejected.push({ id, source, arabic, reason: "النص الإنجليزي مكرر في أكثر من سطر ولا يوجد معرّف id يحدد السطر" });
        continue;
      }
      if (!bySourceMatch) {
        result.rejected.push({ id, source, arabic, reason: "لا يوجد سطر مطابق في المشروع" });
        continue;
      }
      entry = bySourceMatch;
    }

    const key = entryKey(entry);
    if (allowedKeys && !allowedKeys.has(key)) { result.outsideFilter++; continue; }
    if (source && source !== entry.original) {
      result.rejected.push({ id: key, source, arabic, reason: "النص الإنجليزي في الملف لا يطابق النص في المشروع" });
      continue;
    }

    const damage = detectIssues(entry, arabic).find(
      (issue) => issue.severity === "critical" && TOKEN_DAMAGE_CATEGORIES.has(issue.category),
    );
    if (damage) {
      result.rejected.push({ id: key, source: entry.original, arabic, reason: damage.message });
      continue;
    }

    if (translations[key] === arabic) { result.unchanged++; continue; }
    result.updates[key] = arabic;
  }

  return result;
}

/** Imported lines that would overwrite an existing, different translation — shown for accept/reject. */
export function findPortableJsonConflicts(
  updates: Readonly<Record<string, string>>,
  entries: readonly ExtractedEntry[],
  translations: Readonly<Record<string, string>>,
): { key: string; label: string; oldValue: string; newValue: string }[] {
  const byKey = new Map(entries.map((entry) => [entryKey(entry), entry]));
  const conflicts: { key: string; label: string; oldValue: string; newValue: string }[] = [];
  for (const [key, newValue] of Object.entries(updates)) {
    const oldValue = translations[key];
    const entry = byKey.get(key);
    if (!oldValue || !oldValue.trim() || oldValue === entry?.original || oldValue === newValue) continue;
    conflicts.push({ key, label: entry ? entry.original.slice(0, 60) : key, oldValue, newValue });
  }
  return conflicts;
}
