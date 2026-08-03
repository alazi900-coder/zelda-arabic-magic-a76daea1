/**
 * خطوط GameMaker المرسومة بالصور — قراءتها والرسم فيها
 *
 * لعبة Mario هذه لا تحمل خطّاً واحداً في قسم الخطوط `FONT` (عدده صفر).
 * وإنّما تبني خطّها وقت التشغيل من صورة، ونداؤها مقروءٌ من بايتاتها:
 *
 *     font_add_sprite(spr_hud_font,           33, false, false)
 *     font_add_sprite(spr_hud_font_interface, 33, false, false)
 *
 * فالإطار الأوّل من الصورة هو الحرف ٣٣ (`!`)، والذي يليه ٣٤، حتى آخر
 * إطار — ٩٣ إطاراً، فآخر حرف ١٢٥ (`}`). وهذا ليس استنتاجاً من أسماء
 * الصور: الرقمان ٣٣ و«اسم الصورة» مقروءان من معاملات النداء نفسه.
 *
 * وكل إطار مستطيلٌ في صفحة نسيج، وكل صفحة صورة PNG داخل قسم `TXTR`.
 * فالكتابة في الخطّ = رسمٌ في بكسلات تلك الصفحات، لا أكثر: لا يزيد إطار
 * ولا ينقص، ولا يتغيّر جدول ولا بنية. وهذا ما يجعل الطريق آمناً — توسيع
 * الصورة كان يعني تكبير `SPRT` و`TPAG` وهما في وسط الملف يليهما عشرة
 * أقسام بعناوين مطلقة.
 *
 * ويبقى أنّ إعادة ترميز صفحة تغيّر طولها، فتُعاد كتابة قسم النسيج وتُزاح
 * الأصوات بعده — وهي الإزاحة نفسها التي يفعلها كاتب النصوص، بالحارس نفسه.
 */

import { decodePngRawNoCanvas, type DecodedPng } from "@/lib/png-decode";
import { encodePngRawNoCanvas } from "@/lib/png-encode";
import type { GameMakerIFFDocument } from "./gm-iff-parser";

/** خانة واحدة في الخطّ: الحرف الذي ترسمه، وأين هو من صفحة النسيج. */
export interface GmFontCell {
  charCode: number;
  page: number;
  x: number;
  y: number;
  width: number;
  height: number;
  /** إزاحة الرسم داخل الخانة، كما يخزّنها الملف. */
  offsetX: number;
  offsetY: number;
}

export interface GmSpriteFont {
  name: string;
  spriteIndex: number;
  /** رمز الحرف الذي يرسمه الإطار الأوّل، من معاملات النداء. */
  firstChar: number;
  cellWidth: number;
  cellHeight: number;
  cells: GmFontCell[];
}

const PUSH_INT16_OPCODE = 0x84;
const CONVERT_OPCODE = 0x07;

function readString(view: DataView, pointer: number): string {
  const length = view.getUint32(pointer - 4, true);
  let text = "";
  for (let i = 0; i < length; i++) text += String.fromCharCode(view.getUint8(pointer + i));
  return text;
}

/**
 * معاملات نداءٍ ثابتة، مقروءة من الأوامر التي تسبقه.
 *
 * تُدفع المعاملات معكوسةً، فآخر ما يُدفع قبل النداء هو المعامل الأوّل.
 * وكل معامل هنا رقم صريح (`pushi`) يتبعه أمر تحويل، فإن كان المعامل
 * حساباً لا رقماً توقّفت القراءة وعاد ما جُمع.
 */
function literalArguments(view: DataView, callSite: number): number[] {
  const args: number[] = [];
  let p = callSite - 8;
  while (args.length < 4 && p > callSite - 80 && p >= 0) {
    const word = view.getUint32(p, true);
    const opcode = (word >>> 24) & 0xff;
    if (opcode === CONVERT_OPCODE) { p -= 4; continue; }
    if (opcode !== PUSH_INT16_OPCODE) break;
    args.push(word & 0xffff);
    p -= 4;
  }
  return args;
}

/** مواضع كل نداء لدالّة باسمها، من جدول الدوالّ وسلسلة نداءاتها. */
function callSites(view: DataView, doc: GameMakerIFFDocument, functionName: string): number[] {
  const func = doc.chunkLayout.find((c) => c.id === "FUNC");
  if (!func) return [];
  const count = view.getUint32(func.start, true);
  for (let i = 0; i < count; i++) {
    const at = func.start + 4 + 12 * i;
    if (readString(view, view.getUint32(at, true)) !== functionName) continue;
    const occurrences = view.getUint32(at + 4, true);
    let address = view.getUint32(at + 8, true);
    const sites: number[] = [];
    for (let k = 0; k < occurrences && address > 0 && address + 8 <= view.byteLength; k++) {
      sites.push(address);
      // كل نداء يحمل بعده المسافة إلى النداء الذي يليه.
      const step = view.getInt32(address + 4, true);
      if (step <= 0) break;
      address += step;
    }
    return sites;
  }
  return [];
}

