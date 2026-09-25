// ../../../tmp/claude-0/-home-user-zelda-arabic-magic-a76daea1/30195602-0f97-5db6-98d0-4ccab372886b/scratchpad/amt.ts
import { readFileSync } from "fs";

// src/lib/nds/plat-charmap.ts
var CHARMAP_URL = "/pokeplatinum-charmap.json";
var ARCHIVES_URL = "/pokeplatinum-archives.json";
var FORMAT_ARG = 65534;
var TRAINER_NAME = 61696;
var charmap = null;
var archives = null;
var loading = null;
async function ensurePlatTables() {
  if (charmap && archives) return;
  if (!loading) {
    loading = (async () => {
      const [cmRes, arRes] = await Promise.all([fetch(CHARMAP_URL), fetch(ARCHIVES_URL)]);
      if (!cmRes.ok || !arRes.ok) throw new Error("\u062A\u0639\u0630\u0651\u0631 \u062A\u062D\u0645\u064A\u0644 \u062C\u062F\u0627\u0648\u0644 Platinum");
      const raw = await cmRes.json();
      const toChar = /* @__PURE__ */ new Map();
      const toCode = /* @__PURE__ */ new Map();
      let maxCharLen = 1;
      for (const [code, ch] of Object.entries(raw.chars)) {
        toChar.set(Number(code), ch);
        if (!toCode.has(ch)) toCode.set(ch, Number(code));
        maxCharLen = Math.max(maxCharLen, ch.length);
      }
      const commandName = /* @__PURE__ */ new Map();
      const commandCode = /* @__PURE__ */ new Map();
      for (const [code, name] of Object.entries(raw.commands)) {
        commandName.set(Number(code), name);
        commandCode.set(name, Number(code));
      }
      charmap = {
        toChar,
        toCode,
        maxCharLen,
        commandName,
        commandCode,
        strvarCodes: new Set(raw.strvarCodes)
      };
      archives = await arRes.json();
    })();
  }
  await loading;
}
function platCharmap() {
  if (!charmap) throw new Error("\u062C\u062F\u0627\u0648\u0644 Platinum \u0644\u0645 \u062A\u064F\u062D\u0645\u064E\u0651\u0644");
  return charmap;
}
function platArchiveName(index) {
  return archives?.[index] ?? `archive_${index}`;
}
function isPackedMessage(codes) {
  return codes.includes(TRAINER_NAME);
}
function decodePlatMessage(codes) {
  const cm = platCharmap();
  let out = "";
  for (let j = 0; j < codes.length; j++) {
    const code = codes[j];
    const ch = cm.toChar.get(code);
    if (ch !== void 0) {
      out += ch;
      continue;
    }
    if (code !== FORMAT_ARG) {
      out += `{${code.toString(16).toUpperCase().padStart(4, "0")}}`;
      continue;
    }
    const arg = codes[++j];
    const nargs = codes[++j];
    const isStrvar = cm.strvarCodes.has(arg & 65280);
    const name = isStrvar ? `STRVAR_${(arg >> 8).toString(16).toUpperCase()}` : cm.commandName.get(arg);
    const numbers = [];
    if (isStrvar) numbers.push(arg & 255);
    for (let k = 0; k < nargs; k++) numbers.push(codes[j + 1 + k]);
    j += nargs;
    out += name === void 0 ? `{${arg.toString(16).toUpperCase().padStart(4, "0")}}` : `{${name}${numbers.length ? " " + numbers.join(", ") : ""}}`;
  }
  return out;
}

