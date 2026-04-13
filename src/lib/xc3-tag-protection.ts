/**
 * XC3 Tag Protection System
 * Protects technical tags (PUA icons, [Tag:Value], {variables}, control chars)
 * before AI translation and restores them afterward.
 */

export interface ProtectedTag {
  index: number;
  original: string;
  position: number;
}

export interface ProtectedText {
  cleanText: string;
  tags: ProtectedTag[];
}

// Game-specific abbreviations that must NOT be translated
const PROTECTED_ABBREVIATIONS = [
  'EXP', 'PST', 'CP', 'SP', 'HP', 'AP', 'TP', 'WP', 'DP',
  'ATK', 'DEF', 'AGI', 'DEX', 'LUK', 'CRI', 'BLK',
  'DPS', 'DOT', 'AOE', 'HoT', 'MPH',
  'Lv', 'LV', 'MAX', 'DLC', 'NPC', 'QTE', 'UI', 'HUD',
  'KO', 'NG', 'NG\\+',
  'm', 'x', 'g', 'kg', 'km', 'cm', 'mm',
];

// Build regex: match abbreviations as whole words (case-sensitive)
const ABBREV_PATTERN = new RegExp(
  `\\b(${PROTECTED_ABBREVIATIONS.join('|')})\\b`,
  'g'
);

// Patterns to match technical tags in order of priority
const TAG_PATTERNS: RegExp[] = [
  /\[\s*\w+:\w[^\]]*\][^[]*?\[\/\s*\w+:\w[^\]]*\]/g, // Paired tags: [System:Ruby rt=x ]content[/System:Ruby]
  /[\uE000-\uE0FF]+/g,                     // PUA icons (consecutive = atomic block)
  /\d+\s*\\?\[\s*\w+\s*:[^\]]*?\\?\]/g,    // N[Tag:Value] patterns (e.g. 1[XENO:n], 2010[ML:icon icon=copyright])
  /\\?\[\s*\w+\s*:[^\]]*?\\?\]\s*\d+/g,    // [Tag:Value]N patterns
  /\\?\[\s*\/?\s*\w+\s*:[^\]]*?\s*\\?\]/g,          // [Tag:Value] or [/Tag:Value] or \[Tag:Value\]
  /\d+\s*\\?\[[A-Z]{2,10}\\?\]/g,       // N[TAG] patterns BEFORE generic [Word] (e.g. 1[ML])
  /\\?\[[A-Z]{2,10}\\?\]\s*\d+/g,       // [TAG]N patterns BEFORE generic [Word] (e.g. [ML]1)
  /\\?\[\s*[A-Za-z][A-Za-z0-9]*(?:[ '\/-]+[A-Za-z0-9]+)*\s*\\?\]/g, // \[Passive\], \[Arts Seal\], [Lock-On], [XENO]
  /\[\s*\w+\s*=\s*\w[^\]]*\]/g,      // [TAG=Value] patterns (e.g. [Color=Red])
  /\{\s*\w+\s*:\s*\w[^}]*\}/g,        // {TAG:Value} patterns (e.g. {player:name})
  /\{[\w]+\}/g,                           // {variable} placeholders
  /[\uFFF9-\uFFFC]/g,                      // Unicode special markers
  /<[\w\/][^>]*>/g,                        // HTML-like tags
  ABBREV_PATTERN,                            // Game abbreviations (EXP, CP, SP, etc.)
];

/**
 * Extract and replace all technical tags with numbered placeholders.
 * Consecutive PUA sequences are treated as a single atomic block.
 */
export function protectTags(text: string): ProtectedText {
  // Collect all tag matches with their positions
  const matches: { start: number; end: number; original: string }[] = [];

  for (const pattern of TAG_PATTERNS) {
    const regex = new RegExp(pattern.source, pattern.flags);
    let match: RegExpExecArray | null;
    while ((match = regex.exec(text)) !== null) {
      const start = match.index;
      const end = start + match[0].length;
      // Avoid overlapping matches
      const overlaps = matches.some(m => start < m.end && end > m.start);
      if (!overlaps) {
        matches.push({ start, end, original: match[0] });
      }
    }
  }

  // Sort by position
  matches.sort((a, b) => a.start - b.start);

  if (matches.length === 0) {
    return { cleanText: text, tags: [] };
  }

  // Build clean text with placeholders
  const tags: ProtectedTag[] = [];
  let cleanText = '';
  let lastEnd = 0;

  for (let i = 0; i < matches.length; i++) {
    const m = matches[i];
    cleanText += text.slice(lastEnd, m.start);
    const placeholder = `TAG_${i}`;
    cleanText += placeholder;
    tags.push({ index: i, original: m.original, position: m.start });
    lastEnd = m.end;
  }
  cleanText += text.slice(lastEnd);

  return { cleanText, tags };
}

/**
 * Restore original tags from placeholders in translated text.
 */
export function restoreTags(translatedText: string, tags: ProtectedTag[]): string {
  if (tags.length === 0) return translatedText;

  let result = translatedText;
  // Replace in reverse order to maintain correct positions
  for (let i = tags.length - 1; i >= 0; i--) {
    const placeholder = `TAG_${i}`;
    result = result.replace(placeholder, tags[i].original);
  }

  return result;
}
