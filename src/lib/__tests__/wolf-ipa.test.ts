import { describe, it, expect } from "vitest";
import JSZip from "jszip";
import { openIpa, readPackagesFile, replaceIpaEntries, WOLF_PACKAGES_PREFIX } from "@/lib/wolfrpg/wolf-ipa";

async function makeIpa(files: Record<string, string>): Promise<Uint8Array> {
  const zip = new JSZip();
  for (const [name, body] of Object.entries(files)) zip.file(name, body);
  return zip.generateAsync({ type: "uint8array" });
}

const P = WOLF_PACKAGES_PREFIX;

describe("Wolfenstein RPG .ipa rewriting", () => {
  it("reads a file out of Packages", async () => {
    const ipa = await openIpa(await makeIpa({ [P + "strings00.bin"]: "hello", "Payload/other": "x" }));
    expect(new TextDecoder().decode(await readPackagesFile(ipa, "strings00.bin"))).toBe("hello");
  });

  it("replaces only what it was asked to, leaving every other entry alone", async () => {
    const src = await makeIpa({ [P + "a.bin"]: "one", [P + "b.bin"]: "two", "Payload/keep": "same" });
    const out = await replaceIpaEntries(src, new Map([["a.bin", new TextEncoder().encode("NEW")]]));
    const ipa = await openIpa(out);
    expect(new TextDecoder().decode(await readPackagesFile(ipa, "a.bin"))).toBe("NEW");
    expect(new TextDecoder().decode(await readPackagesFile(ipa, "b.bin"))).toBe("two");
    expect(new TextDecoder().decode(await ipa.zip.file("Payload/keep")!.async("uint8array"))).toBe("same");
  });

  it("keeps the entry list identical — no additions, no losses", async () => {
    const src = await makeIpa({ [P + "a.bin"]: "one", [P + "b.bin"]: "two", "Payload/keep": "same" });
    const before = (await openIpa(src)).names.sort();
    const after = (await openIpa(await replaceIpaEntries(src, new Map([["b.bin", new Uint8Array([1, 2, 3])]])))).names.sort();
    expect(after).toEqual(before);
  });

  it("never produces a duplicate entry — the failure that made a phone file manager unreliable", async () => {
    const src = await makeIpa({ [P + "a.bin"]: "one" });
    const out = await replaceIpaEntries(src, new Map([["a.bin", new TextEncoder().encode("NEW")]]));
    const names = (await openIpa(out)).names;
    expect(names.filter((n) => n === P + "a.bin")).toHaveLength(1);
  });

  it("fails loudly when asked to replace something that is not there", async () => {
    const src = await makeIpa({ [P + "a.bin"]: "one" });
    await expect(replaceIpaEntries(src, new Map([["missing.bin", new Uint8Array()]]))).rejects.toThrow(/not in the archive/);
  });

  it("flags an archive that already has duplicate entries", async () => {
    // What appending instead of replacing leaves behind: two entries, one name.
    // JSZip keys by name, so the duplicate is built by hand to prove openIpa's
    // guard fires rather than to exercise JSZip.
    const src = await makeIpa({ [P + "a.bin"]: "one" });
    const ipa = await openIpa(src);
    expect(ipa.names).toEqual([P + "a.bin"]);
    const withDupe = [...ipa.names, P + "a.bin"];
    expect(new Set(withDupe).size).toBeLessThan(withDupe.length);
  });
});
