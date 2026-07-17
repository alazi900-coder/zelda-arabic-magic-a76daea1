/**
 * Risen 2 `.xgfn` audit engine — deep, real (not cosmetic) validation of a
 * font document: header-field consistency, per-glyph structural checks, and
 * pixel-level ink verification against the decoded DDS atlas. Pure logic —
 * no DOM — so it runs in Vitest and in the browser alike.
 *
 * Every rule here is grounded in behavior confirmed on real files during
 * this project's reverse-engineering (see risen2-xgfn.ts docblock): the
 * structural equations hold exactly on 112/112 real fonts (77 original +
 * 35 from a working Chinese mod), and each equation that was ever violated
 * by generated output corresponded to a real in-game failure (crash or
 * invisible text).
 */
import { buildXgfn, parseXgfn, type XgfnDocument } from "./risen2-xgfn";
import { decodeDdsToRgba } from "./risen-ximg";

export type AuditSeverity = "error" | "warning";

export interface AuditIssue {
  severity: AuditSeverity;
  message: string;
}

export interface GlyphAuditRow {
  charCode: number;
  /** Printable form of the character (or a U+XXXX label). */
  charLabel: string;
  glyphIndex: number;
  /** fields[0..3] of the glyph's measurement record. */
  box: { x0: number; y0: number; x1: number; y1: number } | null;
  advance: number | null;
  /** All 9 raw int32 fields of the record. */
  fields: number[] | null;
  /** Real ink bounding box found inside the declared box (null = no ink). */
  inkBounds: { x0: number; y0: number; x1: number; y1: number } | null;
  issues: AuditIssue[];
}

export interface XgfnAuditReport {
  fontLabel: string;
  headerIssues: AuditIssue[];
  glyphs: GlyphAuditRow[];
  atlas: { width: number; height: number; powerOfTwo: boolean } | null;
  errorCount: number;
  warningCount: number;
}

function charLabelOf(code: number): string {
  if (code >= 0x21 && code <= 0x7e) return String.fromCharCode(code);
  if (code === 0x20) return "space";
  // Arabic presentation forms / letters / digits render fine in the UI
  if ((code >= 0x0600 && code <= 0x06ff) || (code >= 0xfb50 && code <= 0xfeff)) {
    return String.fromCharCode(code);
  }
  if (code >= 0xa0 && code <= 0x2fff) return String.fromCharCode(code);
  return "U+" + code.toString(16).toUpperCase().padStart(4, "0");
}

function isPowerOfTwo(n: number): boolean {
  return n > 0 && (n & (n - 1)) === 0;
}

/** Deep audit of one parsed document. Pass `original` (the same font before
 * modification) to also verify nothing pre-existing was disturbed. */
