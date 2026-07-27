/**
 * Metroid Prime Remastered FONT audit — mirrors risen2-xgfn-audit.ts's
 * approach (structural checks + pixel-level ink verification + diff against
 * a baseline) applied to what's actually confirmed about this format (see
 * mp-wasm/src/lib.rs docblock): 48-byte glyph records, `flag=0` reliably
 * maps to the first/primary texture page (confirmed by comparing a real
 * community mod against the original — see mp-wasm.ts's MetroidPrimeGlyph
 * docblock), and u0/v0/u1/v1 are normalized against that page's dimensions
 * for flag=0 glyphs. Unlike Risen's xgfn, MP's per-glyph fields (x0/y0/
 * width/height/advance) are already fully understood standard font metrics,
 * so there's no "unresolved field" class of check here — every check is a
 * concrete, actionable structural or pixel-level rule.
 */
import type { MetroidPrimeGlyph } from "./mp-wasm";

export type MpAuditSeverity = "error" | "warning";

export interface MpAuditIssue {
  severity: MpAuditSeverity;
  message: string;
}

export interface MpGlyphAuditRow {
  code: number;
  charLabel: string;
  flag: number;
  glyph: MetroidPrimeGlyph;
  /** Real ink bounding box found inside the declared UV rect (null = no ink,
   *  or pixel data wasn't supplied). Only computed for flag=0 glyphs. */
  inkBounds: { x0: number; y0: number; x1: number; y1: number } | null;
  issues: MpAuditIssue[];
}

export interface MpFontAuditReport {
  fontLabel: string;
  headerIssues: MpAuditIssue[];
  glyphs: MpGlyphAuditRow[];
  primaryPage: { width: number; height: number } | null;
  errorCount: number;
  warningCount: number;
}

/**
 * Guard against records whose numbers can't describe a real glyph.
 *
 * This used to fire on ~126 rows of every font, which turned out not to be
 * corruption at all: the glyph table stores each record's kerning pairs
 * inline right after it, and reading the table as a flat 48-byte array
 * decoded those kerning bytes as extra glyphs. Now that `list_glyphs` walks
 * the table properly (see `FontTable` in mp-wasm/src/lib.rs), both shipped
 * fonts come back with zero implausible records. The check stays as a
 * cheap tripwire — if it ever fires again it means the walk desynced, which
 * is worth surfacing rather than silently rendering nonsense.
 */
export function isPlausibleMpGlyph(g: MetroidPrimeGlyph): boolean {
  if (g.code === 0) return false;
  const vals = [g.x0, g.y0, g.width, g.height, g.advance, g.u0, g.v0, g.u1, g.v1];
  if (vals.some((v) => !Number.isFinite(v))) return false;
  if (g.width < 0 || g.height < 0 || g.advance < 0) return false;
  if (g.width > 2000 || g.height > 2000 || g.advance > 2000) return false;
  // Denormalized near-zero floats (e.g. 6e-39) are corruption, not real
  // pixel measurements — every real non-degenerate value seen in this font
  // is a whole-ish number >= 1.
  const nonZeroButTiny = (v: number) => v !== 0 && Math.abs(v) < 0.5;
  if ([g.width, g.height, g.advance].some(nonZeroButTiny)) return false;
  return true;
}

function charLabelOf(code: number): string {
  if (code >= 0x21 && code <= 0x7e) return String.fromCharCode(code);
  if (code === 0x20) return "مسافة";
  if ((code >= 0x0600 && code <= 0x06ff) || (code >= 0xfb50 && code <= 0xfeff)) {
    return String.fromCharCode(code);
  }
  return "U+" + code.toString(16).toUpperCase().padStart(4, "0");
}

/**
 * Audits a font's glyph list. `primaryPageRgba`/`primaryPageWidth`/
 * `primaryPageHeight`, when given, enable pixel-level ink checks for
 * flag=0 glyphs (decoded RGBA of the primary texture page — alpha or
 * luminance channel used as coverage, matches decodeTextureToPng's output).
 * `original`, when given, diffs every flag=0 glyph against a baseline glyph
 * list (e.g. before this session's edits) and flags anything that changed.
 */
