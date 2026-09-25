import { readFileSync } from "fs";
import path from "path";
const PUBLIC_DIR = "/home/user/zelda-arabic-magic-a76daea1/public";
globalThis.fetch = async (url) => {
  const p = path.join(PUBLIC_DIR, url.toString());
  return { ok: true, json: async () => JSON.parse(readFileSync(p, "utf-8")) };
};
const { ensurePlatTables, encodePlatMessage, platCharmap } = await import("/home/user/zelda-arabic-magic-a76daea1/src/lib/nds/plat-charmap.ts");
await ensurePlatTables();
const cm = platCharmap();
function test(label, ch) {
  const code = cm.toCode.get(ch);
  console.log(code !== undefined ? `OK    ${label} -> ${code}` : `MISSING ${label} (U+${ch.codePointAt(0).toString(16).toUpperCase()})`);
}
test("ASCII period", ".");
test("ASCII hyphen-minus", "-");
test("ASCII comma", ",");
test("ASCII exclaim", "!");
test("ASCII question", "?");
test("ASCII straight quote", "'");
test("ASCII double quote", '"');
test("ASCII space", " ");
test("ASCII 0", "0");
test("ASCII 9", "9");
test("ASCII percent", "%");
