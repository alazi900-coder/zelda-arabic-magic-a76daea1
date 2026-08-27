import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  GMICLOUD_DIRECT_ENDPOINT,
  formatGmiCloudDirectModel,
  isGmiCloudDirectModel,
  requestGmiCloudDirect,
  requestGmiCloudJson,
} from '../lib/gmicloud-direct';

const completedJson = (value: Record<string, unknown>) => new Response(JSON.stringify({
  choices: [{ message: { content: JSON.stringify(value) } }],
}), { status: 200, headers: { 'Content-Type': 'application/json' } });

afterEach(() => vi.unstubAllGlobals());

describe('GMICLOUD direct transport', () => {
  it('keeps the two verified MiniMax identifiers and their user-facing labels in one place', () => {
    expect(isGmiCloudDirectModel('MiniMaxAI/MiniMax-M2.7')).toBe(true);
    expect(isGmiCloudDirectModel('MiniMaxAI/MiniMax-M3')).toBe(true);
    expect(isGmiCloudDirectModel('MiniMax-M3')).toBe(false);
    expect(formatGmiCloudDirectModel('MiniMaxAI/MiniMax-M3')).toBe('MiniMax M3');
  });

  it('uses only the direct GMICLOUD endpoint for structured tool requests', async () => {
    const fetchMock = vi.fn().mockResolvedValue(completedJson({ suggestions: [] }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(requestGmiCloudJson<{ suggestions: unknown[] }>({
      apiKey: 'session-key',
      model: 'MiniMaxAI/MiniMax-M3',
      system: 'system instruction',
      user: 'user payload',
    })).resolves.toEqual({ suggestions: [] });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [endpoint, options] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(endpoint).toBe(GMICLOUD_DIRECT_ENDPOINT);
    expect(options.headers).toMatchObject({ Authorization: 'Bearer session-key' });
    expect(JSON.parse(String(options.body))).toMatchObject({ model: 'MiniMaxAI/MiniMax-M3' });
  });

  it('routes text translation through the same direct request contract', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(completedJson({ row_1: 'ترجمة' })));

    const response = await requestGmiCloudDirect({
      apiKey: 'session-key',
      model: 'MiniMaxAI/MiniMax-M2.7',
      entries: [{ key: 'row_1', original: 'Original' }],
      signal: undefined,
    });

    await expect(response.json()).resolves.toEqual({
      translations: { row_1: 'ترجمة' },
      providerUsed: 'GMICLOUD / MiniMax M2.7 (direct)',
    });
  });

  it('rejects an unsupported model before any network request', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await expect(requestGmiCloudJson({
      apiKey: 'session-key',
      model: 'MiniMax-M3',
      system: 'system instruction',
      user: 'user payload',
    })).rejects.toThrow('نموذج GMICLOUD المختار غير متاح');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
