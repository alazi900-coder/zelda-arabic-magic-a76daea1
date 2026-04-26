import React from "react";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";

export type FilterStatus = "all" | "translated" | "untranslated" | "problems" | "needs-improve" | "too-short" | "too-long" | "stuck-chars" | "mixed-lang" | "has-tags" | "damaged-tags" | "missing-tags" | "fuzzy" | "byte-overflow" | "has-newlines" | "xeno-n-missing" | "excessive-lines" | "byte-budget" | "newline-diff" | "identical-original";

export type FilterTechnical = "all" | "only" | "exclude";

export interface ExtractedEntry {
  msbtFile: string;
  index: number;
  label: string;
  original: string;
  maxBytes: number;
}

export interface EditorState {
  entries: ExtractedEntry[];
  translations: Record<string, string>;
  protectedEntries?: Set<string>;
  glossary?: string;
  technicalBypass?: Set<string>;
  fuzzyScores?: Record<string, number>;
  isDemo?: boolean; // true when showing demo data (no real BDAT file loaded)
}

export interface ReviewIssue {
  key: string;
  severity: 'error' | 'warning' | 'info';
  message: string;
  category?: string;
  suggestion?: string;
  original?: string;
  translation?: string;
}

export interface ReviewSummary {
  total: number;
  errors: number;
  warnings: number;
  checked: number;
}

export interface ReviewResults {
  issues: ReviewIssue[];
  summary: ReviewSummary;
}

export interface ShortSuggestion {
  key: string;
  original: string;
  current: string;
  suggested: string;
  currentBytes: number;
  suggestedBytes: number;
  maxBytes: number;
}

export interface ImproveResult {
  key: string;
  original: string;
  current: string;
  currentBytes: number;
  improved: string;
  reason: string;
  improvedBytes: number;
  maxBytes: number;
}

export interface FileCategory {
  id: string;
  label: string;
  emoji: string;
  icon?: string; // Lucide icon name
  color?: string; // Tailwind color class for icon
}

export const AUTOSAVE_DELAY = 1500;
export const AI_BATCH_SIZE = 5;
export const PAGE_SIZE = 50;
export const INPUT_DEBOUNCE = 300;

// Tag type config for color-coded display
export const TAG_TYPES: Record<string, { label: string; color: string; tooltip: string }> = {
  '\uFFF9': { label: '⚙', color: 'bg-blue-500/20 text-blue-400 border-blue-500/30', tooltip: 'رمز تحكم (إيقاف مؤقت، انتظار، سرعة نص)' },
  '\uFFFA': { label: '🎨', color: 'bg-purple-500/20 text-purple-400 border-purple-500/30', tooltip: 'رمز تنسيق (لون، حجم خط، روبي)' },
  '\uFFFB': { label: '📌', color: 'bg-amber-500/20 text-amber-400 border-amber-500/30', tooltip: 'متغير (اسم اللاعب، عدد، اسم عنصر)' },
};
export const TAG_FALLBACK = { label: '…', color: 'bg-muted text-muted-foreground', tooltip: 'رمز تقني خاص بمحرك اللعبة' };

export const FILE_CATEGORIES: FileCategory[] = [
  // قوائم اللعبة
  { id: "main-menu", label: "القائمة الرئيسية", emoji: "🏠", icon: "Home", color: "text-emerald-400" },
  { id: "settings", label: "الإعدادات", emoji: "⚙️", icon: "Settings", color: "text-slate-400" },
  { id: "hud", label: "واجهة اللعب (HUD)", emoji: "🖥️", icon: "MonitorSmartphone", color: "text-sky-400" },
  { id: "pause-menu", label: "قائمة الإيقاف", emoji: "⏸️", icon: "Pause", color: "text-orange-400" },
  // الأسلحة والمعدات
  { id: "swords", label: "السيوف", emoji: "⚔️", icon: "Sword", color: "text-red-400" },
  { id: "bows", label: "الأقواس", emoji: "🏹", icon: "Target", color: "text-lime-400" },
  { id: "shields", label: "الدروع", emoji: "🛡️", icon: "ShieldCheck", color: "text-blue-400" },
  { id: "armor", label: "الملابس والدروع", emoji: "👕", icon: "Shirt", color: "text-violet-400" },
  // العناصر والمواد
  { id: "materials", label: "المواد والموارد", emoji: "🧪", icon: "FlaskConical", color: "text-teal-400" },
  { id: "food", label: "الطعام والطبخ", emoji: "🍖", icon: "Utensils", color: "text-amber-400" },
  { id: "key-items", label: "الأدوات المهمة", emoji: "🔑", icon: "Key", color: "text-yellow-400" },
  // المحتوى
  { id: "story", label: "حوارات القصة", emoji: "📖", icon: "BookOpen", color: "text-violet-400" },
  { id: "challenge", label: "المهام والتحديات", emoji: "📜", icon: "ScrollText", color: "text-orange-400" },
  { id: "map", label: "المواقع والخرائط", emoji: "🗺️", icon: "Map", color: "text-emerald-400" },
  { id: "tips", label: "النصائح والتعليمات", emoji: "💡", icon: "Lightbulb", color: "text-yellow-400" },
  { id: "character", label: "الشخصيات والأعداء", emoji: "🎭", icon: "Drama", color: "text-rose-400" },
  { id: "npc", label: "حوارات الشخصيات", emoji: "💬", icon: "MessageCircle", color: "text-cyan-400" },
];

