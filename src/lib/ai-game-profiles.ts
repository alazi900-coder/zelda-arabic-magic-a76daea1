/**
 * AI Game Profiles v1.
 *
 * Shared editor, AI providers and language-quality rules; one isolated
 * game-specific rule/prompt/feedback/cache namespace per selected game.
 * Never infer Xenoblade for an unknown or newly-added ROM format.
 */
import { resolveGameParam, type GameParam } from "./game-param";

export type AiGameProfile = GameParam | "generic";

export function resolveAiGameProfile(fileName: string | undefined, risenVariant: "risen1" | "risen2" = "risen1"): AiGameProfile {
  if (!fileName?.trim()) return "generic";
  const game = resolveGameParam(fileName, risenVariant);
  return game === "xenoblade" && !/^(?:bdat|msg_|scenario|menu|system)/i.test(fileName)
    ? "generic" : game;
}

export const AI_PROFILE_NAMES: Record<AiGameProfile, string> = {
  xenoblade: "Xenoblade Chronicles",
  goldensun: "Golden Sun — الجزء الأول",
  goldensun2: "Golden Sun: The Lost Age — الجزء الثاني",
  risen1: "Risen 1",
  risen2: "Risen 2",
  risen3: "Risen 3",
  mother3: "MOTHER 3",
  metroidprime: "Metroid Prime Remastered",
  pokemon: "Pokémon Ruby Destiny",
  platinum: "Pokémon Platinum",
  "pokemon-xp": "Pokémon Unbreakable Ties",
  lumentale: "LumenTale",
  gtaiv: "GTA IV",
  steinsgate: "Steins;Gate",
  crashlands: "Crashlands",
  ninthdawn: "9th Dawn Remake",
  inazuma: "Inazuma Eleven",
  franbow: "Fran Bow",
  twom: "This War of Mine",
  gtasa: "GTA San Andreas",
  generic: "مشروع عام — بدون تعليمات ألعاب أخرى",
};

export const GOLDEN_SUN_AI_PROFILE_PROMPT = [
  "مراجعة ترجمة Golden Sun إلى العربية: التزم بالنص الإنجليزي والقاموس المعتمد،",
  "ولا تخترع شخصيات أو أحداثاً أو مصطلحات من أي لعبة أخرى.",
  "التزم بأسلوب حوارات تقمّص الأدوار والحفاظ على الأسماء والمصطلحات الرسمية.",
  "كل رمز تقني مثل \\x03 و\\x1E و\\x11 وأكواد \\xNN الأخرى يجب أن يبقى حرفياً بالعدد والترتيب نفسه.",
  "لا تضف أو تحذف \\xNN؛ يحفظ المحرك فواصل الحوار ويعيد توزيع الأسطر بالبكسل في مرحلة البناء.",
  "اكتب الحروف العربية العادية غير المعكوسة؛ لا تستخدم Presentation Forms أو علامات BiDi الخفية.",
].join("\n");

export function profileDefaultPrompt(profile: AiGameProfile): string {
  if (profile === "goldensun2") {
    return "اللعبة: Golden Sun: The Lost Age (الجزء الثاني). تأكد من سياق Felix وJenna وSheba والمصطلحات المعتمدة في القاموس.\n" + GOLDEN_SUN_AI_PROFILE_PROMPT;
  }
  if (profile === "goldensun") {
    return "اللعبة: Golden Sun (الجزء الأول). احفظ اتساق Isaac وGaret وIvan وMia والمصطلحات المعتمدة في القاموس.\n" + GOLDEN_SUN_AI_PROFILE_PROMPT;
  }
  if (profile === "generic") {
    return "راجع النص العربي مقابل الأصل. لا تفترض أي لعبة أو أسماء أو رموز غير موجودة في النص أو القاموس. احتفظ بالرموز التقنية كما هي.";
  }
  return "";
}

const ONLY: Record<string, readonly AiGameProfile[]> = {
  detect_risen_gendered_pickup: ["risen1", "risen2", "risen3"],
  detect_risen_line_structure: ["risen1", "risen2", "risen3"],
  detect_pkm_var: ["pokemon"],
  detect_pkm_overflow: ["pokemon"],
  detect_pkm_linebreaks: ["pokemon"],
  detect_pkm_name_consistency: ["pokemon"],
  detect_plat_tags: ["platinum"],
  detect_crashlands_tags: ["crashlands"],
  detect_crashlands_invented_names: ["crashlands"],
  detect_ninthdawn_tags: ["ninthdawn"],
  detect_franbow_tags: ["franbow"],
  detect_twom_tags: ["twom"],
  detect_gtasa_tags: ["gtasa"],
  detect_gtasa_names: ["gtasa"],
  // Golden Sun II: none of these optional QA rules apply to GS1 or other games.
  detect_gs2_control_codes: ["goldensun2"],
  detect_gs2_line_fit: ["goldensun2"],
  detect_gs2_dialogue_voice: ["goldensun2"],
  detect_gs2_names_terms: ["goldensun2"],
  detect_gs2_ui_consistency: ["goldensun2"],
  protect_gs2_rtl_unicode: ["goldensun2"],
  protect_gs2_dialogue_structure: ["goldensun2"],
  // The text of these built-ins contains literal [XENO:n]. Other games
  // must not see it in the rules dialog or in an AI request.
  detect_split_and_tags: ["xenoblade"],
  detect_line_breaks: ["xenoblade"],
};

export function isRuleForAiProfile(ruleId: string, profile: AiGameProfile): boolean {
  const owners = ONLY[ruleId];
  return !owners || owners.includes(profile);
}

export function aiProfileStorageKey(field: "rules" | "custom" | "overrides" | "prompt" | "review" | "feedback", profile: AiGameProfile): string {
  return "aiGameProfile:v1:" + profile + ":" + field;
}

/** User-editable review prompt, stored independently from the universal AI model/API settings. */
export function loadAiProfilePrompt(profile: AiGameProfile): string {
  try { return localStorage.getItem(aiProfileStorageKey("prompt", profile)) ?? ""; }
  catch { return ""; }
}

export function saveAiProfilePrompt(profile: AiGameProfile, value: string): void {
  try {
    if (value.trim()) localStorage.setItem(aiProfileStorageKey("prompt", profile), value);
    else localStorage.removeItem(aiProfileStorageKey("prompt", profile));
  } catch { /* private browsing / storage unavailable */ }
}

/** Compact deterministic fingerprint for a potentially large per-game glossary
 * in the enhancement cache key. Not used for security or authentication.
 */
export function fingerprintAiContext(value: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return value.length.toString(36) + "-" + hash.toString(36);
}
