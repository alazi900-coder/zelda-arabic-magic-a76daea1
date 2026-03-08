import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// --- Tag Protection: replace technical tags + abbreviations with TAG_N placeholders ---
const PROTECTED_ABBREVIATIONS = [
  'EXP', 'PST', 'CP', 'SP', 'HP', 'AP', 'TP', 'WP', 'DP',
  'ATK', 'DEF', 'AGI', 'DEX', 'LUK', 'CRI', 'BLK',
  'DPS', 'DOT', 'AOE', 'HoT', 'MPH',
  'Lv', 'LV', 'MAX', 'DLC', 'NPC', 'QTE', 'UI', 'HUD',
  'KO', 'NG', 'NG\\+',
  'm', 'x', 'g', 'kg', 'km', 'cm', 'mm',
];
const ABBREV_PATTERN = new RegExp(`\\b(${PROTECTED_ABBREVIATIONS.join('|')})\\b`, 'g');

function protectTags(text: string): { cleaned: string; tags: Map<string, string> } {
  const tags = new Map<string, string>();
  let counter = 0;

  // First: shield literal newlines as NEWLINE_N placeholders
  const nlParts = text.split('\n');
  let shielded = text;
  if (nlParts.length > 1) {
    const nlFragments: string[] = [];
    for (let i = 0; i < nlParts.length; i++) {
      nlFragments.push(nlParts[i]);
      if (i < nlParts.length - 1) {
        const placeholder = `NEWLINE_${counter}`;
        tags.set(placeholder, '\n');
        nlFragments.push(` ${placeholder} `);
        counter++;
      }
    }
    shielded = nlFragments.join('');
  }

  const patterns: RegExp[] = [
    /[\uE000-\uE0FF]+/g,                     // PUA icons (consecutive = atomic block)
    /\[\s*\w+\s*:[^\]]*?\s*\]/g,                     // [Tag:Value] only (no trailing parentheses)
    /\d+\s*\[[A-Z]{2,10}\]/g,              // N[TAG] patterns (e.g. 1[ML], 1 [ML])
    /\[[A-Z]{2,10}\]\s*\d+/g,              // [TAG]N patterns (e.g. [ML]1, [ML] 1)
    /\[\s*\w+\s*=\s*\w[^\]]*\]/g,       // [TAG=Value] patterns (e.g. [Color=Red])
    /\{\s*\w+\s*:\s*\w[^}]*\}/g,         // {TAG:Value} patterns (e.g. {player:name})
    /\{[\w]+\}/g,                            // {variable} placeholders
    /[\uFFF9-\uFFFC]/g,                       // Unicode special markers
    /<[\w\/][^>]*>/g,                         // HTML-like tags
    // Removed: standalone descriptive parentheses - these are translatable content
    ABBREV_PATTERN,                             // Game abbreviations
  ];

  // Collect all matches
  const matches: { start: number; end: number; original: string }[] = [];
  for (const pattern of patterns) {
    const regex = new RegExp(pattern.source, pattern.flags);
    let match: RegExpExecArray | null;
    while ((match = regex.exec(shielded)) !== null) {
      const start = match.index;
      const end = start + match[0].length;
      const overlaps = matches.some(m => start < m.end && end > m.start);
      if (!overlaps) {
        matches.push({ start, end, original: match[0] });
      }
    }
  }
  matches.sort((a, b) => a.start - b.start);

  if (matches.length === 0) return { cleaned: shielded, tags };

  let cleaned = '';
  let lastEnd = 0;
  for (const m of matches) {
    cleaned += shielded.slice(lastEnd, m.start);
    const placeholder = `TAG_${counter}`;
    tags.set(placeholder, m.original);
    cleaned += placeholder;
    counter++;
    lastEnd = m.end;
  }
  cleaned += shielded.slice(lastEnd);

  return { cleaned, tags };
}

/** Normalize malformed TAG_N variants that AI engines may produce */
function normalizeTagPlaceholders(text: string): string {
  return text
    .replace(/TAG\s*[-:_]?\s*_?(\d+)/gi, 'TAG_$1')    // TAG-0, TAG:0, TAG 0, TAG _0
    .replace(/(?<!\w)TAG(\d+)(?!\w)/gi, 'TAG_$1')      // TAG0 -> TAG_0
    .replace(/tag_(\d+)/g, 'TAG_$1')                    // tag_0 -> TAG_0
    .replace(/[\[{(<]\s*TAG\s*[_\s-:]?(\d+)\s*[\]})>]/gi, 'TAG_$1') // [TAG_0] -> TAG_0
    .replace(/NEWLINE\s*[-:_]?\s*_?(\d+)/gi, 'NEWLINE_$1')  // Normalize NEWLINE variants
    .replace(/newline_(\d+)/g, 'NEWLINE_$1');                // lowercase -> uppercase
}

/** Normalize locked term placeholders (⟪T0⟫) without converting them to TAG_N */
function normalizeLockedTermPlaceholders(text: string): string {
  return text
    .replace(/[《〈«]/g, '⟪')
    .replace(/[》〉»]/g, '⟫')
    .replace(/[⟪]\s*T\s*[-:_]?\s*(\d+)\s*[⟫]/gi, '⟪T$1⟫');
}

function restoreTags(text: string, tags: Map<string, string>): string {
  let result = text;
  // Restore NEWLINE_N placeholders first (they may have spaces around them from protection)
  for (const [placeholder, original] of tags) {
    if (placeholder.startsWith('NEWLINE_')) {
      // Remove optional surrounding spaces that were added during protection
      result = result.replace(new RegExp(`\\s*${placeholder}\\s*`, 'g'), original);
    }
  }
  // Then restore TAG_N placeholders
  for (const [placeholder, original] of tags) {
    if (!placeholder.startsWith('NEWLINE_')) {
      const escaped = placeholder.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      result = result.replace(new RegExp(escaped, 'g'), original);
    }
  }
  return result;
}

