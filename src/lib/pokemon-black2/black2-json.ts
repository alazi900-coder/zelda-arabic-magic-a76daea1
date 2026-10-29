import type { ExtractedEntry, FileCategory } from "@/components/editor/types";

/** Pokémon Black 2's extracted, round-trip-safe JSON schema (not a Platinum NARC). */
export const BLACK2_SOURCE_GAME = "black2";
export const BLACK2_DOCUMENT_KEY = "pokemonBlack2:sourceDocument:v1";
export const BLACK2_PREFIX = "black2/";

export interface Black2JsonRow {
  id: string;
  archive: string;
  file_id: number;
  bank_id: number;
  bank_name: string;
  section_id: number;
  index: number;
  category: "system" | "script" | "additional";
  source: string;
  arabic: string;
  control_tokens: string[];
  compressed: boolean;
  already_contains_arabic: boolean;
  [field: string]: unknown;
}

export interface Black2JsonDocument {
  metadata: { game: string; rom_game_code: string; format_version: number; [field: string]: unknown };
  banks: Record<string, unknown>[];
  entries: Black2JsonRow[];
}

const EXACT_TOKEN_RE = /\[(?:CTRL:[0-9A-Fa-f]{4}(?::[0-9A-Fa-f]{4})*|CHAR:[0-9A-Fa-f]{4})\]/g;
const ANY_CONTROL_RE = /\[(?:CTRL|CHAR)(?::[^\]\r\n]*)?\]/gi;
const BIDI_AND_PRESENTATION_RE = /[\u202A-\u202E\u2066-\u2069\uFB50-\uFDFF\uFE70-\uFEFF]/;

/** Preserve archive/bank/section/index in every key, even when English repeats. */
export function black2EntryKeyFromId(id: string): string | null {
  const match = /^(.+):(\d{4}):(\d+):(\d{4})$/.exec(id);
  if (!match) return null;
  const archive = match[1];
  const bank = Number(match[2]);
  const section = Number(match[3]);
  const index = Number(match[4]);
  if (!/^a\/\d+\/\d+\/\d+$/.test(archive)) return null;
  return BLACK2_PREFIX + archive + "/bank_" + bank + "/section_" + section + ":" + index;
}

