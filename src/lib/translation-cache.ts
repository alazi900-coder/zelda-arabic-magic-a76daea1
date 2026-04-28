/**
 * Persistent Translation Cache (IndexedDB-backed)
 *
 * يحفظ الترجمات المُنجَزة بالـ AI في IndexedDB بمفتاح يعتمد على:
 *   - النص الإنجليزي الأصلي (بعد normalize خفيف)
 *   - المزود + الموديل المُستخدَم (لتجنّب خلط جودات مختلفة)
 *
 * فائدته: عندما يطلب المستخدم ترجمة نص رأيناه من قبل (في نفس الملف أو
 * في مشروع آخر تماماً)، نُعيد الترجمة فوراً بدون أي طلب AI، فنوفّر
 * استهلاك حصة Gemini المجانية.
 *
 * يعمل عبر كل مسارات الترجمة: الفردية، الصفحة، التلقائية الكاملة، إعادة الترجمة.
 *
 * Cap: حتى 20,000 إدخال (LRU بسيط بالـ updatedAt).
 */

import { idbGet, idbSet } from "./idb-storage";

const CACHE_KEY = "translationCacheV1";
const MAX_ENTRIES = 20_000;

export interface CacheEntry {
  translation: string;
  provider: string;
  model: string;
  updatedAt: number;
}

type CacheMap = Record<string, CacheEntry>;

let memCache: CacheMap | null = null;
let loadPromise: Promise<CacheMap> | null = null;
let dirty = false;
let saveTimer: ReturnType<typeof setTimeout> | null = null;

/** Normalize the original English text into a stable cache key. */
export function normalizeOriginal(s: string): string {
  // نتعامل مع المسافات الزائدة فقط؛ نحافظ على case لأن الأسماء حساسة (Link ≠ link).
  return s.trim().replace(/\s+/g, " ");
}

function makeKey(original: string, provider: string, model: string): string {
  return `${provider}|${model}|${normalizeOriginal(original)}`;
}

async function loadCache(): Promise<CacheMap> {
  if (memCache) return memCache;
  if (loadPromise) return loadPromise;
  loadPromise = (async () => {
    try {
      const stored = await idbGet<CacheMap>(CACHE_KEY);
      memCache = stored && typeof stored === "object" ? stored : {};
    } catch {
      memCache = {};
    }
    return memCache;
  })();
  return loadPromise;
}

/** Schedule a debounced flush to IndexedDB (avoids hammering disk on bulk inserts). */
function scheduleSave() {
  if (!dirty) return;
  if (saveTimer !== null) return;
  saveTimer = setTimeout(async () => {
    saveTimer = null;
    if (!memCache || !dirty) return;
    dirty = false;
    try {
      // LRU trim if over cap.
      const keys = Object.keys(memCache);
      if (keys.length > MAX_ENTRIES) {
        const sorted = keys
          .map((k) => [k, memCache![k].updatedAt] as const)
          .sort((a, b) => b[1] - a[1])
          .slice(0, MAX_ENTRIES);
        const trimmed: CacheMap = {};
        for (const [k] of sorted) trimmed[k] = memCache[k];
        memCache = trimmed;
      }
      await idbSet(CACHE_KEY, memCache);
    } catch (err) {
      console.warn("[translation-cache] save failed:", err);
    }
  }, 800);
}

/** Look up a cached translation. Returns undefined on miss. */
export async function cacheLookup(
  original: string,
  provider: string,
  model: string
): Promise<string | undefined> {
  const cache = await loadCache();
  const entry = cache[makeKey(original, provider, model)];
  if (!entry) return undefined;
  // Touch updatedAt for LRU (lazy: only update if older than 1h to reduce writes).
  if (Date.now() - entry.updatedAt > 3_600_000) {
    entry.updatedAt = Date.now();
    dirty = true;
    scheduleSave();
  }
  return entry.translation;
}

/** Bulk lookup for batches. */
export async function cacheLookupMany(
  entries: { key: string; original: string }[],
  provider: string,
  model: string
): Promise<{ hits: Record<string, string>; misses: { key: string; original: string }[] }> {
  const cache = await loadCache();
  const hits: Record<string, string> = {};
  const misses: { key: string; original: string }[] = [];
  for (const e of entries) {
    const entry = cache[makeKey(e.original, provider, model)];
    if (entry?.translation) hits[e.key] = entry.translation;
    else misses.push(e);
  }
  return { hits, misses };
}

/** Save one translation to cache. */
export async function cacheStore(
  original: string,
  translation: string,
  provider: string,
  model: string
): Promise<void> {
  if (!translation?.trim()) return;
  const cache = await loadCache();
  cache[makeKey(original, provider, model)] = {
    translation,
    provider,
    model,
    updatedAt: Date.now(),
  };
  dirty = true;
  scheduleSave();
}

/** Save many translations at once (used after a batch AI response). */
export async function cacheStoreMany(
  items: { original: string; translation: string }[],
  provider: string,
  model: string
): Promise<void> {
  if (items.length === 0) return;
  const cache = await loadCache();
  const now = Date.now();
  for (const it of items) {
    if (!it.translation?.trim()) continue;
    cache[makeKey(it.original, provider, model)] = {
      translation: it.translation,
      provider,
      model,
      updatedAt: now,
    };
  }
  dirty = true;
  scheduleSave();
}

/** Stats for UI display. */
export async function cacheStats(): Promise<{ count: number; sizeKB: number }> {
  const cache = await loadCache();
  const count = Object.keys(cache).length;
  const sizeKB = Math.round(JSON.stringify(cache).length / 1024);
  return { count, sizeKB };
}

/** Wipe the cache entirely. */
export async function cacheClear(): Promise<void> {
  memCache = {};
  dirty = false;
  if (saveTimer !== null) {
    clearTimeout(saveTimer);
    saveTimer = null;
  }
  try {
    await idbSet(CACHE_KEY, {});
  } catch {
    /* ignore */
  }
}