function stripUnexpectedPlaceholders(text: string, allowedPlaceholders: Set<string>): string {
  return text
    .replace(/\b(?:TAG|NEWLINE)_\d+\b/g, (match) => (allowedPlaceholders.has(match) ? match : ''))
    .replace(/[⟪《〈«]\s*T\s*[-:_]?\s*\d+\s*[⟫》〉»]/gi, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

let _rebalanceNewlines = false;
let _npcMaxLines: number | undefined = undefined;

/** Check if an entry key belongs to an NPC dialogue file */
function isNpcDialogue(key: string): boolean {
  return /\bmsg_(ask|cq|fev|nq|sq|tlk|tq)\b/i.test(key);
}

function restoreAndEnforce(original: string, translated: string, tags: Map<string, string>, entryKey?: string): string {
  const restored = restoreTags(translated, tags);
  const enforced = enforceTagIntegrity(original, restored);

  // NPC dialogue: limit lines (configurable, default 2)
  const maxLines = entryKey && isNpcDialogue(entryKey) ? (_npcMaxLines ?? 2) : undefined;

  // Check if original had real newlines (NEWLINE_N tags exist)
  const hasOriginalNewlines = [...tags.keys()].some(k => k.startsWith('NEWLINE_'));
  if (hasOriginalNewlines && !_rebalanceNewlines) {
    // Preserve structural newlines but still remove orphan lines
    const preserved = fixOrphansPreservingNewlines(enforced);
    // If NPC and too many lines, rebalance with maxLines
    if (maxLines && preserved.split('\n').length > maxLines) {
      return balanceLines(enforced, maxLines);
    }
    return preserved;
  }

  return balanceLines(enforced, maxLines);
}

/** Tag shielding: replace technical tags with short placeholders for balanced splitting */
const TAG_SHIELD_PATTERN = /[\uE000-\uE0FF]+|\[\s*\w+\s*:[^\]]*?\s*\]|[\uFFF9-\uFFFC]+/g;

interface ShieldResult {
  shielded: string;
  map: Map<string, { placeholder: string; original: string; displayLen: number }>;
}

function shieldTagsForBalance(text: string): ShieldResult {
  const map = new Map<string, { placeholder: string; original: string; displayLen: number }>();
  let idx = 0;
  const shielded = text.replace(TAG_SHIELD_PATTERN, (match) => {
    const placeholder = `◆${idx}◆`;
    map.set(placeholder, { placeholder, original: match, displayLen: match.length });
    idx++;
    return placeholder;
  });
  return { shielded, map };
}

function unshieldTagsAfterBalance(text: string, map: Map<string, { placeholder: string; original: string; displayLen: number }>): string {
  let result = text;
  for (const [placeholder, info] of map) {
    result = result.replace(placeholder, info.original);
  }
  return result;
}

/** Split long lines into balanced chunks using DP optimization */
const TARGET_MIN = 38;
const TARGET_MAX = 42;
const HARD_MAX = 48;

function balanceLines(text: string, maxLines?: number): string {
  // Strip AI-inserted newlines and re-balance
  const stripped = text.replace(/\n/g, ' ').replace(/\s{2,}/g, ' ').trim();

  // Shield technical tags so they're treated as atomic tokens
  const { shielded, map } = shieldTagsForBalance(stripped);

  // Don't touch short text (use real display length accounting for tag sizes)
  let displayLen = shielded.length;
  for (const [placeholder, info] of map) {
    // Adjust: placeholder length was counted, replace with real tag display length
    displayLen += info.displayLen - placeholder.length;
  }
  if (displayLen <= TARGET_MAX) return stripped;

  const words = shielded.split(/\s+/).filter(w => w.length > 0);
  if (words.length < 2) return stripped;

  // Build a display-length function for words that accounts for tag real lengths
  const wordDisplayLen = (w: string): number => {
    let len = w.length;
    for (const [placeholder, info] of map) {
      if (w.includes(placeholder)) {
        len += info.displayLen - placeholder.length;
      }
    }
    return len;
  };

  const totalLen = words.reduce((s, w) => s + wordDisplayLen(w), 0) + (words.length - 1);
  let numLines = Math.max(2, Math.ceil(totalLen / TARGET_MAX));

  // Enforce maxLines cap if provided
  if (maxLines && maxLines > 0) {
    numLines = Math.min(numLines, maxLines);
  }

  // Try line counts from numLines to numLines+1, pick the best
  let bestResult: string[] | null = null;
  let bestCost = Infinity;

  const upperBound = maxLines ? Math.min(numLines, maxLines) : Math.min(numLines + 1, words.length);
  for (let nLines = numLines; nLines <= upperBound; nLines++) {
    const result = dpSplitShielded(words, nLines, wordDisplayLen);
    if (result) {
      const cost = scoreSplit(result.map(line => {
        // For scoring, compute display length
        const displayLine = line.split(/\s+/).map(w => 'x'.repeat(wordDisplayLen(w))).join(' ');
        return displayLine;
      }));
      if (cost < bestCost) {
        bestCost = cost;
        bestResult = result;
      }
    }
  }

  if (!bestResult) return stripped;

  // Post-pass: fix orphan lines (single-word middle lines)
  bestResult = fixOrphans(bestResult);

  // Unshield: restore original tags
  return bestResult.map(line => unshieldTagsAfterBalance(line, map)).join('\n');
}

/** DP split that uses display-length function for tag-aware balancing */
function dpSplitShielded(words: string[], nLines: number, wordDisplayLen: (w: string) => number): string[] | null {
  const n = words.length;
  if (n < nLines) return null;

  const lineLen = (from: number, to: number): number => {
    let len = 0;
    for (let k = from; k < to; k++) {
      len += wordDisplayLen(words[k]) + (k > from ? 1 : 0);
    }
    return len;
  };

  const totalLen = lineLen(0, n);
  const ideal = totalLen / nLines;

  const INF = 1e18;
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array(nLines + 1).fill(INF));
  const choice: number[][] = Array.from({ length: n + 1 }, () => new Array(nLines + 1).fill(0));

  dp[0][0] = 0;

  for (let k = 1; k <= nLines; k++) {
    for (let i = k; i <= n; i++) {
      for (let j = k - 1; j < i; j++) {
        const ll = lineLen(j, i);
        if (ll > HARD_MAX && i - j > 1) continue;

        const deviation = ll - ideal;
        let cost = deviation * deviation;

        const wordCount = i - j;
        const isMiddleLine = k > 1 && k < nLines;
        // Count lexical words (excluding tag placeholders and punctuation)
        const lexicalCount = countLexicalWords(words.slice(j, i).join(' '));
        if (lexicalCount <= 1 && isMiddleLine) cost += 50000;
        if (wordCount === 1 && isMiddleLine) cost += 50000;
        if (ll < ideal * 0.4 && lexicalCount < 3) cost += 5000;

        const total = dp[j][k - 1] + cost;
        if (total < dp[i][k]) {
          dp[i][k] = total;
          choice[i][k] = j;
        }
      }
    }
  }

  if (dp[n][nLines] >= INF) return null;

  const lines: string[] = new Array(nLines);
  let pos = n;
  for (let k = nLines; k >= 1; k--) {
    const start = choice[pos][k];
    lines[k - 1] = words.slice(start, pos).join(' ');
    pos = start;
  }

  return lines;
}

