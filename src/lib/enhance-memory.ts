// Persistent memory of approved/dismissed translations for AI Enhance
// Stored in IndexedDB so reviewed entries are skipped automatically next time.
import { idbGet, idbSet } from "./idb-storage";

const KEY = "enhance-review-memory-v1";

export interface ReviewMemory {
  // Per entry-key: hash of translation that was approved/dismissed
  approved: Record<string, string>;  // key -> hash of translation
  dismissed: Record<string, string>;
}

let cache: ReviewMemory | null = null;

function hash(s: string): string {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  }
  return h.toString(36);
}

export async function loadReviewMemory(): Promise<ReviewMemory> {
  if (cache) return cache;
  const data = await idbGet<ReviewMemory>(KEY);
  cache = data || { approved: {}, dismissed: {} };
  return cache;
}

export async function saveReviewMemory(): Promise<void> {
  if (cache) await idbSet(KEY, cache);
}

export async function markReviewed(key: string, translation: string, kind: "approved" | "dismissed"): Promise<void> {
  const mem = await loadReviewMemory();
  mem[kind][key] = hash(translation);
  await saveReviewMemory();
}

export async function isReviewed(key: string, translation: string): Promise<boolean> {
  const mem = await loadReviewMemory();
  const h = hash(translation);
  return mem.approved[key] === h || mem.dismissed[key] === h;
}

export function isReviewedSync(mem: ReviewMemory, key: string, translation: string): boolean {
  const h = hash(translation);
  return mem.approved[key] === h || mem.dismissed[key] === h;
}

export async function clearReviewMemory(): Promise<void> {
  cache = { approved: {}, dismissed: {} };
  await saveReviewMemory();
}

export async function exportReviewMemory(): Promise<string> {
  const mem = await loadReviewMemory();
  return JSON.stringify(mem, null, 2);
}

export async function importReviewMemory(json: string, mode: "merge" | "replace" = "merge"): Promise<number> {
  const incoming = JSON.parse(json) as Partial<ReviewMemory>;
  const mem = mode === "replace" ? { approved: {}, dismissed: {} } : await loadReviewMemory();
  let count = 0;
  for (const [k, v] of Object.entries(incoming.approved || {})) {
    mem.approved[k] = v as string; count++;
  }
  for (const [k, v] of Object.entries(incoming.dismissed || {})) {
    mem.dismissed[k] = v as string; count++;
  }
  cache = mem;
  await saveReviewMemory();
  return count;
}
