// ../../../tmp/claude-0/-home-user-zelda-arabic-magic-a76daea1/30195602-0f97-5db6-98d0-4ccab372886b/scratchpad/freq.ts
import { readFileSync } from "fs";

// src/lib/gtaiv/gtaiv-ru-charmap.ts
var UNIT_TO_CODEPOINT_PAIRS = [
  [91, 1567],
  [93, 65152],
  [123, 65153],
  [124, 65261],
  [125, 65154],
  [161, 65260],
  [163, 65155],
  [165, 65156],
  [166, 65157],
  [167, 65158],
  [168, 65274],
  [170, 65272],
  [171, 65264],
  [176, 65273],
  [180, 65267],
  [182, 65159],
  [185, 65268],
  [186, 65265],
  [188, 65160],
  [189, 65161],
  [190, 65162],
  [191, 65263],
  [192, 65163],
  [193, 65164],
  [194, 65165],
  [195, 65166],
  [196, 65167],
  [197, 65168],
  [198, 65169],
  [199, 65170],
  [200, 65171],
  [201, 65173],
  [202, 65174],
  [203, 65175],
  [204, 65176],
  [205, 65177],
  [206, 65178],
  [207, 65179],
  [208, 65180],
  [209, 65181],
  [210, 65182],
  [211, 65183],
  [212, 65184],
  [213, 65185],
  [214, 65186],
  [216, 65187],
  [217, 65188],
  [218, 65189],
  [219, 65190],
  [220, 65191],
  [221, 65192],
  [222, 65193],
  [223, 65194],
  [224, 65195],
  [225, 65196],
  [226, 65197],
  [227, 65198],
  [228, 65199],
  [229, 65200],
  [232, 65201],
  [233, 65204],
  [235, 65205],
  [237, 65206],
  [239, 65207],
  [240, 65208],
  [242, 65209],
  [243, 65210],
  [245, 65211],
  [247, 65262],
  [249, 65212],
  [251, 65213],
  [253, 65271],
  [255, 65276],
  [298, 65172],
  [350, 65202],
  [352, 65203],
  [385, 65219],
  [386, 65220],
  [387, 65275],
  [388, 65221],
  [390, 65222],
  [391, 65223],
  [393, 65224],
  [394, 65225],
  [395, 65226],
  [398, 65227],
  [399, 65228],
  [400, 65229],
  [401, 65230],
  [403, 65231],
  [404, 65232],
  [405, 65233],
  [406, 65234],
  [407, 65235],
  [408, 65236],
  [410, 65237],
  [412, 65238],
  [413, 65239],
  [415, 65240],
  [416, 65241],
  [418, 65242],
  [420, 65243],
  [425, 65246],
  [428, 65247],
  [430, 65248],
  [431, 65249],
  [433, 65250],
  [434, 65251],
  [435, 65252],
  [437, 65253],
  [439, 65254],
  [440, 65255],
  [443, 65256],
  [471, 65266],
  [490, 65214],
  [492, 65215],
  [494, 65216],
  [497, 65217],
  [500, 65218],
  [502, 65244],
  [504, 65245],
  [506, 65257],
  [508, 65258],
  [510, 65259]
];
if (UNIT_TO_CODEPOINT_PAIRS.length !== 124) {
  throw new Error(`\u062C\u062F\u0648\u0644 \u062E\u0637\u0651 GTA IV \u0627\u0644\u0631\u0648\u0633\u064A \u063A\u064A\u0631 \u0645\u0643\u062A\u0645\u0644: ${UNIT_TO_CODEPOINT_PAIRS.length} \u062E\u0627\u0646\u0629 \u0628\u062F\u0644 124.`);
}
var LAM_ALEF_MADDA_TO_PLAIN_LAM_ALEF = [
  [
    65269,
    196
    /* placeholder, replaced below */
  ],
  [
    65270,
    196
    /* placeholder, replaced below */
  ]
];
var lamAlefIsolatedUnit = UNIT_TO_CODEPOINT_PAIRS.find(([, cp]) => cp === 65275)?.[0];
var lamAlefFinalUnit = UNIT_TO_CODEPOINT_PAIRS.find(([, cp]) => cp === 65276)?.[0];
if (lamAlefIsolatedUnit === void 0 || lamAlefFinalUnit === void 0) {
  throw new Error("\u062A\u0639\u0630\u0651\u0631 \u0625\u064A\u062C\u0627\u062F \u062E\u0627\u0646\u062A\u064E\u064A \u0631\u0628\u0627\u0637 \xAB\u0644\u0627\xBB \u0644\u0631\u0628\u0637 \u0631\u0628\u0627\u0637 \xAB\u0644\u0622\xBB \u0628\u0647\u0645\u0627.");
}
LAM_ALEF_MADDA_TO_PLAIN_LAM_ALEF[0][1] = lamAlefIsolatedUnit;
LAM_ALEF_MADDA_TO_PLAIN_LAM_ALEF[1][1] = lamAlefFinalUnit;
var GTAIV_RU_CUSTOM_UNITS = new Set(UNIT_TO_CODEPOINT_PAIRS.map(([unit]) => unit));
var GTAIV_RU_UNIT_TO_CODEPOINT = new Map(UNIT_TO_CODEPOINT_PAIRS);
var GTAIV_RU_CODEPOINT_TO_UNIT = new Map([
  ...UNIT_TO_CODEPOINT_PAIRS.map(([unit, cp]) => [cp, unit]),
  ...LAM_ALEF_MADDA_TO_PLAIN_LAM_ALEF
]);