// === Danganronpa Categories ===
export const DR_CATEGORIES: FileCategory[] = [
  { id: "dr-system", label: "النظام والإعدادات", emoji: "⚙️", icon: "Settings", color: "text-slate-400" },
  { id: "dr-prologue", label: "المقدمة (Prologue)", emoji: "🎬", icon: "Clapperboard", color: "text-purple-400" },
  { id: "dr-ch1", label: "الفصل 1", emoji: "📖", icon: "BookOpen", color: "text-blue-400" },
  { id: "dr-ch2", label: "الفصل 2", emoji: "📖", icon: "BookOpen", color: "text-cyan-400" },
  { id: "dr-ch3", label: "الفصل 3", emoji: "📖", icon: "BookOpen", color: "text-teal-400" },
  { id: "dr-ch4", label: "الفصل 4", emoji: "📖", icon: "BookOpen", color: "text-emerald-400" },
  { id: "dr-ch5", label: "الفصل 5", emoji: "📖", icon: "BookOpen", color: "text-amber-400" },
  { id: "dr-ch6", label: "الفصل 6", emoji: "📖", icon: "BookOpen", color: "text-red-400" },
  { id: "dr-freetime", label: "الوقت الحر", emoji: "💬", icon: "MessageCircle", color: "text-pink-400" },
  { id: "dr-trial", label: "المحاكمات", emoji: "⚖️", icon: "Shield", color: "text-rose-500" },
  { id: "dr-menu", label: "القوائم والواجهة", emoji: "🖥️", icon: "Monitor", color: "text-sky-400" },
  { id: "dr-items", label: "الأدوات والأدلة", emoji: "🔑", icon: "Key", color: "text-yellow-400" },
  { id: "dr-report", label: "التقارير والملفات", emoji: "📜", icon: "ScrollText", color: "text-orange-400" },
  { id: "dr-characters", label: "الشخصيات", emoji: "🎭", icon: "Drama", color: "text-violet-400" },
];

export function categorizeDanganronpaFile(filePath: string): string {
  const lower = filePath.toLowerCase();
  if (/system|00_system/i.test(lower)) return "dr-system";
  if (/menu|title|config|option|setting|save|load|select/i.test(lower)) return "dr-menu";
  if (/item|evidence|present|bullet|mono_/i.test(lower)) return "dr-items";
  if (/report|profile|skill/i.test(lower)) return "dr-report";
  if (/freetime|free_time|freeact|ft_/i.test(lower)) return "dr-freetime";
  if (/trial|nonstop|debate|hangman|closing|mtb|panic|ptb/i.test(lower)) return "dr-trial";
  if (/chara_name|character/i.test(lower)) return "dr-characters";
  const chapterMatch = lower.match(/(?:^|[:/])e(\d{2})[_:]/);
  if (chapterMatch) {
    const ch = parseInt(chapterMatch[1], 10);
    if (ch === 0) return "dr-prologue";
    if (ch >= 1 && ch <= 6) return `dr-ch${ch}`;
  }
  return "other";
}

