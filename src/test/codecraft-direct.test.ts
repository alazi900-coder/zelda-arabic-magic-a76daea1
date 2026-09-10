import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { CODECRAFT_DIRECT_ENDPOINT, requestCodeCraftDirect } from '../lib/codecraft-direct';

/**
 * Choosing CodeCraft used to reach the Edge Function, and any deployed version
 * without its provider branch dropped the request into that function's final
 * `else` — the Gemini path — which then failed 404 naming a model the
 * translator never chose. Going direct takes the deploy out of the loop, so
 * what these guard is that the request really does leave the browser for
 * CodeCraft and never for anything else.
 */
const completion = (value: Record<string, unknown>) => new Response(JSON.stringify({
  choices: [{ message: { content: JSON.stringify(value) } }],
}), { status: 200, headers: { 'Content-Type': 'application/json' } });

afterEach(() => vi.unstubAllGlobals());

describe('CodeCraft direct transport', () => {
  it('sends the translation to CodeCraft with the chosen key and model', async () => {
    const fetchMock = vi.fn().mockResolvedValue(completion({ row_1: 'ترجمة' }));
    vi.stubGlobal('fetch', fetchMock);

    const response = await requestCodeCraftDirect({
      apiKey: 'cc-test-key',
      model: 'claude-opus-5',
      entries: [{ key: 'row_1', original: 'Original' }],
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [endpoint, options] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(endpoint).toBe(CODECRAFT_DIRECT_ENDPOINT);
    expect(endpoint).toContain('codecraftapi.com');
    expect(options.headers).toMatchObject({ Authorization: 'Bearer cc-test-key' });
    expect(JSON.parse(String(options.body))).toMatchObject({ model: 'claude-opus-5' });
    await expect(response.json()).resolves.toEqual({
      translations: { row_1: 'ترجمة' },
      providerUsed: 'CodeCraft / claude-opus-5 (direct)',
    });
  });

  it('accepts any model the account catalogue offers, since CodeCraft is a router', async () => {
    const fetchMock = vi.fn().mockResolvedValue(completion({ a: 'ب' }));
    vi.stubGlobal('fetch', fetchMock);

    await requestCodeCraftDirect({
      apiKey: 'k',
      model: 'some-model-added-next-month',
      entries: [{ key: 'a', original: 'A' }],
    });

    expect(JSON.parse(String((fetchMock.mock.calls[0] as [string, RequestInit])[1].body)))
      .toMatchObject({ model: 'some-model-added-next-month' });
  });

  it('refuses without a key before touching the network', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const response = await requestCodeCraftDirect({ entries: [{ key: 'a', original: 'A' }] });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ error: expect.stringContaining('CodeCraft') });
  });

  it('reports the CodeCraft error rather than falling back to another provider', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(
      JSON.stringify({ error: { message: 'model not found' } }), { status: 404 },
    )));

    const response = await requestCodeCraftDirect({
      apiKey: 'k', model: 'gone', entries: [{ key: 'a', original: 'A' }],
    });

    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body.error).toContain('model not found');
    expect(JSON.stringify(body)).not.toContain('Gemini');
  });

  it('never routes a codecraft translation through the edge function', () => {
    const hook = readFileSync(resolve(__dirname, '../hooks/useEditorTranslation.ts'), 'utf8');
    const fn = hook.slice(hook.indexOf('const requestTranslation'), hook.indexOf('getEdgeFunctionUrl("translate-entries")'));
    expect(fn).toContain("payload.provider === 'codecraft'");
    expect(fn).toContain('requestCodeCraftDirect');
  });
});