// src/lib/gtaiv/gxt-format.ts
var ascii = new TextDecoder("ascii");
function fail(message) {
  throw new Error(`\u0645\u0644\u0641 GTA IV \u063A\u064A\u0631 \u0635\u0627\u0644\u062D: ${message}`);
}
function u16(view, offset) {
  if (offset + 2 > view.byteLength) fail("\u0642\u0631\u0627\u0621\u0629 \u062E\u0627\u0631\u062C \u062D\u062F\u0648\u062F \u0627\u0644\u0645\u0644\u0641.");
  return view.getUint16(offset, true);
}
function u32(view, offset) {
  if (offset + 4 > view.byteLength) fail("\u0642\u0631\u0627\u0621\u0629 \u062E\u0627\u0631\u062C \u062D\u062F\u0648\u062F \u0627\u0644\u0645\u0644\u0641.");
  return view.getUint32(offset, true);
}
function marker(bytes, offset, size = 4) {
  if (offset + size > bytes.length) fail("\u062A\u0631\u0648\u064A\u0633\u0629 \u0643\u062A\u0644\u0629 \u0646\u0627\u0642\u0635\u0629.");
  return ascii.decode(bytes.subarray(offset, offset + size));
}
function tableName(bytes, offset) {
  return ascii.decode(bytes.subarray(offset, offset + 8)).replace(/\0+$/, "").trim();
}
function readGxtTextUnits(view, payloadOffset, textBytes, dataOffset, table) {
  if (dataOffset % 2 !== 0) fail(`\u0625\u0632\u0627\u062D\u0629 \u0646\u0635 \u063A\u064A\u0631 \u0632\u0648\u062C\u064A\u0629 \u0641\u064A \u0627\u0644\u062C\u062F\u0648\u0644 ${table}.`);
  const start = payloadOffset + dataOffset;
  const end = payloadOffset + textBytes;
  for (let offset = start; offset < end; offset += 2) {
    if (u16(view, offset) !== 0) continue;
    const units = new Uint16Array((offset - start) / 2);
    for (let index = 0; index < units.length; index += 1) units[index] = u16(view, start + index * 2);
    return units;
  }
  fail(`\u0646\u0635 \u063A\u064A\u0631 \u0645\u0646\u062A\u0647\u064D \u0628\u0640 NUL \u0641\u064A \u0627\u0644\u062C\u062F\u0648\u0644 ${table}.`);
}
function parseGtaIvGxt(buffer) {
  const bytes = new Uint8Array(buffer);
  const view = new DataView(buffer);
  if (bytes.length < 12) fail("\u0623\u0642\u0635\u0631 \u0645\u0646 \u062A\u0631\u0648\u064A\u0633\u0629 GXT.");
  const version = u16(view, 0);
  const charSize = u16(view, 2);
  if (version !== 4) fail(`Version ${version} \u063A\u064A\u0631 \u0645\u062F\u0639\u0648\u0645\u061B \u0627\u0644\u0645\u062A\u0648\u0642\u0639 Version 4.`);
  if (charSize !== 16) fail(`CharSize ${charSize} \u063A\u064A\u0631 \u0645\u062F\u0639\u0648\u0645\u061B \u0627\u0644\u0645\u062A\u0648\u0642\u0639 CharSize 16.`);
  if (marker(bytes, 4) !== "TABL") fail("\u0644\u0627 \u064A\u062D\u0645\u0644 \u0643\u062A\u0644\u0629 TABL \u0641\u064A \u0627\u0644\u062A\u0631\u0648\u064A\u0633\u0629.");
  const tablSize = u32(view, 8);
  if (tablSize === 0 || tablSize % 12 !== 0 || 12 + tablSize > bytes.length) {
    fail("\u062D\u062C\u0645 \u062C\u062F\u0648\u0644 TABL \u063A\u064A\u0631 \u0635\u062D\u064A\u062D.");
  }
  const tables = [];
  const names = /* @__PURE__ */ new Set();
  for (let at = 12; at < 12 + tablSize; at += 12) {
    const name = tableName(bytes, at);
    const offset = u32(view, at + 8);
    if (!name) fail("\u0627\u0633\u0645 \u062C\u062F\u0648\u0644 \u0641\u0627\u0631\u063A \u0641\u064A TABL.");
    if (names.has(name)) fail(`\u0627\u0633\u0645 \u062C\u062F\u0648\u0644 \u0645\u0643\u0631\u0631: ${name}.`);
    names.add(name);
    if (offset + 8 > bytes.length) fail(`\u0625\u0632\u0627\u062D\u0629 \u062C\u062F\u0648\u0644 ${name} \u062E\u0627\u0631\u062C \u0627\u0644\u0645\u0644\u0641.`);
    const prefix = marker(bytes, offset);
    const tkeyOffset = prefix === "TKEY" ? offset : offset + 8;
    if (marker(bytes, tkeyOffset) !== "TKEY") fail(`\u0643\u062A\u0644\u0629 TKEY \u0645\u0641\u0642\u0648\u062F\u0629 \u0645\u0646 \u0627\u0644\u062C\u062F\u0648\u0644 ${name}.`);
    const keyBytes = u32(view, tkeyOffset + 4);
    if (keyBytes % 8 !== 0 || tkeyOffset + 8 + keyBytes + 8 > bytes.length) {
      fail(`\u062D\u062C\u0645 TKEY \u063A\u064A\u0631 \u0635\u062D\u064A\u062D \u0641\u064A \u0627\u0644\u062C\u062F\u0648\u0644 ${name}.`);
    }
    const tdatOffset = tkeyOffset + 8 + keyBytes;
    if (marker(bytes, tdatOffset) !== "TDAT") fail(`\u0643\u062A\u0644\u0629 TDAT \u0645\u0641\u0642\u0648\u062F\u0629 \u0645\u0646 \u0627\u0644\u062C\u062F\u0648\u0644 ${name}.`);
    const textBytes = u32(view, tdatOffset + 4);
    if (textBytes % 2 !== 0 || tdatOffset + 8 + textBytes > bytes.length) {
      fail(`\u062D\u062C\u0645 TDAT \u063A\u064A\u0631 \u0635\u062D\u064A\u062D \u0641\u064A \u0627\u0644\u062C\u062F\u0648\u0644 ${name}.`);
    }
    const payloadOffset = tdatOffset + 8;
    const entries = [];
    for (let keyAt = tkeyOffset + 8; keyAt < tkeyOffset + 8 + keyBytes; keyAt += 8) {
      const dataOffset = u32(view, keyAt);
      if (dataOffset >= textBytes) fail(`\u0625\u0632\u0627\u062D\u0629 \u0646\u0635 \u062E\u0627\u0631\u062C TDAT \u0641\u064A \u0627\u0644\u062C\u062F\u0648\u0644 ${name}.`);
      entries.push({
        dataOffset,
        crc: u32(view, keyAt + 4),
        textUnits: readGxtTextUnits(view, payloadOffset, textBytes, dataOffset, name)
      });
    }
    tables.push({ name, offset, tkeyOffset, tdatOffset, textBytes, entries });
  }
  return { version, charSize, bytes: bytes.length, tables };
}