// === BDAT (Xenoblade) Game Categories ===
export const BDAT_CATEGORIES: FileCategory[] = [
  { id: "bdat-title-menu", label: "القائمة الرئيسية", emoji: "🏠", icon: "Home", color: "text-emerald-400" },
  { id: "bdat-menu-shop", label: "قوائم المتاجر", emoji: "🛒", icon: "ShoppingCart", color: "text-green-400" },
  { id: "bdat-menu-status", label: "قوائم الحالة والمعدات", emoji: "📊", icon: "BarChart3", color: "text-cyan-400" },
  { id: "bdat-menu", label: "قوائم أخرى", emoji: "🖥️", icon: "Monitor", color: "text-sky-400" },
  { id: "bdat-battle", label: "هجمات وإحصائيات", emoji: "⚔️", icon: "Swords", color: "text-red-400" },
  { id: "bdat-character", label: "الشخصيات والأبطال", emoji: "🧑‍🤝‍🧑", icon: "Users", color: "text-blue-400" },
  { id: "bdat-enemy", label: "الأعداء والوحوش", emoji: "👹", icon: "Skull", color: "text-rose-500" },
  { id: "bdat-weapon", label: "الأسلحة", emoji: "⚔️", icon: "Sword", color: "text-red-400" },
  { id: "bdat-armor", label: "الدروع والإكسسوارات", emoji: "🛡️", icon: "Shield", color: "text-blue-400" },
  { id: "bdat-collectible", label: "المقتنيات والمواد", emoji: "🧪", icon: "FlaskConical", color: "text-teal-400" },
  { id: "bdat-food", label: "الطعام والطبخ", emoji: "🍖", icon: "Utensils", color: "text-amber-400" },
  { id: "bdat-item", label: "أدوات أخرى", emoji: "🎒", icon: "Backpack", color: "text-amber-400" },
  { id: "bdat-hero-quest", label: "مهام الأبطال", emoji: "🦸", icon: "ShieldCheck", color: "text-amber-500" },
  { id: "bdat-quest", label: "المهام والتحديات", emoji: "📜", icon: "ScrollText", color: "text-orange-400" },
  { id: "bdat-colony", label: "المستعمرات والمعسكرات", emoji: "🏕️", icon: "Tent", color: "text-teal-500" },
  { id: "bdat-field", label: "المواقع والخرائط", emoji: "🗺️", icon: "MapPin", color: "text-emerald-400" },
  { id: "bdat-story", label: "حوارات القصة", emoji: "📖", icon: "BookOpen", color: "text-violet-400" },
  { id: "bdat-skill", label: "المهارات والفنون", emoji: "✨", icon: "Sparkles", color: "text-yellow-400" },
  { id: "bdat-buff", label: "التأثيرات والبوفات", emoji: "🔮", icon: "Zap", color: "text-fuchsia-400" },
  { id: "bdat-gem", label: "الجواهر والإكسسوارات", emoji: "💎", icon: "Gem", color: "text-cyan-400" },
  { id: "bdat-class", label: "الفصائل والأدوار", emoji: "🛡️", icon: "Shield", color: "text-indigo-400" },
  { id: "bdat-tips", label: "النصائح والشروحات", emoji: "💡", icon: "Lightbulb", color: "text-lime-400" },
  { id: "bdat-dlc", label: "المحتوى الإضافي (DLC)", emoji: "🎮", icon: "Gamepad2", color: "text-pink-400" },
  { id: "bdat-system", label: "إعدادات النظام", emoji: "⚙️", icon: "Settings", color: "text-slate-400" },
  { id: "bdat-npc",       label: "حوارات NPC",   emoji: "🧑‍🤝‍🧑", icon: "Users",      color: "text-blue-400"   },
  { id: "bdat-event-xc1", label: "حوارات المهام", emoji: "📖", icon: "BookOpen",  color: "text-violet-400" },
  { id: "bdat-misc-xc1",  label: "متفرقات",       emoji: "📁", icon: "FolderOpen", color: "text-gray-400"   },
  { id: "bdat-dialogue", label: "الحوارات والمشاهد", emoji: "🎬", icon: "Clapperboard", color: "text-purple-400" },
  { id: "bdat-cutscene", label: "المشاهد السينمائية", emoji: "🎞️", icon: "Film", color: "text-purple-500" },
  { id: "bdat-event-dialogue", label: "حوارات الأحداث", emoji: "🎭", icon: "Drama", color: "text-indigo-400" },
  { id: "bdat-battlefield-dialogue", label: "حوارات ساحة المعركة", emoji: "⚔️", icon: "Swords", color: "text-red-500" },
  { id: "bdat-quest-dialogue", label: "حوارات المهام القصصية", emoji: "📜", icon: "ScrollText", color: "text-orange-500" },
  { id: "bdat-kizuna-talk", label: "محادثات Heart-to-Heart", emoji: "❤️", icon: "Heart", color: "text-pink-400" },
  { id: "bdat-npc-talk", label: "حوارات الشخصيات (NPC)", emoji: "💬", icon: "MessageCircle", color: "text-cyan-400" },
  { id: "bdat-camp-talk", label: "محادثات المعسكر", emoji: "🏕️", icon: "Tent", color: "text-teal-400" },
  { id: "bdat-message", label: "أرشيف الرسائل", emoji: "💬", icon: "MessageSquare", color: "text-teal-400" },
  { id: "bdat-gimmick", label: "الآليات والألغاز", emoji: "🔧", icon: "Wrench", color: "text-gray-400" },
  { id: "bdat-settings", label: "إعدادات الصوت والعرض", emoji: "🎚️", icon: "SlidersHorizontal", color: "text-fuchsia-400" },
];

// Keywords that identify title screen / main menu text
const TITLE_MENU_KEYWORDS = /^(new game|continue|load game|save game|options|settings|quit|exit|title screen|press any button|difficulty|controls|brightness|language|audio|vibration|game over|retry|return to title)$/i;

// Buff/Debuff/Status effect patterns for content-based detection
const BUFF_CONTENT_RE = /^(attack up|defense up|accuracy up|evasion up|crit rate up|crit damage up|regen|armor veil|power charge|awakening|atk spd up|recharge up|fast blade switch|counter heal|damage armor|invincible|aggro up|decoy|block rate up|max hp up|attack down|defense down|physical def down|ether def down|accuracy down|evasion down|dmg taken up|aggro down|resistance down|maximum hp down|bleed|blaze|toxin|frost|bind|sleep|arts seal|heal bind|target lock|unblockable|pierce|debuff resistance down|debuff resistance|moebius shackles|shackle arts|shackle healing|shackle blocking)$/i;

// Skill/Art patterns for content-based detection
const SKILL_CONTENT_RE = /^(physical arts?|ether arts?|talent art|auto[- ]?attack|cancel attack|chain attack|interlink|heat gauge|overheat|ouroboros order|master arts?|master skills?|soul hack|fusion arts?|role action|class aptitude|combo route|tactical points|completion bonus|overkill)$/i;

// Longer effect descriptions (e.g. "Damage to Toppled enemies ↑")
const BUFF_EFFECT_DESC_RE = /\b(up|down|↑|↓)\s*$/i;
const BUFF_EFFECT_KEYWORDS_RE = /\b(damage to|aggro generated|arts recharge|revive|cancel damage|auto-attack speed|block damage|healing arts|damage dealt|damage taken|chance to|accuracy|movement speed|status effect duration|field effect duration|area of effect|reaction success|break resistance|topple duration|launch duration|daze duration|bleed damage|blaze damage|toxin damage|defender aggro|healer aggro|attacker aggro|first attack|chain attack tp|chain attack multiplier|interlink level|heat build|ouroboros|fusion arts|stance duration)\b/i;

export function isBuffContent(text: string): boolean {
  if (!text) return false;
  const t = text.trim();
  if (BUFF_CONTENT_RE.test(t)) return true;
  // Short-to-medium effect descriptions ending with ↑/↓/up/down
  if (t.split(/\s+/).length <= 8 && BUFF_EFFECT_DESC_RE.test(t) && BUFF_EFFECT_KEYWORDS_RE.test(t)) return true;
  return false;
}

export function isSkillContent(text: string): boolean {
  if (!text) return false;
  return SKILL_CONTENT_RE.test(text.trim());
}

