export type OpenRouterModelOption = {
  id: string;
  label: string;
  desc: string;
  badge: string;
};

export const OPENROUTER_FREE_MODELS: OpenRouterModelOption[] = [
  { id: "z-ai/glm-4.5-air:free", label: "GLM 4.5 Air", desc: "Z.AI — الخيار الافتراضي الحالي", badge: "🆕" },
  { id: "google/gemma-2-9b-it:free", label: "Gemma 2 9B", desc: "Google — خفيف ومتوازن", badge: "✨" },
  { id: "meta-llama/llama-3.2-3b-instruct:free", label: "Llama 3.2 3B", desc: "Meta — متعدد اللغات", badge: "🦙" },
  { id: "microsoft/phi-3-mini-128k-instruct:free", label: "Phi-3 Mini 128K", desc: "Microsoft — سريع وطويل السياق", badge: "⚡" },
  { id: "microsoft/phi-3-medium-128k-instruct:free", label: "Phi-3 Medium 128K", desc: "Microsoft — أدق قليلاً", badge: "🎯" },
];

export const DEFAULT_OPENROUTER_MODEL = OPENROUTER_FREE_MODELS[0].id;

export function isOpenRouterModelId(value?: string | null): boolean {
  return Boolean(value && OPENROUTER_FREE_MODELS.some((model) => model.id === value));
}