/** DP to find optimal word distribution across exactly nLines lines */
function dpSplit(words: string[], nLines: number): string[] | null {
  const n = words.length;
  if (n < nLines) return null;

  // Precompute line lengths: lineLen[i][j] = length of words[i..j-1] joined
  const lineLen = (from: number, to: number): number => {
    let len = 0;
    for (let k = from; k < to; k++) {
      len += words[k].length + (k > from ? 1 : 0);
    }
    return len;
  };

  const totalLen = lineLen(0, n);
  const ideal = totalLen / nLines;

  // dp[i][k] = min cost to split words[0..i-1] into k lines
  // choice[i][k] = the start index of line k
  const INF = 1e18;
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array(nLines + 1).fill(INF));
  const choice: number[][] = Array.from({ length: n + 1 }, () => new Array(nLines + 1).fill(0));

  dp[0][0] = 0;

  for (let k = 1; k <= nLines; k++) {
    for (let i = k; i <= n; i++) {
      // Line k contains words[j..i-1] for some j
      for (let j = k - 1; j < i; j++) {
        const ll = lineLen(j, i);
        if (ll > HARD_MAX && i - j > 1) continue; // skip if too long (unless single word)

        const deviation = ll - ideal;
        let cost = deviation * deviation; // squared deviation from ideal

        // Orphan penalty: single-word middle line
        const wordCount = i - j;
        const isMiddleLine = k > 1 && k < nLines;
        if (wordCount === 1 && isMiddleLine) {
          cost += 50000; // massive penalty
        }

        // Short line penalty (less than half ideal)
        if (ll < ideal * 0.4 && wordCount < 3) {
          cost += 5000;
        }

        const total = dp[j][k - 1] + cost;
        if (total < dp[i][k]) {
          dp[i][k] = total;
          choice[i][k] = j;
        }
      }
    }
  }

  if (dp[n][nLines] >= INF) return null;

  // Reconstruct
  const lines: string[] = new Array(nLines);
  let pos = n;
  for (let k = nLines; k >= 1; k--) {
    const start = choice[pos][k];
    lines[k - 1] = words.slice(start, pos).join(' ');
    pos = start;
  }

  return lines;
}

/** Score a split: lower is better */
function scoreSplit(lines: string[]): number {
  if (lines.length <= 1) return 0;
  const lengths = lines.map(l => l.length);
  const avg = lengths.reduce((a, b) => a + b, 0) / lengths.length;

  let cost = 0;
  for (let i = 0; i < lines.length; i++) {
    const dev = lengths[i] - avg;
    cost += dev * dev;

    // Orphan penalty for middle lines with weak lexical content
    if (i > 0 && i < lines.length - 1) {
      const lexical = countLexicalWords(lines[i]);
      if (lexical <= 1) cost += 50000;
      if (lexical === 2 && lengths[i] < 10) cost += 5000;
    }
  }
  return cost;
}

function countLexicalWords(line: string): number {
  const tokens = line.split(/\s+/).filter(Boolean);
  let count = 0;

  for (const token of tokens) {
    // Shielded technical tags during balancing
    if (/^◆\d+◆$/.test(token)) continue;
    if (/^TAG_\d+$/i.test(token)) continue;

    // Ignore punctuation-only fragments
    if (/^[\p{P}\p{S}]+$/u.test(token)) continue;

    // Count only tokens that contain real letters/numbers (Arabic/Latin/digits)
    if (/[\p{L}\p{N}]/u.test(token)) count++;
  }

  return count;
}

/** Fix orphan lines by merging weak lines with neighbors */
function fixOrphans(lines: string[]): string[] {
  if (lines.length <= 1) return lines;

  const result = [...lines];
  let changed = true;
  let iterations = 0;

  while (changed && iterations < 8) {
    changed = false;
    iterations++;

    for (let i = 0; i < result.length; i++) {
      const lexical = countLexicalWords(result[i]);
      if (lexical <= 1 && result.length > 1) {
        // Determine merge target: prefer shorter neighbor
        if (i === 0) {
          // First line orphan: merge into next
          result[1] = `${result[0]} ${result[1]}`.replace(/\s{2,}/g, ' ').trim();
          result.splice(0, 1);
        } else if (i === result.length - 1) {
          // Last line orphan: merge into previous
          result[i - 1] = `${result[i - 1]} ${result[i]}`.replace(/\s{2,}/g, ' ').trim();
          result.splice(i, 1);
        } else {
          // Middle line orphan: merge with shorter neighbor
          const prevLen = result[i - 1].length;
          const nextLen = result[i + 1].length;
          if (prevLen <= nextLen) {
            result[i - 1] = `${result[i - 1]} ${result[i]}`.replace(/\s{2,}/g, ' ').trim();
            result.splice(i, 1);
          } else {
            result[i + 1] = `${result[i]} ${result[i + 1]}`.replace(/\s{2,}/g, ' ').trim();
            result.splice(i, 1);
          }
        }
        changed = true;
        break; // restart loop after modification
      }
    }
  }

  return result;
}

/** Preserve existing newlines but merge orphan lines across boundaries */
function fixOrphansPreservingNewlines(text: string): string {
  const rawLines = text.split('\n').map(l => l.trim()).filter(Boolean);
  if (rawLines.length <= 1) return text.replace(/\s{2,}/g, ' ').trim();

  const fixed = fixOrphans(rawLines);
  return fixed.join('\n').replace(/[ \t]+\n/g, '\n').replace(/\n[ \t]+/g, '\n').trim();
}

/** Unified regex matching all supported technical tag formats */
const TECH_TAG_REGEX = /[\uFFF9-\uFFFC]|[\uE000-\uE0FF]+|\d+\s*\[[A-Z]{2,10}\]|\[[A-Z]{2,10}\]\s*\d+|\[\s*\w+\s*:[^\]]*?\s*\](?:\s*\([^)]{1,100}\))?|\[\s*\w+\s*=\s*\w[^\]]*\]|\{\s*\w+\s*:\s*\w[^}]*\}|\{[\w]+\}/g;

function extractTechTags(text: string): string[] {
  return [...text.matchAll(new RegExp(TECH_TAG_REGEX.source, TECH_TAG_REGEX.flags))].map(m => m[0]);
}

/** Remove invented tags and enforce original tag multiset */
function enforceTagIntegrity(original: string, translation: string): string {
  const origTags = extractTechTags(original);
  if (origTags.length === 0) return translation;

  let result = translation;
  const origTagSet = new Set(origTags);

  // Remove obvious broken tag shards produced by engines in RTL/LTR mixing
  // Examples: "ML:icon]" or "[ icon=btn_a ]" when original only has "[ML:icon icon=btn_a ]"
  result = result
    .replace(/(?<!\[)\b[A-Za-z_]\w*:[^\s\]]+\]/g, '')
    .replace(/\[[^\]{}:\n]*=[^\]{}:\n]*\]/g, (m) => (origTagSet.has(m) ? m : ''));

  const transTags = extractTechTags(result);

  // Strip foreign tags invented by AI
  for (const t of transTags) {
    if (!origTagSet.has(t)) {
      result = result.replace(t, '');
    }
  }

  // Ensure all original tags exist with correct multiplicity
  const currentTags = extractTechTags(result);
  const currentCount = new Map<string, number>();
  for (const t of currentTags) currentCount.set(t, (currentCount.get(t) || 0) + 1);
  for (const t of origTags) {
    const n = currentCount.get(t) || 0;
    if (n <= 0) {
      result = `${result.trimEnd()} ${t}`.trim();
    } else {
      currentCount.set(t, n - 1);
    }
  }

  return result.replace(/\s{2,}/g, ' ').trim();
}