export function isMainMenuText(englishText: string): boolean {
  if (!englishText) return false;
  const trimmed = englishText.trim();
  // Exact match on common title-screen strings
  if (TITLE_MENU_KEYWORDS.test(trimmed)) return true;
  // Short text (≤5 words) containing key phrases
  if (trimmed.split(/\s+/).length <= 5) {
    if (/\b(new game|continue|load|save|quit|exit|title screen|options|settings|controls|brightness|difficulty)\b/i.test(trimmed)) return true;
  }
  return false;
}

export function categorizeBdatTable(label: string, sourceFilename?: string, englishText?: string): string {
  const match = label.match(/^(.+?)\[\d+\]/);
  if (!match) return "other";
  const tbl = match[1];

  // Extract column name from label (part after "].")
  const colMatch = label.match(/\]\s*\.?\s*(.+)/);
  const col = colMatch ? colMatch[1] : "";

  // Step 1: Categorize by table name (prefix + full-name patterns)
  const tblCat = categorizeByTableName(tbl);
  if (tblCat) return tblCat;

  // Step 2: Categorize by column name keywords
  const colCat = categorizeByColumnName(col);
  if (colCat) return colCat;

  // Step 3: Content-based detection for combat subcategories
  // This runs BEFORE filename fallback so hex-hash entries in battle.bdat
  // can be classified as skill/buff based on their English text
  if (englishText) {
    if (isBuffContent(englishText)) return "bdat-buff";
    if (isSkillContent(englishText)) return "bdat-skill";
    if (isMainMenuText(englishText)) return "bdat-title-menu";
  }

  // Step 4: Fallback to source BDAT filename
  if (sourceFilename) {
    const fileCat = categorizeByFilename(sourceFilename);
    if (fileCat) return fileCat;
  }

  return "other";
}

export function categorizeByFilename(filename: string): string | null {
  const f = filename.toLowerCase().replace(/\.bdat$/i, '');
  
  const filenameMap: Record<string, string> = {
    'battle': 'bdat-battle',
    'btl': 'bdat-battle',
    'field': 'bdat-field',
    'fld': 'bdat-field',
    'menu': 'bdat-menu',
    'mnu': 'bdat-menu',
    'shop': 'bdat-menu-shop',
    'hero_quest': 'bdat-hero-quest',
    'hero quest': 'bdat-hero-quest',
    'hro': 'bdat-hero-quest',
    'colony': 'bdat-colony',
    'camp': 'bdat-colony',
    'quest': 'bdat-quest',
    'qst': 'bdat-quest',
    'system': 'bdat-system',
    'sys': 'bdat-system',
    'dlc': 'bdat-dlc',
    'enemy': 'bdat-enemy',
    'ene': 'bdat-enemy',
    'weapon': 'bdat-weapon',
    'wpn': 'bdat-weapon',
    'armor': 'bdat-armor',
    'accessory': 'bdat-armor',
    'collect': 'bdat-collectible',
    'material': 'bdat-collectible',
    'craft': 'bdat-collectible',
    'cook': 'bdat-food',
    'food': 'bdat-food',
    'recipe': 'bdat-food',
    'item': 'bdat-item',
    'itm': 'bdat-item',
    'story': 'bdat-story',
    'event': 'bdat-story',
    'evt': 'bdat-story',
    'character': 'bdat-character',
    'chr': 'bdat-character',
    'skill': 'bdat-skill',
    'art': 'bdat-skill',
    'buff': 'bdat-buff',
    'debuff': 'bdat-buff',
    'status': 'bdat-buff',
    'enhance': 'bdat-buff',
    'aura': 'bdat-buff',
    'gem': 'bdat-gem',
    'class': 'bdat-class',
    'job': 'bdat-class',
    'tips': 'bdat-tips',
    'tutorial': 'bdat-tips',
    'message': 'bdat-message',
    'msg': 'bdat-message',
    'autotalk': 'bdat-message',
    'talk': 'bdat-story',
    'gimmick': 'bdat-gimmick',
    'gmk': 'bdat-gimmick',
    'common': 'bdat-menu',
    'ui': 'bdat-menu',
    'npc': 'bdat-character',
  };
  
  // Exact match
  if (filenameMap[f]) return filenameMap[f];
  
  // Partial match - check if filename contains any key
  for (const [key, cat] of Object.entries(filenameMap)) {
    if (f.includes(key)) return cat;
  }
  
  // Dialogue files: msg_ev*, msg_fev*, msg_ask*, msg_bev*, msg_sev*
  if (/^msg_(ev|fev|ask|bev|sev)\d/i.test(f)) return "bdat-dialogue";
  
  return null;
}

