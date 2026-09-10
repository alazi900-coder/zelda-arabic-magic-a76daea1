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

  it('explains a swallowed gateway error instead of blaming the connection', async () => {
    // what the browser actually does when CodeCraft answers with a gateway
    // error page: the response carries no CORS header, so fetch rejects with a
    // TypeError and the 502 never reaches us
    const fetchMock = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));
    vi.stubGlobal('fetch', fetchMock);

    const response = await requestCodeCraftDirect({
      apiKey: 'k', entries: [{ key: 'a', original: 'A' }],
    });

    expect(fetchMock).toHaveBeenCalledTimes(3); // retried before giving up
    const { error } = await response.json();
    expect(error).toContain('502');
    expect(error).toContain('CORS');
    expect(error).toContain('رصيد');
    expect(error).not.toMatch(/^تعذر الاتصال بـ CodeCraft بعد محاولات محدودة/);
  }, 15000);

  it('never routes a codecraft translation through the edge function', () => {
    const hook = src('hooks/useEditorTranslation.ts');
    const fn = hook.slice(hook.indexOf('const requestTranslation'), hook.indexOf('getEdgeFunctionUrl("translate-entries")'));
    expect(fn).toContain("payload.provider === 'codecraft'");
    expect(fn).toContain('requestCodeCraftDirect');
  });

  /**
   * Translation was only one of the panels. `enhance-translations`,
   * `review-translations` and `context-suggest` carry no CodeCraft branch at
   * all, so any of them still reaching an Edge Function answers as some other
   * provider — which is how a CodeCraft choice produced a Gemini 404 from the
   * test-connection button long after the translation path was fixed.
   */
  it.each([
    ['test-connection button', 'pages/Editor.tsx', 'requestCodeCraftDirect'],
    ['enhance panel', 'components/editor/TranslationAIEnhancePanel.tsx', 'requestCodeCraftJson'],
    ['context suggestions', 'components/editor/ContextSuggestPanel.tsx', 'requestCodeCraftJson'],
    ['engine comparison', 'components/editor/CompareEnginesDialog.tsx', 'requestCodeCraftDirect'],
  ])('sends %s straight to CodeCraft', (_label, file, transport) => {
    const text = src(file);
    expect(text, file).toContain(transport);
    expect(text, file).toMatch(/=== ['"]codecraft['"]/);
  });

  it('offers CodeCraft as an engine to compare, running the picked model', () => {
    const dialog = src('components/editor/CompareEnginesDialog.tsx');
    expect(dialog).toMatch(/id: 'codecraft'[^}]*provider: 'codecraft'/);
    // the model is the translator's pick, not a name frozen in the list
    expect(dialog).toMatch(/id: 'codecraft'[^}]*model: codeCraftModel/);
    expect(dialog).toContain('buildEngines(aiModel)');
  });

  it('picks the model in the enhance panel from the account catalogue, not a frozen list', () => {
    const panel = src('components/editor/TranslationAIEnhancePanel.tsx');
    // starts on the model chosen in the provider panel...
    expect(panel).toContain('if (provider === "codecraft") return currentModel || CODECRAFT_DEFAULT_MODEL;');
    // ...and can be pointed at any other model the key can reach
    expect(panel).toContain('fetchCodeCraftModels');
    expect(panel).toContain('CodeCraft — نماذج حسابك');
  });

  it('sends the key with an autopilot run', () => {
    const autopilot = src('hooks/useAutoPilot.ts');
    expect(autopilot).toContain("prov === 'codecraft'");
    expect(autopilot).toMatch(/\?\s*userCodeCraftKey/);
  });

  it('resolves the key on every direct surface, so none of them calls out empty', () => {
    expect(src('pages/Editor.tsx')).toContain('editor.userCodeCraftKey');
    expect(src('components/editor/TranslationAIEnhancePanel.tsx')).toContain('codeCraftKey');
    expect(src('components/editor/ContextSuggestPanel.tsx')).toContain('userCodeCraftKey');
    expect(src('components/editor/CompareEnginesDialog.tsx')).toContain('userCodeCraftKey');
  });
});

function src(...parts: string[]): string {
  return readFileSync(resolve(__dirname, '..', ...parts), 'utf8');
}