// ../../../tmp/claude-0/-home-user-zelda-arabic-magic-a76daea1/30195602-0f97-5db6-98d0-4ccab372886b/scratchpad/freq.ts
var buf = readFileSync("/root/.claude/uploads/30195602-0f97-5db6-98d0-4ccab372886b/a5c910b1-russian_3.gxt");
var gxt = parseGtaIvGxt(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
var counts = /* @__PURE__ */ new Map();
for (const t of gxt.tables) for (const e of t.entries)
  for (const u of Array.from(e.textUnits)) if (u > 127) counts.set(u, (counts.get(u) ?? 0) + 1);
var sorted = [...counts].sort((a, b) => b[1] - a[1]);
var unmapped = sorted.filter(([u]) => !GTAIV_RU_UNIT_TO_CODEPOINT.has(u));
console.log("distinct units >127:", sorted.length, "| unmapped by our table:", unmapped.length);
console.log("unmapped (top 20):", unmapped.slice(0, 20).map(([u, n]) => `${u}:${n}`).join(" "));
var H = { 180: "yeh.INI", 185: "yeh.MED", 186: "yeh.ISO", 471: "yeh.FIN", 191: "maksura.ISO", 171: "maksura.FIN" };
console.log("\nrank  unit  count   note");
sorted.slice(0, 25).forEach(([u, n], i) => {
  const cp = GTAIV_RU_UNIT_TO_CODEPOINT.get(u);
  console.log(`${(i + 1).toString().padStart(4)}  ${u.toString().padStart(4)}  ${n.toString().padStart(6)}   ${H[u] ?? (cp ? "U+" + cp.toString(16) : "UNMAPPED")}`);
});
console.log("\nyeh-family ranks:");
for (const u of [180, 185, 186, 471, 191, 171]) {
  const r = sorted.findIndex(([x]) => x === u);
  console.log(`  unit ${u} (${H[u]}): rank ${r + 1}, count ${counts.get(u) ?? 0}`);
}