/**
 * If text becomes only placeholders/punctuation after protection, don't send to AI.
 * Example: "[ML:EnhanceParam paramtype=1 ]%." should be returned as-is.
 */
function isTagOnlyOrSymbolic(cleanedText: string): boolean {
  const withoutTags = cleanedText.replace(/TAG_\d+/g, ' ').trim();
  if (!withoutTags) return true;
  return !/[A-Za-z\u00C0-\u024F]/.test(withoutTags);
}
// Replaces glossary terms in source text with locked placeholders before AI translation,
// then swaps them back to the approved Arabic translations afterward.

interface TermLockResult {
  lockedText: string;
  locks: { placeholder: string; english: string; arabic: string }[];
}

function lockTermsInText(text: string, glossaryMap: Map<string, string>): TermLockResult {
  if (glossaryMap.size === 0) return { lockedText: text, locks: [] };

  const textLower = text.toLowerCase();

  // Pre-filter: only keep terms that actually appear in the text (fast string check)
  const candidateTerms: [string, string][] = [];
  for (const [eng, arab] of glossaryMap) {
    if (eng.length < 2) continue;
    if (textLower.includes(eng)) {
      candidateTerms.push([eng, arab]);
    }
  }

  if (candidateTerms.length === 0) return { lockedText: text, locks: [] };

  // Sort by length (longest first) to prevent partial matches
  candidateTerms.sort((a, b) => b[0].length - a[0].length);

  const locks: TermLockResult['locks'] = [];
  let lockedText = text;
  let lockCounter = 0;

  for (const [eng, arab] of candidateTerms) {
    const escaped = eng.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    // Match with optional possessive suffix ('s, 's)
    const pattern = eng.length <= 3
      ? new RegExp(`\\b${escaped}(?:'s|'s)?\\b`, 'gi')
      : new RegExp(`(?<![\\w-])${escaped}(?:'s|'s)?(?![\\w-])`, 'gi');

    const regex = new RegExp(pattern.source, pattern.flags);
    let match: RegExpExecArray | null;
    
    while ((match = regex.exec(lockedText)) !== null) {
      const matchEnd = match.index + match[0].length;
      const surroundingSlice = lockedText.slice(match.index, matchEnd);
      if (surroundingSlice.includes('⟪') || surroundingSlice.includes('⟫')) continue;

      const placeholder = `⟪T${lockCounter}⟫`;
      lockedText = lockedText.slice(0, match.index) + placeholder + lockedText.slice(matchEnd);
      locks.push({ placeholder, english: match[0], arabic: arab });
      lockCounter++;
      regex.lastIndex = match.index + placeholder.length;
    }
  }

  return { lockedText, locks };
}

function unlockTerms(translatedText: string, locks: TermLockResult['locks']): string {
  // Normalize AI-corrupted term placeholders before matching
  let result = normalizeLockedTermPlaceholders(translatedText);

  const lockMap = new Map<string, string>();
  for (const lock of locks) {
    lockMap.set(lock.placeholder, lock.arabic);
    const escaped = lock.placeholder.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    result = result.replace(new RegExp(escaped, 'g'), lock.arabic);
  }

  // Fallback: catch bracket/spacing variants and drop unknown placeholders
  result = result.replace(/[⟪《〈«]\s*T\s*[-:_]?\s*(\d+)\s*[⟫》〉»]/gi, (_match, num) => {
    const key = `⟪T${num}⟫`;
    return lockMap.get(key) ?? '';
  });

  return result.replace(/\s{2,}/g, ' ').trim();
}

// --- Apply glossary replacements to translated text (post-processing) ---
function applyGlossaryPost(text: string, glossaryMap: Map<string, string>): string {
  let result = text;
  const textLower = text.toLowerCase();
  for (const [eng, ara] of glossaryMap) {
    if (eng.length < 2) continue;
    if (!textLower.includes(eng)) continue; // Fast pre-filter
    const escaped = eng.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    // Match term with optional possessive suffix ('s, 's) and flexible word boundaries
    const regex = new RegExp(`(?:^|[\\s.,;:!?()\\[\\]{}])${escaped}(?:'s|'s)?(?=$|[\\s.,;:!?()\\[\\]{}])`, 'gi');
    result = result.replace(regex, (match) => {
      // Preserve leading whitespace/punctuation
      const leadMatch = match.match(/^[\s.,;:!?()\[\]{}]*/);
      const lead = leadMatch ? leadMatch[0] : '';
      return lead + ara;
    });
  }
  return result;
}

// --- Fetch with retry ---
async function fetchWithRetry(url: string, retries = 2, delayMs = 1000): Promise<Response> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const response = await fetch(url);
      if (response.ok || response.status === 400) return response;
      if (attempt < retries) {
        await new Promise(r => setTimeout(r, delayMs * (attempt + 1)));
      } else {
        return response;
      }
    } catch (err) {
      if (attempt >= retries) throw err;
      await new Promise(r => setTimeout(r, delayMs * (attempt + 1)));
    }
  }
  throw new Error('fetchWithRetry exhausted');
}

// --- Pick best translation from MyMemory matches ---
function pickBestTranslation(data: any): string | null {
  const primary = data?.responseData?.translatedText;
  const primaryMatch = data?.responseData?.match;
  
  const matches = data?.matches;
  if (Array.isArray(matches) && matches.length > 0) {
    const ranked = matches
      .filter((m: any) => m.translation?.trim() && m.segment?.trim())
      .sort((a: any, b: any) => {
        const aHuman = a['created-by'] !== 'MT' ? 1 : 0;
        const bHuman = b['created-by'] !== 'MT' ? 1 : 0;
        if (aHuman !== bHuman) return bHuman - aHuman;
        return (b.match || 0) - (a.match || 0);
      });
    
    if (ranked.length > 0 && ranked[0].match >= 0.5) {
      return ranked[0].translation;
    }
  }
  
  if (primary?.trim() && primaryMatch >= 0.3) {
    return primary;
  }
  
  return primary?.trim() ? primary : null;
}

