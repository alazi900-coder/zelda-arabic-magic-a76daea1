/**
 * GMICLOUD values verified against its official LLM API documentation.
 * Keep this allowlist deliberately narrow: translation needs a text model with
 * a documented ID, not merely a model name visible in a console dashboard.
 */
export const GMICLOUD_OPENAI_BASE_URL = 'https://api.gmi-serving.com/v1';

export const GMICLOUD_TEXT_MODELS = {
  'MiniMaxAI/MiniMax-M2.7': 'MiniMaxAI/MiniMax-M2.7',
  'MiniMaxAI/MiniMax-M3': 'MiniMaxAI/MiniMax-M3',
} as const;

export type GmiCloudTextModel = keyof typeof GMICLOUD_TEXT_MODELS;

export function resolveGmiCloudTextModel(model: string | undefined): string | undefined {
  if (!model) return GMICLOUD_TEXT_MODELS['MiniMaxAI/MiniMax-M2.7'];
  return GMICLOUD_TEXT_MODELS[model as GmiCloudTextModel];
}
