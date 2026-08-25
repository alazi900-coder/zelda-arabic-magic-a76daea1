/**
 * Local technical-tag extractor (no AI).
 * Scans English originals across all loaded entries and produces a categorized
 * report of every technical token found, with counts, file lists, and examples.
 *
 * Designed to be chunked + async so it never freezes the UI on large datasets
 * (XC1 DE has ~50k+ entries).
 */

export interface ExtractorEntry {
  msbtFile: string;
  original: string;
}

interface Occurrence {
  count: number;
  files: Set<string>;
  example: string;
}

export interface TagReport {
  totalEntries: number;
  scannedEntries: number;
  categories: Record<string, Map<string, Occurrence>>;
}

const CATEGORIES = [
  "bracket_tags",      // [Tag:Value], [System:Ruby], [XENO:n]
  "paired_tags",       // [Tag:x]...[/Tag:x]
  "curly_vars",        // {var}, {player:name}
  "html_like",         // <tag>, </tag>
  "escape_seq",        // \xNN, \uNNNN, \n, \t
  "pua_chars",         // U+E000..U+E0FF (matches the real protection range in xc3-tag-protection.ts)
  "control_chars",     // U+FFF9..U+FFFC, BiDi marks
  "dollar_vars",       // $1, $2, $name
  "percent_vars",      // %s, %d, %1$s
] as const;
type Category = (typeof CATEGORIES)[number];

const PATTERNS: Record<Category, RegExp> = {
  paired_tags: /\[\s*\w+\s*:[^\]]*\][^[]*?\[\/\s*\w+\s*:[^\]]*\]/g,
  bracket_tags: /\\?\[\s*\/?\s*[A-Za-z][\w\s:=.'\/-]*\s*\\?\]/g,
  curly_vars: /\{[^{}]{1,60}\}/g,
  html_like: /<\/?[A-Za-z][^>]{0,80}>/g,
  // 'n' is deliberately excluded from the hex-prefix class below: \xNN and
  // \uNNNN are real hex escapes, but \n is the single-char newline escape —
  // including 'n' there let "\n12" (newline followed by literal digits "12")
  // get misparsed as a bogus hex escape "\n12" instead of \n + "12".
  escape_seq: /\\[xu][0-9A-Fa-f]{2,8}|\\[ntr0]/g,
  pua_chars: /[\uE000-\uE0FF]+/g,
  control_chars: /[\uFFF9-\uFFFC\u200E\u200F\u202A-\u202E\u2066-\u2069]/g,
  dollar_vars: /\$\w+/g,
  percent_vars: /%[\d.$-]*[sdif]/g,
};

// Priority order for cross-category de-duplication: when two categories'
// patterns both match overlapping text (e.g. paired_tags' full
// "[Tag]...[/Tag]" span also matches bracket_tags' single-bracket pattern,
// and a nested pattern matches inner text of any of the above), the first
// category in this list to claim a span wins; the same span is skipped by
// every later category so the same token isn't reported 2-3x over.
const SCAN_PRIORITY: Category[] = [
  "paired_tags",
  "bracket_tags",
  "curly_vars",
  "html_like",
  "escape_seq",
  "pua_chars",
  "control_chars",
  "dollar_vars",
  "percent_vars",
];

/** Extracts a stable de-dup key for paired_tags: the opening+closing tag
 * skeleton, with the (usually-unique) inner text stripped out. Without this,
 * "[System:Ruby]Aegis[/System:Ruby]" and "[System:Ruby]Alrest[/System:Ruby]"
 * are treated as different tokens and `count` never aggregates past 1. */
const PAIRED_TAG_SKELETON = /^(\[\s*\w+\s*:[^\]]*\])[^[]*?(\[\/\s*\w+\s*:[^\]]*\])$/;
function pairedTagKey(fullMatch: string): string {
  const m = PAIRED_TAG_SKELETON.exec(fullMatch);
  return m ? `${m[1]}...${m[2]}` : fullMatch;
}

function recordMatch(map: Map<string, Occurrence>, key: string, file: string, example: string) {
  const existing = map.get(key);
  if (existing) {
    existing.count++;
    if (existing.files.size < 20) existing.files.add(file);
  } else {
    map.set(key, { count: 1, files: new Set([file]), example });
  }
}

function scanSingle(text: string, file: string, categories: Record<Category, Map<string, Occurrence>>) {
  const claimed: [number, number][] = [];
  const isClaimed = (start: number, end: number) => claimed.some(([s, e]) => start >= s && end <= e);
  const example = text.length > 100 ? text.slice(0, 97) + "..." : text;

  for (const cat of SCAN_PRIORITY) {
    const re = PATTERNS[cat];
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      const start = m.index;
      const end = start + m[0].length;
      if (isClaimed(start, end)) continue;
      claimed.push([start, end]);

      const key = cat === "paired_tags"
        ? pairedTagKey(m[0])
        : cat === "pua_chars"
          ? Array.from(m[0]).map((c) => `\\u${c.charCodeAt(0).toString(16).toUpperCase().padStart(4, "0")}`).join("")
          : cat === "control_chars"
            ? `\\u${m[0].charCodeAt(0).toString(16).toUpperCase().padStart(4, "0")}`
            : m[0];
      recordMatch(categories[cat], key, file, example);
    }
  }
}

