import { afterEach, describe, expect, it, vi } from "vitest";
import {
  GMICLOUD_DIRECT_ENDPOINT,
  GMICLOUD_DIRECT_MODEL,
  requestGmiCloudDirect,
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
});
