/**
 * Result Cache لأداة تحسين الترجمة بالذكاء الاصطناعي (IndexedDB-backed).
 *
 * يمنع إعادة سؤال الـ AI عن نصّ لم يتغيّر منذ آخر فحص بنفس السياق (الموديل +
 * الوضع + القواعد المُفعَّلة + القواعد المخصّصة + التعليمات الإضافية) — يشمل
 * حالة "لا توجد مشكلة" (تُخزَّن أيضاً كـ payload=null لتجنّب إعادة الفحص، لا
 * فقط الاقتراحات الموجَبة).
 *
 * Invalidation طبيعيّة بالكامل: أي تغيير في النصّ الأصلي/الترجمة/الموديل/الوضع/
 * القواعد يُنتج contextSignature أو مفتاحاً مختلفاً تلقائياً — لا حاجة لمسح يدويّ.
 *
 * Cap: حتى 10,000 إدخال (LRU بسيط بالـ updatedAt).
 */

import { idbGet, idbSet } from "./idb-storage";

const CACHE_KEY = "enhanceResultCacheV1";
const MAX_ENTRIES = 10_000;

export interface CachedResult {
  /** العنصر الخام كما أعادته الـ AI (نفس شكل عنصر في suggestions/issues/results)، أو null إن تأكّد سابقاً عدم وجود مشكلة. */
  payload: unknown | null;
  updatedAt: number;
}

type CacheMap = Record<string, CachedResult>;

let memCache: CacheMap | null = null;
let loadPromise: Promise<CacheMap> | null = null;
let dirty = false;
let saveTimer: ReturnType<typeof setTimeout> | null = null;

/** نقيّة — تبني مفتاحاً مستقراً من النصّ + توقيع سياق الفحص. مُصدَّرة للاختبار. */
export function makeEnhanceCacheKey(original: string, translation: string, contextSignature: string): string {
  return `${contextSignature}|${original.trim()}|${translation.trim()}`;
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

function scheduleSave() {
  if (!dirty) return;
  if (saveTimer !== null) return;
  saveTimer = setTimeout(async () => {
    saveTimer = null;
    if (!memCache || !dirty) return;
    dirty = false;
    try {
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
      console.warn("[enhance-cache] save failed:", err);
    }
  }, 800);
}

export async function enhanceCacheLookup(key: string): Promise<CachedResult | undefined> {
  const cache = await loadCache();
  return cache[key];
}

export async function enhanceCacheStore(key: string, payload: unknown | null): Promise<void> {
  const cache = await loadCache();
  cache[key] = { payload, updatedAt: Date.now() };
  dirty = true;
  scheduleSave();
}

export async function enhanceCacheClear(): Promise<void> {
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

export async function enhanceCacheStats(): Promise<{ count: number }> {
  const cache = await loadCache();
  return { count: Object.keys(cache).length };
}
