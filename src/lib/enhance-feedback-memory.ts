/**
 * Learned Feedback Memory (IndexedDB-backed) — لأداة تحسين الترجمة بالذكاء الاصطناعي.
 *
 * كل مرّة يرفض المستخدم اقتراحاً أو يعدّله يدويّاً بدل قبوله كما هو، هذا إشارة
 * أنّ الـ AI أخطأ لهذا النمط من النصّ. نُسجّل هذه الإشارات هنا، ثم نُرسِل أحدثها
 * كأمثلة "تجنّب تكرار هذا الخطأ" ضمن الـ prompt في الطلبات القادمة — تعلّم من
 * سياق قصير (in-context)، وليس تدريباً فعليّاً للنموذج.
 *
 * Cap: حتى 300 إدخال (الأحدث يُبقى، الأقدم يُحذف عند التجاوز).
 */

import { idbGet, idbSet } from "./idb-storage";

const KEY = "enhance-feedback-memory-v1";
const MAX_ENTRIES = 300;

export interface FeedbackEntry {
  /** EnhanceSuggestion.type أو GrammarIssue.category — تصنيف حرّ، لا نفرض تطابقاً بين الاثنين. */
  type: string;
  original: string;
  aiSuggested: string;
  userAction: "dismissed" | "edited";
  /** النص النهائي الذي طبّقه المستخدم فعلياً، فقط عند userAction === "edited". */
  userFinal?: string;
  ts: number;
}

type FeedbackStore = FeedbackEntry[];

let memCache: FeedbackStore | null = null;
let loadPromise: Promise<FeedbackStore> | null = null;

async function loadStore(): Promise<FeedbackStore> {
  if (memCache) return memCache;
  if (loadPromise) return loadPromise;
  loadPromise = (async () => {
    try {
      const stored = await idbGet<FeedbackStore>(KEY);
      memCache = Array.isArray(stored) ? stored : [];
    } catch {
      memCache = [];
    }
    return memCache;
  })();
  return loadPromise;
}

async function saveStore(): Promise<void> {
  if (!memCache) return;
  if (memCache.length > MAX_ENTRIES) {
    memCache = memCache.slice(memCache.length - MAX_ENTRIES);
  }
  try {
    await idbSet(KEY, memCache);
  } catch (err) {
    console.warn("[enhance-feedback-memory] save failed:", err);
  }
}

/** سجّل رفض/تعديل اقتراح واحد. */
export async function recordFeedback(entry: Omit<FeedbackEntry, "ts">): Promise<void> {
  if (!entry.original?.trim() || !entry.aiSuggested?.trim()) return;
  const store = await loadStore();
  store.push({ ...entry, ts: Date.now() });
  await saveStore();
}

function truncate(s: string, max = 80): string {
  return s.length > max ? `${s.slice(0, max)}…` : s;
}

/** نقيّة — تُنسّق قائمة إدخالات إلى كتلة نصّية تُحقن في الـ prompt. مُصدَّرة للاختبار. */
export function formatFeedbackForPrompt(entries: FeedbackEntry[]): string {
  if (entries.length === 0) return "";
  const lines = entries.map((e, i) => {
    const outcome = e.userAction === "dismissed"
      ? "رفض المستخدم الاقتراح (الترجمة الحالية كانت صحيحة فعلاً)"
      : `عدّله المستخدم يدويّاً إلى: "${truncate(e.userFinal || "")}"`;
    return `${i + 1}. النص: "${truncate(e.original)}" — اقترح الذكاء الاصطناعي: "${truncate(e.aiSuggested)}" — لكن ${outcome}`;
  });
  return `**أمثلة من مراجعات سابقة لهذا المستخدم (تجنّب تكرار نفس نمط الخطأ):**\n${lines.join("\n")}`;
}

/** آخر N إدخال، جاهزة كنصّ مباشر للحقن في الـ prompt. */
export async function getRecentFeedbackForPrompt(limit = 8): Promise<string> {
  const store = await loadStore();
  const recent = [...store].sort((a, b) => b.ts - a.ts).slice(0, limit);
  return formatFeedbackForPrompt(recent);
}

export async function clearFeedbackMemory(): Promise<void> {
  memCache = [];
  await saveStore();
}

export async function feedbackMemoryStats(): Promise<{ count: number }> {
  const store = await loadStore();
  return { count: store.length };
}