export function categorizeByTableName(tbl: string): string | null {
  const t = tbl.toLowerCase();

  // === XC1 script_msg_ms.bdat — فئات ناقصة ===
  if (/^\d{4}c\d+(am|pm)_ms$/i.test(t)) return "bdat-npc";       // حوارات NPC: 0101c1am_ms
  if (/^\d{4}t\d+(am|pm)?_ms$/i.test(t)) return "bdat-npc";      // NPC كبير: 2501t1am_ms
  if (/^\d{4}e\d+_ms$/i.test(t)) return "bdat-event-xc1";        // حوارات المهام: 0101e1_ms
  if (/^\d{4}(f|m\d?)_ms$/i.test(t)) return "bdat-misc-xc1";     // متفرقات: 0101f_ms

  // === القائمة الرئيسية (title screen & core menus) — must be checked FIRST ===
  if (/^msg_mnu_(common_ms|title|save|load|option|config)/i.test(tbl)) return "bdat-title-menu";

  // === النصائح والشروحات — must be checked BEFORE generic menu catch-all ===
  if (/^(tip_|hlp_|tut_|mnu_tutorial)/i.test(tbl)) return "bdat-tips";
  if (/^msg_mnu_tutorial/i.test(tbl)) return "bdat-tips";

  // === محادثات Heart-to-Heart (Kizuna Talk) — XC3 script_msg tables ===
  // أمثلة: addkizunatalk001_ms, kizunatalk_ms, kzn_talk_xxx
  if (/^(addkizunatalk|kizunatalk|kzn_?talk|heart_?to_?heart|h2h_?talk)/i.test(tbl)) return "bdat-kizuna-talk";

  // === محادثات المعسكر (Camp Talk) ===
  // أمثلة: addcamptalk001_ms, camptalk_xxx_ms, camp_talk_ms
  if (/^(addcamptalk|camptalk|camp_?talk|camp_?msg)/i.test(tbl)) return "bdat-camp-talk";

  // === حوارات NPC (Field NPC dialogue) ===
  // أمثلة: addnpctalk001_ms, npctalk_xxx_ms, talk_npc_xxx
  if (/^(addnpctalk|npctalk|talk_?npc|fld_?npctalk_?ms|addnpc_?talk)/i.test(tbl)) return "bdat-npc-talk";

  // === المشاهد السينمائية (Cutscenes / Visual Scene dialogue) ===
  // أمثلة: vs01070100_ms, vs02110100_ms — جداول الحوارات الموجودة في المشاهد السينمائية
  if (/^vs\d{2,}/i.test(tbl)) return "bdat-cutscene";
  if (/^(scene|cutscene|cinematic|movie|demo)_?\d/i.test(tbl)) return "bdat-cutscene";

  // === حوارات ساحة المعركة (Battle Field dialogue) ===
  // أمثلة: bf01010100_ms, bf03020100_ms — حوارات تظهر أثناء/قبل المعارك
  if (/^bf\d{2,}/i.test(tbl)) return "bdat-battlefield-dialogue";

  // === حوارات الأحداث (Event dialogue) ===
  // أمثلة: ev01010100_ms, ev02030100_ms — حوارات الأحداث القصصية والجانبية
  if (/^ev\d{2,}/i.test(tbl)) return "bdat-event-dialogue";

  // === حوارات المهام القصصية (Quest dialogue tables in script_msg) ===
  // أمثلة: qst001301_ms, qst020602_ms — أرقام المهام
  if (/^qst\d{3,}/i.test(tbl)) return "bdat-quest-dialogue";


  // === قوائم المتاجر ===
  if (/^mnu_shop/i.test(tbl) || /mnu_shop/i.test(tbl)) return "bdat-menu-shop";
  if (/^msg_mnu_shop/i.test(tbl)) return "bdat-menu-shop";
  
  // === قوائم الحالة والمعدات ===
  if (/^mnu_(status|equip|class|hero|gem|weapon|armor|item|collect|achievement)/i.test(tbl)) return "bdat-menu-status";
  if (/^msg_mnu_(status|equip|class|hero|gem|weapon|armor|item|collect|achievement)/i.test(tbl)) return "bdat-menu-status";
  
  // === قوائم أخرى ===
  if (/^mnu_/i.test(tbl) || /^menu$/i.test(tbl)) return "bdat-menu";
  if (/mnu_option|mnu_msg|mnu_name|mnu_camp|mnu_map|mnu_battle|mnu_quest|mnu_system|mnu_filter|mnu_sort|mnu_font|mnu_res|mnu_layer|mnu_text/i.test(tbl)) return "bdat-menu";

  // === المهارات والفنون (must check before generic btl_) ===
  if (/^btl_(skill|art|arts|spc|talent|master)/i.test(tbl)) return "bdat-skill";

  // === التأثيرات والبوفات (must check before generic btl_) ===
  if (/^btl_(buff|debuff|enhance|aura|status|condition|effect)/i.test(tbl)) return "bdat-buff";

  // === نظام القتال (هجمات وإحصائيات) ===
  if (/^btl_/i.test(tbl) || /^(rsc_|wpn_)/i.test(tbl)) return "bdat-battle";

  // === المستعمرات والمعسكرات ===
  if (/^(colony_|camp_|fld_colony|fld_camp)/i.test(tbl)) return "bdat-colony";

  // === الشخصيات ===
  if (/^chr_/i.test(tbl) || /^(fld_npc|fld_mob|fld_kizuna)/i.test(tbl)) return "bdat-character";

  // === الأعداء ===
  if (/^(ene_|emt_|fld_enemy|fld_unique|btl_en)/i.test(tbl)) return "bdat-enemy";

  // === الأسلحة ===
  if (/^(itm_weapon|itm_wpn|wpn_)/i.test(tbl)) return "bdat-weapon";
  // === الدروع والإكسسوارات ===
  if (/^(itm_armor|itm_acc|itm_equip)/i.test(tbl)) return "bdat-armor";
  // === المقتنيات والمواد ===
  if (/^(itm_collect|itm_material|itm_craft|itm_pouch|fld_collect|fld_salvage)/i.test(tbl)) return "bdat-collectible";
  // === الطعام والطبخ ===
  if (/^(itm_cook|itm_food|itm_recipe|itm_meal)/i.test(tbl)) return "bdat-food";
  // === أدوات أخرى ===
  if (/^(itm_|fld_tbox)/i.test(tbl)) return "bdat-item";

  // === مهام الأبطال (Hero Quests) - must check before generic quest ===
  if (/^(qst_hero|qst_hro|hero_quest|hro_)/i.test(tbl)) return "bdat-hero-quest";

  // === المهام ===
  if (/^(qst_|tsk_)/i.test(tbl)) return "bdat-quest";

  // === الأحداث والقصة ===
  if (/^(evt_|tlk_|fld_talk|fld_event)/i.test(tbl)) return "bdat-story";
  // msg_ sub-categories (check specific prefixes before generic msg_)
  if (/^msg_mnu_(shop)/i.test(tbl)) return "bdat-menu-shop";
  if (/^msg_mnu_(status|equip|class|hero|gem|weapon|armor|item|collect|achievement)/i.test(tbl)) return "bdat-menu-status";
  if (/^msg_mnu_/i.test(tbl)) return "bdat-menu";
  // msg_btl_ sub-categories: skill/buff BEFORE generic battle catch-all
  if (/^msg_btl_.*(skill|art|arts|talent|master|spc)/i.test(tbl)) return "bdat-skill";
  if (/^msg_btl_.*(buff|debuff|status|enhance|aura|condition|effect)/i.test(tbl)) return "bdat-buff";
  if (/^msg_btl_/i.test(tbl)) return "bdat-battle";
  if (/^msg_fld_/i.test(tbl)) return "bdat-character";
  if (/^msg_qst_hero/i.test(tbl)) return "bdat-hero-quest";
  if (/^msg_qst_/i.test(tbl)) return "bdat-quest";
  if (/^msg_item_.*(weapon|wpn|sword|blade)/i.test(tbl)) return "bdat-weapon";
  if (/^msg_item_.*(armor|acc|equip)/i.test(tbl)) return "bdat-armor";
  if (/^msg_item_.*(collect|material|craft|pouch)/i.test(tbl)) return "bdat-collectible";
  if (/^msg_item_.*(cook|food|recipe|meal)/i.test(tbl)) return "bdat-food";
  if (/^msg_item_/i.test(tbl)) return "bdat-item";
  if (/^msg_enemy_/i.test(tbl)) return "bdat-enemy";
  if (/^msg_colony_/i.test(tbl)) return "bdat-colony";
  if (/^msg_camp_/i.test(tbl)) return "bdat-colony";
  if (/^msg_comspot_/i.test(tbl)) return "bdat-field";
  if (/^msg_extra_/i.test(tbl)) return "bdat-dlc";
  // Dialogue / cutscene files: msg_ev*, msg_fev*, msg_ask*, msg_bev*
  if (/^msg_(ev|fev|ask|bev|sev)\d/i.test(tbl)) return "bdat-dialogue";
  if (/^msg_/i.test(tbl)) return "bdat-message";

  // === المحتوى الإضافي ===
  if (/^dlc_/i.test(tbl)) return "bdat-dlc";

  // === أرشيف الرسائل ===
  if (/^(ma_)/i.test(tbl)) return "bdat-message";

  // === إعدادات النظام ===
  if (/^sys_/i.test(tbl)) return "bdat-system";

  // === الآليات (gimmick tables - lowercase without prefix) ===
  if (/^(gimmick|gmk_)/i.test(tbl)) return "bdat-gimmick";

  // === المواقع والخرائط ===
  if (/^(fld_map|fld_land|fld_location|fld_area|fld_camp|fld_colony|fld_weather)/i.test(tbl)) return "bdat-field";

  // === المهارات ===
  if (/^(skl_|art_|spc_)/i.test(tbl)) return "bdat-skill";

  // === التأثيرات والبوفات ===
  if (/^(buff_|debuff_|status_|aura_|enhance_|condition_)/i.test(tbl)) return "bdat-buff";

  // === الجواهر ===
  if (/^(gem_|acc_|orb_)/i.test(tbl)) return "bdat-gem";

  // === الفصائل ===
  if (/^(job_|rol_|cls_)/i.test(tbl)) return "bdat-class";

  // === النصائح (remaining patterns — tut_/hlp_/tip_/mnu_tutorial already caught above) ===
  if (/^sys_(tips|loading)/i.test(tbl)) return "bdat-tips";

  // === FLD_ عام (catch-all for remaining FLD_ tables) ===
  if (/^fld_/i.test(tbl)) return "bdat-field";

  // === BGM ===
  if (/^bgm/i.test(tbl)) return "bdat-system";

  // === RSC_ (Resource tables - typically system/menu) ===
  if (/^rsc_/i.test(tbl)) return "bdat-system";

  // === Hex hash names (unresolved) - try to classify by context ===
  // These are like "0xABC123" - can't categorize by table name
  if (/^0x[0-9a-f]+$/i.test(tbl)) return null; // fall through to column check

  return null;
}

