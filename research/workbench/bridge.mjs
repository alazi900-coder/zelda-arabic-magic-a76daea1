// ../../../tmp/claude-0/-home-user-zelda-arabic-magic-a76daea1/30195602-0f97-5db6-98d0-4ccab372886b/scratchpad/bridge.ts
import { readFileSync, writeFileSync } from "fs";

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

// src/lib/arabic-processing.ts
var ARABIC_FORMS = {
  1569: [65152, 65152, null, null],
  1570: [65153, 65154, null, null],
  1571: [65155, 65156, null, null],
  1572: [65157, 65158, null, null],
  1573: [65159, 65160, null, null],
  1574: [65161, 65162, 65163, 65164],
  1575: [65165, 65166, null, null],
  1576: [65167, 65168, 65169, 65170],
  1577: [65171, 65172, null, null],
  1578: [65173, 65174, 65175, 65176],
  1579: [65177, 65178, 65179, 65180],
  1580: [65181, 65182, 65183, 65184],
  1581: [65185, 65186, 65187, 65188],
  1582: [65189, 65190, 65191, 65192],
  1583: [65193, 65194, null, null],
  1584: [65195, 65196, null, null],
  1585: [65197, 65198, null, null],
  1586: [65199, 65200, null, null],
  1587: [65201, 65202, 65203, 65204],
  1588: [65205, 65206, 65207, 65208],
  1589: [65209, 65210, 65211, 65212],
  1590: [65213, 65214, 65215, 65216],
  1591: [65217, 65218, 65219, 65220],
  1592: [65221, 65222, 65223, 65224],
  1593: [65225, 65226, 65227, 65228],
  1594: [65229, 65230, 65231, 65232],
  1600: [1600, 1600, 1600, 1600],
  1601: [65233, 65234, 65235, 65236],
  1602: [65237, 65238, 65239, 65240],
  1603: [65241, 65242, 65243, 65244],
  1604: [65245, 65246, 65247, 65248],
  1605: [65249, 65250, 65251, 65252],
  1606: [65253, 65254, 65255, 65256],
  1607: [65257, 65258, 65259, 65260],
  1608: [65261, 65262, null, null],
  1609: [65263, 65264, null, null],
  1610: [65265, 65266, 65267, 65268]
};
var LAM_ALEF_LIGATURES = {
  1570: [65269, 65270],
  1571: [65271, 65272],
  1573: [65273, 65274],
  1575: [65275, 65276]
};
function canConnectAfter(code) {
  const forms = ARABIC_FORMS[code];
  if (!forms) return false;
  return forms[2] !== null;
}
function isTashkeel(code) {
  return code >= 1611 && code <= 1631;
}
function getPrevArabicCode(chars, index) {
  for (let i = index - 1; i >= 0; i--) {
    const c = chars[i].charCodeAt(0);
    if (isTashkeel(c)) continue;
    if (c >= 57344 && c <= 57599) continue;
    if (ARABIC_FORMS[c] !== void 0) return c;
    return null;
  }
  return null;
}
function getNextArabicCode(chars, index) {
  for (let i = index + 1; i < chars.length; i++) {
    const c = chars[i].charCodeAt(0);
    if (isTashkeel(c)) continue;
    if (c >= 57344 && c <= 57599) continue;
    if (ARABIC_FORMS[c] !== void 0) return c;
    return null;
  }
  return null;
}
function reshapeArabic(text) {
  const chars = [...text];
  const result = [];
  for (let i = 0; i < chars.length; i++) {
    const code = chars[i].charCodeAt(0);
    if (isTashkeel(code)) {
      result.push(chars[i]);
      continue;
    }
    if (code >= 57344 && code <= 57599) {
      result.push(chars[i]);
      continue;
    }
    const forms = ARABIC_FORMS[code];
    if (!forms) {
      result.push(chars[i]);
      continue;
    }
    if (code === 1604) {
      let nextIdx = i + 1;
      while (nextIdx < chars.length && isTashkeel(chars[nextIdx].charCodeAt(0))) nextIdx++;
      if (nextIdx < chars.length) {
        const nextCode2 = chars[nextIdx].charCodeAt(0);
        const ligature = LAM_ALEF_LIGATURES[nextCode2];
        if (ligature) {
          const prevCode2 = getPrevArabicCode(chars, i);
          const prevConnects2 = prevCode2 !== null && canConnectAfter(prevCode2);
          result.push(String.fromCharCode(prevConnects2 ? ligature[1] : ligature[0]));
          i = nextIdx;
          continue;
        }
      }
    }
    const prevCode = getPrevArabicCode(chars, i);
    const prevConnects = prevCode !== null && canConnectAfter(prevCode);
    const nextCode = getNextArabicCode(chars, i);
    const nextExists = nextCode !== null && ARABIC_FORMS[nextCode] !== void 0;
    let formIndex;
    if (prevConnects && nextExists && forms[2] !== null) {
      formIndex = 3;
      if (forms[3] === null) formIndex = 1;
    } else if (prevConnects) {
      formIndex = 1;
    } else if (nextExists && forms[2] !== null) {
      formIndex = 2;
    } else {
      formIndex = 0;
    }
    const glyph = forms[formIndex];
    result.push(String.fromCharCode(glyph !== null ? glyph : forms[0]));
  }
  return result.join("");
}

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

