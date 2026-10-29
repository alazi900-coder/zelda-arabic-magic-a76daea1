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


/** Bank-based cards for the real Black 2 JSON export. Numbered banks
 * remain anonymous rather than guessing a category from their prose. */
export const BLACK2_CATEGORIES: FileCategory[] = [
  { id: "b2-story", label: "القصة وفريق بلازما", emoji: "📜", icon: "ScrollText", color: "text-violet-400" },
  { id: "b2-cities", label: "المدن والبلدات", emoji: "🏙️", icon: "Home", color: "text-cyan-400" },
  { id: "b2-routes", label: "الطرق والكهوف والمناطق", emoji: "🗺️", icon: "MapPin", color: "text-emerald-400" },
  { id: "b2-global", label: "الحوارات والأحداث العامة", emoji: "💬", icon: "MessageCircle", color: "text-indigo-400" },
  { id: "b2-trainers", label: "المدربون وأسماؤهم", emoji: "🎽", icon: "Users", color: "text-rose-400" },
  { id: "b2-battle", label: "المعارك ومرافق القتال", emoji: "⚔️", icon: "Sword", color: "text-red-400" },
  { id: "b2-pokemon", label: "البوكيمون والبوكيدكس", emoji: "🐾", icon: "BookOpen", color: "text-green-400" },
  { id: "b2-moves", label: "الحركات والقدرات والأنواع", emoji: "✨", icon: "Sparkles", color: "text-yellow-400" },
  { id: "b2-items", label: "الأدوات والحقيبة والمتاجر", emoji: "🎒", icon: "Backpack", color: "text-amber-400" },
  { id: "b2-menu", label: "القوائم والحفظ والنظام", emoji: "⚙️", icon: "Settings", color: "text-sky-400" },
  { id: "b2-network", label: "الاتصال والتبادل", emoji: "🌐", icon: "Globe", color: "text-teal-400" },
  { id: "b2-activities", label: "الأنشطة والمسابقات والميداليات", emoji: "🎬", icon: "Clapperboard", color: "text-pink-400" },
  { id: "b2-words", label: "الكلمات والعبارات الجاهزة", emoji: "📝", icon: "MessageSquare", color: "text-orange-400" },
  { id: "b2-script-other", label: "حوارات أماكن أخرى", emoji: "📍", icon: "Map", color: "text-blue-400" },
  { id: "b2-system-other", label: "بنوك النظام غير المصنفة", emoji: "🗃️", icon: "FolderOpen", color: "text-slate-400" },
  { id: "b2-additional", label: "الرسائل الإضافية", emoji: "➕", icon: "FileText", color: "text-lime-400" },
];

/** Classify from the bank name and the original NARC archive, not translated text. */
export function categorizeBlack2Entry(entry: ExtractedEntry): string {
  if (!entry.msbtFile.startsWith(BLACK2_PREFIX)) return "b2-system-other";
  const bankName = entry.label.split(" · ")[0].toLowerCase();
  const archive = entry.msbtFile.slice(BLACK2_PREFIX.length).split("/bank_")[0];

  if (archive !== "a/0/0/2" && archive !== "a/0/0/3") return "b2-additional";
  if (/(?:^|_)trainer(?:_|s\b)|trainer_class|trainer_names|trainer_messages|gym_leader|elite_four|champion_names|treehollow_trainer/.test(bankName)) return "b2-trainers";
  if (/(?:^pms_|^easy_chat|^questionnaire|^hobbies|^job_answers|^event_phrase|^words_|_word_set|^word_set|^greetings|^phrase_)/.test(bankName)) return "b2-words";
  if (/(?:^item|^bag_|_bag_|^bag$|^berry|^shop|_shop|^mart|shopping_mall|^medicine|^goods_|_goods|^sell_|^buy_)/.test(bankName)) return "b2-items";
  if (/(?:^move_|^move_names|^ability|^abilities|^natures?$|^nature_names|^type_names|^type_)/.test(bankName)) return "b2-moves";
  if (/(?:^species|^pokedex|^pokemon|^pokeparam|^egg_|^evolution|^form_names)/.test(bankName)) return "b2-pokemon";
  if (/(?:^btl|^battle|^gym_|^pwt_|^black_tower|^white_treehollow|^battle_subway|_battle|^bsubway)/.test(bankName)) return "b2-battle";
  if (/(?:^pokestar|^pokewood|^pkwd_|^musical|^medal|^join_avenue|^entree_|^festival|^fest_|^fmission|^cg_|^royal_unova|^movie|^dream_world)/.test(bankName)) return "b2-activities";
  if (/(?:^wifi|^wfc|^gts|^gsync|^wireless|^union|^trade|^worldtrade|^comm_|^communication|^network|^cgear|^c_gear|^game_sync)/.test(bankName)) return "b2-network";
  if (/(?:^menu|^startmenu|^title|^save|_save|^delete_save|^option|^system|^help|^error|^warning|^input|^box|^pc_|^town_map|^map_|^game_start|^settings|^status|^months|^place_names|^load_field_menu)/.test(bankName)) return "b2-menu";
  if (/(?:^plasma|_plasma|^rival|^intro|^story|^ending|^credits|^event_|^scrcmd_plasma|^cutscene)/.test(bankName)) return "b2-story";
  if (archive === "a/0/0/3") {
    if (/(?:_city(?:_|$)|_town(?:_|$)|^black_city|^white_forest|pokemon_center|^aspertia|^virbank|^castelia|^nimbasa|^undella|^driftveil|^humilau|^opelucid|^lentimas|^floccesy|^icirrus|^striaton|^accumula|^nuvema|^lacunosa|^anville|^gear_station|^unity_tower)/.test(bankName)) return "b2-cities";
    if (/(?:^route|_route|^road|^bridge|_bridge|^gate|_gate|^cave|_cave|^forest|_forest|^mountain|^desert|^lake|^woods|^ruins|_ruins|^giant_chasm|^chargestone|^victory_road|^seaside|^hidden_grotto|^abyssal|^relic|^pinwheel|^moor|^nature_preserve|^floccesy_ranch|^pledge_grove|^celestial_tower|^dreamyard)/.test(bankName)) return "b2-routes";
    if (/^global_/.test(bankName)) return "b2-global";
    return "b2-script-other";
  }
  return "b2-system-other";
}