export function categorizeByColumnName(columnName: string): string | null {
  if (!columnName || /^0x[0-9a-f]+$/i.test(columnName)) return null;
  const col = columnName.toLowerCase();

  // قوائم المتاجر
  if (/shop|price|buy|sell|trade|exchange/i.test(col) && !/enemy/i.test(col)) return "bdat-menu-shop";
  // قوائم الحالة
  if (/^(status|equip|loadout|formation)/i.test(columnName)) return "bdat-menu-status";
  // القوائم والواجهة - UI column patterns
  if (/^(msg_caption|msgidcaption|caption|windowtitle|btncaption|menucategory|menugroup|menuicon|menupriority|optiontext|overwritetext|pagetitle|filtern|sortn)/i.test(columnName)) return "bdat-menu";
  if (/window|btn|layout|menu(?!mapimage)/i.test(col) && !/enemy|battle/i.test(col)) return "bdat-menu";

  // المهام والقصص - Quest/Story column patterns
  if (/^(msg_info|msgidinfo|questcategory|questflag|questid|questimage|purposeicon|nextpurpose|taskui|linqquest)/i.test(columnName)) return "bdat-quest";
  if (/task|purpose|summary|quest|scenario/i.test(col)) return "bdat-quest";

  // المواقع - Location column patterns
  if (/^(locationname|locationid|locationbdat|colonyid|mapid|mapinfo|mapjump|areainfo|arealist|landmark)/i.test(columnName)) return "bdat-field";
  if (/landmark|colony(?!flag)|area(?!ffect)/i.test(col) && !/enemy/i.test(col)) return "bdat-field";

  // الأسلحة
  if (/^(weapon|wpn|sword|blade)/i.test(columnName)) return "bdat-weapon";
  // الدروع والإكسسوارات
  if (/^(armor|accessory|equiptype|shield)/i.test(columnName)) return "bdat-armor";
  // المقتنيات والمواد
  if (/^(material|pouch|collect|craft|salvage)/i.test(columnName)) return "bdat-collectible";
  // الطعام
  if (/^(recipe|cook|food|meal|ingredient)/i.test(columnName)) return "bdat-food";
  // أدوات أخرى
  if (/^(itm|gem|price)/i.test(columnName)) return "bdat-item";

  // النصائح والشروحات - Tips/Tutorial column patterns
  if (/tutorial|tips?_|howto|hint|help_text|loading_?tip/i.test(col)) return "bdat-tips";

  // التأثيرات والبوفات - Buff/Debuff/Status column patterns
  if (/buff|debuff|status_?effect|enhance_?effect|aura_?effect|condition_?name/i.test(col)) return "bdat-buff";

  // الإعدادات - Settings column patterns
  if (/^(voice|audio|config|option(?!text)|setting|display|brightness|camera|sound|formation|notice|message$)/i.test(columnName)) return "bdat-settings";

  // أسماء/أوصاف عامة - try to infer from common text columns
  // Msg_Name, Msg_Detail, Msg_Help, Name, DebugName, DescText, DetailText, etc.
  // These are too generic to categorize - leave as "other"

  return null;
}

