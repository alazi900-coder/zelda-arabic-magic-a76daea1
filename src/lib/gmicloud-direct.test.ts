import { afterEach, describe, expect, it, vi } from "vitest";
import {
  GMICLOUD_DIRECT_ENDPOINT,
  GMICLOUD_DIRECT_MODEL,
  requestGmiCloudDirect,
  requestGmiCloudJson,
} from "./gmicloud-direct";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("GMICLOUD direct transport", () => {
  it("sends MiniMax M2.7 to GMICLOUD only and returns its JSON translations", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      choices: [{ message: { content: '{"test:0":"مرحباً"}' } }],
    }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const response = await requestGmiCloudDirect({
      apiKey: "session-key",
      entries: [{ key: "test:0", original: "Hello" }],
    });

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, options] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(GMICLOUD_DIRECT_ENDPOINT);
    expect(options.headers).toMatchObject({
      Authorization: "Bearer session-key",
      "Content-Type": "application/json",
    });
    expect(JSON.parse(String(options.body))).toMatchObject({
      model: GMICLOUD_DIRECT_MODEL,
    });
    await expect(response.json()).resolves.toMatchObject({
      translations: { "test:0": "مرحباً" },
      providerUsed: "GMICLOUD / MiniMax M2.7 (direct)",
    });
  });

  it("uses MiniMax M3 directly for editor JSON tools and accepts fenced JSON", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      choices: [{ message: { content: '```json\n{"results":[{"key":"a","suggested":"أهلاً"}]}\n```' } }],
    }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const response = await requestGmiCloudJson<{ results: Array<{ key: string; suggested: string }> }>({
      apiKey: "session-key",
      model: "MiniMaxAI/MiniMax-M3",
      system: "Return JSON only",
      user: "{}",
    });

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, options] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(GMICLOUD_DIRECT_ENDPOINT);
    expect(options.headers).toMatchObject({ Authorization: "Bearer session-key" });
    expect(JSON.parse(String(options.body))).toMatchObject({ model: "MiniMaxAI/MiniMax-M3" });
    expect(response.results[0]).toEqual({ key: "a", suggested: "أهلاً" });
  });

  it("retries a temporary GMICLOUD overload and stays on the same MiniMax model", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: { message: "Service temporarily unavailable. All endpoints are currently overloaded." } }), { status: 503 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        choices: [{ message: { content: '{"results":[{"key":"a","suggested":"أهلاً"}]}' } }],
      }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const pending = requestGmiCloudJson<{ results: Array<{ key: string; suggested: string }> }>({
      apiKey: "session-key",
      model: "MiniMaxAI/MiniMax-M3",
      system: "Return JSON only",
      user: "{}",
    });
    const response = await pending;

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(JSON.parse(String(fetchMock.mock.calls[0][1].body))).toMatchObject({ model: "MiniMaxAI/MiniMax-M3" });
    expect(JSON.parse(String(fetchMock.mock.calls[1][1].body))).toMatchObject({ model: "MiniMaxAI/MiniMax-M3" });
    expect(response.results[0]).toEqual({ key: "a", suggested: "أهلاً" });
  });

  it("retries a temporary overload for direct translation without changing the selected MiniMax model", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: { message: "Service temporarily unavailable." } }), { status: 503 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        choices: [{ message: { content: '{"test:0":"مرحباً"}' } }],
      }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const response = await requestGmiCloudDirect({
      apiKey: "session-key",
      model: "MiniMaxAI/MiniMax-M3",
      entries: [{ key: "test:0", original: "Hello" }],
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(JSON.parse(String(fetchMock.mock.calls[0][1].body))).toMatchObject({ model: "MiniMaxAI/MiniMax-M3" });
    expect(JSON.parse(String(fetchMock.mock.calls[1][1].body))).toMatchObject({ model: "MiniMaxAI/MiniMax-M3" });
    await expect(response.json()).resolves.toMatchObject({ translations: { "test:0": "مرحباً" } });
  });

  it("rejects a non-MiniMax model before sending any request", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(requestGmiCloudJson({
      apiKey: "session-key",
      model: "gemini-2.5-flash",
      system: "Return JSON only",
      user: "{}",
    })).rejects.toThrow("نموذج GMICLOUD المختار غير متاح");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