export function auditMpFont(
  glyphs: MetroidPrimeGlyph[],
  options: {
    fontLabel?: string;
    primaryPageRgba?: Uint8ClampedArray;
    primaryPageWidth?: number;
    primaryPageHeight?: number;
    original?: MetroidPrimeGlyph[];
  } = {}
): MpFontAuditReport {
  const headerIssues: MpAuditIssue[] = [];
  const rows: MpGlyphAuditRow[] = [];
  const { primaryPageRgba, primaryPageWidth, primaryPageHeight, original } = options;
  const primaryPage = primaryPageWidth && primaryPageHeight ? { width: primaryPageWidth, height: primaryPageHeight } : null;

  const garbageCount = glyphs.filter((g) => !isPlausibleMpGlyph(g)).length;
  if (garbageCount > 0) {
    headerIssues.push({
      severity: "warning",
      message: `${garbageCount} سجلاً بقيم غير منطقية تم تجاهلها في العرض والفحص — الخطوط الأصلية تعطي صفراً هنا، فظهور رقم يعني أن قراءة جدول الحروف اختلّت (انظر FontTable في mp-wasm/src/lib.rs)`,
    });
  }
  const plausible = glyphs.filter(isPlausibleMpGlyph);

  // --- duplicate (code, flag=0) pairs — scoped to flag=0 (the only page we
  // edit/understand). Duplicates DO exist in other flags (e.g. flag=1 has
  // repeated Japanese kana entries at different table positions) but their
  // page semantics aren't understood, so flagging those would be noise, not
  // a fixable finding. ---
  const seenPairs = new Map<string, number>();
  plausible.forEach((g, i) => {
    if (g.flag !== 0) return;
    const key = `${g.code}:${g.flag}`;
    const prev = seenPairs.get(key);
    if (prev !== undefined) {
      headerIssues.push({ severity: "error", message: `الحرف ${charLabelOf(g.code)} (flag=0) مكرر — مرتين في الجدول` });
    }
    seenPairs.set(key, i);
  });

  // --- diff vs baseline: every flag=0 original glyph must survive
  // byte-identical (field-identical) unless it was deliberately edited. ---
  if (original) {
    const byKey = new Map(plausible.map((g) => [`${g.code}:${g.flag}`, g]));
    for (const og of original.filter(isPlausibleMpGlyph)) {
      if (og.flag !== 0) continue;
      const now = byKey.get(`${og.code}:${og.flag}`);
      if (!now) {
        headerIssues.push({ severity: "warning", message: `الحرف الأصلي ${charLabelOf(og.code)} (flag=0) حُذف` });
        continue;
      }
      const changed =
        now.x0 !== og.x0 || now.y0 !== og.y0 || now.width !== og.width || now.height !== og.height ||
        now.advance !== og.advance || now.u0 !== og.u0 || now.v0 !== og.v0 || now.u1 !== og.u1 || now.v1 !== og.v1;
      if (changed) {
        headerIssues.push({ severity: "error", message: `الحرف الأصلي ${charLabelOf(og.code)} (flag=0) تغيّرت حقوله دون قصد` });
      }
    }
  }

  for (const g of plausible) {
    const issues: MpAuditIssue[] = [];
    let inkBounds: MpGlyphAuditRow["inkBounds"] = null;

    if (g.advance < 0) {
      issues.push({ severity: "error", message: `تباعد سالب (${g.advance})` });
    }
    if (g.width < 0 || g.height < 0) {
      issues.push({ severity: "error", message: `أبعاد سالبة (${g.width}×${g.height})` });
    }

    if (g.flag === 0 && g.width > 0 && g.height > 0 && primaryPage) {
      const x0 = Math.round(g.u0 * primaryPage.width);
      const x1 = Math.round(g.u1 * primaryPage.width);
      const yTop = Math.round(g.v1 * primaryPage.height);
      const yBottom = Math.round(g.v0 * primaryPage.height);
      if (x0 < 0 || yTop < 0 || x1 > primaryPage.width || yBottom > primaryPage.height || x1 <= x0 || yBottom <= yTop) {
        issues.push({ severity: "error", message: `صندوق UV [${x0},${yTop}]-[${x1},${yBottom}] خارج حدود الصفحة الأساسية ${primaryPage.width}×${primaryPage.height}` });
      } else if (primaryPageRgba) {
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        for (let y = yTop; y < yBottom; y++) {
          for (let x = x0; x < x1; x++) {
            const idx = (y * primaryPage.width + x) * 4;
            const coverage = primaryPageRgba[idx + 3] > 10 ? primaryPageRgba[idx + 3] : primaryPageRgba[idx];
            if (coverage > 10) {
              if (x < minX) minX = x;
              if (y < minY) minY = y;
              if (x > maxX) maxX = x;
              if (y > maxY) maxY = y;
            }
          }
        }
        if (minX === Infinity) {
          issues.push({ severity: "warning", message: "لا يوجد أي حبر داخل الصندوق المُعلَن — سيُرسم فارغاً" });
        } else {
          inkBounds = { x0: minX, y0: minY, x1: maxX + 1, y1: maxY + 1 };
        }
      }
    } else if (g.flag === 0 && (g.width <= 0 || g.height <= 0) && g.code !== 0x20 && (g.advance ?? 0) <= 0) {
      issues.push({ severity: "warning", message: "صندوق فارغ وتباعد صفري — الحرف لن يشغل أي مساحة" });
    }

    rows.push({ code: g.code, charLabel: charLabelOf(g.code), flag: g.flag, glyph: g, inkBounds, issues });
  }

  const allIssues = [...headerIssues, ...rows.flatMap((r) => r.issues)];
  return {
    fontLabel: options.fontLabel ?? "",
    headerIssues,
    glyphs: rows,
    primaryPage,
    errorCount: allIssues.filter((i) => i.severity === "error").length,
    warningCount: allIssues.filter((i) => i.severity === "warning").length,
  };
}