// src/lib/nds/nds-rom.ts
var FNT_OFFSET = 64;
var FAT_OFFSET = 72;
var FAT_SIZE = 76;
function u16(rom, at) {
  return rom[at] | rom[at + 1] << 8;
}
function u32(rom, at) {
  return (rom[at] | rom[at + 1] << 8 | rom[at + 2] << 16 | rom[at + 3] << 24) >>> 0;
}
function ndsFiles(rom) {
  const fatOff = u32(rom, FAT_OFFSET);
  const fatSize = u32(rom, FAT_SIZE);
  const files = [];
  for (let i = 0; i * 8 + 8 <= fatSize; i++) {
    const at = fatOff + i * 8;
    files.push({ id: i, start: u32(rom, at), end: u32(rom, at + 4) });
  }
  return files;
}
function ndsFileIdByPath(rom) {
  const fnt = u32(rom, FNT_OFFSET);
  const dirCount = u16(rom, fnt + 6);
  const names = new Array(dirCount).fill("");
  const parents = new Array(dirCount).fill(0);
  const paths = /* @__PURE__ */ new Map();
  const pending = [];
  for (let dir = 0; dir < dirCount; dir++) {
    const entry = fnt + dir * 8;
    let at = fnt + u32(rom, entry);
    let fileId = u16(rom, entry + 4);
    for (; ; ) {
      const control = rom[at++];
      if (control === 0 || control === 128) break;
      const len = control & 127;
      let name = "";
      for (let i = 0; i < len; i++) name += String.fromCharCode(rom[at + i]);
      at += len;
      if (control & 128) {
        const sub = u16(rom, at) & 4095;
        at += 2;
        if (sub < dirCount) {
          names[sub] = name;
          parents[sub] = dir;
        }
      } else {
        pending.push({ dir, name, id: fileId++ });
      }
    }
  }
  const pathOf = (dir) => {
    const parts = [];
    for (let d = dir, guard = 0; d > 0 && guard < dirCount; d = parents[d], guard++) {
      parts.unshift(names[d]);
    }
    return parts.join("/");
  };
  for (const { dir, name, id } of pending) {
    const prefix = pathOf(dir);
    paths.set(prefix ? `${prefix}/${name}` : name, id);
  }
  return paths;
}
function findNdsFile(rom, path) {
  const id = ndsFileIdByPath(rom).get(path);
  if (id === void 0) return null;
  const files = ndsFiles(rom);
  return files[id] ?? null;
}

// src/lib/nds/narc.ts
function u162(b, at) {
  return b[at] | b[at + 1] << 8;
}
function u322(b, at) {
  return (b[at] | b[at + 1] << 8 | b[at + 2] << 16 | b[at + 3] << 24) >>> 0;
}
function ascii(b, at) {
  return String.fromCharCode(b[at], b[at + 1], b[at + 2], b[at + 3]);
}
function parseNarc(buf) {
  if (ascii(buf, 0) !== "NARC") throw new Error("\u0644\u064A\u0633 \u0623\u0631\u0634\u064A\u0641 NARC");
  const sections = /* @__PURE__ */ new Map();
  let at = u162(buf, 12);
  for (let i = 0, n = u162(buf, 14); i < n; i++) {
    const size = u322(buf, at + 4);
    sections.set(ascii(buf, at), { at, size });
    at += size;
  }
  const btaf = sections.get("BTAF");
  const btnf = sections.get("BTNF");
  const gmif = sections.get("GMIF");
  if (!btaf || !btnf || !gmif) throw new Error("\u0623\u0631\u0634\u064A\u0641 NARC \u0646\u0627\u0642\u0635 \u0627\u0644\u0623\u0642\u0633\u0627\u0645");
  const count = u162(buf, btaf.at + 8);
  const data = gmif.at + 8;
  const files = [];
  for (let i = 0; i < count; i++) {
    const e = btaf.at + 12 + i * 8;
    files.push(buf.subarray(data + u322(buf, e), data + u322(buf, e + 4)));
  }
  return { files, btnf: buf.subarray(btnf.at, btnf.at + btnf.size) };
}

// src/lib/nds/plat-msg.ts
var TABLE_SEED = 765;
var TEXT_SEED = 596947;
var TEXT_STEP = 18749;
var EOS = 65535;
function decodePlatArchive(buf) {
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const count = view.getUint16(0, true);
  const key = view.getUint16(2, true);
  const tableKey = key * TABLE_SEED & 65535;
  const messages = [];
  for (let i = 0; i < count; i++) {
    const k = tableKey * (i + 1) & 65535;
    const mask = (k | k << 16) >>> 0;
    const offset = (view.getUint32(4 + i * 8, true) ^ mask) >>> 0;
    const size = (view.getUint32(8 + i * 8, true) ^ mask) >>> 0;
    let textKey = TEXT_SEED * (i + 1) & 65535;
    const codes = [];
    for (let j = 0; j < size; j++) {
      codes.push(view.getUint16(offset + j * 2, true) ^ textKey);
      textKey = textKey + TEXT_STEP & 65535;
    }
    if (codes[codes.length - 1] === EOS) codes.pop();
    messages.push(codes);
  }
  return { key, messages };
}