export function auditXgfnDocument(
  doc: XgfnDocument,
  options: { fontLabel?: string; original?: XgfnDocument } = {}
): XgfnAuditReport {
  const headerIssues: AuditIssue[] = [];
  const glyphs: GlyphAuditRow[] = [];

  const headerView = new DataView(doc.headerPrefix.buffer, doc.headerPrefix.byteOffset, doc.headerPrefix.byteLength);

  // --- header/structure equations (each violated form of these caused a
  // real in-game failure at some point in this project) ---
  const pairCountField = headerView.getUint32(0xf6, true);
  if (pairCountField !== doc.charmap.length) {
    headerIssues.push({ severity: "error", message: `حقل عدد الأزواج (0xF6=${pairCountField}) لا يطابق العدد الفعلي (${doc.charmap.length})` });
  }

  if (doc.recordCount !== doc.measurements.length) {
    headerIssues.push({ severity: "error", message: `عدّاد السجلات (${doc.recordCount}) لا يطابق عدد السجلات الفعلي (${doc.measurements.length})` });
  }

  const maxGlyphIndex = doc.charmap.length ? Math.max(...doc.charmap.map((r) => r.glyphIndex)) : -1;
  if (doc.recordCount !== maxGlyphIndex + 1) {
    // On all 112 real fonts recordCount == maxGlyphIndex + 1 exactly. A
    // higher recordCount (orphan records) is tolerated by originals? No —
    // never observed. Flag as warning if only orphans, error if pairs
    // point past the table (checked per-glyph below).
    headerIssues.push({ severity: "warning", message: `عدّاد السجلات (${doc.recordCount}) ≠ أعلى مؤشر حرف + 1 (${maxGlyphIndex + 1}) — كل الخطوط الحقيقية الـ112 تحقق المساواة تماماً` });
  }

  // 0x1C = totalSize - 0x66 (exact on every real sample)
  let rebuiltSize: number | null = null;
  try {
    rebuiltSize = buildXgfn(doc).byteLength;
  } catch (err) {
    headerIssues.push({ severity: "error", message: "تعذّرت إعادة بناء الملف للتحقق: " + (err as Error).message });
  }
  if (rebuiltSize !== null) {
    const field1c = headerView.getUint32(0x1c, true);
    if (field1c !== rebuiltSize - 0x66) {
      headerIssues.push({ severity: "error", message: `حقل حجم الحمولة (0x1C=${field1c}) لا يطابق الصيغة المؤكدة (الحجم−0x66=${rebuiltSize - 0x66}) — تسبب سابقاً بانهيار STATUS_NO_MEMORY` });
    }
  }

  // trailing u32 == DDS byte length (exact on 112/112 real fonts; the working
  // Chinese mod updates it when its atlases grow — left stale it made the
  // engine reject the whole font: all glyphs invisible, Latin included)
  const trailingView = new DataView(doc.trailingBytes.buffer, doc.trailingBytes.byteOffset, doc.trailingBytes.byteLength);
  const ddsLenField = trailingView.getUint32(0, true);
  if (ddsLenField !== doc.ddsBytes.length) {
    headerIssues.push({ severity: "error", message: `حقل طول DDS (${ddsLenField}) لا يطابق طول الأطلس الفعلي (${doc.ddsBytes.length}) — قيمة قديمة هنا تجعل المحرك يخفي كل الحروف (العربية والإنجليزية)` });
  }

  // --- vs original: nothing pre-existing may change ---
  if (options.original) {
    const orig = options.original;
    const origView = new DataView(orig.headerPrefix.buffer, orig.headerPrefix.byteOffset, orig.headerPrefix.byteLength);
    for (const off of [0xea, 0xee, 0xf2] as const) {
      const a = origView.getUint32(off, true);
      const b = headerView.getUint32(off, true);
      if (a !== b) {
        headerIssues.push({ severity: "error", message: `الحقل 0x${off.toString(16).toUpperCase()} تغيّر (${a} → ${b}) — يجب ألا يُلمس أبداً (مؤكد من المود الصيني العامل)` });
      }
    }
    // Every original pair must survive identically.
    const byChar = new Map(doc.charmap.map((r) => [r.charCode, r.glyphIndex]));
    for (const p of orig.charmap) {
      const now = byChar.get(p.charCode);
      if (now === undefined) {
        headerIssues.push({ severity: "warning", message: `الزوج الأصلي (${charLabelOf(p.charCode)} → ${p.glyphIndex}) حُذف` });
      } else if (now !== p.glyphIndex) {
        headerIssues.push({ severity: "error", message: `الزوج الأصلي (${charLabelOf(p.charCode)}) غيّر مؤشره (${p.glyphIndex} → ${now})` });
      }
    }
    // Every original record must be byte-identical at the same index.
    const shared = Math.min(orig.measurements.length, doc.measurements.length);
    for (let i = 0; i < shared; i++) {
      const a = orig.measurements[i].rawBytes;
      const b = doc.measurements[i].rawBytes;
      let same = a.length === b.length;
      if (same) for (let k = 0; k < a.length; k++) if (a[k] !== b[k]) { same = false; break; }
      if (!same) {
        headerIssues.push({ severity: "error", message: `سجل القياسات الأصلي رقم ${i} تغيّرت بايتاته` });
      }
    }
    if (doc.measurements.length < orig.measurements.length) {
      headerIssues.push({ severity: "error", message: `عدد السجلات نقص عن الأصل (${orig.measurements.length} → ${doc.measurements.length})` });
    }
  }

  // --- atlas ---
  let atlas: XgfnAuditReport["atlas"] = null;
  let rgba: Uint8Array | null = null;
  let atlasW = 0;
  let atlasH = 0;
  const decoded = decodeDdsToRgba(doc.ddsBytes);
  if (!decoded.supported) {
    headerIssues.push({ severity: "error", message: "تعذّر فك ضغط أطلس DDS — صيغة غير مدعومة أو تالفة" });
  } else {
    atlasW = decoded.width;
    atlasH = decoded.height;
    rgba = decoded.rgba;
    const pot = isPowerOfTwo(atlasW) && isPowerOfTwo(atlasH);
    atlas = { width: atlasW, height: atlasH, powerOfTwo: pot };
    if (!pot) {
      headerIssues.push({ severity: "error", message: `أبعاد الأطلس ${atlasW}×${atlasH} ليست قوة 2 — المحرك يرفض تحميلها بصمت` });
    }
  }

  // --- per-glyph rows ---
  const seenChars = new Map<number, number>();
  const boxes: { charCode: number; x0: number; y0: number; x1: number; y1: number }[] = [];

  for (const pair of doc.charmap) {
    const issues: AuditIssue[] = [];
    const prevSeen = seenChars.get(pair.charCode);
    if (prevSeen !== undefined) {
      issues.push({ severity: "error", message: `رمز مكرر — سبق ربطه بالمؤشر ${prevSeen}` });
    }
    seenChars.set(pair.charCode, pair.glyphIndex);

    let box: GlyphAuditRow["box"] = null;
    let advance: number | null = null;
    let fields: number[] | null = null;
    let inkBounds: GlyphAuditRow["inkBounds"] = null;

    if (pair.glyphIndex >= doc.recordCount) {
      issues.push({ severity: "error", message: `المؤشر ${pair.glyphIndex} خارج جدول السجلات (العدد ${doc.recordCount})` });
    } else {
      const rec = doc.measurements[pair.glyphIndex];
      fields = rec.fields;
      const [x0, y0, x1, y1, adv] = rec.fields;
      box = { x0, y0, x1, y1 };
      advance = adv;

      const degenerate = x1 <= x0 || y1 <= y0;
      if (!degenerate) {
        if (x0 < 0 || y0 < 0 || (atlasW > 0 && (x1 > atlasW || y1 > atlasH))) {
          issues.push({ severity: "error", message: `الصندوق [${x0},${y0}]-[${x1},${y1}] خارج حدود الأطلس ${atlasW}×${atlasH}` });
        } else if (rgba) {
          // pixel-level: is there real ink inside the declared box?
          let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
          for (let y = y0; y < y1; y++) {
            for (let x = x0; x < x1; x++) {
              if (rgba[(y * atlasW + x) * 4 + 3] > 10) {
                if (x < minX) minX = x;
                if (y < minY) minY = y;
                if (x > maxX) maxX = x;
                if (y > maxY) maxY = y;
              }
            }
          }
          if (minX === Infinity) {
            issues.push({ severity: "warning", message: "لا يوجد أي حبر داخل صندوق الحرف — سيُرسم فارغاً" });
          } else {
            inkBounds = { x0: minX, y0: minY, x1: maxX + 1, y1: maxY + 1 };
          }
        }
        boxes.push({ charCode: pair.charCode, x0, y0, x1, y1 });
      } else if (pair.charCode !== 0x20 && pair.charCode !== 0x1f && (advance === null || advance <= 0)) {
        issues.push({ severity: "warning", message: "صندوق فارغ وتباعد صفري — الحرف لن يشغل أي مساحة" });
      }
      if (advance !== null && advance < 0) {
        issues.push({ severity: "error", message: `تباعد سالب (${advance})` });
      }
    }

    glyphs.push({
      charCode: pair.charCode,
      charLabel: charLabelOf(pair.charCode),
      glyphIndex: pair.glyphIndex,
      box,
      advance,
      fields,
      inkBounds,
      issues,
    });
  }

  // --- overlap detection between non-degenerate boxes (same atlas region
  // shared by two DIFFERENT glyph indices is legal aliasing; two different
  // regions overlapping partially is a packing bug) ---
  const byIndex = new Map<number, { x0: number; y0: number; x1: number; y1: number }>();
  doc.charmap.forEach((pair) => {
    if (pair.glyphIndex < doc.recordCount) {
      const [x0, y0, x1, y1] = doc.measurements[pair.glyphIndex].fields;
      if (x1 > x0 && y1 > y0) byIndex.set(pair.glyphIndex, { x0, y0, x1, y1 });
    }
  });
  const idxList = [...byIndex.entries()];
  for (let i = 0; i < idxList.length; i++) {
    for (let j = i + 1; j < idxList.length; j++) {
      const [gi, a] = idxList[i];
      const [gj, b] = idxList[j];
      const identical = a.x0 === b.x0 && a.y0 === b.y0 && a.x1 === b.x1 && a.y1 === b.y1;
      if (identical) continue; // full alias — legal
      const overlap = a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;
      if (overlap) {
        headerIssues.push({ severity: "warning", message: `تداخل جزئي بين صندوقي الحرفين ${gi} و${gj} في الأطلس` });
      }
    }
  }

  const allIssues = [...headerIssues, ...glyphs.flatMap((g) => g.issues)];
  return {
    fontLabel: options.fontLabel ?? "",
    headerIssues,
    glyphs,
    atlas,
    errorCount: allIssues.filter((i) => i.severity === "error").length,
    warningCount: allIssues.filter((i) => i.severity === "warning").length,
  };
}