/** Blank is a no-change instruction. Preserve every runtime token literally and in order. */
export function validateBlack2Translation(source: string, translation: string): string | null {
  if (!translation.trim() || translation === source) return null;
  const wanted = source.match(EXACT_TOKEN_RE) ?? [];
  const actual = translation.match(EXACT_TOKEN_RE) ?? [];
  if (wanted.length !== actual.length || wanted.some((token, i) => token !== actual[i])) {
    return "وسوم [CTRL:...] و[CHAR:...] مفقودة أو معدّلة أو تغيّر ترتيبها";
  }
  const visibleControls = translation.match(ANY_CONTROL_RE) ?? [];
  if (visibleControls.length !== actual.length || /\[(?:CTRL|CHAR)\b/i.test(translation.replace(ANY_CONTROL_RE, ""))) {
    return "هناك وسم تحكم غير صالح أو مكتوب بطريقة ناقصة";
  }
  if ((source.match(/\n/g) ?? []).length !== (translation.match(/\n/g) ?? []).length) {
    return "عدد فواصل الأسطر مختلف عن النص الأصلي";
  }
  if (BIDI_AND_PRESENTATION_RE.test(translation)) {
    return "اكتب العربية بصيغتها الطبيعية، دون أشكال عرض جاهزة أو علامات اتجاه مخفية";
  }
  return null;
}

export function parseBlack2Json(text: string): {
  document: Black2JsonDocument;
  entries: ExtractedEntry[];
  translations: Record<string, string>;
} {
  const parsed: unknown = JSON.parse(text.replace(/^\uFEFF/, ""));
  if (!parsed || typeof parsed !== "object") throw new Error("ملف JSON غير صالح");
  const doc = parsed as Black2JsonDocument;
  if (doc.metadata?.game !== "Pokémon Black 2" || doc.metadata?.rom_game_code !== "IREO"
      || doc.metadata?.format_version !== 1 || !Array.isArray(doc.banks) || !Array.isArray(doc.entries)) {
    throw new Error("الملف ليس قالب Pokémon Black 2 (IREO) المدعوم، أو تغيّرت بنيته");
  }
  if (!doc.entries.length || doc.entries.length > 150000) throw new Error("عدد النصوص في ملف Black 2 غير متوقع");
  const seen = new Set<string>();
  const entries: ExtractedEntry[] = [];
  const translations: Record<string, string> = {};
  for (const row of doc.entries) {
    if (!row || typeof row.id !== "string" || typeof row.archive !== "string"
        || !Number.isSafeInteger(row.bank_id) || !Number.isSafeInteger(row.section_id)
        || !Number.isSafeInteger(row.index) || typeof row.bank_name !== "string"
        || typeof row.source !== "string" || typeof row.arabic !== "string"
        || !Array.isArray(row.control_tokens) || row.control_tokens.some(t => typeof t !== "string")) {
      throw new Error("يوجد سطر بلا معرّف أو بحقول غير صالحة في JSON");
    }
    const key = black2EntryKeyFromId(row.id);
    const expected = BLACK2_PREFIX + row.archive + "/bank_" + row.bank_id
      + "/section_" + row.section_id + ":" + row.index;
    if (!key || key !== expected || seen.has(key)) throw new Error("معرّف Black 2 مكرر أو غير مطابق للصف: " + row.id);
    seen.add(key);
    const sourceTokens = row.source.match(EXACT_TOKEN_RE) ?? [];
    if (sourceTokens.length !== row.control_tokens.length
        || sourceTokens.some((token, i) => token !== row.control_tokens[i])) {
      throw new Error("قائمة control_tokens لا تطابق النص الأصلي في " + row.id);
    }
    const err = validateBlack2Translation(row.source, row.arabic);
    if (err) throw new Error("ترجمة غير آمنة في " + row.id + ": " + err);
    const at = key.lastIndexOf(":");
    entries.push({
      msbtFile: key.slice(0, at),
      index: row.index,
      original: row.source,
      label: row.bank_name + " · " + row.id,
      // JSON-only workflow: no guessed NDS message byte/ROM slot limit.
      maxBytes: 65535,
    });
    if (row.arabic.trim()) translations[key] = row.arabic;
  }
  return { document: doc, entries, translations };
}

export function exportBlack2Json(
  doc: Black2JsonDocument,
  entries: readonly ExtractedEntry[],
  translations: Readonly<Record<string, string>>,
): Black2JsonDocument {
  const byKey = new Map(entries.map(entry => [entry.msbtFile + ":" + entry.index, entry]));
  const seen = new Set<string>();
  if (entries.length !== doc.entries.length) throw new Error("بيانات Black 2 المحفوظة لا تطابق ملف المصدر");
  const outputRows = doc.entries.map(row => {
    const key = black2EntryKeyFromId(row.id);
    const entry = key ? byKey.get(key) : undefined;
    if (!key || !entry || entry.original !== row.source || seen.has(key)) {
      throw new Error("اختلاف في معرّف أو مصدر النص: " + row.id);
    }
    seen.add(key);
    const translated = translations[key];
    const value = translated === undefined || translated === row.source ? row.arabic : translated;
    const error = validateBlack2Translation(row.source, value);
    if (error) throw new Error("رُفض تصدير " + row.id + ": " + error);
    return { ...row, arabic: value };
  });
  return { ...doc, entries: outputRows };
}

/** Categorization uses bank names and source category, never translated prose. */
export const BLACK2_CATEGORIES: FileCategory[] = [
  { id: "b2-dialogue", label: "القصة والحوارات والمناطق", emoji: "💬", icon: "MessageCircle", color: "text-violet-400" },
  { id: "b2-battle", label: "المعارك والمدربون", emoji: "⚔️", icon: "Sword", color: "text-red-400" },
  { id: "b2-pokemon", label: "البوكيمون والحركات والقدرات", emoji: "🐾", icon: "BookOpen", color: "text-emerald-400" },
  { id: "b2-items", label: "الأدوات والمتاجر", emoji: "🎒", icon: "Backpack", color: "text-amber-400" },
  { id: "b2-menu", label: "القوائم والنظام", emoji: "▤", icon: "Monitor", color: "text-sky-400" },
  { id: "b2-network", label: "التبادل والاتصال", emoji: "🌐", icon: "Globe", color: "text-teal-400" },
  { id: "b2-misc", label: "محتويات أخرى", emoji: "◌", icon: "LibraryBig", color: "text-slate-400" },
];

export function categorizeBlack2Entry(entry: ExtractedEntry): string {
  const name = entry.label.split(" · ")[0].toLowerCase();
  if (/item|bag|shop|mart|berry|medicine|sell|buy/.test(name)) return "b2-items";
  if (/battle|btl|trainer|gym|subway|tower|fight/.test(name)) return "b2-battle";
  if (/species|pokedex|pokeparam|pokemon|ability|move|nature|egg|evolution/.test(name)) return "b2-pokemon";
  if (/gts|wifi|wi.fi|wireless|union|trade|comm|network|cgear|gsync/.test(name)) return "b2-network";
  if (/menu|title|save|option|system|warning|error|medal|help|bag_pockets|box|input/.test(name)) return "b2-menu";
  if (/^s\d+|event|route|city|town|plasma|forest|cave|script|story|field|demo/.test(name)) return "b2-dialogue";
  return "b2-misc";
}
