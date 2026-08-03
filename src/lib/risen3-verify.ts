/**
 * Checking a built `0_na_fnt.pak` against everything the shipped one shows.
 *
 * Written because three builds in a row left the game with no text at all —
 * not the Arabic, not the Latin — and nothing on screen said why. The engine
 * gives no error: it drops a font it does not like and draws nothing. So the
 * only way to know is to compare the file against the seven fonts the game
 * itself ships, and refuse to hand over a file that differs where it matters.
 *
 * Each rule below cost a build to learn:
 *
 *   - **The charmap must ascend.** All seven are strictly ascending. Appending
 *     Arabic after the last code broke that, and every character stopped being
 *     found — the engine binary-searches this table.
 *   - **The index must agree.** `w_fnt_0_na.db` repeats each font's length;
 *     leaving it at the old value drops the font.
 *   - **The atlas must not outgrow the game's own.** The largest shipped is
 *     2048x1024. A build that doubled one to 2048x2048 was refused even with
 *     every other field correct.
 *   - Records must stay inside the texture, and no two characters may end up
 *     on one glyph.
 */

import { parseImagesPakHeader, parseImagesPakFileInfoTree, type RisenPakNode } from "./risen-images-pak";
import { inflateFontsPakEntry } from "./risen2-fontspak";
import {
  parseRisen3Fnt,
  looksLikeRisen3Fnt,
  risen3FntAtlas,
  risen3FntName,
  readRisen3FontCsv,
  risen3FntHashFromPath,
  readRisen3FontDbEnd,
} from "./risen3-fnt";

/** The largest atlas the game ships, and so the largest known to work. */
export const RISEN3_MAX_ATLAS_PIXELS = 2048 * 1024;

export interface Risen3FontCheck {
  path: string;
  name: string;
  /** The name the index knows it by, when the manifest could give one. */
  dbName: string | null;
  bytes: number;
  chars: number;
  arabic: number;
  glyphs: number;
  atlas: { width: number; height: number };
  /** Where the charmap first stops ascending, or -1 when it never does. */
  orderBreak: number;
  recordsOutsideAtlas: number;
  glyphIndexOutOfRange: number;
  sharedGlyphs: number;
  dbRecorded: number | null;
  dbExpected: number;
  problems: string[];
}

export interface Risen3ArchiveReport {
  toolVersion: string;
  archiveBytes: number;
  fonts: Risen3FontCheck[];
  /** Every problem found, across every font. Empty means the file is sound. */
  problems: string[];
}

function walk(tree: RisenPakNode[], prefix: string, out: { path: string; node: RisenPakNode }[]): void {
  for (const node of tree) {
    const path = prefix ? `${prefix}/${node.name}` : node.name;
    if (node.type === "folder") walk(node.children, path, out);
    else out.push({ path, node });
  }
}

/**
 * Reads a built archive back and checks it, the way the engine would if it
 * told us anything.
 *
 * `original` is the untouched archive, so an atlas can be judged against what
 * that font started with rather than a number chosen here.
 */