/** مواضع مدخلات صفحات النسيج المسموح للإطارات أن تشير إليها. */
function tpagEntries(view: DataView, doc: GameMakerIFFDocument): Set<number> {
  const tpag = doc.chunkLayout.find((c) => c.id === "TPAG");
  const out = new Set<number>();
  if (!tpag) return out;
  const count = view.getUint32(tpag.start, true);
  for (let i = 0; i < count; i++) out.add(view.getUint32(tpag.start + 4 + 4 * i, true));
  return out;
}

/**
 * الخطوط التي تبنيها اللعبة من صورها، بحروفها ومواضعها.
 *
 * لا يُخمَّن شيء: أسماء الصور وأرقام الحروف من معاملات `font_add_sprite`،
 * وعدد الإطارات ومستطيلاتها من جداول الملف. وإطارٌ لا يشير إلى مدخلة
 * صفحةٍ معروفة يُسقط الخطّ كلّه، لأنّه يعني أنّ بنية الصورة ليست ما نظنّ.
 */
export function findGmSpriteFonts(doc: GameMakerIFFDocument): GmSpriteFont[] {
  const view = new DataView(doc.originalBuffer);
  const sprt = doc.chunkLayout.find((c) => c.id === "SPRT");
  if (!sprt) return [];
  const spriteCount = view.getUint32(sprt.start, true);
  const known = tpagEntries(view, doc);
  const fonts: GmSpriteFont[] = [];

  for (const site of callSites(view, doc, "font_add_sprite")) {
    const args = literalArguments(view, site);
    if (args.length < 2) continue;
    const [spriteIndex, firstChar] = args;
    if (spriteIndex >= spriteCount) continue;

    const sprite = view.getUint32(sprt.start + 4 + 4 * spriteIndex, true);
    const name = readString(view, view.getUint32(sprite, true));
    const cellWidth = view.getUint32(sprite + 4, true);
    const cellHeight = view.getUint32(sprite + 8, true);
    const frames = view.getUint32(sprite + 56, true);
    if (frames < 1 || frames > 4096) continue;

    const cells: GmFontCell[] = [];
    let sound = true;
    for (let i = 0; i < frames; i++) {
      const entry = view.getUint32(sprite + 60 + 4 * i, true);
      if (!known.has(entry)) { sound = false; break; }
      cells.push({
        charCode: firstChar + i,
        x: view.getUint16(entry, true),
        y: view.getUint16(entry + 2, true),
        width: view.getUint16(entry + 4, true),
        height: view.getUint16(entry + 6, true),
        offsetX: view.getUint16(entry + 8, true),
        offsetY: view.getUint16(entry + 10, true),
        page: view.getUint16(entry + 20, true),
      });
    }
    if (!sound) continue;
    fonts.push({ name, spriteIndex, firstChar, cellWidth, cellHeight, cells });
  }
  return fonts;
}

/** موضع بيانات كل صفحة نسيج وطولها. */
function texturePages(view: DataView, doc: GameMakerIFFDocument): { entry: number; data: number }[] {
  const txtr = doc.chunkLayout.find((c) => c.id === "TXTR");
  if (!txtr) throw new Error("لا قسم صفحات نسيج (TXTR) في هذا الملف");
  const count = view.getUint32(txtr.start, true);
  const out: { entry: number; data: number }[] = [];
  for (let i = 0; i < count; i++) {
    const entry = view.getUint32(txtr.start + 4 + 4 * i, true);
    out.push({ entry, data: view.getUint32(entry + 4, true) });
  }
  return out;
}

/** نهاية بيانات صفحة: أوّل ما يليها، أو نهاية القسم للأخيرة. */
function pageBounds(view: DataView, doc: GameMakerIFFDocument): { start: number; end: number }[] {
  const txtr = doc.chunkLayout.find((c) => c.id === "TXTR")!;
  const pages = texturePages(view, doc);
  const sorted = [...pages].map((p) => p.data).sort((a, b) => a - b);
  return pages.map((p) => {
    const next = sorted.find((v) => v > p.data);
    return { start: p.data, end: next ?? txtr.start + txtr.size };
  });
}

