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
  "pua_chars",         // U+E000..U+F8FF
  "control_chars",     // U+FFF9..U+FFFC, BiDi marks
  "uppercase_tokens",  // FAT, EXP, ABCDEF (≥2 uppercase letters, standalone)
  "dollar_vars",       // $1, $2, $name
  "percent_vars",      // %s, %d, %1$s
] as const;
type Category = (typeof CATEGORIES)[number];

const PATTERNS: Record<Category, RegExp> = {
  paired_tags: /\[\s*\w+\s*:[^\]]*\][^[]*?\[\/\s*\w+\s*:[^\]]*\]/g,
  bracket_tags: /\\?\[\s*\/?\s*[A-Za-z][\w\s:=.'\/-]*\s*\\?\]/g,
  curly_vars: /\{[^{}]{1,60}\}/g,
  html_like: /<\/?[A-Za-z][^>]{0,80}>/g,
  escape_seq: /\\[xun][0-9A-Fa-f]{2,8}|\\[ntr0]/g,
  pua_chars: /[\uE000-\uF8FF]+/g,
  control_chars: /[\uFFF9-\uFFFC\u200E\u200F\u202A-\u202E\u2066-\u2069]/g,
  uppercase_tokens: /(?<![A-Za-z])[A-Z]{2,10}(?![A-Za-z])/g,
  dollar_vars: /\$\w+/g,
  percent_vars: /%[\d.$-]*[sdif]/g,
};

function recordMatch(map: Map<string, Occurrence>, token: string, file: string, example: string) {
  const existing = map.get(token);
  if (existing) {
    existing.count++;
    if (existing.files.size < 20) existing.files.add(file);
  } else {
    map.set(token, { count: 1, files: new Set([file]), example });
  }
}

function scanSingle(text: string, file: string, categories: Record<Category, Map<string, Occurrence>>) {
  for (const cat of CATEGORIES) {
    const re = new RegExp(PATTERNS[cat].source, PATTERNS[cat].flags);
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      const token = cat === "pua_chars"
        ? Array.from(m[0]).map((c) => `\\u${c.charCodeAt(0).toString(16).toUpperCase().padStart(4, "0")}`).join("")
        : cat === "control_chars"
          ? `\\u${m[0].charCodeAt(0).toString(16).toUpperCase().padStart(4, "0")}`
          : m[0];
      const example = text.length > 100 ? text.slice(0, 97) + "..." : text;
      recordMatch(categories[cat], token, file, example);
    }
  }
}

/**
 * Chunked async extraction. Yields to the event loop every CHUNK_SIZE entries
 * so the UI stays responsive even on 50k+ entries.
 */
export async function extractTags(
  entries: ExtractorEntry[],
  onProgress?: (done: number, total: number) => void,
): Promise<TagReport> {
  const CHUNK_SIZE = 500;
  const categories = Object.fromEntries(
    CATEGORIES.map((c) => [c, new Map<string, Occurrence>()]),
  ) as Record<Category, Map<string, Occurrence>>;

  let scanned = 0;
  for (let i = 0; i < entries.length; i += CHUNK_SIZE) {
    const chunk = entries.slice(i, i + CHUNK_SIZE);
    for (const e of chunk) {
      if (!e.original) continue;
      try {
        scanSingle(e.original, e.msbtFile || "(unknown)", categories);
        scanned++;
      } catch {
        // never crash on a single bad entry
      }
    }
    onProgress?.(Math.min(i + CHUNK_SIZE, entries.length), entries.length);
    await new Promise<void>((r) => setTimeout(r, 0));
  }

  return { totalEntries: entries.length, scannedEntries: scanned, categories };
}

const CATEGORY_LABELS: Record<Category, string> = {
  bracket_tags: "Bracket Tags [Tag:Value]",
  paired_tags: "Paired Tags [Tag]...[/Tag]",
  curly_vars: "Curly Variables {var}",
  html_like: "HTML-like <tag>",
  escape_seq: "Escape Sequences \\xNN \\uNNNN",
  pua_chars: "PUA Characters (U+E000..U+F8FF) — likely icons",
  control_chars: "Control / BiDi Characters",
  uppercase_tokens: "Uppercase Tokens (potential abbreviations or leaked tag names)",
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
