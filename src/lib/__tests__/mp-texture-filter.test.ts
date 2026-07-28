import { describe, it, expect } from "vitest";
import type { MetroidPrimeTextureInfo } from "@/lib/metroid-prime/mp-wasm";

/** The list logic from MetroidPrimeImages, kept here so the rule that makes a
 *  logo findable among hundreds of button icons is pinned by a test rather
 *  than by eye. */
function arrange(
  textures: MetroidPrimeTextureInfo[],
  { search = "", sortBySize = true, largeOnly = false } = {}
): MetroidPrimeTextureInfo[] {
  const q = search.trim().toLowerCase();
  let list = textures;
  if (q) {
    list = list.filter(
      (t) => t.names.some((n) => n.toLowerCase().includes(q)) || t.id.includes(q) || `${t.width}x${t.height}`.includes(q)
    );
  }
  if (largeOnly) list = list.filter((t) => t.width > 256 || t.height > 256);
  if (sortBySize) list = [...list].sort((a, b) => b.width * b.height - a.width * a.height);
  return list;
}

function tex(name: string, width: number, height: number): MetroidPrimeTextureInfo {
  return { id: `${name}-id`, names: [name], width, height, format: "BptcUnorm", mips: 1, layers: 1, data_len: width * height, readable: true };
}

describe("Metroid Prime image list — finding one big image among many small ones", () => {
  // A real front-end .pak: dozens of button icons and one logo, in package
  // order, with the logo nowhere near the top.
  const pak = [
    ...Array.from({ length: 40 }, (_, i) => tex(`btn_${i}`, 36, 36)),
    tex("TitleLogo", 2048, 1024),
    ...Array.from({ length: 40 }, (_, i) => tex(`stick_${i}`, 36, 36)),
    tex("combo_L_and_R", 128, 36),
  ];

  it("puts the biggest image first", () => {
    expect(arrange(pak)[0].names[0]).toBe("TitleLogo");
  });

  it("keeps package order when sorting is turned off", () => {
    expect(arrange(pak, { sortBySize: false })[0].names[0]).toBe("btn_0");
  });

  it("hides the icons entirely with the large-only filter", () => {
    const large = arrange(pak, { largeOnly: true });
    expect(large).toHaveLength(1);
    expect(large[0].names[0]).toBe("TitleLogo");
  });

  it("finds it by size when the name is unknown", () => {
    expect(arrange(pak, { search: "2048" }).map((t) => t.names[0])).toEqual(["TitleLogo"]);
  });

  it("finds it by name", () => {
    expect(arrange(pak, { search: "logo" }).map((t) => t.names[0])).toEqual(["TitleLogo"]);
  });

  it("a search that matches nothing returns nothing rather than everything", () => {
    expect(arrange(pak, { search: "zzz" })).toHaveLength(0);
  });
});