// Check if text contains technical tag markers (PUA, control chars, [Tag:...], [/Tag:...], N[TAG], [TAG]N, [TAG=Value], {TAG:Value})
export function hasTechnicalTags(text: string): boolean {
  return /[\uFFF9\uFFFA\uFFFB\uFFFC\uE000-\uE0FF]/.test(text)
    || /\[\s*\/?\s*\w+\s*:[^\]]*\]/.test(text)
    || /\d+\s*\[[A-Z]{2,10}\]/.test(text)
    || /\[[A-Z]{2,10}\]\s*\d+/.test(text)
    || /\\?\[\s*[A-Za-z][A-Za-z0-9]*(?:[ '\/-]+[A-Za-z0-9]+)*\s*\\?\]/.test(text)
    || /\[\s*\w+\s*=\s*\w[^\]]*\]/.test(text)
    || /\{\s*\w+\s*:\s*\w[^}]*\}/.test(text);
}

// Re-export from dedicated module for backward compatibility
export { restoreTagsLocally, previewTagRestore } from "@/lib/xc3-tag-restoration";

// Sanitize original text: replace binary tag markers with color-coded, tooltipped badges
export function displayOriginal(text: string): React.ReactNode {
  // Split on PUA, control chars, AND [Tag:...] / [/Tag:...] patterns
  const regex = /([\uFFF9\uFFFA\uFFFB\uFFFC\uE000-\uE0FF\u0000-\u0008\u000E-\u001F]+|\[\s*\/?\s*\w+\s*:[^\]]*\])/g;
  const parts = text.split(regex);
  if (parts.length === 1 && !regex.test(text)) return text;
  const elements: React.ReactNode[] = [];
  let keyIdx = 0;
  let mlCounter = 0;
  for (const part of parts) {
    if (!part) continue;
    const firstCode = part.charCodeAt(0);

    // [Tag:Value] / [/Tag:Value] format tags (e.g. [ML:undisp ], [/System:Ruby])
    if (/^\[\s*\/?\s*\w+\s*:[^\]]*\]$/.test(part)) {
      mlCounter++;
      const tagContent = part.slice(1, -1); // Remove brackets
      const tagType = tagContent.split(':')[0]; // e.g. "ML"
      elements.push(
        <Tooltip key={keyIdx++}>
          <TooltipTrigger asChild>
            <span className="inline-block px-1 rounded border text-xs cursor-help mx-0.5 bg-purple-500/20 text-purple-400 border-purple-500/30">
              [{tagType}]{mlCounter > 0 ? mlCounter : ''}
            </span>
          </TooltipTrigger>
          <TooltipContent side="top" className="max-w-xs text-xs">
            <div className="font-mono text-[10px] opacity-70">{part}</div>
            <div>وسم محرك اللعبة — لا تحذفه أو تعدّله</div>
          </TooltipContent>
        </Tooltip>
      );
      continue;
    }

    // PUA markers (E000-E0FF) — render each one as an individual numbered badge
    if (firstCode >= 0xE000 && firstCode <= 0xE0FF) {
      for (let ci = 0; ci < part.length; ci++) {
        const code = part.charCodeAt(ci);
        if (code >= 0xE000 && code <= 0xE0FF) {
          const tagNum = code - 0xE000 + 1;
          elements.push(
            <Tooltip key={keyIdx++}>
              <TooltipTrigger asChild>
                <span className="inline-block px-1 rounded border text-xs cursor-help mx-0.5 bg-blue-500/20 text-blue-400 border-blue-500/30">
                  🏷{tagNum}
                </span>
              </TooltipTrigger>
              <TooltipContent side="top" className="max-w-xs text-xs">
                رمز تحكم #{tagNum} — أيقونة زر أو تنسيق (لا تحذفه)
              </TooltipContent>
            </Tooltip>
          );
        }
      }
      continue;
    }
    // Legacy FFF9-FFFC markers or other control chars
    const tagType = TAG_TYPES[part[0]] || (part.match(/[\uFFF9\uFFFA\uFFFB\uFFFC\u0000-\u0008\u000E-\u001F]/) ? TAG_FALLBACK : null);
    if (tagType) {
      elements.push(
        <Tooltip key={keyIdx++}>
          <TooltipTrigger asChild>
            <span className={`inline-block px-1 rounded border text-xs cursor-help mx-0.5 ${tagType.color}`}>
              {tagType.label}
            </span>
          </TooltipTrigger>
          <TooltipContent side="top" className="max-w-xs text-xs">
            {tagType.tooltip}
          </TooltipContent>
        </Tooltip>
      );
      continue;
    }
    elements.push(<React.Fragment key={keyIdx++}>{part}</React.Fragment>);
  }
  return elements;
}

