import { describe, expect, it } from 'vitest';
import {
  GMICLOUD_OPENAI_BASE_URL,
  GMICLOUD_TEXT_MODELS,
  resolveGmiCloudTextModel,
} from '../../supabase/functions/_shared/gmicloud.ts';

describe('GMICLOUD translation model allowlist', () => {
  it('uses the documented OpenAI-compatible LLM endpoint', () => {
    expect(GMICLOUD_OPENAI_BASE_URL).toBe('https://api.gmi-serving.com/v1');
  });

  it('allows the two verified MiniMax text models', () => {
    expect(GMICLOUD_TEXT_MODELS).toEqual({
      'MiniMaxAI/MiniMax-M2.7': 'MiniMaxAI/MiniMax-M2.7',
      'MiniMaxAI/MiniMax-M3': 'MiniMaxAI/MiniMax-M3',
    });
    expect(resolveGmiCloudTextModel('MiniMaxAI/MiniMax-M2.7')).toBe('MiniMaxAI/MiniMax-M2.7');
    expect(resolveGmiCloudTextModel('MiniMaxAI/MiniMax-M3')).toBe('MiniMaxAI/MiniMax-M3');
  });

  it('rejects short names and the music-only model', () => {
    expect(resolveGmiCloudTextModel('MiniMax-M3')).toBeUndefined();
    expect(resolveGmiCloudTextModel('minimax-music-3.0')).toBeUndefined();
  });
});
