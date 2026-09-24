import { describe, expect, it } from "vitest";
import { inazumaImageZipPath, inazumaZipMatcher } from "../inazuma-zip-import";
import type { InazumaImageRef } from "../inazuma-images";

const ref = (romPath: string, entryName: string | null): InazumaImageRef => ({
  id: entryName ? `${romPath}#${entryName}` : romPath,
  romPath,
  entryName,
  dataOffset: 0,
  size: 0,
});

const NAME = ref("data_iz/pic2d/menu/en/MMName.SPF_", "NEDN_BG01.PAC");
const BARE = ref("data_iz/pic2d/menu/en/msup_bg00.pac_", null);
const TWIN_A = ref("data_iz/pic2d/en/MPSAct.SPF_", "WC_I00.PAC");
const TWIN_B = ref("data_iz/pic2d/en/MPSBgn.SPF_", "WC_I00.PAC");
const match = inazumaZipMatcher([NAME, BARE, TWIN_A, TWIN_B]);

describe("inazuma-zip-import", () => {
  it("names exports the way the ZIP download does", () => {
    expect(inazumaImageZipPath(NAME, 256, 24)).toBe("pic2d/menu/en/MMName/NEDN_BG01_256x24.png");
    expect(inazumaImageZipPath(BARE, 256, 192)).toBe("pic2d/menu/en/msup_bg00_256x192.png");
  });

  it("sends every exported picture home, with the width it was drawn at", () => {
    expect(match("pic2d/menu/en/MMName/NEDN_BG01_256x24.png")).toEqual({ ok: true, id: NAME.id, width: 256, height: 24 });
    expect(match("pic2d/menu/en/msup_bg00_256x192.png")).toEqual({ ok: true, id: BARE.id, width: 256, height: 192 });
  });

  it("tolerates an outer folder, backslashes and letter case", () => {
    expect(match("معرّب/PIC2D/Menu/EN/mmname/nedn_bg01_128x48.png")).toEqual({ ok: true, id: NAME.id, width: 128, height: 48 });
    expect(match("out\\pic2d\\menu\\en\\msup_bg00_256x192.png")).toMatchObject({ ok: true, id: BARE.id });
  });

  it("matches a lone «تنزيل PNG» file by name only when one picture has it", () => {
    expect(match("NEDN_BG01_256x24.png")).toMatchObject({ ok: true, id: NAME.id });
    expect(match("WC_I00_96x16.png")).toEqual({ ok: false, reason: "ambiguous" });
    expect(match("pic2d/en/MPSBgn/WC_I00_96x16.png")).toMatchObject({ ok: true, id: TWIN_B.id });
  });

  it("says why a file was not used", () => {
    expect(match("notes.txt")).toEqual({ ok: false, reason: "not-png" });
    expect(match("__MACOSX/pic2d/menu/en/MMName/._NEDN_BG01_256x24.png")).toEqual({ ok: false, reason: "not-png" });
    expect(match("pic2d/menu/en/MMName/NEDN_BG01.png")).toEqual({ ok: false, reason: "no-size" });
    expect(match("pic2d/menu/en/MMName/NOPE_8x8.png")).toEqual({ ok: false, reason: "no-image" });
  });
});