/** Rebuild→reparse→audit safety gate: returns the reparsed doc if (and only
 * if) the mutated document serializes cleanly, parses back identically in
 * structure, and audits with ZERO errors. Throws otherwise — callers use
 * this to reject any edit that would corrupt the font. */
export function verifyDocumentSafe(doc: XgfnDocument, original?: XgfnDocument): { doc: XgfnDocument; report: XgfnAuditReport } {
  const rebuilt = buildXgfn(doc);
  const reparsed = parseXgfn(rebuilt);
  if (reparsed.charmap.length !== doc.charmap.length || reparsed.recordCount !== doc.recordCount) {
    throw new Error("فشل التحقق: الملف المُعاد بناؤه لا يُقرأ بنفس البنية");
  }
  const report = auditXgfnDocument(reparsed, { original });
  if (report.errorCount > 0) {
    const firstError =
      report.headerIssues.find((i) => i.severity === "error")?.message ??
      report.glyphs.flatMap((g) => g.issues.filter((i) => i.severity === "error").map((i) => `${g.charLabel}: ${i.message}`))[0];
    throw new Error(`رُفض التعديل — الفحص وجد ${report.errorCount} خطأً: ${firstError}`);
  }
  return { doc: reparsed, report };
}

/**
 * Machine-readable diagnostic bundle (JSON) — designed to be sent as-is to
 * an assistant/developer for remote diagnosis: carries the tool version, the
 * raw header bytes, every known header field, every structural equation with
 * its actual vs expected values, and the full per-glyph table with issues.
 */