// --- MyMemory free translation ---
async function translateWithMyMemory(
  entries: { key: string; original: string }[],
  protectedEntries: { key: string; cleaned: string; tags: Map<string, string> }[],
  glossaryMap?: Map<string, string>,
  email?: string,
): Promise<{ translations: Record<string, string>; charsUsed: number; glossaryStats: GlossaryStats }> {
  const result: Record<string, string> = {};
  let charsUsed = 0;
  const stats: GlossaryStats = { directMatches: 0, lockedTerms: 0, contextTerms: 0 };

  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    const pe = protectedEntries[i];
    const textToTranslate = pe.cleaned.trim();
    
    if (!textToTranslate) continue;

    // Tag-only/symbolic entries must pass through unchanged
    if (isTagOnlyOrSymbolic(textToTranslate)) {
      result[entry.key] = restoreAndEnforce(entry.original, textToTranslate, pe.tags, entry.key);
      continue;
    }

    // Check glossary for exact match first
    if (glossaryMap) {
      const norm = textToTranslate.toLowerCase();
      const hit = glossaryMap.get(norm);
      if (hit) {
        result[entry.key] = restoreAndEnforce(entry.original, hit, pe.tags, entry.key);
        stats.directMatches++;
        continue;
      }
    }

    // Term locking before translation
    let textForTranslation = textToTranslate;
    let termLocks: TermLockResult = { lockedText: textToTranslate, locks: [] };
    if (glossaryMap && glossaryMap.size > 0) {
      termLocks = lockTermsInText(textToTranslate, glossaryMap);
      textForTranslation = termLocks.lockedText;
      stats.lockedTerms += termLocks.locks.length;
    }

    try {
      let url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(textForTranslation)}&langpair=en|ar`;
      if (email?.trim()) {
        url += `&de=${encodeURIComponent(email.trim())}`;
      }
      
      const response = await fetchWithRetry(url);
      if (!response.ok) {
        console.error(`MyMemory error for key ${entry.key}: ${response.status}`);
        await response.text();
        continue;
      }
      const data = await response.json();
      
      let translation = pickBestTranslation(data);
      
      if (translation?.trim()) {
        translation = normalizeTagPlaceholders(translation);
        translation = normalizeLockedTermPlaceholders(translation);
        translation = unlockTerms(translation, termLocks.locks);
        translation = stripUnexpectedPlaceholders(translation, new Set(pe.tags.keys()));
        // Then apply glossary post-processing for any remaining English terms
        if (glossaryMap) {
          translation = applyGlossaryPost(translation, glossaryMap);
        }
        result[entry.key] = restoreAndEnforce(entry.original, translation, pe.tags, entry.key);
        charsUsed += textToTranslate.length;
      }
    } catch (err) {
      console.error(`MyMemory fetch error for key ${entry.key}:`, err);
    }
    
    if (i < entries.length - 1) {
      await new Promise(r => setTimeout(r, 150));
    }
  }

  return { translations: result, charsUsed, glossaryStats: stats };
}

// --- Google Translate ---
async function translateWithGoogle(
  entries: { key: string; original: string }[],
  protectedEntries: { key: string; cleaned: string; tags: Map<string, string> }[],
  glossaryMap?: Map<string, string>,
): Promise<{ translations: Record<string, string>; charsUsed: number; glossaryStats: GlossaryStats }> {
  const result: Record<string, string> = {};
  let charsUsed = 0;
  const stats: GlossaryStats = { directMatches: 0, lockedTerms: 0, contextTerms: 0 };

  // Individual requests only — batch mode removed to prevent displacement
  for (let i = 0; i < entries.length; i++) {
      const entry = entries[i];
      const pe = protectedEntries[i];
      const text = pe.cleaned.trim();
      if (!text) continue;

      // Tag-only/symbolic entries must pass through unchanged
      if (isTagOnlyOrSymbolic(text)) {
        result[entry.key] = restoreAndEnforce(entry.original, text, pe.tags, entry.key);
        continue;
      }

      if (glossaryMap) {
        const norm = text.toLowerCase();
        const hit = glossaryMap.get(norm);
        if (hit) {
          result[entry.key] = restoreAndEnforce(entry.original, hit, pe.tags, entry.key);
          stats.directMatches++;
          continue;
        }
      }

      // Term locking
      let textForTranslation = text;
      let termLocks: TermLockResult = { lockedText: text, locks: [] };
      if (glossaryMap && glossaryMap.size > 0) {
        termLocks = lockTermsInText(text, glossaryMap);
        textForTranslation = termLocks.lockedText;
        stats.lockedTerms += termLocks.locks.length;
      }

      try {
        const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=ar&dt=t&q=${encodeURIComponent(textForTranslation)}`;
        const response = await fetchWithRetry(url);
        if (!response.ok) {
          console.error(`Google Translate error for key ${entry.key}: ${response.status}`);
          await response.text();
          continue;
        }
        const data = await response.json();

        let translation = '';
        if (Array.isArray(data) && Array.isArray(data[0])) {
          for (const segment of data[0]) {
            if (Array.isArray(segment) && segment[0]) {
              translation += segment[0];
            }
          }
        }
        translation = translation.trim();

        if (translation) {
          translation = normalizeTagPlaceholders(translation);
          translation = normalizeLockedTermPlaceholders(translation);
          translation = unlockTerms(translation, termLocks.locks);
          translation = stripUnexpectedPlaceholders(translation, new Set(pe.tags.keys()));
          if (glossaryMap) {
            translation = applyGlossaryPost(translation, glossaryMap);
          }
          result[entry.key] = restoreAndEnforce(entry.original, translation, pe.tags, entry.key);
          charsUsed += text.length;
        }
      } catch (err) {
        console.error(`Google Translate error for key ${entry.key}:`, err);
      }

      if (i < entries.length - 1) {
        await new Promise(r => setTimeout(r, 100));
      }
    }

  return { translations: result, charsUsed, glossaryStats: stats };
}

// --- Parse glossary text into a map ---
function parseGlossaryToMap(glossary: string): Map<string, string> {
  const map = new Map<string, string>();
  if (!glossary?.trim()) return map;
  for (const line of glossary.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('//')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx < 1) continue;
    const eng = trimmed.slice(0, eqIdx).trim().toLowerCase();
    const arb = trimmed.slice(eqIdx + 1).trim();
    if (eng && arb) map.set(eng, arb);
  }
  return map;
}