/** Plain-text report (Arabic) for download/inspection — only lists glyphs
 *  that have at least one issue, to stay readable for a 6000+ glyph font. */
export function formatMpAuditReportText(report: MpFontAuditReport): string {
  const lines: string[] = [];
  lines.push(`===== تقرير فحص خط Metroid Prime: ${report.fontLabel} =====`);
  lines.push(`الصفحة الأساسية: ${report.primaryPage ? `${report.primaryPage.width}×${report.primaryPage.height}` : "غير معروفة"}`);
  lines.push(`الحروف: ${report.glyphs.length} | أخطاء: ${report.errorCount} | تحذيرات: ${report.warningCount}`);
  lines.push("");
  if (report.headerIssues.length) {
    lines.push("--- مشاكل عامة ---");
    for (const i of report.headerIssues) lines.push(`[${i.severity === "error" ? "خطأ" : "تحذير"}] ${i.message}`);
    lines.push("");
  }
  const problemRows = report.glyphs.filter((r) => r.issues.length > 0);
  lines.push(`--- الحروف ذات المشاكل (${problemRows.length}) ---`);
  for (const r of problemRows) {
    const inkStr = r.inkBounds ? `[${r.inkBounds.x0},${r.inkBounds.y0}]-[${r.inkBounds.x1},${r.inkBounds.y1}]` : "لا حبر/غير محسوب";
    lines.push(
      `${r.charLabel} (U+${r.code.toString(16).toUpperCase().padStart(4, "0")}, flag=${r.flag}) | حبر ${inkStr} | ` +
      r.issues.map((i) => `[${i.severity === "error" ? "خطأ" : "تحذير"}] ${i.message}`).join(" ؛ ")
    );
  }
  return lines.join("\n");
}

/** Machine-readable diagnostic bundle (JSON), for sending to a developer. */
export function buildMpDiagnosticJson(report: MpFontAuditReport, extras: { appVersion: string; context?: string }): string {
  const bundle = {
    schema: "mp-font-diagnostic/1",
    appVersion: extras.appVersion,
    generatedAt: new Date().toISOString(),
    context: extras.context ?? "single-font",
    fontLabel: report.fontLabel,
    primaryPage: report.primaryPage,
    totals: { glyphs: report.glyphs.length, errorCount: report.errorCount, warningCount: report.warningCount },
    headerIssues: report.headerIssues,
    glyphs: report.glyphs
      .filter((r) => r.issues.length > 0)
      .map((r) => ({
        char: r.charLabel,
        code: "U+" + r.code.toString(16).toUpperCase().padStart(4, "0"),
        flag: r.flag,
        glyph: r.glyph,
        ink: r.inkBounds,
        issues: r.issues,
      })),
  };
  return JSON.stringify(bundle, null, 1);
}