export function verifyRisen3Archive(
  bytes: Uint8Array,
  toolVersion: string,
  original?: Uint8Array
): Risen3ArchiveReport {
  const header = parseImagesPakHeader(bytes);
  const { tree } = parseImagesPakFileInfoTree(bytes.subarray(header.fileInfoOffset), header);
  const nodes: { path: string; node: RisenPakNode }[] = [];
  walk(tree, "", nodes);

  const dbNode = nodes.find((n) => n.path.endsWith(".db"));
  const csvNode = nodes.find((n) => n.path.endsWith(".csv"));
  const db = dbNode ? inflateFontsPakEntry(bytes, dbNode.node as never) : null;
  const byHash = csvNode ? readRisen3FontCsv(inflateFontsPakEntry(bytes, csvNode.node as never)) : new Map<string, string>();

  const originalAtlas = new Map<string, number>();
  if (original) {
    try {
      const oh = parseImagesPakHeader(original);
      const { tree: ot } = parseImagesPakFileInfoTree(original.subarray(oh.fileInfoOffset), oh);
      const on: { path: string; node: RisenPakNode }[] = [];
      walk(ot, "", on);
      for (const { path, node } of on) {
        const inner = inflateFontsPakEntry(original, node as never);
        if (!looksLikeRisen3Fnt(inner)) continue;
        const a = risen3FntAtlas(parseRisen3Fnt(inner));
        originalAtlas.set(path, a.width * a.height);
      }
    } catch {
      // An unreadable original is not this check's business; the rest stands.
    }
  }

  const fonts: Risen3FontCheck[] = [];
  const problems: string[] = [];

  for (const { path, node } of nodes) {
    let inner: Uint8Array;
    try {
      inner = inflateFontsPakEntry(bytes, node as never);
    } catch {
      problems.push(`تعذّر فكّ ضغط «${path}»`);
      continue;
    }
    if (!looksLikeRisen3Fnt(inner)) continue;

    const doc = parseRisen3Fnt(inner);
    const atlas = risen3FntAtlas(doc);
    const name = risen3FntName(inner);
    const dbName = byHash.get(risen3FntHashFromPath(path) ?? "") ?? null;

    let orderBreak = -1;
    for (let i = 1; i < doc.charmap.length; i++) {
      if (doc.charmap[i].charCode <= doc.charmap[i - 1].charCode) {
        orderBreak = i;
        break;
      }
    }
    const outside = doc.glyphs.filter((g) => g.fields[2] > atlas.width || g.fields[3] > atlas.height).length;
    const outOfRange = doc.charmap.filter((p) => p.glyphIndex >= doc.glyphs.length).length;
    const shared = doc.charmap.length - new Set(doc.charmap.map((p) => p.glyphIndex)).size;
    const dbExpected = inner.length - 36;
    const dbRecorded = db && dbName ? readRisen3FontDbEnd(db, dbName) : null;

    const own: string[] = [];
    const label = dbName ?? name ?? path;
    if (orderBreak >= 0) {
      own.push(`«${label}»: خريطة الحروف غير مرتّبة — تنكسر عند الزوج ${orderBreak} (${doc.charmap[orderBreak].charCode} بعد ${doc.charmap[orderBreak - 1].charCode})`);
    }
    if (outside > 0) own.push(`«${label}»: ${outside} خلية خارج حدود الأطلس`);
    if (outOfRange > 0) own.push(`«${label}»: ${outOfRange} رمزاً يشير إلى رسم غير موجود`);
    if (shared > 0) own.push(`«${label}»: ${shared} رمزاً يتشارك رسماً مع غيره`);
    if (dbName && dbRecorded !== dbExpected) {
      own.push(`«${label}»: الفهرس يقول ${dbRecorded} والمطلوب ${dbExpected}`);
    }
    if (!dbName) own.push(`«${label}»: لم أجد اسمه في بيان الخطوط، فلا يمكن التحقّق من سجلّه في الفهرس`);
    const area = atlas.width * atlas.height;
    const before = originalAtlas.get(path);
    if (before !== undefined && area > before) {
      own.push(`«${label}»: الأطلس كبر من ${before / 1e6}M إلى ${area / 1e6}M بكسل — أكبر أطلس تشحنه اللعبة ${RISEN3_MAX_ATLAS_PIXELS / 1e6}M، والبناء الذي تجاوزه رفضته اللعبة`);
    } else if (area > RISEN3_MAX_ATLAS_PIXELS) {
      own.push(`«${label}»: الأطلس ${atlas.width}×${atlas.height} أكبر من أي أطلس تشحنه اللعبة`);
    }
    if ((atlas.width & (atlas.width - 1)) !== 0 || (atlas.height & (atlas.height - 1)) !== 0) {
      own.push(`«${label}»: أبعاد الأطلس ليست قوّة اثنين`);
    }

    fonts.push({
      path,
      name,
      dbName,
      bytes: inner.length,
      chars: doc.charmap.length,
      arabic: doc.charmap.filter((p) => p.charCode >= 0x0600 && p.charCode <= 0xfeff).length,
      glyphs: doc.glyphs.length,
      atlas: { width: atlas.width, height: atlas.height },
      orderBreak,
      recordsOutsideAtlas: outside,
      glyphIndexOutOfRange: outOfRange,
      sharedGlyphs: shared,
      dbRecorded,
      dbExpected,
      problems: own,
    });
    problems.push(...own);
  }

  if (fonts.length === 0) problems.push("لا خطوط في هذا الملف");
  return { toolVersion, archiveBytes: bytes.length, fonts, problems };
}

/** The report as text, for the translator to copy and send. */
export function formatRisen3Report(report: Risen3ArchiveReport): string {
  const lines = [
    `تقرير أداة خطوط Risen 3 — نسخة الأداة ${report.toolVersion}`,
    `حجم الحاوية: ${report.archiveBytes} بايت`,
    "",
  ];
  for (const f of report.fonts) {
    lines.push(
      `${f.dbName ?? f.name} (${f.path})`,
      `   الحجم ${f.bytes} | حروف ${f.chars} منها عربي ${f.arabic} | رسوم ${f.glyphs}`,
      `   الأطلس ${f.atlas.width}×${f.atlas.height} = ${(f.atlas.width * f.atlas.height) / 1e6}M بكسل`,
      `   الترتيب ${f.orderBreak < 0 ? "تصاعدي" : `مكسور عند ${f.orderBreak}`}` +
        ` | خارج الأطلس ${f.recordsOutsideAtlas} | فهارس خاطئة ${f.glyphIndexOutOfRange} | رسوم مشتركة ${f.sharedGlyphs}`,
      `   الفهرس ${f.dbRecorded ?? "—"} والمطلوب ${f.dbExpected}`,
      ""
    );
  }
  lines.push(report.problems.length === 0 ? "لا مشاكل." : `مشاكل (${report.problems.length}):`);
  for (const p of report.problems) lines.push(`   • ${p}`);
  return lines.join("\n");
}