// --- Filter glossary to only terms relevant to the batch texts ---
function filterRelevantGlossary(glossary: string, texts: string[]): string {
  if (!glossary?.trim()) return '';
  const combinedText = texts.join(' ').toLowerCase();
  const relevantLines: string[] = [];
  for (const line of glossary.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('//')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx < 1) continue;
    const eng = trimmed.slice(0, eqIdx).trim();
    if (eng.length <= 2) {
      const regex = new RegExp(`\\b${eng.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
      if (regex.test(combinedText)) relevantLines.push(trimmed);
    } else {
      if (combinedText.includes(eng.toLowerCase())) relevantLines.push(trimmed);
    }
  }
  return relevantLines.join('\n');
}

// --- Glossary usage statistics ---
interface GlossaryStats {
  directMatches: number;
  lockedTerms: number;
  contextTerms: number;
}

// --- Build translation memory map from context entries ---
function buildTranslationMemory(context: { key: string; original: string; translation?: string }[] | undefined): Map<string, string> {
  const tmMap = new Map<string, string>();
  if (!context) return tmMap;
  for (const c of context) {
    if (!c.translation?.trim() || !c.original?.trim()) continue;
    // Add full-text mapping (lowercased)
    tmMap.set(c.original.trim().toLowerCase(), c.translation.trim());
  }
  return tmMap;
}

// --- AI translation (Gemini / Lovable gateway) ---
async function translateWithAI(
  entries: { key: string; original: string }[],
  protectedEntries: { key: string; cleaned: string; tags: Map<string, string> }[],
  glossary: string | undefined,
  context: { key: string; original: string; translation?: string }[] | undefined,
  userApiKey: string | undefined,
  aiModel: string | undefined,
): Promise<{ translations: Record<string, string>; glossaryStats: GlossaryStats }> {
  const glossaryMap = glossary ? parseGlossaryToMap(glossary) : new Map<string, string>();
  const tmMap = buildTranslationMemory(context);
  const stats: GlossaryStats = { directMatches: 0, lockedTerms: 0, contextTerms: 0 };

  // --- Step 1: Direct matches (exact full-string from glossary OR translation memory) ---
  const directResult: Record<string, string> = {};
  const needsAI: { entry: typeof entries[0]; pe: typeof protectedEntries[0]; termLocks: TermLockResult }[] = [];

  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    const pe = protectedEntries[i];
    const norm = pe.cleaned.trim().toLowerCase();

    // Tag-only/symbolic entries must pass through unchanged
    if (isTagOnlyOrSymbolic(pe.cleaned)) {
      directResult[entry.key] = restoreAndEnforce(entry.original, pe.cleaned, pe.tags, entry.key);
      continue;
    }

    // Priority 1: Glossary exact match
    const glossaryHit = glossaryMap.get(norm);
    if (glossaryHit) {
      directResult[entry.key] = restoreAndEnforce(entry.original, glossaryHit, pe.tags, entry.key);
      stats.directMatches++;
      continue;
    }

    // Priority 2: Translation memory exact match (previously translated identical text)
    const tmHit = tmMap.get(norm);
    if (tmHit) {
      directResult[entry.key] = restoreAndEnforce(entry.original, tmHit, pe.tags, entry.key);
      stats.directMatches++;
      continue;
    }

    // --- Step 2: Term locking for partial matches (glossary terms inside text) ---
    const termLocks = lockTermsInText(pe.cleaned, glossaryMap);
    stats.lockedTerms += termLocks.locks.length;
    needsAI.push({ entry, pe, termLocks });
  }

  if (needsAI.length === 0) {
    return { translations: directResult, glossaryStats: stats };
  }

  // --- Step 3: Build prompt with KEYED texts (prevents positional misalignment) ---
  // Use short unique keys like K0, K1, ... so the AI must return a JSON object with the same keys
  // Proper JSON escaping to prevent broken prompts
  function escapeForJsonString(s: string): string {
    return s
      .replace(/\\/g, '\\\\')
      .replace(/"/g, '\\"')
      .replace(/\n/g, '\\n')
      .replace(/\r/g, '\\r')
      .replace(/\t/g, '\\t')
      .replace(/[\x00-\x1F\x7F]/g, '');
  }
  const textsBlock = needsAI.map((item, i) => `"K${i}": "${escapeForJsonString(item.termLocks.lockedText)}"`).join(',\n');

  let glossarySection = '';
  if (glossary?.trim()) {
    const batchTexts = needsAI.map(item => item.pe.cleaned);
    const relevantGlossary = filterRelevantGlossary(glossary, batchTexts);
    if (relevantGlossary.trim()) {
      const termCount = relevantGlossary.split('\n').length;
      stats.contextTerms = termCount;
      console.log(`Glossary: ${stats.directMatches} direct, ${stats.lockedTerms} locked, ${termCount} context terms`);
      glossarySection = `\n\nMANDATORY GLOSSARY (${termCount} terms) — You MUST use these exact Arabic translations. Do NOT paraphrase, alter, or use synonyms for any glossary term:\n${relevantGlossary}\n`;
    }
  }

  // Enhanced context section: show previous translations as mandatory consistency reference
  let contextSection = '';
  if (context && context.length > 0) {
    const contextLines = context
      .filter(c => c.translation?.trim())
      .map(c => `${c.original.replace(/"/g, '')} → ${c.translation!.replace(/"/g, '')}`)
      .slice(0, 15)
      .join('\n');
    if (contextLines) {
      contextSection = `\n\nPREVIOUSLY TRANSLATED TEXTS (for mandatory consistency — if you encounter the same words/phrases, use the SAME Arabic translation):\n${contextLines}\n`;
    }
  }

  let categoryHint = '';
  const sampleKey = entries[0]?.key || '';
  if (/ActorMsg\/PouchContent/i.test(sampleKey)) categoryHint = 'هذه نصوص أسماء أسلحة وأدوات ومواد - استخدم صيغة مختصرة ومباشرة.';
  else if (/LayoutMsg/i.test(sampleKey)) categoryHint = 'هذه نصوص واجهة مستخدم وقوائم - استخدم صيغة مختصرة وواضحة.';
  else if (/EventFlowMsg/i.test(sampleKey)) categoryHint = 'هذه حوارات قصة ومهام - استخدم أسلوباً سردياً طبيعياً وممتعاً.';
  else if (/ChallengeMsg/i.test(sampleKey)) categoryHint = 'هذه نصوص مهام وتحديات - استخدم أسلوباً تحفيزياً واضحاً.';
  else if (/LocationMsg/i.test(sampleKey)) categoryHint = 'هذه أسماء مواقع وخرائط - حافظ على الأسماء العلم أو ترجمها بالطريقة الشائعة.';
  else if (/ActorMsg/i.test(sampleKey)) categoryHint = 'هذه أسماء شخصيات وأعداء - حافظ على الأسماء العلم الشهيرة كما هي.';

  const categorySection = categoryHint ? `\n\n${categoryHint}` : '';

  const prompt = `You are a professional game translator specializing in Xenoblade Chronicles 3 (ゼノブレイド3). Translate the following game texts from English to Arabic.

CRITICAL RULES:
1. Placeholders like ⟪T0⟫, ⟪T1⟫, etc. are LOCKED TERMS — copy them EXACTLY as-is into your translation. Do NOT translate, modify, or remove them.
2. NEVER remove, modify, merge, or reorder TAG_0, TAG_1, TAG_2 etc. placeholders. They MUST appear in your output EXACTLY as they appear in the input.
3. Keep the translation length close to the original to fit in-game text boxes.
4. If a glossary term appears, you MUST use its EXACT Arabic translation — no alternatives, no synonyms, no paraphrasing. This is NON-NEGOTIABLE. Match possessive forms too (e.g., "Hero's" should use the glossary entry for "Hero").
5. CONSISTENCY IS MANDATORY: If a word or phrase was translated a certain way in the "Previously Translated Texts" section, you MUST translate it the same way.
6. Use terminology consistent with the Arabic gaming community for Xenoblade Chronicles 3.
7. Preserve proper nouns (Noah, Mio, Eunie, Taion, Lanz, Sena, Aionios) as-is or use their established Arabic equivalents from the glossary.
8. Return ONLY a JSON object where each key matches the input key (K0, K1, etc.) and the value is the Arabic translation. Example: {"K0": "ترجمة", "K1": "ترجمة"}
9. You MUST return EXACTLY ${needsAI.length} entries. Do NOT skip, merge, or add extra entries. Each key MUST have its own separate translation.
10. Do NOT insert newline characters (\\n) in your translations. Return each translation as a single continuous string. Line breaking is handled separately.${categorySection}${glossarySection}${contextSection}

Input texts (as JSON object — translate each value and return with the SAME keys):
{
${textsBlock}
}`;

  const effectiveKey = userApiKey?.trim() || Deno.env.get('GEMINI_API_KEY') || '';
  
  /** Detect if the AI response was truncated */
  function detectTruncation(text: string): boolean {
    const openBraces = (text.match(/{/g) || []).length;
    const closeBraces = (text.match(/}/g) || []).length;
    if (openBraces !== closeBraces) return true;
    return /\.\.\.$/m.test(text.trim()) || /\[truncated\]/i.test(text) || /\[continued\]/i.test(text);
  }

  /** Extract JSON object from AI response, handling markdown and malformed output */
  function extractJsonObject(raw: string): Record<string, string> {
    let cleaned = raw.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
    
    // Find the outermost JSON object by matching balanced braces,
    // properly skipping content inside quoted strings
    let depth = 0, start = -1, end = -1;
    let inString = false, escapeNext = false;
    for (let i = 0; i < cleaned.length; i++) {
      const ch = cleaned[i];
      if (escapeNext) { escapeNext = false; continue; }
      if (ch === '\\' && inString) { escapeNext = true; continue; }
      if (ch === '"') { inString = !inString; continue; }
      if (inString) continue; // Skip everything inside strings
      if (ch === '{') {
        if (depth === 0) start = i;
        depth++;
      } else if (ch === '}') {
        depth--;
        if (depth === 0 && start !== -1) { end = i; break; }
      }
    }
    
    if (start !== -1 && end !== -1) {
      let jsonStr = cleaned.substring(start, end + 1);
      try {
        return JSON.parse(jsonStr);
      } catch {
        // Fix common issues: trailing commas, control characters
        jsonStr = jsonStr.replace(/,\s*}/g, '}').replace(/[\x00-\x1F\x7F]/g, ' ');
        try { return JSON.parse(jsonStr); } catch (e2) {
          console.error('JSON parse failed after cleanup:', (e2 as Error).message, 'Raw snippet:', jsonStr.substring(0, 200));
        }
      }
    }
    
    // Fallback: try as array (old format) and convert to keyed object
    const arrMatch = cleaned.match(/\[[\s\S]*?\]/);
    if (arrMatch) {
      const sanitized = arrMatch[0].replace(/[\x00-\x1F\x7F]/g, ' ');
      try {
        const arr: string[] = JSON.parse(sanitized);
        const obj: Record<string, string> = {};
        arr.forEach((val, i) => { obj[`K${i}`] = val; });
        console.warn(`AI returned array instead of object, converted ${arr.length} entries`);
        return obj;
      } catch {}
    }

    // Fallback: regex extraction of individual K{n} keys
    const regexResult: Record<string, string> = {};
    const keyRegex = /"K(\d+)"\s*:\s*"/g;
    let keyMatch;
    while ((keyMatch = keyRegex.exec(cleaned)) !== null) {
      const keyNum = keyMatch[1];
      const valueStart = keyMatch.index + keyMatch[0].length;
      // Find the end of the value string, handling escaped quotes
      let i = valueStart;
      let value = '';
      while (i < cleaned.length) {
        if (cleaned[i] === '\\' && i + 1 < cleaned.length) {
          value += cleaned[i] + cleaned[i + 1];
          i += 2;
        } else if (cleaned[i] === '"') {
          break;
        } else {
          value += cleaned[i];
          i++;
        }
      }
      if (value.trim()) {
        // Unescape the value
        try {
          regexResult[`K${keyNum}`] = JSON.parse(`"${value}"`);
        } catch {
          regexResult[`K${keyNum}`] = value.replace(/\\n/g, '\n').replace(/\\"/g, '"').replace(/\\\\/g, '\\');
        }
      }
    }
    if (Object.keys(regexResult).length > 0) {
      console.warn(`Extracted ${Object.keys(regexResult).length} keys via regex fallback`);
      return regexResult;
    }
    
    throw new Error('فشل في تحليل استجابة الذكاء الاصطناعي — لم يتم العثور على JSON صالح');
  }

  const parseAndUnlock = (translationsObj: Record<string, string>): Record<string, string> => {
    const result: Record<string, string> = {};
    for (let i = 0; i < needsAI.length; i++) {
      const key = `K${i}`;
      let translated = translationsObj[key]?.trim();
      if (!translated) {
        console.warn(`Missing translation for key ${key} (entry: ${needsAI[i].entry.key})`);
        continue;
      }
      const item = needsAI[i];

      // Safety check: reject suspiciously short translations (likely mismatched)
      const originalLen = item.pe.cleaned.length;
      if (translated.length < 3 && originalLen > 20) {
        console.warn(`Skipping suspiciously short translation "${translated}" for ${item.entry.key} (original: ${originalLen} chars)`);
        continue;
      }
      if (originalLen > 30 && translated.length < originalLen * 0.15) {
        console.warn(`Translation ratio too low for ${item.entry.key}: ${translated.length}/${originalLen} chars`);
        continue;
      }

      translated = normalizeTagPlaceholders(translated);
      translated = normalizeLockedTermPlaceholders(translated);

      // Unlock term placeholders → Arabic (and strip unknown lock placeholders)
      translated = unlockTerms(translated, item.termLocks.locks);

      // Remove any leaked TAG_/NEWLINE_ placeholders that are not expected for this entry
      const expectedTags = [...item.pe.tags.keys()];
      translated = stripUnexpectedPlaceholders(translated, new Set(expectedTags));

      // Post-validation: re-insert any missing expected placeholders only
      for (const tag of expectedTags) {
        if (!translated.includes(tag)) {
          console.warn(`Post-validation: re-inserting missing ${tag} for key ${item.entry.key}`);
          translated = translated.trimEnd() + ' ' + tag;
        }
      }
      // Post-process: replace any remaining English glossary terms
      if (glossaryMap.size > 0) {
        translated = applyGlossaryPost(translated, glossaryMap);
      }
      result[item.entry.key] = restoreAndEnforce(item.entry.original, translated, item.pe.tags, item.entry.key);
    }
    return result;
  };

  if (effectiveKey) {
    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${effectiveKey}`;
    const geminiResponse = await fetch(geminiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        systemInstruction: { parts: [{ text: 'You are a Xenoblade Chronicles 3 game text translator. Output ONLY a valid JSON object with keys like K0, K1, K2... and Arabic translation values. Never modify ⟪T#⟫ placeholders. ALWAYS use glossary terms exactly. ALWAYS maintain consistency with previously translated texts — same English word = same Arabic translation. CRITICAL: Never use unescaped double quotes inside translation values. Use single quotes or escaped quotes (\\\") instead. Ensure the JSON is complete and valid.' }] },
        generationConfig: { temperature: 0.3 },
      }),
    });

    if (!geminiResponse.ok) {
      const errText = await geminiResponse.text();
      console.error('Gemini API error:', errText);
      if (geminiResponse.status === 429) {
        console.log('Gemini quota exceeded, falling back to Lovable AI...');
      } else {
        if (geminiResponse.status === 400) throw new Error('مفتاح API غير صالح — تحقق من المفتاح');
        if (geminiResponse.status === 403) throw new Error('مفتاح API محظور أو منتهي — أنشئ مفتاحاً جديداً من Google AI Studio');
        throw new Error(`خطأ Gemini: ${geminiResponse.status}`);
      }
    } else {
      const geminiData = await geminiResponse.json();
      const content = geminiData.candidates?.[0]?.content?.parts?.[0]?.text || '';
      if (detectTruncation(content)) {
        console.warn('Gemini response truncated, results may be incomplete');
      }
      const translationsObj = extractJsonObject(content);
      const aiResult = parseAndUnlock(translationsObj);
      console.log(`AI translated ${Object.keys(aiResult).length}/${needsAI.length} entries (keyed mode)`);
      return { translations: { ...directResult, ...aiResult }, glossaryStats: stats };
    }
  }

  // Fallback to Lovable AI — with retry on JSON parse failure
  {
    const apiKey = Deno.env.get('LOVABLE_API_KEY');
    if (!apiKey) throw new Error('Missing LOVABLE_API_KEY');

    const callLovableAI = async (aiPrompt: string, count: number): Promise<Record<string, string>> => {
      const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'google/gemini-2.5-flash',
          messages: [
            { role: 'system', content: 'You are a Xenoblade Chronicles 3 game text translator. Output ONLY a valid JSON object with keys like K0, K1, K2... and Arabic translation values. Never modify ⟪T#⟫ placeholders. ALWAYS use glossary terms exactly. ALWAYS maintain consistency with previously translated texts — same English word = same Arabic translation. CRITICAL: Never use unescaped double quotes inside translation values. Use single quotes or escaped quotes (\\\") instead. Ensure the JSON is complete and valid.' },
            { role: 'user', content: aiPrompt },
          ],
          temperature: 0.3,
        }),
      });

      if (!response.ok) {
        const err = await response.text();
        console.error('AI gateway error:', err);
        if (response.status === 402) throw new Error('انتهت نقاط الذكاء الاصطناعي — استخدم مفتاح Gemini الشخصي');
        if (response.status === 429) throw new Error('تم تجاوز حد الطلبات، حاول لاحقاً');
        throw new Error(`AI error: ${response.status}`);
      }

      const data = await response.json();
      const content = data.choices?.[0]?.message?.content || '';
      if (detectTruncation(content)) {
        console.warn('Lovable AI response truncated, results may be incomplete');
      }
      return extractJsonObject(content);
    };

    // Try full batch first, on JSON failure split into halves
    try {
      const translationsObj = await callLovableAI(prompt, needsAI.length);
      const aiResult = parseAndUnlock(translationsObj);
      console.log(`AI translated ${Object.keys(aiResult).length}/${needsAI.length} entries (keyed mode)`);
      return { translations: { ...directResult, ...aiResult }, glossaryStats: stats };
    } catch (e) {
      if (needsAI.length <= 1) throw e;
      console.warn(`Full batch failed (${(e as Error).message}), splitting into halves...`);

      const mid = Math.ceil(needsAI.length / 2);
      const buildHalfPrompt = (items: typeof needsAI, offset: number) => {
        const halfTexts = items.map((item, i) => `"K${i}": "${escapeForJsonString(item.termLocks.lockedText)}"`).join(',\n');
        return prompt.replace(textsBlock, halfTexts).replace(`EXACTLY ${needsAI.length} entries`, `EXACTLY ${items.length} entries`);
      };

      const firstHalf = needsAI.slice(0, mid);
      const secondHalf = needsAI.slice(mid);

      const [obj1, obj2] = await Promise.all([
        callLovableAI(buildHalfPrompt(firstHalf, 0), firstHalf.length),
        callLovableAI(buildHalfPrompt(secondHalf, mid), secondHalf.length),
      ]);

      // Remap second half keys back to original indices
      const combined: Record<string, string> = { ...obj1 };
      for (const [key, val] of Object.entries(obj2)) {
        const idx = parseInt(key.replace('K', ''));
        combined[`K${idx + mid}`] = val;
      }

      const aiResult = parseAndUnlock(combined);
      console.log(`AI translated ${Object.keys(aiResult).length}/${needsAI.length} entries (split mode)`);
      return { translations: { ...directResult, ...aiResult }, glossaryStats: stats };
    }
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { entries, glossary, context, userApiKey, provider, myMemoryEmail, rebalanceNewlines, npcMaxLines } = await req.json() as {
      entries: { key: string; original: string }[];
      glossary?: string;
      context?: { key: string; original: string; translation?: string }[];
      userApiKey?: string;
      provider?: string;
      myMemoryEmail?: string;
      rebalanceNewlines?: boolean;
      npcMaxLines?: number;
    };

    // Set the global rebalance flag for this request
    _rebalanceNewlines = !!rebalanceNewlines;
    _npcMaxLines = npcMaxLines && npcMaxLines >= 1 && npcMaxLines <= 3 ? npcMaxLines : undefined;

    if (!entries || entries.length === 0) {
      return new Response(JSON.stringify({ error: 'لا توجد نصوص للترجمة' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const protectedEntries = entries.map(e => {
      const { cleaned, tags } = protectTags(e.original);
      return { ...e, cleaned, tags };
    });

    if (provider === 'mymemory') {
      const glossaryMap = glossary ? parseGlossaryToMap(glossary) : undefined;
      const { translations, charsUsed, glossaryStats } = await translateWithMyMemory(entries, protectedEntries, glossaryMap, myMemoryEmail);
      return new Response(JSON.stringify({ translations, charsUsed, glossaryStats }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    } else if (provider === 'google') {
      const glossaryMap = glossary ? parseGlossaryToMap(glossary) : undefined;
      const { translations, charsUsed, glossaryStats } = await translateWithGoogle(entries, protectedEntries, glossaryMap);
      return new Response(JSON.stringify({ translations, charsUsed, glossaryStats }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    } else {
      const { translations, glossaryStats } = await translateWithAI(entries, protectedEntries, glossary, context, userApiKey);
      return new Response(JSON.stringify({ translations, glossaryStats }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
  } catch (error) {
    console.error('Error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'خطأ غير متوقع' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
