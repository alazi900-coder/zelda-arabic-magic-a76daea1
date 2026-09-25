// ../../../tmp/claude-0/-home-user-zelda-arabic-magic-a76daea1/30195602-0f97-5db6-98d0-4ccab372886b/scratchpad/rt.ts
import { readFileSync } from "fs";

// src/lib/nds/nds-rom.ts
var FNT_OFFSET = 64;
var FAT_OFFSET = 72;
var FAT_SIZE = 76;
var USED_SIZE = 128;
var ALIGN = 512;
function u16(rom, at) {
  return rom[at] | rom[at + 1] << 8;
}
function u32(rom, at) {
  return (rom[at] | rom[at + 1] << 8 | rom[at + 2] << 16 | rom[at + 3] << 24) >>> 0;
}
function setU32(rom, at, value) {
  rom[at] = value & 255;
  rom[at + 1] = value >>> 8 & 255;
  rom[at + 2] = value >>> 16 & 255;
  rom[at + 3] = value >>> 24 & 255;
}
function looksLikeNdsRom(rom) {
  if (rom.length < 32768) return false;
  const used = u32(rom, USED_SIZE);
  return used > 16384 && used <= rom.length;
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
function writeNdsFile(rom, file, data) {
  const fatEntry = u32(rom, FAT_OFFSET) + file.id * 8;
  const fits = data.length <= file.end - file.start;
  if (fits) {
    const out2 = rom.slice();
    out2.set(data, file.start);
    setU32(out2, fatEntry, file.start);
    setU32(out2, fatEntry + 4, file.start + data.length);
    return out2;
  }
  const start = Math.ceil(u32(rom, USED_SIZE) / ALIGN) * ALIGN;
  const end = start + data.length;
  const out = end <= rom.length ? rom.slice() : (() => {
    const grown = new Uint8Array(Math.ceil(end / ALIGN) * ALIGN).fill(255);
    grown.set(rom);
    return grown;
  })();
  out.set(data, start);
  setU32(out, fatEntry, start);
  setU32(out, fatEntry + 4, end);
  setU32(out, USED_SIZE, end);
  return out;
}

// src/lib/nds/narc.ts
var HEADER = 16;
function u162(b, at) {
  return b[at] | b[at + 1] << 8;
}
function u322(b, at) {
  return (b[at] | b[at + 1] << 8 | b[at + 2] << 16 | b[at + 3] << 24) >>> 0;
}
function put32(b, at, v) {
  b[at] = v & 255;
  b[at + 1] = v >>> 8 & 255;
  b[at + 2] = v >>> 16 & 255;
  b[at + 3] = v >>> 24 & 255;
}
function put16(b, at, v) {
  b[at] = v & 255;
  b[at + 1] = v >>> 8 & 255;
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
function buildNarc(narc) {
  const align = (n) => n + 3 & ~3;
  const btafSize = 12 + narc.files.length * 8;
  let dataSize = 0;
  const spans = narc.files.map((f) => {
    const start = dataSize;
    dataSize = align(dataSize + f.length);
    return { start, end: start + f.length };
  });
  const gmifSize = 8 + dataSize;
  const total = HEADER + btafSize + narc.btnf.length + gmifSize;
  const out = new Uint8Array(total);
  out.set([78, 65, 82, 67, 254, 255, 0, 1]);
  put32(out, 8, total);
  put16(out, 12, HEADER);
  put16(out, 14, 3);
  let at = HEADER;
  out.set([66, 84, 65, 70], at);
  put32(out, at + 4, btafSize);
  put16(out, at + 8, narc.files.length);
  put16(out, at + 10, 0);
  spans.forEach((s, i) => {
    put32(out, at + 12 + i * 8, s.start);
    put32(out, at + 16 + i * 8, s.end);
  });
  at += btafSize;
  out.set(narc.btnf, at);
  at += narc.btnf.length;
  out.set([71, 77, 73, 70], at);
  put32(out, at + 4, gmifSize);
  out.fill(255, at + 8, at + gmifSize);
  narc.files.forEach((f, i) => out.set(f, at + 8 + spans[i].start));
  return out;
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
function encodePlatArchive(archive) {
  const { key, messages } = archive;
  const dataStart = 4 + messages.length * 8;
  const sizes = messages.map((m) => m.length + 1);
  const total = dataStart + sizes.reduce((n, s) => n + s * 2, 0);
  const out = new Uint8Array(total);
  const view = new DataView(out.buffer);
  view.setUint16(0, messages.length, true);
  view.setUint16(2, key, true);
  const tableKey = key * TABLE_SEED & 65535;
  let offset = dataStart;
  messages.forEach((codes, i) => {
    const k = tableKey * (i + 1) & 65535;
    const mask = (k | k << 16) >>> 0;
    view.setUint32(4 + i * 8, (offset ^ mask) >>> 0, true);
    view.setUint32(8 + i * 8, (sizes[i] ^ mask) >>> 0, true);
    let textKey = TEXT_SEED * (i + 1) & 65535;
    for (let j = 0; j < sizes[i]; j++) {
      const c = j < codes.length ? codes[j] : EOS;
      view.setUint16(offset + j * 2, (c ^ textKey) & 65535, true);
      textKey = textKey + TEXT_STEP & 65535;
    }
    offset += sizes[i] * 2;
  });
  return out;
}

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
var PlatEncodeError = class extends Error {
};
function encodePlatMessage(text) {
  const cm = platCharmap();
  const out = [];
  for (let j = 0; j < text.length; j++) {
    if (text[j] === "{") {
      const close = text.indexOf("}", j);
      if (close < 0) throw new PlatEncodeError("\u0648\u0633\u0645 \u063A\u064A\u0631 \u0645\u063A\u0644\u0642: \u064A\u0646\u0642\u0635\u0647 }");
      const body = text.slice(j + 1, close).trim();
      j = close;
      const space = body.indexOf(" ");
      const name = space < 0 ? body : body.slice(0, space);
      const numbers = space < 0 ? [] : body.slice(space + 1).split(",").map((n) => {
        const v = Number(n.trim());
        if (!Number.isInteger(v) || v < 0 || v > 65535) {
          throw new PlatEncodeError(`\u0642\u064A\u0645\u0629 \u063A\u064A\u0631 \u0635\u0627\u0644\u062D\u0629 \u0641\u064A \u0627\u0644\u0648\u0633\u0645 {${body}}`);
        }
        return v;
      });
      let code = cm.commandCode.get(name);
      if (code === void 0 && /^STRVAR_[0-9A-F]+$/i.test(name)) {
        code = parseInt(name.slice(7), 16) << 8;
      }
      if (code === void 0) {
        if (/^[0-9A-F]{4}$/i.test(name) && numbers.length === 0) {
          out.push(parseInt(name, 16));
          continue;
        }
        throw new PlatEncodeError(`\u0648\u0633\u0645 \u0645\u062C\u0647\u0648\u0644: {${name}}`);
      }
      const args = numbers.slice();
      if (name.startsWith("STRVAR_")) {
        if (args.length === 0) throw new PlatEncodeError(`\u0627\u0644\u0648\u0633\u0645 {${name}} \u064A\u0646\u0642\u0635\u0647 \u0631\u0642\u0645\u0647 \u0627\u0644\u0623\u0648\u0644`);
        code |= args.shift();
      }
      out.push(FORMAT_ARG, code, args.length, ...args);
      continue;
    }
    let matched = false;
    for (let len = Math.min(cm.maxCharLen, text.length - j); len >= 1; len--) {
      const code = cm.toCode.get(text.substr(j, len));
      if (code !== void 0) {
        out.push(code);
        j += len - 1;
        matched = true;
        break;
      }
    }
    if (!matched) throw new PlatEncodeError(`\u062D\u0631\u0641 \u0644\u0627 \u062E\u0627\u0646\u0629 \u0644\u0647 \u0641\u064A \u0627\u0644\u062E\u0637: \xAB${text[j]}\xBB`);
  }
  return out;
}

// ../../../tmp/claude-0/-home-user-zelda-arabic-magic-a76daea1/30195602-0f97-5db6-98d0-4ccab372886b/scratchpad/rt.ts
var ROM = "/home/user/decomps/pokeplatinum/build/pokeplatinum.us.nds";
var PUB = "/home/user/zelda-arabic-magic-a76daea1/public/";
globalThis.fetch = async (url) => ({
  ok: true,
  json: async () => JSON.parse(readFileSync(PUB + url.replace(/^\//, ""), "utf8"))
});
var eq = (a, b) => a.length === b.length && a.every((v, i) => v === b[i]);
async function main() {
  await ensurePlatTables();
  const rom = new Uint8Array(readFileSync(ROM));
  console.log("looksLikeNdsRom:", looksLikeNdsRom(rom));
  const file = findNdsFile(rom, "msgdata/pl_msg.narc");
  if (!file) throw new Error("pl_msg.narc not found");
  console.log(`pl_msg.narc: id=${file.id} @0x${file.start.toString(16)} size=${file.end - file.start}`);
  const raw = rom.subarray(file.start, file.end);
  const narc = parseNarc(raw);
  console.log("archives:", narc.files.length);
  console.log("buildNarc identical:", eq(buildNarc(narc), raw));
  let msgs = 0, packed = 0, textFail = 0, archFail = 0;
  const samples = [];
  for (let a = 0; a < narc.files.length; a++) {
    const arch = decodePlatArchive(narc.files[a]);
    if (!eq(encodePlatArchive(arch), narc.files[a])) {
      archFail++;
      continue;
    }
    for (const codes of arch.messages) {
      msgs++;
      if (isPackedMessage(codes)) {
        packed++;
        continue;
      }
      const text = decodePlatMessage(codes);
      let back;
      try {
        back = encodePlatMessage(text);
      } catch (e) {
        if (textFail++ < 5) console.log("ENC FAIL", platArchiveName(a), JSON.stringify(text.slice(0, 80)), e.message);
        continue;
      }
      if (back.length !== codes.length || back.some((v, i) => v !== codes[i])) {
        if (textFail++ < 5) console.log("MISMATCH", platArchiveName(a), JSON.stringify(text.slice(0, 80)));
      }
    }
    if (a === 389) samples.push(decodePlatMessage(arch.messages[0]));
  }
  console.log(`archives re-encoded byte-identical: ${narc.files.length - archFail}/${narc.files.length}`);
  console.log(`messages: ${msgs} | packed(skipped): ${packed} | text round-trip failures: ${textFail}`);
  console.log("sample:", JSON.stringify(samples[0]));
  const rebuilt = writeNdsFile(rom, file, buildNarc(narc));
  console.log("ROM rebuilt identical:", eq(rebuilt, rom));
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