export function buildDiagnosticJson(
  report: XgfnAuditReport,
  doc: XgfnDocument,
  extras: { appVersion: string; context?: string } // context: e.g. "single-font" | "post-injection"
): string {
  const headerView = new DataView(doc.headerPrefix.buffer, doc.headerPrefix.byteOffset, doc.headerPrefix.byteLength);
  const headerHex = Array.from(doc.headerPrefix, (b) => b.toString(16).padStart(2, "0")).join("");
  let totalSize: number | null = null;
  try {
    totalSize = buildXgfn(doc).byteLength;
  } catch {
    totalSize = null;
  }
  const maxGlyphIndex = doc.charmap.length ? Math.max(...doc.charmap.map((r) => r.glyphIndex)) : -1;
  const bundle = {
    schema: "risen2-xgfn-diagnostic/1",
    appVersion: extras.appVersion,
    generatedAt: new Date().toISOString(),
    context: extras.context ?? "single-font",
    fontLabel: report.fontLabel,
    headerHex,
    headerFields: {
      "0x10": headerView.getUint32(0x10, true),
      "0x14": headerView.getUint32(0x14, true),
      "0x18": headerView.getUint32(0x18, true),
      "0x1C": headerView.getUint32(0x1c, true),
      "0xEA": headerView.getUint32(0xea, true),
      "0xEE": headerView.getUint32(0xee, true),
      "0xF2": headerView.getUint32(0xf2, true),
      "0xF6": headerView.getUint32(0xf6, true),
    },
    equations: {
      payloadSize0x1C: { actual: headerView.getUint32(0x1c, true), expected: totalSize !== null ? totalSize - 0x66 : null, pass: totalSize !== null && headerView.getUint32(0x1c, true) === totalSize - 0x66 },
      pairCount0xF6: { actual: headerView.getUint32(0xf6, true), expected: doc.charmap.length, pass: headerView.getUint32(0xf6, true) === doc.charmap.length },
      recordCount: { actual: doc.recordCount, expectedMaxGlyphPlus1: maxGlyphIndex + 1, measurements: doc.measurements.length, pass: doc.recordCount === doc.measurements.length && doc.recordCount === maxGlyphIndex + 1 },
      atlasPowerOfTwo: { dims: report.atlas ? `${report.atlas.width}x${report.atlas.height}` : null, pass: report.atlas?.powerOfTwo ?? false },
      ddsByteLength: {
        actual: new DataView(doc.trailingBytes.buffer, doc.trailingBytes.byteOffset, doc.trailingBytes.byteLength).getUint32(0, true),
        expected: doc.ddsBytes.length,
        pass: new DataView(doc.trailingBytes.buffer, doc.trailingBytes.byteOffset, doc.trailingBytes.byteLength).getUint32(0, true) === doc.ddsBytes.length,
      },
    },
    totals: {
      pairs: doc.charmap.length,
      records: doc.recordCount,
      ddsBytes: doc.ddsBytes.length,
      totalSize,
      errorCount: report.errorCount,
      warningCount: report.warningCount,
    },
    headerIssues: report.headerIssues,
    glyphs: report.glyphs.map((g) => ({
      char: g.charLabel,
      code: "U+" + g.charCode.toString(16).toUpperCase().padStart(4, "0"),
      glyphIndex: g.glyphIndex,
      box: g.box,
      advance: g.advance,
      fields: g.fields,
      ink: g.inkBounds,
      issues: g.issues,
    })),
  };
  return JSON.stringify(bundle, null, 1);
}