// src/lib/nds/plat-editor-bridge.ts
var PLAT_FILE_PREFIX = "platinum/";
var PLAT_NARC_PATH = "msgdata/pl_msg.narc";
function preview(text) {
  const t = text.replace(/[\n\r\f]/g, " ").replace(/\s+/g, " ").trim();
  return t.length > 60 ? `${t.slice(0, 57)}\u2026` : t;
}
function measurePlatChars(text) {
  let n = 0;
  for (let i = 0; i < text.length; i++) {
    if (text[i] !== "{") {
      n++;
      continue;
    }
    const close = text.indexOf("}", i);
    if (close < 0) {
      n++;
      continue;
    }
    const body = text.slice(i + 1, close).trim();
    const space = body.indexOf(" ");
    const numbers = space < 0 ? 0 : body.slice(space + 1).split(",").length;
    n += 3 + (body.startsWith("STRVAR_") ? Math.max(0, numbers - 1) : numbers);
    i = close;
  }
  return n;
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
    const file = PLAT_FILE_PREFIX + platArchiveName(index);
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
var TAG_RE = /\{[^}]*\}/g;
function tagsOf(text) {
  return (text.match(TAG_RE) || []).map((t) => t.replace(/\s+/g, " ").trim());
}
function buildPlatRom(rom, translations) {
  const file = findNdsFile(rom, PLAT_NARC_PATH);
  if (!file) throw new Error("\u0644\u0645 \u064A\u064F\u0639\u062B\u0631 \u0639\u0644\u0649 \u0623\u0631\u0634\u064A\u0641 \u0627\u0644\u0646\u0635\u0648\u0635 \u062F\u0627\u062E\u0644 \u0627\u0644\u0631\u0648\u0645");
  const narc = parseNarc(rom.subarray(file.start, file.end));
  const archives2 = narc.files.map(decodePlatArchive);
  const brokenTags = [];
  const tooLong = [];
  const unmapped = /* @__PURE__ */ new Set();
  let translatedLines = 0;
  archives2.forEach((archive, index) => {
    const name = platArchiveName(index);
    const prefix = PLAT_FILE_PREFIX + name;
    const originals = archive.messages.map(
      (codes) => isPackedMessage(codes) ? null : decodePlatMessage(codes)
    );
    const limit = archive.messages.reduce(
      (n, codes, i) => originals[i] === null ? n : Math.max(n, codes.length),
      0
    );
    archive.messages.forEach((codes, i) => {
      const original = originals[i];
      if (original === null) return;
      const translation = translations[`${prefix}:${i}`];
      if (!translation || !translation.trim()) return;
      const want = tagsOf(original).sort();
      const got = tagsOf(translation).sort();
      if (want.length !== got.length || want.some((t, k) => t !== got[k])) {
        brokenTags.push(`${name}:${i}`);
        return;
      }
      let encoded;
      try {
        encoded = encodePlatMessage(reshapeArabic(translation));
      } catch (err) {
        if (err instanceof PlatEncodeError) {
          const ch = /«(.+)»/.exec(err.message)?.[1];
          if (ch) unmapped.add(ch);
          else brokenTags.push(`${name}:${i}`);
          return;
        }
        throw err;
      }
      if (encoded.length > limit) {
        tooLong.push(`${name}:${i}`);
        return;
      }
      archive.messages[i] = encoded;
      translatedLines++;
    });
  });
  narc.files = archives2.map(encodePlatArchive);
  return {
    rom: writeNdsFile(rom, file, buildNarc(narc)),
    translatedLines,
    brokenTags,
    tooLong,
    unmapped: [...unmapped]
  };
}

// ../../../tmp/claude-0/-home-user-zelda-arabic-magic-a76daea1/30195602-0f97-5db6-98d0-4ccab372886b/scratchpad/bridge.ts
var PUB = "/home/user/zelda-arabic-magic-a76daea1/public/";
globalThis.fetch = async (url) => ({
  ok: true,
  json: async () => JSON.parse(readFileSync(PUB + url.replace(/^\//, ""), "utf8"))
});
async function main() {
  await ensurePlatTables();
  const rom = new Uint8Array(readFileSync("/home/user/decomps/pokeplatinum/build/pokeplatinum.us.nds"));
  const { entries, packed, archives: archives2 } = extractPlatEntries(rom);
  console.log(`archives=${archives2} entries=${entries.length} packed=${packed}`);
  const rowan = entries.filter((e) => e.msbtFile === "platinum/rowan_intro").slice(0, 3);
  for (const e of rowan) console.log(`  ${e.msbtFile}:${e.index} limit=${e.maxBytes} | ${e.label}`);
  const names = entries.filter((e) => e.msbtFile === "platinum/species_names").slice(0, 2);
  for (const e of names) console.log(`  ${e.msbtFile}:${e.index} limit=${e.maxBytes} | ${e.label}`);
  const t = {
    "platinum/rowan_intro:0": "\u0645\u0631\u062D\u0628\u0627 \u0628\u0643 \u0641\u064A \u0639\u0627\u0644\u0645 \u0628\u0648\u0643\u064A\u0645\u0648\u0646\n\u0627\u0633\u0645\u064A \u0623\u0648\u0643\u064A\u062F\u0648\u060C \u0648\u0623\u0646\u0627 \u0628\u0627\u062D\u062B\r"
  };
  console.log("chars of that line:", measurePlatChars(t["platinum/rowan_intro:0"]));
  const built = buildPlatRom(rom, t);
  console.log(`translated=${built.translatedLines} broken=${built.brokenTags.length} tooLong=${built.tooLong.length} unmapped=${JSON.stringify(built.unmapped)}`);
  console.log("rom size", built.rom.length);
  writeFileSync("/tmp/plat_built.nds", built.rom);
  const same = buildPlatRom(rom, {});
  console.log("no-op build identical:", same.rom.length === rom.length && same.rom.every((v, i) => v === rom[i]));
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
