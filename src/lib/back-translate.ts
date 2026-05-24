import { fetchWithTimeout } from "./fetch-with-timeout";

/**
 * Translate Arabic text back to English using Google Translate free API.
 * Used to verify translation accuracy by comparing with original.
 */
export async function backTranslate(arabicText: string): Promise<string> {
  const text = encodeURIComponent(arabicText);
  const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=ar&tl=en&dt=t&q=${text}`;
  const response = await fetchWithTimeout(url);
  if (!response.ok) throw new Error(`Back-translate failed: ${response.status}`);
  const data = await response.json();
  return ((data?.[0] as [string, string][] | undefined)
    ?.map((seg: [string, string]) => seg[0])
    .join('') || '').trim();
}

/**
 * Calculate similarity between original English and back-translated English.
 * Returns 0–100 percentage.
 */
export function textSimilarity(a: string, b: string): number {
  const aNorm = a.toLowerCase().replace(/[^a-z0-9\s]/g, '').trim();
  const bNorm = b.toLowerCase().replace(/[^a-z0-9\s]/g, '').trim();
  if (aNorm === bNorm) return 100;
  if (!aNorm || !bNorm) return 0;

  const aWords = new Set(aNorm.split(/\s+/));
  const bWords = new Set(bNorm.split(/\s+/));
  let overlap = 0;
  for (const w of aWords) {
    if (bWords.has(w)) overlap++;
  }
  const union = new Set([...aWords, ...bWords]).size;
  return Math.round((overlap / Math.max(union, 1)) * 100);
}

/** Tokenize a string into words (lowercase, strip punctuation). */
function tokenize(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter((t) => t.length > 1);
}

/** Build set of bigrams from tokens. */
function bigrams(tokens: string[]): Set<string> {
  const out = new Set<string>();
  for (let i = 0; i < tokens.length - 1; i++) {
    out.add(`${tokens[i]} ${tokens[i + 1]}`);
  }
  return out;
}

/**
 * Sorensen-Dice similarity over unigrams + bigrams.
 * Returns 0–1 (1 = identical).
 */
export function diceSimilarity(a: string, b: string): number {
  const ta = tokenize(a);
  const tb = tokenize(b);
  if (ta.length === 0 || tb.length === 0) return 0;
  const setA = new Set<string>([...ta, ...bigrams(ta)]);
  const setB = new Set<string>([...tb, ...bigrams(tb)]);
  let inter = 0;
  for (const x of setA) if (setB.has(x)) inter++;
  return (2 * inter) / (setA.size + setB.size);
}

/**
 * Jaccard similarity over unigrams only — measures whether the same words
 * appear in both texts regardless of order. Returns 0–1.
 */
export function wordsJaccard(a: string, b: string): number {
  const ta = tokenize(a);
  const tb = tokenize(b);
  if (ta.length === 0 || tb.length === 0) return 0;
  const setA = new Set(ta);
  const setB = new Set(tb);
  let inter = 0;
  for (const x of setA) if (setB.has(x)) inter++;
  const union = new Set([...ta, ...tb]).size;
  return inter / Math.max(union, 1);
}

/**
 * Bigram (consecutive word pairs) overlap — measures how well the word
 * order is preserved. Returns 0–1 over the symmetric Sorensen-Dice on
 * bigrams alone.
 */
export function orderOverlap(a: string, b: string): number {
  const ta = tokenize(a);
  const tb = tokenize(b);
  const ba = bigrams(ta);
  const bb = bigrams(tb);
  if (ba.size === 0 || bb.size === 0) return 0;
  let inter = 0;
  for (const x of ba) if (bb.has(x)) inter++;
  return (2 * inter) / (ba.size + bb.size);
}

/**
 * Whether `orderOverlap` is meaningful for the given pair. Both texts must
 * tokenize to ≥ 3 words; below that there are 0–1 bigrams and the metric
 * collapses to a binary 0/1 that produces false "wrong order" alerts on
 * single-word translations like "Someday..." → "يوما ما...".
 */
export function isOrderComparable(a: string, b: string): boolean {
  return tokenize(a).length >= 3 && tokenize(b).length >= 3;
}

export type BackTranslateResult = { arabic: string; english: string; error?: string };

/**
 * Batch back-translate Arabic texts with concurrency control.
 * Returns array of results in same order as input.
 * Pass `shouldAbort` to allow early termination between chunks.
 * `onChunkDone` fires after each chunk with the chunk's results and start index.
 */
export async function backTranslateBatch(
  texts: string[],
  concurrency = 3,
  onProgress?: (done: number, total: number) => void,
  shouldAbort?: () => boolean,
  onChunkDone?: (chunkResults: BackTranslateResult[], startIdx: number) => void,
): Promise<BackTranslateResult[]> {
  const results: BackTranslateResult[] = new Array(texts.length);
  let done = 0;

  for (let i = 0; i < texts.length; i += concurrency) {
    if (shouldAbort?.()) break;
    const chunk = texts.slice(i, i + concurrency);
    const chunkResults = await Promise.all(
      chunk.map(async (text) => {
        try {
          const english = await backTranslate(text);
          return { arabic: text, english };
        } catch (err) {
          return { arabic: text, english: '', error: String(err) };
        }
      }),
    );
    for (let j = 0; j < chunkResults.length; j++) {
      results[i + j] = chunkResults[j];
    }
    done += chunk.length;
    onProgress?.(done, texts.length);
    onChunkDone?.(chunkResults, i);
  }

  return results;
}