/** يقرأ صفحات النسيج المطلوبة بكسلاتٍ. */
export async function readGmTexturePages(
  doc: GameMakerIFFDocument,
  pages: number[]
): Promise<Map<number, DecodedPng>> {
  const view = new DataView(doc.originalBuffer);
  const bytes = new Uint8Array(doc.originalBuffer);
  const bounds = pageBounds(view, doc);
  const out = new Map<number, DecodedPng>();
  for (const page of new Set(pages)) {
    const b = bounds[page];
    if (!b) throw new Error(`لا صفحة نسيج برقم ${page}`);
    const decoded = await decodePngRawNoCanvas(bytes.subarray(b.start, b.end));
    if (!decoded) throw new Error(`تعذّرت قراءة صفحة النسيج ${page}`);
    out.set(page, decoded);
  }
  return out;
}

/**
 * يكتب صفحاتٍ معدَّلة ويُخرج الملف كلّه.
 *
 * إعادة ترميز صورة تغيّر طولها، فتُعاد كتابة منطقة البيانات كلّها بمحاذاتها
 * المقروءة من الملف، وتُصحَّح مواضع الصفحات، ويُزاح ما بعد القسم. والقسم
 * الوحيد الذي يليه هنا هو الأصوات، وجدوله مواضعُ صرفة.
 */
export async function writeGmTexturePages(
  doc: GameMakerIFFDocument,
  edited: Map<number, DecodedPng>
): Promise<ArrayBuffer> {
  const view = new DataView(doc.originalBuffer);
  const bytes = new Uint8Array(doc.originalBuffer);
  const txtr = doc.chunkLayout.find((c) => c.id === "TXTR")!;
  const pages = texturePages(view, doc);
  const bounds = pageBounds(view, doc);

  const blobs: Uint8Array[] = [];
  for (let i = 0; i < pages.length; i++) {
    const replacement = edited.get(i);
    if (!replacement) {
      blobs.push(bytes.subarray(bounds[i].start, bounds[i].end));
      continue;
    }
    const encoded = await encodePngRawNoCanvas(replacement.rgba, replacement.width, replacement.height);
    if (!encoded) throw new Error(`تعذّر ترميز صفحة النسيج ${i}`);
    blobs.push(encoded);
  }

  // المحاذاة كما يحفظها الملف نفسه، لا كما نظنّ.
  let common = 0;
  for (const p of pages) common |= p.data;
  const alignment = common === 0 ? 1 : common & -common;

  const dataStart = Math.min(...pages.map((p) => p.data));
  const placements: number[] = [];
  let at = dataStart;
  for (const blob of blobs) {
    at = Math.ceil(at / alignment) * alignment;
    placements.push(at);
    at += blob.length;
  }
  const oldEnd = txtr.start + txtr.size;
  const delta = at - oldEnd;

  const out = new Uint8Array(doc.originalBuffer.byteLength + delta);
  const outView = new DataView(out.buffer);
  out.set(bytes.subarray(0, dataStart), 0);
  blobs.forEach((blob, i) => out.set(blob, placements[i]));
  out.set(bytes.subarray(oldEnd), at);

  // يُزاح الحجم المذكور بمقدار التغيير ولا يُعاد حسابه: ملفّ حقله لا يطابق
  // طوله يبقى كما هو، فلا نُخفي عنه خللاً بتصحيحٍ لم يُطلب.
  outView.setUint32(4, view.getUint32(4, true) + delta, true);
  outView.setUint32(txtr.start - 4, txtr.size + delta, true);
  pages.forEach((p, i) => outView.setUint32(p.entry + 4, placements[i], true));

  for (const chunk of doc.chunkLayout) {
    if (chunk.start < oldEnd) continue;
    if (chunk.id !== "AUDO") {
      throw new Error(`قسم «${chunk.id}» يلي صفحات النسيج ولا أعرف مواضعه — لا أبني ملفاً قد تفسد عناوينه`);
    }
    const start = chunk.start + delta;
    const count = outView.getUint32(start, true);
    for (let i = 0; i < count; i++) {
      const entryAt = start + 4 + 4 * i;
      outView.setUint32(entryAt, outView.getUint32(entryAt, true) + delta, true);
    }
  }

  return out.buffer;
}

/** يرسم بكسلات حرفٍ في خانته، ويترك ما حولها كما هو. */
export function paintGmFontCell(page: DecodedPng, cell: GmFontCell, glyph: DecodedPng): void {
  for (let y = 0; y < cell.height; y++) {
    for (let x = 0; x < cell.width; x++) {
      const to = ((cell.y + y) * page.width + (cell.x + x)) * 4;
      const inside = x < glyph.width && y < glyph.height;
      const from = inside ? (y * glyph.width + x) * 4 : -1;
      for (let c = 0; c < 4; c++) page.rgba[to + c] = from < 0 ? 0 : glyph.rgba[from + c];
    }
  }
}