/**
 * Adaptive chunked async extraction.
 *
 * Auto-tunes batch size to keep each chunk under ~16ms (one frame), so the UI
 * stays at 60fps regardless of device speed. Strategy:
 *  - Start with a conservative chunk (200 entries).
 *  - Measure actual processing time per chunk.
 *  - Grow chunk size when fast, shrink when slow, clamped to [50, 5000].
 *  - Always yield to the event loop between chunks via `requestAnimationFrame`
 *    when available (falls back to setTimeout(0)).
 */
export async function extractTags(
  entries: ExtractorEntry[],
  onProgress?: (done: number, total: number) => void,
): Promise<TagReport> {
  const TARGET_MS = 12;     // ~16ms frame budget minus overhead
  const MIN_CHUNK = 50;
  const MAX_CHUNK = 5000;
  let chunkSize = 200;

  const categories = Object.fromEntries(
    CATEGORIES.map((c) => [c, new Map<string, Occurrence>()]),
  ) as Record<Category, Map<string, Occurrence>>;

  const yieldToUI = () =>
    new Promise<void>((r) => {
      if (typeof requestAnimationFrame === "function") {
        requestAnimationFrame(() => r());
      } else {
        setTimeout(r, 0);
      }
    });

  const now = () => (typeof performance !== "undefined" ? performance.now() : Date.now());

  let scanned = 0;
  let i = 0;
  while (i < entries.length) {
    const end = Math.min(i + chunkSize, entries.length);
    const t0 = now();
    for (let j = i; j < end; j++) {
      const e = entries[j];
      if (!e.original) continue;
      try {
        scanSingle(e.original, e.msbtFile || "(unknown)", categories);
        scanned++;
      } catch {
        // never crash on a single bad entry
      }
    }
    const elapsed = now() - t0;
    i = end;

    onProgress?.(i, entries.length);
    await yieldToUI();

    // Adaptive resize: aim for TARGET_MS per chunk.
    if (elapsed > 0) {
      const ratio = TARGET_MS / elapsed;
      // Dampen the adjustment (75% old, 25% new) to avoid oscillation.
      const next = chunkSize * (0.75 + 0.25 * ratio);
      chunkSize = Math.max(MIN_CHUNK, Math.min(MAX_CHUNK, Math.round(next)));
    }
  }

  return { totalEntries: entries.length, scannedEntries: scanned, categories };
}

const CATEGORY_LABELS: Record<Category, string> = {
  bracket_tags: "Bracket Tags [Tag:Value]",
  paired_tags: "Paired Tags [Tag]...[/Tag]",
  curly_vars: "Curly Variables {var}",
  html_like: "HTML-like <tag>",
  escape_seq: "Escape Sequences \\xNN \\uNNNN",
  pua_chars: "PUA Characters (U+E000..U+E0FF) — likely icons",
  control_chars: "Control / BiDi Characters",
  dollar_vars: "Dollar Variables $N / $name",
  percent_vars: "Percent Format Specifiers %s %d",
};

export function formatReport(report: TagReport): string {
  const lines: string[] = [];
  const now = new Date().toISOString();
  lines.push(`# Xenoblade Technical Tag Report`);
  lines.push(`# Generated: ${now}`);
  lines.push(`# Entries scanned: ${report.scannedEntries} / ${report.totalEntries}`);
  lines.push("");

  for (const cat of CATEGORIES) {
    const map = report.categories[cat];
    if (map.size === 0) continue;
    const sorted = [...map.entries()].sort((a, b) => b[1].count - a[1].count);
    const totalCount = sorted.reduce((s, [, v]) => s + v.count, 0);
    lines.push(`========================================================`);
    lines.push(`=== ${CATEGORY_LABELS[cat]}`);
    lines.push(`=== Unique: ${sorted.length}    Total occurrences: ${totalCount}`);
    lines.push(`========================================================`);
    for (const [token, occ] of sorted) {
      const files = [...occ.files].slice(0, 8).join(", ");
      const more = occ.files.size > 8 ? ` (+${occ.files.size - 8} more)` : "";
      lines.push(`${token}`);
      lines.push(`  count: ${occ.count}`);
      lines.push(`  files: ${files}${more}`);
      lines.push(`  example: ${occ.example.replace(/\n/g, "\\n")}`);
      lines.push("");
    }
    lines.push("");
  }

  if (lines.length <= 4) lines.push("(no technical tokens found)");
  return lines.join("\n");
}

export function downloadReport(report: TagReport, filename?: string) {
  const text = formatReport(report);
  const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  const stamp = new Date().toISOString().slice(0, 10);
  a.download = filename || `xc-tags-report-${stamp}.txt`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Tests whether `text` contains at least one match for the given category —
 * used by CleanupToolsPanel to wire its category filter chips into the
 * editor's real entry filter (via matching entry keys), without duplicating
 * each category's regex there. */
export function categoryMatches(cat: Category, text: string): boolean {
  const re = PATTERNS[cat];
  re.lastIndex = 0;
  return re.test(text);
}

export type { Category };
