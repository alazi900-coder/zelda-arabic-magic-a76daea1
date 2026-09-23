import { describe, expect, it } from "vitest";
import { matchWilayZipEntry } from "../wilay-zip-import";

const open = ["cttrl_i086_03.wilay", "cttrl_i086_04.wilay", "cttrl_i087_01.wilay"];

describe("matching an Arabised ZIP back to its textures", () => {
  it("reads the export's own layout: one folder per file, tex<N>_<W>x<H>_<FMT>.png", () => {
    expect(matchWilayZipEntry("cttrl_i086_04/tex0_1100x400_BC7.png", open)).toEqual({ ok: true, fileIndex: 1, texIndex: 0 });
    expect(matchWilayZipEntry("cttrl_i087_01/tex12_64x64_BC1.png", open)).toEqual({ ok: true, fileIndex: 2, texIndex: 12 });
  });

  it("ignores an extra folder around everything (the reported صور/ folder)", () => {
    expect(matchWilayZipEntry("صور/cttrl_i086_03/tex0_1100x400_BC7.png", open)).toEqual({ ok: true, fileIndex: 0, texIndex: 0 });
  });

  it("does not care about case in the folder name", () => {
    expect(matchWilayZipEntry("CTTRL_I086_03/tex3_8x8_BC7.png", open)).toEqual({ ok: true, fileIndex: 0, texIndex: 3 });
  });

  it("takes pictures at the root when a single file is open", () => {
    expect(matchWilayZipEntry("tex2_256x256_BC3.png", ["menu.wilay"])).toEqual({ ok: true, fileIndex: 0, texIndex: 2 });
    expect(matchWilayZipEntry("صور/tex2_256x256_BC3.png", ["menu.wilay"])).toEqual({ ok: true, fileIndex: 0, texIndex: 2 });
  });

  it("reads the single-texture export name <file>_tex<N>.png", () => {
    expect(matchWilayZipEntry("cttrl_i086_04.wilay_tex5.png", open)).toEqual({ ok: true, fileIndex: 1, texIndex: 5 });
  });

  it("matches a file opened from a folder by its own name", () => {
    expect(matchWilayZipEntry("cttrl_i086_03/tex0_1x1_BC7.png", ["menu/cttrl_i086_03.wilay"])).toEqual({ ok: true, fileIndex: 0, texIndex: 0 });
  });

  it("refuses rather than guesses", () => {
    expect(matchWilayZipEntry("other_file/tex0_1x1_BC7.png", open)).toEqual({ ok: false, reason: "no-file" });
    expect(matchWilayZipEntry("cttrl_i086_03/cover.png", open)).toEqual({ ok: false, reason: "no-texture-number" });
    expect(matchWilayZipEntry("x/a/tex0_1x1.png", ["one/a.wilay", "two/a.wilay"])).toEqual({ ok: false, reason: "ambiguous-file" });
  });

  it("skips what is not a picture, and macOS litter", () => {
    expect(matchWilayZipEntry("cttrl_i086_03/notes.txt", open)).toEqual({ ok: false, reason: "not-png" });
    expect(matchWilayZipEntry("__MACOSX/cttrl_i086_03/._tex0_1x1_BC7.png", open)).toEqual({ ok: false, reason: "not-png" });
  });
});
