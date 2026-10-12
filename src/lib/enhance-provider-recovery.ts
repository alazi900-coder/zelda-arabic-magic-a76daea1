/**
 * Small, deterministic safeguards for provider-specific AI review batches.
 * Never send a large unrelated project glossary to a slower reviewer.
 */
export interface ReviewBatchEntry {
  original: string;
  translation: string;
}

const REVIEW_GLOSSARY_MAX_CHARS = 3500;

export function relevantReviewGlossary(
  glossary: string | undefined,
  entries: readonly ReviewBatchEntry[],
): string {
  if (!glossary?.trim() || !entries.length) return "";
  const haystack = entries.map(e => e.original + " " + e.translation).join("\n").toLocaleLowerCase();
  const picked: string[] = [];
  let length = 0;
  // Entries are formatted as English term → Arabic, or pipe/tab/equals
  // separated. Unknown lines are deliberately excluded, never included en
  // masse merely because the glossary is small.
  for (const line of glossary.split(/\r?\n/)) {
    const sep = line.match(/→|\||\t|=|:/);
    if (!sep || sep.index === undefined) continue;
    const term = line.slice(0, sep.index).trim().replace(/^[-*]\s*/, "");
    if (term.length < 2 || term.length > 120 || !haystack.includes(term.toLocaleLowerCase())) continue;
    const cleaned = line.trim();
    if (length + cleaned.length + (picked.length ? 1 : 0) > REVIEW_GLOSSARY_MAX_CHARS) break;
    picked.push(cleaned);
    length += cleaned.length + (picked.length > 1 ? 1 : 0);
  }
  return picked.join("\n");
}

/** Supabase FunctionsHttpError stores HTTP status in context (a Response). */
export function isReviewRateLimit(error: unknown): boolean {
  if (typeof error === "object" && error !== null) {
    const e = error as { status?: number; context?: { status?: number }; message?: string; error?: unknown };
    if (e.status === 429 || e.context?.status === 429) return true;
    if (typeof e.message === "string") return isReviewRateLimit(e.message);
    if (e.error != null) return isReviewRateLimit(e.error);
  }
  return /(?:\b429\b|rate.?limit|tokens.?per.?minute|requests.?per.?minute|TPM\b|RPM\b|تجاوز.*(?:الحد|الطلب)|حد.?الطلبات)/i.test(String(error ?? ""));
}

/** Abortable inter-batch pacing and 429 cooldown with no orphaned listeners. */
export function waitForReviewCooldown(ms: number, signal: AbortSignal): Promise<void> {
  if (signal.aborted) return Promise.reject(new DOMException("Aborted", "AbortError"));
  return new Promise((resolve, reject) => {
    const cancel = () => {
      clearTimeout(timer);
      signal.removeEventListener("abort", cancel);
      reject(new DOMException("Aborted", "AbortError"));
    };
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", cancel);
      resolve();
    }, ms);
    signal.addEventListener("abort", cancel, { once: true });
  });
}
