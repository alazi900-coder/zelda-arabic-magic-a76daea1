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

/** "info" states something the tool did on purpose — it is reported so the
 *  translator can see it happened, and deliberately does not count as a
 *  problem. */
export type MpAuditSeverity = "error" | "warning" | "info";

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

const isArabicCode = (c: number) =>
  // U+FEFF sits at the top of the presentation-forms block but is a
  // zero-width no-break space, never drawn — counting it would report a
  // missing glyph for something no font is supposed to have.
  c !== 0xfeff &&
  ((c >= 0x0600 && c <= 0x06ff) || (c >= 0xfb50 && c <= 0xfdff) || (c >= 0xfe70 && c <= 0xfeff));

/**
 * Which Arabic codepoints does the .pak's text actually ask the font to draw,
 * and how often?
 *
 * MSBT stores its strings as UTF-16LE, so scanning every 2-byte unit of the
 * raw asset finds them wherever they live — in any of the 13 bundled locale
 * sub-chunks, without having to parse the container. Stray matches from
 * binary header fields are possible but harmless: this feeds a coverage
 * check, and a handful of noise codepoints cannot mask thousands of real
 * ones.
 */
export function collectArabicTextCodepoints(msbtAssets: Uint8Array[]): Map<number, number> {
  const counts = new Map<number, number>();
  for (const data of msbtAssets) {
    for (let i = 0; i + 1 < data.length; i += 2) {
      const code = data[i] | (data[i + 1] << 8);
      if (isArabicCode(code)) counts.set(code, (counts.get(code) ?? 0) + 1);
    }
  }
  return counts;
}