export function categorizeFile(filePath: string): string {
  // === قوائم اللعبة ===
  if (/LayoutMsg\/(Title|Boot|Save|Load|GameOver|Opening|Ending)/i.test(filePath)) return "main-menu";
  if (/LayoutMsg\/(Option|Config|Setting|System|Language|Control|Camera|Sound)/i.test(filePath)) return "settings";
  if (/LayoutMsg\/(Pause|Menu|Pouch|Inventory|Equipment|Status)/i.test(filePath)) return "pause-menu";
  if (/LayoutMsg\//i.test(filePath)) return "hud";
  
  // === الأسلحة والمعدات ===
  if (/ActorMsg\/(Weapon_Sword|Weapon_Lsword|Weapon_SmallSword)/i.test(filePath)) return "swords";
  if (/ActorMsg\/Weapon_Bow/i.test(filePath)) return "bows";
  if (/ActorMsg\/Weapon_Shield/i.test(filePath)) return "shields";
  if (/ActorMsg\/Armor/i.test(filePath)) return "armor";
  
  // === العناصر والمواد ===
  if (/ActorMsg\/Item_Material/i.test(filePath)) return "materials";
  if (/ActorMsg\/(Item_Cook|Item_Fruit|Item_Mushroom|Item_Fish|Item_Meat|Item_Plant)/i.test(filePath)) return "food";
  if (/ActorMsg\/(PouchContent|Item_Key|Item_Ore|Item_Enemy|Item_Insect|Item_)/i.test(filePath)) return "key-items";
  
  // === المحتوى ===
  if (/EventFlowMsg\/(Npc|Demo_Npc)/i.test(filePath)) return "npc";
  if (/EventFlowMsg\//i.test(filePath)) return "story";
  if (/ChallengeMsg\//i.test(filePath)) return "challenge";
  if (/LocationMsg\//i.test(filePath)) return "map";
  if (/StaticMsg\/(Tips|GuideKeyIcon)\.msbt/i.test(filePath)) return "tips";
  if (/ActorMsg\/Enemy/i.test(filePath)) return "character";
  if (/ActorMsg\//i.test(filePath)) return "character";
  
  return "other";
}

// Re-export from canonical source to avoid duplication
export { isArabicChar, hasArabicChars, reverseBidi as unReverseBidi } from "@/lib/arabic-processing";

export function isTechnicalText(text: string): boolean {
  const t = text.trim();
  if (!t) return true;
  // Pure hex/numeric/path-like identifiers (e.g. "a1b2c3", "path/to/file")
  if (/^[0-9A-Fa-f\-\._:\/]+$/.test(t)) return true;
  // camelCase or snake_case identifiers (e.g. "getItemName", "item_name")
  if (/^[a-z]+([A-Z][a-z]*)+$|^[a-z]+(_[a-z]+)+$/.test(t)) return true;
  // Short alphanumeric codes (e.g. zY1, yY1, xA3) — not real sentences
  if (/^[a-zA-Z0-9]{1,6}$/.test(t) && !/^[A-Z][a-z]{2,}$/.test(t)) return true;
  // File paths (e.g. \path\to\file or /path/to/file)
  if (/[\\/][\w\-]+[\\/]/i.test(t) && !/\s/.test(t)) return true;
  // Text that is ONLY tags with no real translatable content
  const strippedTags = t
    .replace(/\[\s*\/?\s*\w+\s*:[^\]]*\]/g, '')   // [Tag:Value]
    .replace(/\[\s*\w+\s*=\s*\w[^\]]*\]/g, '')     // [Tag=Value]
    .replace(/<[^>]+>/g, '')                         // <html-like>
    .replace(/\{[\w:]+\}/g, '')                      // {variable}
    .replace(/[\uE000-\uE0FF\uFFF9-\uFFFC]/g, '')  // PUA/control chars
    .trim();
  if (strippedTags.length === 0) return true;
  // Very short text that is ONLY special characters (no letters)
  if (t.length < 6 && !/[a-zA-Z\u0600-\u06FF\u3040-\u30FF\u4E00-\u9FFF]/.test(t)) return true;
  return false;
}

export function entryKey(entry: ExtractedEntry): string {
  return `${entry.msbtFile}:${entry.index}`;
}
