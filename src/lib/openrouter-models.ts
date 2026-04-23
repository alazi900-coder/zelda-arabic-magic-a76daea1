import { getEdgeFunctionUrl, getSupabaseHeaders } from "@/lib/supabase-edge";

export type OpenRouterModelOption = {
  id: string;
  label: string;
  desc: string;
  badge: string;
};

// Built-in fallback list (used if cache empty AND fetch fails)
export const OPENROUTER_FREE_MODELS_FALLBACK: OpenRouterModelOption[] = [
  { id: "z-ai/glm-4.5-air:free", label: "GLM 4.5 Air", desc: "Z.AI — قوي ومتوازن", badge: "🆕" },
  { id: "openai/gpt-oss-120b:free", label: "GPT-OSS 120B", desc: "OpenAI — مفتوح وضخم", badge: "🧠" },
  { id: "qwen/qwen3-next-80b-a3b-instruct:free", label: "Qwen3 Next 80B", desc: "Qwen — متعدد اللغات ممتاز", badge: "🐉" },
  { id: "nvidia/nemotron-nano-9b-v2:free", label: "Nemotron Nano 9B", desc: "NVIDIA — سريع", badge: "💚" },
  { id: "google/gemma-2-9b-it:free", label: "Gemma 2 9B", desc: "Google — متوازن", badge: "✨" },
];

export const DEFAULT_OPENROUTER_MODEL = "z-ai/glm-4.5-air:free";
const STORAGE_KEY = "openrouter_models_cache_v2";
const STORAGE_TIME_KEY = "openrouter_models_fetched_at_v2";

// In-memory cache (persists across components within the SPA session)
let runtimeCache: OpenRouterModelOption[] | null = null;

/** Read cached models from localStorage; returns fallback if absent. */
export function getOpenRouterModels(): OpenRouterModelOption[] {
  if (runtimeCache) return runtimeCache;
  try {
    const raw = typeof window !== "undefined" ? window.localStorage.getItem(STORAGE_KEY) : null;
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        runtimeCache = parsed;
        return parsed;
      }
    }
  } catch {
    /* ignore */
  }
  return OPENROUTER_FREE_MODELS_FALLBACK;
}

/** Last fetch timestamp (ISO string) or null. */
export function getOpenRouterFetchedAt(): string | null {
  try {
    return typeof window !== "undefined" ? window.localStorage.getItem(STORAGE_TIME_KEY) : null;
  } catch {
    return null;
  }
}

/** Fetch fresh models from edge function and cache them. */
export async function refreshOpenRouterModels(): Promise<OpenRouterModelOption[]> {
  const resp = await fetch(getEdgeFunctionUrl("list-openrouter-models"), {
    method: "GET",
    headers: getSupabaseHeaders(),
  });
  if (!resp.ok) {
    let msg = `HTTP ${resp.status}`;
    try {
      const j = await resp.json();
      if (j?.error) msg = j.error;
    } catch {
      /* ignore */
    }
    throw new Error(msg);
  }
  const data = await resp.json();
  const models: OpenRouterModelOption[] = (data?.models || []).map((m: any) => ({
    id: m.id,
    label: m.label,
    desc: m.desc,
    badge: m.badge || "🆓",
  }));
  if (!Array.isArray(models) || models.length === 0) {
    throw new Error("القائمة المُستلمة فارغة");
  }
  runtimeCache = models;
  try {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(models));
      window.localStorage.setItem(STORAGE_TIME_KEY, new Date().toISOString());
    }
  } catch {
    /* ignore */
  }
  return models;
}

export function isOpenRouterModelId(value?: string | null): boolean {
  if (!value) return false;
  if (!value.endsWith(":free")) return false;
  // Accept any cached model OR fallback
  const all = [...getOpenRouterModels(), ...OPENROUTER_FREE_MODELS_FALLBACK];
  return all.some((m) => m.id === value);
}

// Backward compat — used by CompareEnginesDialog and Editor.tsx
// Returns the *current* cached list (or fallback). Components that want to
// re-render on refresh should call getOpenRouterModels() inside their render.
export const OPENROUTER_FREE_MODELS = getOpenRouterModels();