function severityLabel(s: MpAuditSeverity): string {
  return s === "error" ? "خطأ" : s === "warning" ? "تحذير" : "معلومة";
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
    textCodepoints?: Map<number, number>;
  } = {}
): MpFontAuditReport {
  const headerIssues: MpAuditIssue[] = [];
  const rows: MpGlyphAuditRow[] = [];
  const { primaryPageRgba, primaryPageWidth, primaryPageHeight, original, textCodepoints } = options;
  const primaryPage = primaryPageWidth && primaryPageHeight ? { width: primaryPageWidth, height: primaryPageHeight } : null;

  const garbageCount = glyphs.filter((g) => !isPlausibleMpGlyph(g)).length;
  if (garbageCount > 0) {
    headerIssues.push({
      severity: "warning",
      message: `${garbageCount} سجلاً بقيم غير منطقية تم تجاهلها في العرض والفحص — الخطوط الأصلية تعطي صفراً هنا، فظهور رقم يعني أن قراءة جدول الحروف اختلّت (انظر FontTable في mp-wasm/src/lib.rs)`,
    });
  }
  const plausible = glyphs.filter(isPlausibleMpGlyph);

  // --- does the font actually cover the text that ships in this .pak? ---
  //
  // A font can be structurally perfect and still draw nothing but the
  // fallback dash, because the text asks for codepoints the font has no
  // record for. That is exactly what happened when the text was built before
  // Arabic shaping existed: the strings stayed in base letters (U+0627 ا …)
  // while the font carried presentation forms (U+FE80 …), so 3371 of 3388
  // Arabic characters had no glyph. Comparing the two sets answers in one
  // step what took days to find by inspection.
  if (textCodepoints && textCodepoints.size > 0) {
    const have = new Set(plausible.map((g) => g.code));
    const missing = [...textCodepoints.entries()].filter(([code]) => !have.has(code));
    if (missing.length === 0) {
      headerIssues.push({
        severity: "info",
        message: `النص داخل الحزمة يطلب ${textCodepoints.size} رمزاً عربياً، والخط يغطيها كلها`,
      });
    } else {
      const occurrences = missing.reduce((sum, [, n]) => sum + n, 0);
      const missingBase = missing.filter(([c]) => c <= 0x06ff).length;
      const fontHasForms = [...have].some((c) => c >= 0xfe70 && c <= 0xfeff);
      // Show the ones the text leans on most — a codepoint used 400 times
      // matters more to the translator than one that appears once.
      const sample = [...missing]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 12)
        .map(([c]) => `${charLabelOf(c)} (U+${c.toString(16).toUpperCase().padStart(4, "0")})`)
        .join("، ");
      headerIssues.push({
        severity: "error",
        message:
          `النص داخل الحزمة يطلب ${missing.length} رمزاً عربياً لا يملكها الخط ` +
          `(${occurrences} ظهوراً) — ستُرسم شرطة بديلة مكان كل واحد منها. أمثلة: ${sample}`,
      });
      if (missingBase > missing.length / 2 && fontHasForms) {
        headerIssues.push({
          severity: "error",
          message:
            "معظم الرموز الناقصة أحرف عربية أساسية بينما الخط يحمل أشكال العرض المتّصلة — " +
            "أي أن النصوص بُنيت بإصدار سابق قبل إضافة التشكيل العربي. أعد بناء النصوص بالإصدار الحالي ثم ركّب الخط.",
        });
      }
    }
  }

  // --- duplicate (code, flag=0) pairs — scoped to flag=0 (the only page we
  // edit/understand). Duplicates DO exist in other flags (e.g. flag=1 has
  // repeated Japanese kana entries at different table positions) but their
  // page semantics aren't understood, so flagging those would be noise, not
  // a fixable finding. ---
  // Duplicates that the stock fonts already ship (U+005F appears twice on
  // page 0 of every font checked) are worth stating, but they are not a
  // finding about this edit — reporting them as errors sends the translator
  // hunting for a problem the tool did not create.
  const preExistingCodes = new Set(
    (original ?? []).filter((g) => g.flag === 0).map((g) => g.code)
  );
  const seenPairs = new Map<string, number>();
  plausible.forEach((g, i) => {
    if (g.flag !== 0) return;
    const key = `${g.code}:${g.flag}`;
    const prev = seenPairs.get(key);
    if (prev !== undefined) {
      const stock = original ? preExistingCodes.has(g.code) : false;
      headerIssues.push({
        severity: stock ? "warning" : "error",
        message: stock
          ? `الحرف ${charLabelOf(g.code)} (flag=0) مكرر مرتين — وهذا موجود في الخط الأصلي نفسه، ليس من صنع الأداة`
          : `الحرف ${charLabelOf(g.code)} (flag=0) مكرر — مرتين في الجدول`,
      });
    }
    seenPairs.set(key, i);
  });

  // --- diff vs baseline ---
  //
  // Growing the atlas moves every page-0 glyph in V space on purpose: V is
  // `row / height`, so when the page gets taller each glyph's v0/v1 must be
  // multiplied by old_height/new_height to keep pointing at the same pixels.
  // Reporting that per glyph buried a real report under ~125 identical
  // "changed unintentionally" errors. What actually needs checking is that the
  // rescale is *uniform*: one glyph left behind, or scaled by a different
  // factor, is a genuine defect, and it shows up as a mismatch against the
  // ratio the majority agree on.
  if (original) {
    // Key on the occurrence index too: the stock fonts contain a codepoint
    // twice on page 0, and a plain code→glyph map would collapse the pair and
    // then report the one it dropped as "changed".
    const occurrence = new Map<string, number>();
    const byKey = new Map<string, MetroidPrimeGlyph>();
    for (const g of plausible) {
      const base = `${g.code}:${g.flag}`;
      const n = occurrence.get(base) ?? 0;
      occurrence.set(base, n + 1);
      byKey.set(`${base}:${n}`, g);
    }
    const seenOriginal = new Map<string, number>();
    const ratios: number[] = [];
    const pairs: { og: MetroidPrimeGlyph; now: MetroidPrimeGlyph }[] = [];
    for (const og of original.filter(isPlausibleMpGlyph)) {
      if (og.flag !== 0) continue;
      const base = `${og.code}:${og.flag}`;
      const n = seenOriginal.get(base) ?? 0;
      seenOriginal.set(base, n + 1);
      const now = byKey.get(`${base}:${n}`);
      if (!now) {
        headerIssues.push({ severity: "warning", message: `الحرف الأصلي ${charLabelOf(og.code)} (flag=0) حُذف` });
        continue;
      }
      pairs.push({ og, now });
      if (og.v0 > 0) ratios.push(now.v0 / og.v0);
      if (og.v1 > 0) ratios.push(now.v1 / og.v1);
    }

    // The expected factor is whatever the bulk of the glyphs agree on; taking
    // the median rather than an average keeps a handful of odd records from
    // dragging it off.
    const sorted = [...ratios].sort((a, b) => a - b);
    const vScale = sorted.length ? sorted[Math.floor(sorted.length / 2)] : 1;
    const rescaled = Math.abs(vScale - 1) > 1e-6;
    const near = (a: number, b: number) => Math.abs(a - b) <= Math.max(1e-5, Math.abs(b) * 1e-4);

    let offPattern = 0;
    for (const { og, now } of pairs) {
      const geometryChanged =
        now.x0 !== og.x0 || now.y0 !== og.y0 || now.width !== og.width ||
        now.height !== og.height || now.advance !== og.advance ||
        now.u0 !== og.u0 || now.u1 !== og.u1;
      const vFollowsScale = near(now.v0, og.v0 * vScale) && near(now.v1, og.v1 * vScale);
      if (geometryChanged || !vFollowsScale) {
        offPattern++;
        if (offPattern <= 10) {
          headerIssues.push({
            severity: "error",
            message: `الحرف الأصلي ${charLabelOf(og.code)} (flag=0) تغيّرت حقوله دون قصد`,
          });
        }
      }
    }
    if (offPattern > 10) {
      headerIssues.push({
        severity: "error",
        message: `و${offPattern - 10} حرفاً أصلياً آخر تغيّرت حقوله دون قصد (عُرضت أول 10 فقط)`,
      });
    }
    if (rescaled && offPattern === 0) {
      headerIssues.push({
        severity: "info",
        message: `أُعيد قياس إحداثي V لـ${pairs.length} حرفاً أصلياً بنسبة ${vScale.toFixed(6)} — وهذا مقصود بعد تكبير الأطلس، وجميعها بنفس النسبة بلا استثناء`,
      });
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
    for (const i of report.headerIssues) lines.push(`[${severityLabel(i.severity)}] ${i.message}`);
    lines.push("");
  }
  const problemRows = report.glyphs.filter((r) => r.issues.length > 0);
  lines.push(`--- الحروف ذات المشاكل (${problemRows.length}) ---`);
  for (const r of problemRows) {
    const inkStr = r.inkBounds ? `[${r.inkBounds.x0},${r.inkBounds.y0}]-[${r.inkBounds.x1},${r.inkBounds.y1}]` : "لا حبر/غير محسوب";
    lines.push(
      `${r.charLabel} (U+${r.code.toString(16).toUpperCase().padStart(4, "0")}, flag=${r.flag}) | حبر ${inkStr} | ` +
      r.issues.map((i) => `[${severityLabel(i.severity)}] ${i.message}`).join(" ؛ ")
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