// src/lib/nds/plat-editor-bridge.ts
var PLAT_FILE_PREFIX = "platinum/";
var PLAT_NARC_PATH = "msgdata/pl_msg.narc";
var PLAT_NON_TEXT_ARCHIVES = /* @__PURE__ */ new Set([
  "seq_names",
  "species_pokedex_entry_jp",
  "species_category_jp",
  "species_name_with_natdex_number_jp",
  "greetings_jp"
]);
function preview(text) {
  const t = text.replace(/[\n\r\f]/g, " ").replace(/\s+/g, " ").trim();
  return t.length > 60 ? `${t.slice(0, 57)}\u2026` : t;
}
function readArchives(rom) {
  const file = findNdsFile(rom, PLAT_NARC_PATH);
  if (!file) throw new Error("\u0644\u0645 \u064A\u064F\u0639\u062B\u0631 \u0639\u0644\u0649 \u0623\u0631\u0634\u064A\u0641 \u0627\u0644\u0646\u0635\u0648\u0635 \u062F\u0627\u062E\u0644 \u0627\u0644\u0631\u0648\u0645 \u2014 \u0647\u0644 \u0647\u0630\u0627 \u0631\u0648\u0645 Pok\xE9mon Platinum\u061F");
  const narc = parseNarc(rom.subarray(file.start, file.end));
  return { file, archives: narc.files.map(decodePlatArchive) };
}
function extractPlatEntries(rom) {
  const { archives: archives2 } = readArchives(rom);
  const entries = [];
  let packed = 0;
  archives2.forEach((archive, index) => {
    const texts = archive.messages.map(
      (codes) => isPackedMessage(codes) ? null : decodePlatMessage(codes)
    );
    const limit = archive.messages.reduce(
      (n, codes, i) => texts[i] === null ? n : Math.max(n, codes.length),
      0
    );
    const name = platArchiveName(index);
    if (PLAT_NON_TEXT_ARCHIVES.has(name)) return;
    const file = PLAT_FILE_PREFIX + name;
    texts.forEach((text, i) => {
      if (text === null) {
        packed++;
        return;
      }
      if (text === "") return;
      entries.push({
        msbtFile: file,
        index: i,
        label: preview(text),
        original: text,
        maxBytes: limit
      });
    });
  });
  return { entries, packed, archives: archives2.length };
}

// ../../../tmp/claude-0/-home-user-zelda-arabic-magic-a76daea1/30195602-0f97-5db6-98d0-4ccab372886b/scratchpad/amt.ts
var PUB = "/home/user/zelda-arabic-magic-a76daea1/public/";
globalThis.fetch = async (u) => ({ ok: true, json: async () => JSON.parse(readFileSync(PUB + u.replace(/^\//, ""), "utf8")) });
async function main() {
  await ensurePlatTables();
  const rom = new Uint8Array(readFileSync("/home/user/decomps/pokeplatinum/build/pokeplatinum.us.nds"));
  const { entries } = extractPlatEntries(rom);
  const plain = /\$\d+/g, full = /\$\d[\d,]*/g;
  let lines = 0, grouped = 0;
  const samples = [];
  for (const e of entries) {
    const all = e.original.match(full);
    if (!all) continue;
    lines++;
    for (const a of all) if (a.includes(",")) {
      grouped++;
      if (samples.length < 6) samples.push(a);
    }
  }
  console.log(`\u0623\u0633\u0637\u0631 \u0641\u064A\u0647\u0627 \u0645\u0628\u0644\u063A: ${lines} | \u0645\u0628\u0627\u0644\u063A \u0641\u064A\u0647\u0627 \u0641\u0627\u0635\u0644\u0629 \u0622\u0644\u0627\u0641: ${grouped}`);
  console.log("\u0639\u064A\u0651\u0646\u0629:", samples.join("  "));
  console.log('\u0645\u0627 \u064A\u0631\u0627\u0647 \u0627\u0644\u0641\u062D\u0635 \u0627\u0644\u062D\u0627\u0644\u064A \u0645\u0646 "$1,000":', JSON.stringify("It is $1,000 now".match(plain)));
  console.log("\u0648\u0645\u0627 \u064A\u0631\u0627\u0647 \u0644\u0648 \u0648\u064F\u0633\u0651\u0639        :", JSON.stringify("It is $1,000 now".match(full)));
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