/** Plain-text report (Arabic) for download/inspection. */
export function formatAuditReportText(report: XgfnAuditReport): string {
  const lines: string[] = [];
  lines.push(`===== تقرير فحص الخط: ${report.fontLabel} =====`);
  lines.push(`الأطلس: ${report.atlas ? `${report.atlas.width}×${report.atlas.height} (قوة-2: ${report.atlas.powerOfTwo ? "نعم" : "لا"})` : "غير قابل للفك"}`);
  lines.push(`الحروف: ${report.glyphs.length} | أخطاء: ${report.errorCount} | تحذيرات: ${report.warningCount}`);
  lines.push("");
  if (report.headerIssues.length) {
    lines.push("--- مشاكل عامة ---");
    for (const i of report.headerIssues) lines.push(`[${i.severity === "error" ? "خطأ" : "تحذير"}] ${i.message}`);
    lines.push("");
  }
  lines.push("--- كل الحروف ---");
  for (const g of report.glyphs) {
    const boxStr = g.box ? `[${g.box.x0},${g.box.y0}]-[${g.box.x1},${g.box.y1}]` : "—";
    const inkStr = g.inkBounds ? `[${g.inkBounds.x0},${g.inkBounds.y0}]-[${g.inkBounds.x1},${g.inkBounds.y1}]` : "لا حبر";
    const fieldsStr = g.fields ? g.fields.join(",") : "—";
    lines.push(
      `${g.charLabel} (U+${g.charCode.toString(16).toUpperCase().padStart(4, "0")}) → حرف ${g.glyphIndex} | صندوق ${boxStr} | تباعد ${g.advance ?? "—"} | حبر ${inkStr} | حقول [${fieldsStr}]` +
      (g.issues.length ? " | " + g.issues.map((i) => `[${i.severity === "error" ? "خطأ" : "تحذير"}] ${i.message}`).join(" ; ") : "")
    );
  }
  return lines.join("\n");
}
