import { useState, useCallback, useRef, useEffect, useMemo } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ArrowRight, FileArchive, Loader2, CheckCircle2, XCircle, Upload, Package, Download } from "lucide-react";
import { toast } from "sonner";
import { parseXgfn, buildXgfn, type XgfnDocument } from "@/lib/risen2-xgfn";
import { renderArabicGlyphsFromFont, appendArabicGlyphsToXgfn, measureFontCellMetrics, type AlternateFontOverride } from "@/lib/risen2-arabic-font-gen";
import { getPresentationFormsForLetter } from "@/lib/risen/arabic-shaper";
import { FREE_ARABIC_FONTS, fetchFreeFontBytes, type FreeFontEntry } from "@/lib/risen2-free-fonts";
import { auditXgfnDocument, formatAuditReportText, buildDiagnosticJson, type XgfnAuditReport } from "@/lib/risen2-xgfn-audit";
import { updateGlyphFields, deleteCharmapPair, addCharmapAlias, remapCharmapPair } from "@/lib/risen2-xgfn-edit";
import { shapeArabicForRisen } from "@/lib/risen/arabic-shaper";
import { APP_VERSION } from "@/lib/version";
import { decodeDdsToRgba } from "@/lib/risen-ximg";
import {
  parseImagesPakHeader,
  parseImagesPakFileInfoTree,
  inflateFontsPakEntry,
  buildFontsPakArchive,
  buildFontsPatchArchive,
  type RisenPakHeader,
  type RisenPakNode,
  type RisenPakFileEntry,
} from "@/lib/risen2-fontspak";

function downloadBlob(bytes: Uint8Array, filename: string): void {
  const blob = new Blob([bytes as BlobPart], { type: "application/octet-stream" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

const ACCENT = "#4a7c3f";

/** Zoom factor of the text-preview simulator canvas (drawing + hit-testing). */
const PREVIEW_SCALE = 2;

/** Arabic label + effect explanation for each of the 9 measurement-record
 * fields, shown in the field editor and its help panel. */
const FIELD_INFO: { key: string; short: string; desc: string }[] = [
  { key: "x0", short: "يسار", desc: "الحافة اليسرى لصندوق الحرف داخل صورة الأطلس (بالبكسل). إنقاصها يوسّع الاقتطاع يساراً وقد يُدخل بكسلات من حرف مجاور؛ زيادتها تقص يسار الحرف." },
  { key: "y0", short: "أعلى", desc: "الحافة العليا للصندوق. إنقاصها يُدخل صفوفاً فارغة فوق الحرف فيُرسم أنزل؛ زيادتها تقص أعلى الحرف فيُرسم أعلى." },
  { key: "x1", short: "يمين", desc: "الحافة اليمنى للصندوق. يجب أن تبقى أكبر من «يسار» وداخل عرض الأطلس، وإلا يُرفض التعديل تلقائياً." },
  { key: "y1", short: "أسفل", desc: "الحافة السفلى للصندوق. يجب أن تبقى أكبر من «أعلى» وداخل ارتفاع الأطلس، وإلا يُرفض التعديل تلقائياً." },
  { key: "adv", short: "تباعد", desc: "عدد البكسلات التي يتقدمها المؤشر بعد رسم هذا الحرف: زيادته توسّع الفراغ بعده، وإنقاصه يجعل الحرف التالي أقرب (القيمة السالبة مرفوضة)." },
  { key: "f5", short: "؟6", desc: "وظيفته غير مؤكدة. كل الحروف المضافة في المود الصيني العامل تتركه صفراً — لا تغيّره إلا للتجربة." },
  { key: "f6", short: "؟7", desc: "وظيفته غير مؤكدة. كل الحروف المضافة في المود الصيني العامل تتركه صفراً — لا تغيّره إلا للتجربة." },
  { key: "f7", short: "؟8", desc: "وظيفته غير مؤكدة. كل الحروف المضافة في المود الصيني العامل تتركه صفراً — لا تغيّره إلا للتجربة." },
  { key: "f8", short: "؟9", desc: "وظيفته غير مؤكدة. كل الحروف المضافة في المود الصيني العامل تتركه صفراً — لا تغيّره إلا للتجربة." },
];

interface RoundTripResult {
  ok: boolean;
  message: string;
}

interface PakEntryRef {
  path: string;
  node: RisenPakFileEntry;
}

/** The 35-file list a real Chinese mod successfully modified — every Trajan
 * Pro + every Georgia entry (confirmed by counting: 21 + 14 = 35 exactly). */
function isTargetFont(path: string): boolean {
  return path.startsWith("Trajan Pro_") || path.startsWith("Georgia_");
}

/** Most common (mode) row height across existing measurement records — used
 * as the target draw size when rendering new Arabic glyphs, so they're
 * visually comparable in scale to the font's existing Latin glyphs. */
function computeRowHeightPx(doc: XgfnDocument): number {
  const counts = new Map<number, number>();
  for (const m of doc.measurements) {
    if (m.fields.length < 4) continue;
    const h = m.fields[3] - m.fields[1];
    if (h <= 0) continue;
    counts.set(h, (counts.get(h) ?? 0) + 1);
  }
  let best = 20;
  let bestCount = 0;
  for (const [h, count] of counts) {
    if (count > bestCount) { best = h; bestCount = count; }
  }
  return best;
}

/** Parses a character reference typed by the user: a single character
 * ("ب"), a hex codepoint ("FE8E" / "0xFE8E" / "U+FE8E"), or decimal. */
function parseCharInput(input: string): number | null {
  const s = input.trim();
  if (!s) return null;
  if ([...s].length === 1) return s.codePointAt(0)!;
  const hex = s.replace(/^(U\+|0x)/i, "");
  if (/^[0-9a-fA-F]{1,6}$/.test(hex)) return parseInt(hex, 16);
  return null;
}

function walkFileEntries(tree: RisenPakNode[], prefix = ""): PakEntryRef[] {
  const out: PakEntryRef[] = [];
  for (const n of tree) {
    const path = prefix ? `${prefix}/${n.name}` : n.name;
    if (n.type === "folder") out.push(...walkFileEntries(n.children, path));
    else out.push({ path, node: n });
  }
  return out;
}

const RisenFonts = () => {
  const [busy, setBusy] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const [originalBytes, setOriginalBytes] = useState<Uint8Array | null>(null);
  const [doc, setDoc] = useState<XgfnDocument | null>(null);
  const [fontLabel, setFontLabel] = useState<string>("");
  const [showGrid, setShowGrid] = useState(true);
  const [roundTrip, setRoundTrip] = useState<RoundTripResult | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // fonts.pak container state — lets the user pick any real font directly
  // from the archive instead of needing to extract/decompress one manually first.
  const [pakBusy, setPakBusy] = useState(false);
  const [pakDragOver, setPakDragOver] = useState(false);
  const [pakName, setPakName] = useState<string | null>(null);
  const [pakBytes, setPakBytes] = useState<Uint8Array | null>(null);
  const [pakHeader, setPakHeader] = useState<RisenPakHeader | null>(null);
  const [pakTree, setPakTree] = useState<RisenPakNode[] | null>(null);
  const [pakEntries, setPakEntries] = useState<PakEntryRef[]>([]);
  const [selectedPath, setSelectedPath] = useState<string | null>(null);

  // Arabic glyph generator (Phase 3) — merges rendered Arabic glyphs into
  // the currently-displayed font for visual inspection, and (once merged)
  // allows injecting the result back into the source fonts.pak for a real
  // in-game test.
  const [arabicFontBytes, setArabicFontBytes] = useState<ArrayBuffer | null>(null);
  const [arabicFontName, setArabicFontName] = useState<string | null>(null);
  // Alternate font: selected base letters are rendered from this TTF instead
  // of the primary one (all their contextual forms at once), fixing letters
  // the primary font draws badly (e.g. medial ع designed like an initial).
  const [altFontBytes, setAltFontBytes] = useState<ArrayBuffer | null>(null);
  const [altFontName, setAltFontName] = useState<string | null>(null);
  const [altLetters, setAltLetters] = useState("");
  const [arabicBusy, setArabicBusy] = useState(false);

  // Free-font library: per-font load status; bytes cached so a font is
  // fetched from the CDN at most once per session.
  const [freeFontStatus, setFreeFontStatus] = useState<Record<string, "loading" | "ready" | "error">>({});
  const freeFontBytesRef = useRef<Map<string, ArrayBuffer>>(new Map());
  const [showFontLibrary, setShowFontLibrary] = useState(false);
  const [arabicMerged, setArabicMerged] = useState(false);
  const [injectBusy, setInjectBusy] = useState(false);

  // Batch mode — generates + merges Arabic glyphs into all 35 target fonts
  // at once and injects them into a single fonts.pak (matches the real
  // Chinese mod's scope, confirmed via the fonts.p00 comparison: it modified
  // exactly this same 35-file set, not a single font).
  const [batchBusy, setBatchBusy] = useState(false);
  const [batchProgress, setBatchProgress] = useState<string>("");
  const [batchSummary, setBatchSummary] = useState<{ errors: number; warnings: number; report: string; reportJson: string } | null>(null);

  // Inspection / manual-edit state.
  const [auditReport, setAuditReport] = useState<XgfnAuditReport | null>(null);
  const [auditBusy, setAuditBusy] = useState(false);
  const [selectedPairIdx, setSelectedPairIdx] = useState<number | null>(null);
  const [editFieldValues, setEditFieldValues] = useState<string[]>([]);
  const [aliasCharInput, setAliasCharInput] = useState("");
  const [aliasGlyphInput, setAliasGlyphInput] = useState("");
  const [remapGlyphInput, setRemapGlyphInput] = useState("");
  /** Inline result of the last edit action — replaces the floating toasts
   * that used to cover the apply button and block further clicks. */
  const [editStatus, setEditStatus] = useState<{ ok: boolean; message: string } | null>(null);
  const [showFieldHelp, setShowFieldHelp] = useState(false);
  /** Scroll container of the glyph table — used to bring the selected row
   * into view when a glyph is picked from the atlas or the preview. */
  const tableWrapRef = useRef<HTMLDivElement>(null);
  /** The doc as first loaded (pre-merge/pre-edit) — comparison baseline for audits. */
  const baseDocRef = useRef<XgfnDocument | null>(null);

  // Text preview simulator — renders a sentence EXACTLY the way the game
  // engine does: shape via shapeArabicForRisen, then draw each codepoint's
  // atlas region left-to-right advancing by fields[4]. If it looks right
  // here but wrong in-game the problem is engine-side; if it's wrong here
  // the font data itself is wrong.
  const previewCanvasRef = useRef<HTMLCanvasElement>(null);
  const [previewText, setPreviewText] = useState("مرحبا بكم في Risen 2");
  const [previewMissing, setPreviewMissing] = useState<string[]>([]);
  /** Horizontal hit region of every glyph drawn in the preview (unscaled
   * canvas units) → its charmap pair index, for click-to-select. */
  const previewHitsRef = useRef<{ x0: number; x1: number; pairIdx: number }[]>([]);

  const decodeFontName = useCallback((headerPrefix: Uint8Array): string => {
    const nameBytes = headerPrefix.subarray(0x96, 0x96 + 64);
    return new TextDecoder("utf-16le").decode(nameBytes).replace(/\0+$/, "");
  }, []);

  /** Parses already-decompressed .xgfn bytes and updates the shared preview state
   * (used both for a direct .xgfn upload and for a font selected from fonts.pak). */
  const loadXgfnBytes = useCallback((buffer: ArrayBuffer, label: string) => {
    const parsed = parseXgfn(buffer);
    setOriginalBytes(new Uint8Array(buffer));
    setDoc(parsed);
    baseDocRef.current = parseXgfn(buffer); // independent copy as audit baseline
    setFileName(label);
    setFontLabel(decodeFontName(parsed.headerPrefix));
    setRoundTrip(null);
    setArabicMerged(false);
    setAuditReport(null);
    setSelectedPairIdx(null);
    setEditStatus(null);
    toast.success(`تم تحليل الملف: ${parsed.charmap.length} زوجاً / ${parsed.recordCount} سجلاً`);
  }, [decodeFontName]);

  const handleFile = useCallback(async (file: File) => {
    setBusy(true);
    try {
      const buffer = await file.arrayBuffer();
      loadXgfnBytes(buffer, file.name);
    } catch (err) {
      console.error(err);
      toast.error("فشل تحليل الملف: " + (err as Error).message);
      setDoc(null);
      setOriginalBytes(null);
    } finally {
      setBusy(false);
    }
  }, [loadXgfnBytes]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (busy) return;
    const f = e.dataTransfer.files?.[0];
    if (f) void handleFile(f);
  }, [busy, handleFile]);

  const handlePakFile = useCallback(async (file: File) => {
    setPakBusy(true);
    try {
      const buffer = await file.arrayBuffer();
      const bytes = new Uint8Array(buffer);
      const header = parseImagesPakHeader(bytes.slice(0, 48));
      const { tree, endOffset } = parseImagesPakFileInfoTree(bytes.subarray(header.fileInfoOffset), header);
      if (endOffset !== bytes.length) {
        throw new Error("نهاية شجرة الملفات لا تطابق نهاية الملف — الملف قد يكون غير مكتمل أو غير مدعوم");
      }
      const entries = walkFileEntries(tree).filter((e) => e.path.endsWith("._xgfn"));
      setPakBytes(bytes);
      setPakHeader(header);
      setPakTree(tree);
      setPakEntries(entries);
      setPakName(file.name);
      setSelectedPath(null);
      toast.success(`تم فتح الحاوية: ${entries.length} خطاً`);
    } catch (err) {
      console.error(err);
      toast.error("فشل فتح fonts.pak: " + (err as Error).message);
      setPakBytes(null);
      setPakTree(null);
      setPakEntries([]);
    } finally {
      setPakBusy(false);
    }
  }, []);

  const handlePakDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setPakDragOver(false);
    if (pakBusy) return;
    const f = e.dataTransfer.files?.[0];
    if (f) void handlePakFile(f);
  }, [pakBusy, handlePakFile]);

  const handleSelectPakEntry = useCallback((entry: PakEntryRef) => {
    if (!pakBytes) return;
    try {
      const decompressed = inflateFontsPakEntry(pakBytes, entry.node);
      const buf = decompressed.buffer.slice(decompressed.byteOffset, decompressed.byteOffset + decompressed.byteLength) as ArrayBuffer;
      loadXgfnBytes(buf, entry.path);
      setSelectedPath(entry.path);
    } catch (err) {
      console.error(err);
      toast.error(`فشل استخراج "${entry.path}": ` + (err as Error).message);
    }
  }, [pakBytes, loadXgfnBytes]);

  const handleArabicFontFile = useCallback(async (file: File) => {
    const buffer = await file.arrayBuffer();
    setArabicFontBytes(buffer);
    setArabicFontName(file.name);
  }, []);

  const handleAltFontFile = useCallback(async (file: File) => {
    const buffer = await file.arrayBuffer();
    setAltFontBytes(buffer);
    setAltFontName(file.name);
  }, []);

  /** Loads a library font once (CDN fetch + FontFace registration for the
   * live style preview). Returns the cached bytes on later calls. */
  const loadFreeFont = useCallback(async (entry: FreeFontEntry): Promise<ArrayBuffer | null> => {
    const cached = freeFontBytesRef.current.get(entry.id);
    if (cached) return cached;
    setFreeFontStatus((s) => ({ ...s, [entry.id]: "loading" }));
    try {
      const bytes = await fetchFreeFontBytes(entry);
      const face = new FontFace(`FreeFont_${entry.id}`, bytes.slice(0));
      await face.load();
      document.fonts.add(face);
      freeFontBytesRef.current.set(entry.id, bytes);
      setFreeFontStatus((s) => ({ ...s, [entry.id]: "ready" }));
      return bytes;
    } catch (err) {
      console.error(err);
      setFreeFontStatus((s) => ({ ...s, [entry.id]: "error" }));
      toast.error((err as Error).message);
      return null;
    }
  }, []);

  const useFreeFontAs = useCallback(async (entry: FreeFontEntry, role: "main" | "alt") => {
    const bytes = await loadFreeFont(entry);
    if (!bytes) return;
    if (role === "main") {
      setArabicFontBytes(bytes);
      setArabicFontName(entry.name);
    } else {
      setAltFontBytes(bytes);
      setAltFontName(entry.name);
    }
    toast.success(role === "main" ? `صار ${entry.name} الخط الأساسي` : `صار ${entry.name} الخط البديل — اكتب الحروف المطلوبة منه`);
  }, [loadFreeFont]);

  /** Expands the typed base letters (e.g. "ع غ") into ALL their contextual
   * presentation-form codepoints — replacing a letter must replace every
   * form it takes, or styles would mix mid-word. */
  const altCodepoints = useMemo(() => {
    const set = new Set<number>();
    for (const ch of altLetters.replace(/\s+/g, "")) {
      for (const cp of getPresentationFormsForLetter(ch.codePointAt(0)!)) set.add(cp);
    }
    return set;
  }, [altLetters]);

  const altOverride: AlternateFontOverride | undefined = useMemo(
    () => (altFontBytes && altCodepoints.size > 0 ? { fontBytes: altFontBytes, codepoints: altCodepoints } : undefined),
    [altFontBytes, altCodepoints]
  );

  const handleGenerateArabic = useCallback(async () => {
    if (!doc || !arabicFontBytes) return;
    setArabicBusy(true);
    try {
      const glyphs = await renderArabicGlyphsFromFont(arabicFontBytes, measureFontCellMetrics(doc), altOverride);
      const merged = appendArabicGlyphsToXgfn(doc, glyphs);
      setDoc(merged);
      setOriginalBytes(null); // merged doc no longer corresponds to any single original byte stream
      setRoundTrip(null);
      setArabicMerged(true);
      toast.success(`تم توليد ${glyphs.length} حرفاً عربياً ودمجها للمعاينة`);
    } catch (err) {
      console.error(err);
      toast.error("فشل توليد الحروف العربية: " + (err as Error).message);
    } finally {
      setArabicBusy(false);
    }
  }, [doc, arabicFontBytes, altOverride]);

  const handleInjectAndDownload = useCallback(() => {
    if (!doc || !pakBytes || !pakHeader || !pakTree || !selectedPath) return;
    setInjectBusy(true);
    try {
      const newXgfnBytes = new Uint8Array(buildXgfn(doc));
      const result = buildFontsPakArchive(pakBytes, pakHeader, pakTree, new Map([[selectedPath, newXgfnBytes]]));
      const outName = (pakName ?? "fonts.pak").replace(/\.pak$/i, "") + "_ar_test.pak";
      downloadBlob(result.bytes, outName);
      toast.success(`تم حقن الخط وتنزيل "${outName}" (${result.bytes.length.toLocaleString()} بايت)`);
    } catch (err) {
      console.error(err);
      toast.error("فشل حقن الخط في fonts.pak: " + (err as Error).message);
    } finally {
      setInjectBusy(false);
    }
  }, [doc, pakBytes, pakHeader, pakTree, selectedPath, pakName]);

  const handleGenerateBatch = useCallback(async () => {
    if (!pakBytes || !pakHeader || !pakTree || !arabicFontBytes) return;
    setBatchBusy(true);
    setBatchProgress("");
    setBatchSummary(null);
    try {
      const targets = pakEntries.filter((e) => isTargetFont(e.path));
      const replacements = new Map<string, Uint8Array>();
      const originalDocs = new Map<string, XgfnDocument>();
      const reportLines: string[] = [];
      reportLines.push(`===== تقرير بناء وحقن fonts.p00 — ${new Date().toISOString()} =====`, "");

      for (let i = 0; i < targets.length; i++) {
        const { path, node } = targets[i];
        setBatchProgress(`توليد (${i + 1}/${targets.length}) ${path}`);
        const decompressed = inflateFontsPakEntry(pakBytes, node);
        const buf = decompressed.buffer.slice(decompressed.byteOffset, decompressed.byteOffset + decompressed.byteLength) as ArrayBuffer;
        const fontDoc = parseXgfn(buf);
        originalDocs.set(path, parseXgfn(buf));
        const glyphs = await renderArabicGlyphsFromFont(arabicFontBytes, measureFontCellMetrics(fontDoc), altOverride);
        const merged = appendArabicGlyphsToXgfn(fontDoc, glyphs);
        replacements.set(path, new Uint8Array(buildXgfn(merged)));

        const oldDims = decodeDdsToRgba(fontDoc.ddsBytes);
        const newDims = decodeDdsToRgba(merged.ddsBytes);
        reportLines.push(
          `--- ${path} ---`,
          `الأزواج: ${fontDoc.charmap.length} → ${merged.charmap.length} (+${merged.charmap.length - fontDoc.charmap.length})`,
          `السجلات: ${fontDoc.recordCount} → ${merged.recordCount}`,
          `الأطلس: ${oldDims.supported ? `${oldDims.width}×${oldDims.height}` : "؟"} → ${newDims.supported ? `${newDims.width}×${newDims.height}` : "؟"}`,
        );
      }

      // Standalone fonts.p00-style patch archive (matches the real Chinese
      // mod's structure); the base fonts.pak stays completely untouched.
      setBatchProgress("بناء fonts.p00...");
      const result = buildFontsPatchArchive(pakBytes, pakHeader, pakTree, replacements);

      // ── Post-injection deep audit: re-open OUR OWN OUTPUT from its raw
      // bytes and run the full audit (structure + per-glyph pixel checks +
      // compare-against-original) on every font actually inside it. This is
      // the direct answer to "does the injection itself introduce even a
      // small problem": we verify what the game will actually read. ──
      let totalErrors = 0;
      let totalWarnings = 0;
      const diagBundles: string[] = [];
      reportLines.push("", "===== فحص ما بعد الحقن (قراءة fonts.p00 الناتج نفسه) =====");
      const outHeader = parseImagesPakHeader(result.bytes.slice(0, 48));
      const { tree: outTree } = parseImagesPakFileInfoTree(result.bytes.subarray(outHeader.fileInfoOffset), outHeader);
      const outEntries = walkFileEntries(outTree);
      for (let i = 0; i < outEntries.length; i++) {
        const { path, node } = outEntries[i];
        setBatchProgress(`فحص ما بعد الحقن (${i + 1}/${outEntries.length}) ${path}`);
        // Yield to the event loop so progress paints during the heavy scans.
        await new Promise((r) => setTimeout(r, 0));
        const content = inflateFontsPakEntry(result.bytes, node);
        const parsed = parseXgfn(content.buffer.slice(content.byteOffset, content.byteOffset + content.byteLength) as ArrayBuffer);
        const audit = auditXgfnDocument(parsed, { fontLabel: path, original: originalDocs.get(path) });
        totalErrors += audit.errorCount;
        totalWarnings += audit.warningCount;
        diagBundles.push(buildDiagnosticJson(audit, parsed, { appVersion: APP_VERSION, context: "post-injection" }));
        if (audit.errorCount > 0 || audit.warningCount > 0) {
          reportLines.push("", formatAuditReportText(audit));
        } else {
          reportLines.push(`${path}: سليم ✅ (${audit.glyphs.length} حرفاً، أطلس ${audit.atlas?.width}×${audit.atlas?.height})`);
        }
      }
      reportLines.push("", `===== الخلاصة: ${totalErrors} خطأ، ${totalWarnings} تحذير عبر ${outEntries.length} خطاً =====`);
      const reportText = reportLines.join("\n");
      setBatchSummary({ errors: totalErrors, warnings: totalWarnings, report: reportText, reportJson: "[\n" + diagBundles.join(",\n") + "\n]" });

      downloadBlob(result.bytes, "fonts.p00");
      if (totalErrors > 0) {
        toast.error(`اكتمل البناء لكن الفحص وجد ${totalErrors} خطأً — راجع التقرير قبل الاستخدام`);
      } else {
        toast.success(`تم بناء fonts.p00 (${result.bytes.length.toLocaleString()} بايت) وفحص كل الـ${outEntries.length} خطاً بعد الحقن: ${totalErrors} خطأ، ${totalWarnings} تحذير`);
      }
    } catch (err) {
      console.error(err);
      toast.error("فشلت الدفعة: " + (err as Error).message);
    } finally {
      setBatchBusy(false);
      setBatchProgress("");
    }
  }, [pakBytes, pakHeader, pakTree, arabicFontBytes, pakEntries, altOverride]);

  const handleRoundTripTest = useCallback(() => {
    if (!doc || !originalBytes) return;
    try {
      const rebuilt = new Uint8Array(buildXgfn(doc));
      if (rebuilt.length !== originalBytes.length) {
        setRoundTrip({ ok: false, message: `اختلاف بالحجم: أصلي ${originalBytes.length} بايت، مُعاد بناؤه ${rebuilt.length} بايت` });
        return;
      }
      let match = true;
      for (let i = 0; i < rebuilt.length; i++) {
        if (rebuilt[i] !== originalBytes[i]) { match = false; break; }
      }
      setRoundTrip(match
        ? { ok: true, message: "مطابقة كاملة بايت-بايت ✅" }
        : { ok: false, message: "اختلاف في المحتوى رغم تطابق الحجم — تحقق من منطق البناء" });
    } catch (err) {
      setRoundTrip({ ok: false, message: "خطأ أثناء إعادة البناء: " + (err as Error).message });
    }
  }, [doc, originalBytes]);

  // ─── Inspection / manual edit ──────────────────────────────────────────

  const handleRunAudit = useCallback(() => {
    if (!doc) return;
    setAuditBusy(true);
    // setTimeout so the busy state paints before the (CPU-heavy) pixel scan.
    setTimeout(() => {
      try {
        const report = auditXgfnDocument(doc, {
          fontLabel: fileName ?? "",
          original: arabicMerged ? baseDocRef.current ?? undefined : undefined,
        });
        setAuditReport(report);
        if (report.errorCount === 0 && report.warningCount === 0) {
          toast.success("الفحص الشامل: لا أخطاء ولا تحذيرات ✅");
        } else {
          toast[report.errorCount > 0 ? "error" : "warning"](`الفحص: ${report.errorCount} خطأ، ${report.warningCount} تحذير`);
        }
      } catch (err) {
        toast.error("فشل الفحص: " + (err as Error).message);
      } finally {
        setAuditBusy(false);
      }
    }, 30);
  }, [doc, fileName, arabicMerged]);

  const handleDownloadAuditReport = useCallback(() => {
    if (!auditReport) return;
    const text = formatAuditReportText(auditReport);
    downloadBlob(new TextEncoder().encode(text), `font-audit-${(fileName ?? "font").replace(/[^\w.-]+/g, "_")}.txt`);
  }, [auditReport, fileName]);

  const handleDownloadDiagnosticJson = useCallback(() => {
    if (!auditReport || !doc) return;
    const json = buildDiagnosticJson(auditReport, doc, { appVersion: APP_VERSION, context: "single-font" });
    downloadBlob(new TextEncoder().encode(json), `font-diagnostic-${(fileName ?? "font").replace(/[^\w.-]+/g, "_")}.json`);
  }, [auditReport, doc, fileName]);

  const selectPair = useCallback((idx: number | null) => {
    setSelectedPairIdx(idx);
    setEditStatus(null);
    if (idx !== null && doc) {
      const pair = doc.charmap[idx];
      const rec = pair.glyphIndex < doc.measurements.length ? doc.measurements[pair.glyphIndex] : null;
      setEditFieldValues(rec ? rec.fields.map((v) => String(v)) : []);
      setRemapGlyphInput(String(pair.glyphIndex));
      // Bring the row into view when the pick came from the atlas/preview.
      requestAnimationFrame(() => {
        tableWrapRef.current?.querySelector(`tr[data-idx="${idx}"]`)?.scrollIntoView({ block: "nearest" });
      });
    }
  }, [doc]);

  /** Applies an edit result (already safety-verified by the edit module).
   * Outcome is reported inline next to the buttons (NOT as a floating toast
   * — toasts used to cover the apply button and block repeated clicks). */
  const applyEdit = useCallback((fn: () => { doc: XgfnDocument }) => {
    try {
      const { doc: next } = fn();
      setDoc(next);
      setAuditReport(null);
      setRoundTrip(null);
      setOriginalBytes(null); // manually edited — no longer matches any original stream
      setArabicMerged(true); // enables inject/download buttons
      setEditStatus({ ok: true, message: "طُبّق التعديل بعد اجتياز الفحص الكامل ✅" });
      return true;
    } catch (err) {
      setEditStatus({ ok: false, message: (err as Error).message });
      return false;
    }
  }, []);

  const handleApplyFieldEdit = useCallback(() => {
    if (!doc || selectedPairIdx === null) return;
    const pair = doc.charmap[selectedPairIdx];
    const fields = editFieldValues.map((v) => parseInt(v, 10));
    if (fields.length !== 9 || fields.some((v) => !Number.isFinite(v))) {
      setEditStatus({ ok: false, message: "القيم يجب أن تكون 9 أعداد صحيحة" });
      return;
    }
    applyEdit(() => updateGlyphFields(doc, pair.glyphIndex, fields));
  }, [doc, selectedPairIdx, editFieldValues, applyEdit]);

  /** Arrow-nudge: moves where the selected glyph is DRAWN by one pixel. The
   * sampled atlas box must shift the OPPOSITE way to achieve that visually
   * (sampling one row lower draws the ink one pixel higher, etc.). Updates
   * the editor inputs only — the live preview reflects it immediately, and
   * nothing is written until "تطبيق تعديل الحقول" passes the safety gate. */
  const nudgeSelected = useCallback((dx: number, dy: number) => {
    setEditFieldValues((prev) => {
      if (prev.length !== 9) return prev;
      const f = prev.map((v) => parseInt(v, 10));
      if (f.slice(0, 4).some((v) => !Number.isFinite(v))) return prev;
      return prev.map((v, i) => {
        if (i === 0 || i === 2) return String(f[i] - dx);
        if (i === 1 || i === 3) return String(f[i] - dy);
        return v;
      });
    });
  }, []);

  const handleDeletePair = useCallback(() => {
    if (!doc || selectedPairIdx === null) return;
    const pair = doc.charmap[selectedPairIdx];
    if (applyEdit(() => deleteCharmapPair(doc, pair.charCode))) {
      setSelectedPairIdx(null);
    }
  }, [doc, selectedPairIdx, applyEdit]);

  const handleRemapPair = useCallback(() => {
    if (!doc || selectedPairIdx === null) return;
    const pair = doc.charmap[selectedPairIdx];
    const gi = parseInt(remapGlyphInput, 10);
    if (!Number.isFinite(gi)) { setEditStatus({ ok: false, message: "مؤشر غير صالح" }); return; }
    applyEdit(() => remapCharmapPair(doc, pair.charCode, gi));
  }, [doc, selectedPairIdx, remapGlyphInput, applyEdit]);

  const handleAddAlias = useCallback(() => {
    if (!doc) return;
    const code = parseCharInput(aliasCharInput);
    if (code === null) { setEditStatus({ ok: false, message: "أدخل حرفاً واحداً أو رمزاً ست عشرياً مثل FE8E" }); return; }
    const gi = parseInt(aliasGlyphInput, 10);
    if (!Number.isFinite(gi)) { setEditStatus({ ok: false, message: "مؤشر الحرف الهدف غير صالح" }); return; }
    if (applyEdit(() => addCharmapAlias(doc, code, gi))) {
      setAliasCharInput("");
      setAliasGlyphInput("");
    }
  }, [doc, aliasCharInput, aliasGlyphInput, applyEdit]);

  /** Click on the atlas selects the glyph whose box contains the point. */
  const handleCanvasClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!doc || !canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const x = Math.floor((e.clientX - rect.left) * (canvasRef.current.width / rect.width));
    const y = Math.floor((e.clientY - rect.top) * (canvasRef.current.height / rect.height));
    for (let i = 0; i < doc.charmap.length; i++) {
      const gi = doc.charmap[i].glyphIndex;
      if (gi >= doc.measurements.length) continue;
      const [x0, y0, x1, y1] = doc.measurements[gi].fields;
      if (x1 > x0 && y1 > y0 && x >= x0 && x < x1 && y >= y0 && y < y1) {
        selectPair(i);
        return;
      }
    }
    selectPair(null);
  }, [doc, selectPair]);

  // Render the text-preview simulation whenever the doc or the sample text changes.
  useEffect(() => {
    if (!doc || !previewCanvasRef.current) return;
    const decoded = decodeDdsToRgba(doc.ddsBytes);
    if (!decoded.supported) return;

    const atlas = document.createElement("canvas");
    atlas.width = decoded.width;
    atlas.height = decoded.height;
    atlas.getContext("2d")!.putImageData(new ImageData(new Uint8ClampedArray(decoded.rgba), decoded.width, decoded.height), 0, 0);

    const shaped = shapeArabicForRisen(previewText);
    const byChar = new Map(doc.charmap.map((p) => [p.charCode, p.glyphIndex]));
    const pairIdxByChar = new Map<number, number>();
    doc.charmap.forEach((p, i) => { if (!pairIdxByChar.has(p.charCode)) pairIdxByChar.set(p.charCode, i); });
    const rowH = Math.max(10, computeRowHeightPx(doc));

    // Unapplied field-editor values override the selected glyph's record, so
    // arrow-nudges and typed edits show their visual effect BEFORE being
    // applied through the safety gate.
    let pendingGi: number | null = null;
    let pendingFields: number[] | null = null;
    if (selectedPairIdx !== null && doc.charmap[selectedPairIdx] && editFieldValues.length === 9) {
      const parsed = editFieldValues.map((v) => parseInt(v, 10));
      if (!parsed.some((v) => !Number.isFinite(v))) {
        pendingGi = doc.charmap[selectedPairIdx].glyphIndex;
        pendingFields = parsed;
      }
    }
    const fieldsOf = (gi: number): number[] =>
      gi === pendingGi && pendingFields ? pendingFields : doc.measurements[gi].fields;

    // First pass: total width + missing chars.
    const missing: string[] = [];
    let totalW = 8;
    for (const ch of [...shaped]) {
      const gi = byChar.get(ch.charCodeAt(0));
      if (gi === undefined || gi >= doc.measurements.length) {
        missing.push(ch);
        totalW += Math.ceil(rowH * 0.6) + 2;
      } else {
        totalW += Math.max(1, fieldsOf(gi)[4]) + 1;
      }
    }

    const canvas = previewCanvasRef.current;
    canvas.width = Math.max(60, totalW + 8) * PREVIEW_SCALE;
    canvas.height = (rowH + 12) * PREVIEW_SCALE;
    const ctx = canvas.getContext("2d")!;
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = "#12241a";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.scale(PREVIEW_SCALE, PREVIEW_SCALE);

    let x = 6;
    const hits: { x0: number; x1: number; pairIdx: number }[] = [];
    for (const ch of [...shaped]) {
      const code = ch.charCodeAt(0);
      const gi = byChar.get(code);
      if (gi === undefined || gi >= doc.measurements.length) {
        // missing char — draw a red notdef-style box, like the engine's fallback
        ctx.strokeStyle = "rgba(255,60,60,0.9)";
        ctx.strokeRect(x + 0.5, 4.5, Math.ceil(rowH * 0.6), rowH);
        x += Math.ceil(rowH * 0.6) + 2;
        continue;
      }
      const [x0, y0, x1, y1, adv] = fieldsOf(gi);
      if (x1 > x0 && y1 > y0) {
        ctx.drawImage(atlas, x0, y0, x1 - x0, y1 - y0, x, 4, x1 - x0, y1 - y0);
      }
      const w = Math.max(1, adv) + 1;
      const pi = pairIdxByChar.get(code);
      if (pi !== undefined) hits.push({ x0: x, x1: x + Math.max(w, x1 - x0), pairIdx: pi });
      x += w;
    }
    previewHitsRef.current = hits;
    setPreviewMissing([...new Set(missing)]);
  }, [doc, previewText, selectedPairIdx, editFieldValues]);

  /** Click a glyph in the preview → select its charmap pair directly. */
  const handlePreviewClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = previewCanvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = ((e.clientX - rect.left) * (canvas.width / rect.width)) / PREVIEW_SCALE;
    const hit = previewHitsRef.current.find((h) => x >= h.x0 && x < h.x1);
    if (hit) selectPair(hit.pairIdx);
  }, [selectPair]);

  // Render the DDS atlas + diagnostic grid overlay whenever the doc or grid toggle changes.
  useEffect(() => {
    if (!doc || !canvasRef.current) return;
    const decoded = decodeDdsToRgba(doc.ddsBytes);
    if (!decoded.supported) {
      toast.error("صيغة DDS غير مدعومة للمعاينة");
      return;
    }
    const canvas = canvasRef.current;
    canvas.width = decoded.width;
    canvas.height = decoded.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const imageData = new ImageData(new Uint8ClampedArray(decoded.rgba), decoded.width, decoded.height);
    ctx.putImageData(imageData, 0, 0);

    if (showGrid) {
      ctx.save();
      // Per-glyph atlas bounding box: fields[0..3] = [x0, y0, x1, y1] —
      // confirmed by checking real ink pixel bounds against these fields on
      // the Georgia sample (276 glyphs): the actual non-transparent pixels
      // always sit comfortably inside this rectangle, for both single-row
      // (numbers) and multi-row (full-alphabet) atlases alike.
      ctx.strokeStyle = "rgba(255, 0, 128, 0.85)";
      ctx.lineWidth = 1;
      for (const m of doc.measurements) {
        const [x0, y0, x1, y1] = m.fields;
        if (x0 === undefined || x1 === undefined || y1 === undefined) continue;
        if (x1 <= x0 || y1 <= y0) continue; // skip zero-size cells (e.g. space)
        ctx.strokeRect(x0 + 0.5, y0 + 0.5, x1 - x0, y1 - y0);
      }
      ctx.restore();
    }

    // Selected-glyph highlight (drawn regardless of the grid toggle) — uses
    // the UNAPPLIED editor values when valid, so arrow-nudges move the box.
    if (selectedPairIdx !== null && doc.charmap[selectedPairIdx]) {
      const gi = doc.charmap[selectedPairIdx].glyphIndex;
      if (gi < doc.measurements.length) {
        let [x0, y0, x1, y1] = doc.measurements[gi].fields;
        if (editFieldValues.length === 9) {
          const pending = editFieldValues.slice(0, 4).map((v) => parseInt(v, 10));
          if (!pending.some((v) => !Number.isFinite(v))) [x0, y0, x1, y1] = pending;
        }
        if (x1 > x0 && y1 > y0) {
          ctx.save();
          ctx.strokeStyle = "rgba(0, 220, 255, 1)";
          ctx.lineWidth = 2;
          ctx.strokeRect(x0 + 0.5, y0 + 0.5, x1 - x0, y1 - y0);
          ctx.restore();
        }
      }
    }
  }, [doc, showGrid, selectedPairIdx, editFieldValues]);

  const altFontControls = (
    <div className="space-y-1">
      <div className="flex items-center gap-3 flex-wrap">
        <label className="block">
          <input
            type="file"
            accept=".ttf,.otf"
            className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) void handleAltFontFile(f); }}
          />
          <span className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-dashed border-border text-sm cursor-pointer hover:border-primary/50">
            <Upload className="w-4 h-4" /> {altFontName ?? "خط بديل (اختياري)"}
          </span>
        </label>
        <input
          type="text"
          placeholder="حروف من البديل مثل: ع غ"
          value={altLetters}
          onChange={(e) => setAltLetters(e.target.value)}
          className="w-48 rounded border border-border bg-background px-2 py-1.5 text-sm"
          dir="rtl"
        />
        {altOverride && (
          <span className="text-xs text-emerald-500">سيُؤخذ {altCodepoints.size} شكلاً من {altFontName}</span>
        )}
        {altLetters.trim() && !altFontBytes && (
          <span className="text-xs text-amber-500">ارفع الخط البديل أولاً</span>
        )}
      </div>
      <p className="text-xs text-muted-foreground">
        اكتب الحرف الأساسي (مثل ع) فتُستبدل كل أشكاله الأربعة تلقائياً من الخط البديل — بنفس الخلايا وخط القاعدة والإحداثيات المحسوبة تلقائياً، بلا أي ضبط يدوي.
      </p>
    </div>
  );

  return (
    <div className="min-h-screen bg-background p-4 md:p-8" dir="rtl">
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <Link to="/risen" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
            <ArrowRight className="w-4 h-4" /> الرجوع
          </Link>
          <h1 className="text-2xl font-display font-bold">أداة خطوط Risen 2 (تجريبية)</h1>
        </div>

        <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 text-sm">
          <strong className="font-display block mb-1">مرحلة تحليل الصيغة</strong>
          <p className="text-muted-foreground">
            هذه مرحلة تحليل الصيغة: افتح fonts.pak كاملاً واختر أي خط منه (أو ملف .xgfn منفرد)، شغّل اختبار round-trip، وقارن الشبكة التشخيصية بصرياً مع الحروف.
            توليد الخطوط العربية والحقن في fonts.pak سيأتي لاحقاً بعد تأكيد معنى حقول القياسات.
          </p>
        </div>

        {/* fonts.pak container upload — pick any real font directly from the archive */}
        <div className="rounded-xl border border-border bg-card p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-lg bg-primary/15 flex items-center justify-center">
              <Package className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h2 className="font-display font-bold">أو ارفع fonts.pak كاملاً واختر خطاً منه</h2>
              <p className="text-sm text-muted-foreground">يفتح الحاوية ويفك ضغط أي خط تختاره تلقائياً</p>
            </div>
          </div>
          <label className="block">
            <input
              type="file"
              accept=".pak"
              className="hidden"
              disabled={pakBusy}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handlePakFile(f);
              }}
            />
            <div
              className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${pakBusy ? "opacity-50 pointer-events-none border-border" : pakDragOver ? "border-primary bg-primary/5" : "border-border hover:border-primary/50"}`}
              onDragOver={(e) => { e.preventDefault(); setPakDragOver(true); }}
              onDragLeave={() => setPakDragOver(false)}
              onDrop={handlePakDrop}
            >
              {pakBusy ? (
                <>
                  <Loader2 className="w-8 h-8 mx-auto mb-2 animate-spin text-primary" />
                  <p className="text-sm text-muted-foreground">جاري الفتح...</p>
                </>
              ) : (
                <>
                  <Package className="w-8 h-8 mx-auto mb-2 text-muted-foreground" />
                  <p className="text-sm">اضغط لاختيار fonts.pak، أو اسحبه وأفلته هنا</p>
                </>
              )}
            </div>
          </label>

          {pakEntries.length > 0 && (
            <div className="mt-4">
              <p className="text-sm text-muted-foreground mb-2">
                تم فتح <span className="font-mono">{pakName}</span> — {pakEntries.length} خطاً (المميّزة بالأخضر من قائمة الـ35 المستهدفة):
              </p>
              <div className="max-h-64 overflow-y-auto rounded-lg border border-border divide-y divide-border">
                {pakEntries.map((entry) => (
                  <button
                    key={entry.path}
                    onClick={() => handleSelectPakEntry(entry)}
                    className={`w-full text-right px-3 py-2 text-sm font-mono hover:bg-primary/10 transition-colors ${selectedPath === entry.path ? "bg-primary/20" : ""} ${isTargetFont(entry.path) ? "text-emerald-500" : ""}`}
                  >
                    {entry.path}
                  </button>
                ))}
              </div>

              <div className="mt-4 pt-4 border-t border-border space-y-3">
                <h3 className="font-display font-bold text-sm">
                  توليد ودمج الحروف العربية في الـ35 خطاً المستهدفة دفعة واحدة، وبناء fonts.p00
                </h3>
                <p className="text-xs text-muted-foreground">
                  يكرر عملية التوليد والدمج على كل خط من قائمة الـ35 الخضراء، ثم يبني ملف تصحيح (patch) مستقل يحتوي هذه الـ35 فقط باسم fonts.p00 — بنفس بنية المود الصيني الحقيقي الناجح. يوضع fonts.p00 بجانب fonts.pak الأصلي دون تعديله؛ اللعبة تدمج التعديلات تلقائياً.
                </p>
                <div className="flex items-center gap-3 flex-wrap">
                  <label className="block">
                    <input
                      type="file"
                      accept=".ttf,.otf"
                      className="hidden"
                      onChange={(e) => { const f = e.target.files?.[0]; if (f) void handleArabicFontFile(f); }}
                    />
                    <span className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-border text-sm cursor-pointer hover:border-primary/50">
                      <Upload className="w-4 h-4" /> {arabicFontName ?? "اختر خط TTF عربي"}
                    </span>
                  </label>
                  <Button onClick={handleGenerateBatch} disabled={!arabicFontBytes || batchBusy} className="font-display gap-2">
                    {batchBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                    توليد + حقن + تنزيل ({pakEntries.filter((e) => isTargetFont(e.path)).length} خطاً)
                  </Button>
                </div>
                {altFontControls}
                {batchBusy && batchProgress && (
                  <p className="text-xs text-muted-foreground font-mono">{batchProgress}</p>
                )}
                {batchSummary && (
                  <div className={`rounded-lg p-3 text-sm space-y-2 ${batchSummary.errors > 0 ? "bg-destructive/10" : "bg-emerald-500/10"}`}>
                    <div className="flex items-center gap-2">
                      {batchSummary.errors > 0 ? <XCircle className="w-4 h-4 text-destructive shrink-0" /> : <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />}
                      <span>
                        فحص ما بعد الحقن (قراءة fonts.p00 الناتج نفسه): {batchSummary.errors} خطأ، {batchSummary.warnings} تحذير
                      </span>
                    </div>
                    <div className="flex gap-2 flex-wrap">
                      <Button
                        variant="outline"
                        size="sm"
                        className="font-display gap-2"
                        onClick={() => downloadBlob(new TextEncoder().encode(batchSummary.report), "fonts-p00-build-report.txt")}
                      >
                        <Download className="w-3 h-3" /> تنزيل التقرير المفصل (البناء + الحقن + كل حرف)
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="font-display gap-2"
                        onClick={() => downloadBlob(new TextEncoder().encode(batchSummary.reportJson), "fonts-p00-diagnostic.json")}
                      >
                        <Download className="w-3 h-3" /> JSON تشخيصي (للإرسال للمطوّر)
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Free Arabic font library — fetched straight from the google/fonts CDN */}
        <div className="rounded-xl border border-border bg-card p-6">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div>
              <h2 className="font-display font-bold">مكتبة خطوط عربية مجانية (رخصة OFL المفتوحة)</h2>
              <p className="text-sm text-muted-foreground">
                12 خطاً من مستودع Google Fonts الرسمي — معاينة حية، ثم استخدمه كخط أساسي أو كخط بديل لاستنساخ حروف مختارة منه. يتطلب اتصال إنترنت عند أول تحميل.
              </p>
            </div>
            <Button variant="outline" className="font-display" onClick={() => setShowFontLibrary((s) => !s)}>
              {showFontLibrary ? "إخفاء المكتبة" : "عرض المكتبة"}
            </Button>
          </div>
          {showFontLibrary && (
            <div className="mt-4 divide-y divide-border rounded-lg border border-border">
              {FREE_ARABIC_FONTS.map((f) => {
                const status = freeFontStatus[f.id];
                return (
                  <div key={f.id} className="p-3 flex items-center gap-3 flex-wrap">
                    <div className="min-w-32">
                      <div className="font-display font-bold text-sm">{f.name}</div>
                      <div className="text-xs text-muted-foreground">{f.style}</div>
                    </div>
                    <div className="flex-1 min-w-40 text-xl leading-snug" style={status === "ready" ? { fontFamily: `FreeFont_${f.id}` } : undefined}>
                      {status === "ready" ? "معركة عز حج ٢٣" : status === "loading" ? <Loader2 className="w-4 h-4 animate-spin text-primary" /> : status === "error" ? <span className="text-xs text-destructive">فشل التحميل</span> : <span className="text-xs text-muted-foreground">اضغط معاينة</span>}
                    </div>
                    <div className="flex gap-2 flex-wrap">
                      {status !== "ready" && (
                        <Button size="sm" variant="outline" className="font-display" disabled={status === "loading"} onClick={() => void loadFreeFont(f)}>
                          معاينة
                        </Button>
                      )}
                      <Button size="sm" variant="outline" className="font-display" onClick={() => void useFreeFontAs(f, "main")}>
                        خط أساسي
                      </Button>
                      <Button size="sm" variant="outline" className="font-display" onClick={() => void useFreeFontAs(f, "alt")}>
                        خط بديل
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Upload */}
        <div className="rounded-xl border border-border bg-card p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-lg bg-primary/15 flex items-center justify-center">
              <Upload className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h2 className="font-display font-bold">أو ارفع ملف .xgfn منفرداً (مفكوك الضغط)</h2>
              <p className="text-sm text-muted-foreground">مثال: خط واحد مستخرج ومفكوك مسبقاً من fonts.pak</p>
            </div>
          </div>
          <label className="block">
            <input
              type="file"
              accept=".xgfn"
              className="hidden"
              disabled={busy}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleFile(f);
              }}
            />
            <div
              className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${busy ? "opacity-50 pointer-events-none border-border" : dragOver ? "border-primary bg-primary/5" : "border-border hover:border-primary/50"}`}
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
            >
              {busy ? (
                <>
                  <Loader2 className="w-8 h-8 mx-auto mb-2 animate-spin text-primary" />
                  <p className="text-sm text-muted-foreground">جاري التحليل...</p>
                </>
              ) : (
                <>
                  <FileArchive className="w-8 h-8 mx-auto mb-2 text-muted-foreground" />
                  <p className="text-sm">اضغط لاختيار ملف .xgfn، أو اسحبه وأفلته هنا</p>
                </>
              )}
            </div>
          </label>
        </div>

        {doc && (
          <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-6 space-y-4">
            <div className="flex items-center gap-3">
              <CheckCircle2 className="w-5 h-5 text-emerald-500" />
              <h2 className="font-display font-bold">تم التحليل: <span className="font-mono">{fileName}</span></h2>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-sm">
              <div className="rounded-lg bg-background/50 p-3 text-center">
                <div className="font-mono text-xs text-muted-foreground">اسم الخط</div>
                <div className="font-display font-bold">{fontLabel || "—"}</div>
              </div>
              <div className="rounded-lg bg-background/50 p-3 text-center">
                <div className="font-mono text-xs text-muted-foreground">عدد الحروف</div>
                <div className="font-display font-bold text-lg">{doc.glyphCount}</div>
              </div>
              <div className="rounded-lg bg-background/50 p-3 text-center">
                <div className="font-mono text-xs text-muted-foreground">مدخلات charmap</div>
                <div className="font-display font-bold text-lg">{doc.charmap.length}</div>
              </div>
              <div className="rounded-lg bg-background/50 p-3 text-center">
                <div className="font-mono text-xs text-muted-foreground">حجم DDS</div>
                <div className="font-display font-bold text-lg">{doc.ddsBytes.length.toLocaleString()} بايت</div>
              </div>
            </div>

            <div className="flex items-center gap-3 flex-wrap">
              <Button onClick={handleRoundTripTest} variant="outline" className="font-display">
                اختبار Round-trip
              </Button>
              <Button onClick={handleRunAudit} disabled={auditBusy} variant="outline" className="font-display gap-2">
                {auditBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                فحص شامل (بنية + بكسلات)
              </Button>
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input type="checkbox" checked={showGrid} onChange={(e) => setShowGrid(e.target.checked)} className="rounded border-border" />
                إظهار الشبكة التشخيصية
              </label>
            </div>

            {auditReport && (
              <div className={`rounded-lg border p-3 text-sm space-y-2 ${auditReport.errorCount > 0 ? "border-destructive/40 bg-destructive/5" : auditReport.warningCount > 0 ? "border-amber-500/40 bg-amber-500/5" : "border-emerald-500/40 bg-emerald-500/5"}`}>
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-2">
                    {auditReport.errorCount > 0 ? <XCircle className="w-4 h-4 text-destructive" /> : <CheckCircle2 className="w-4 h-4 text-emerald-500" />}
                    <strong className="font-display">
                      سجل الفحص: {auditReport.errorCount} خطأ، {auditReport.warningCount} تحذير — {auditReport.glyphs.length} حرفاً، أطلس {auditReport.atlas ? `${auditReport.atlas.width}×${auditReport.atlas.height}` : "؟"}
                    </strong>
                  </div>
                  <div className="flex gap-2 flex-wrap">
                    <Button variant="outline" size="sm" className="font-display gap-2" onClick={handleDownloadAuditReport}>
                      <Download className="w-3 h-3" /> تقرير نصي
                    </Button>
                    <Button variant="outline" size="sm" className="font-display gap-2" onClick={handleDownloadDiagnosticJson}>
                      <Download className="w-3 h-3" /> JSON تشخيصي (للإرسال للمطوّر)
                    </Button>
                  </div>
                </div>
                {auditReport.headerIssues.length > 0 && (
                  <ul className="text-xs space-y-1">
                    {auditReport.headerIssues.map((issue, i) => (
                      <li key={i} className={issue.severity === "error" ? "text-destructive" : "text-amber-500"}>
                        [{issue.severity === "error" ? "خطأ" : "تحذير"}] {issue.message}
                      </li>
                    ))}
                  </ul>
                )}
                {auditReport.glyphs.some((g) => g.issues.length > 0) && (
                  <div className="max-h-40 overflow-y-auto text-xs space-y-1 border-t border-border pt-2">
                    {auditReport.glyphs.filter((g) => g.issues.length > 0).map((g, i) => (
                      <div key={i}>
                        <span className="font-mono">{g.charLabel} (U+{g.charCode.toString(16).toUpperCase()})</span>:{" "}
                        {g.issues.map((issue, j) => (
                          <span key={j} className={issue.severity === "error" ? "text-destructive" : "text-amber-500"}>
                            {issue.message}{j < g.issues.length - 1 ? " ؛ " : ""}
                          </span>
                        ))}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {roundTrip && (
              <div className={`rounded-lg p-3 text-sm flex items-center gap-2 ${roundTrip.ok ? "bg-emerald-500/10 text-emerald-600" : "bg-destructive/10 text-destructive"}`}>
                {roundTrip.ok ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <XCircle className="w-4 h-4 shrink-0" />}
                {roundTrip.message}
              </div>
            )}

            <div className="rounded-lg border border-border p-4 space-y-3">
              <h3 className="font-display font-bold text-sm">توليد ودمج الحروف العربية</h3>
              <p className="text-xs text-muted-foreground">
                يرسم كل نقاط اليونيكود التي يحتاجها نظام تشكيل Risen العربي الحالي (الأشكال السياقية + لامات الألف + الأرقام العربية الهندية) من خط TTF، ويضيفها أسفل أطلس هذا الخط لمعاينتها في الشبكة التشخيصية.
              </p>
              <div className="flex items-center gap-3 flex-wrap">
                <label className="block">
                  <input
                    type="file"
                    accept=".ttf,.otf"
                    className="hidden"
                    onChange={(e) => { const f = e.target.files?.[0]; if (f) void handleArabicFontFile(f); }}
                  />
                  <span className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-border text-sm cursor-pointer hover:border-primary/50">
                    <Upload className="w-4 h-4" /> {arabicFontName ?? "اختر خط TTF عربي"}
                  </span>
                </label>
                <Button onClick={handleGenerateArabic} disabled={!arabicFontBytes || arabicBusy} className="font-display">
                  {arabicBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : "توليد ودمج"}
                </Button>
              </div>
              {altFontControls}

              {arabicMerged && (
                pakBytes && selectedPath ? (
                  <div className="pt-3 border-t border-border space-y-2">
                    <p className="text-xs text-muted-foreground">
                      تم الدمج للمعاينة. لاختبار الخط فعلياً داخل اللعبة، احقنه في نسخة كاملة من fonts.pak وحمّلها، ثم استبدل بها fonts.pak في ملفات اللعبة (يُستحسن أخذ نسخة احتياطية من الملف الأصلي أولاً).
                    </p>
                    <Button onClick={handleInjectAndDownload} disabled={injectBusy} variant="outline" className="font-display gap-2">
                      {injectBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                      حقن الخط في fonts.pak وتنزيله
                    </Button>
                  </div>
                ) : (
                  <p className="text-xs text-amber-500">
                    الدمج تم للمعاينة فقط — الحقن في fonts.pak يتطلب أن يكون هذا الخط مفتوحاً من رفع fonts.pak كامل (وليس ملف .xgfn منفرداً).
                  </p>
                )
              )}
            </div>

            <div>
              <p className="text-xs text-muted-foreground mb-2">
                المربعات الوردية: صندوق كل حرف في الأطلس. انقر على أي حرف داخل الأطلس (أو في الجدول أدناه) لاختياره وفحص بياناته وتعديلها — المختار يُحاط بإطار سماوي.
              </p>
              <div className="overflow-auto rounded-lg border border-border bg-[repeating-conic-gradient(#0002_0%_25%,transparent_0%_50%)] bg-[length:16px_16px] p-2">
                <canvas ref={canvasRef} onClick={handleCanvasClick} className="max-w-none cursor-crosshair" style={{ imageRendering: "pixelated" }} />
              </div>
            </div>

            {/* Text preview simulator — draws exactly like the game engine */}
            <div className="rounded-lg border border-border p-4 space-y-3">
              <h3 className="font-display font-bold text-sm">محاكي المعاينة — كما سيرسمها المحرك حرفياً</h3>
              <p className="text-xs text-muted-foreground">
                اكتب جملة: تُشكَّل بنفس نظام اللعبة ثم تُرسم من أطلس هذا الخط نفسه (حرفاً حرفاً بنفس التباعد). إن ظهرت صحيحة هنا وخاطئة داخل اللعبة فالمشكلة في المحرك؛ وإن ظهرت خاطئة هنا فالمشكلة في بيانات الخط. المربع الأحمر = حرف غير موجود في الخريطة. <strong>انقر على أي حرف في المعاينة لاختياره مباشرة</strong> بدل البحث عنه في الجدول.
              </p>
              <input
                type="text"
                value={previewText}
                onChange={(e) => setPreviewText(e.target.value)}
                className="w-full rounded border border-border bg-background px-2 py-1.5 text-sm"
                dir="rtl"
              />
              <div className="overflow-x-auto rounded border border-border p-2 bg-[#12241a]">
                <canvas ref={previewCanvasRef} onClick={handlePreviewClick} className="max-w-none cursor-pointer" style={{ imageRendering: "pixelated" }} />
              </div>
              {previewMissing.length > 0 && (
                <p className="text-xs text-destructive">
                  حروف غير موجودة في هذا الخط: {previewMissing.map((c) => `${c} (U+${c.charCodeAt(0).toString(16).toUpperCase()})`).join("، ")}
                </p>
              )}
            </div>

            {/* Glyph inspector table */}
            <div className="rounded-lg border border-border p-4 space-y-3">
              <h3 className="font-display font-bold text-sm">جدول الحروف ({doc.charmap.length}) — انقر صفاً لاختياره</h3>
              <div ref={tableWrapRef} className="max-h-64 overflow-y-auto overflow-x-auto rounded border border-border">
                <table className="w-full text-xs font-mono">
                  <thead className="sticky top-0 bg-card">
                    <tr className="text-muted-foreground">
                      <th className="px-2 py-1 text-right">الحرف</th>
                      <th className="px-2 py-1 text-right">الرمز</th>
                      <th className="px-2 py-1 text-right">المؤشر</th>
                      <th className="px-2 py-1 text-right">الصندوق</th>
                      <th className="px-2 py-1 text-right">التباعد</th>
                    </tr>
                  </thead>
                  <tbody>
                    {doc.charmap.map((pair, i) => {
                      const rec = pair.glyphIndex < doc.measurements.length ? doc.measurements[pair.glyphIndex] : null;
                      const [x0, y0, x1, y1, adv] = rec ? rec.fields : [];
                      return (
                        <tr
                          key={i}
                          data-idx={i}
                          onClick={() => selectPair(i)}
                          className={`cursor-pointer border-t border-border hover:bg-primary/10 ${selectedPairIdx === i ? "bg-primary/20" : ""}`}
                        >
                          <td className="px-2 py-1">{pair.charCode >= 0x21 ? String.fromCharCode(pair.charCode) : pair.charCode === 0x20 ? "␣" : "·"}</td>
                          <td className="px-2 py-1">U+{pair.charCode.toString(16).toUpperCase().padStart(4, "0")}</td>
                          <td className="px-2 py-1">{pair.glyphIndex}</td>
                          <td className="px-2 py-1" dir="ltr">{rec ? `[${x0},${y0}]-[${x1},${y1}]` : "—"}</td>
                          <td className="px-2 py-1">{rec ? adv : "—"}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {selectedPairIdx !== null && doc.charmap[selectedPairIdx] && (
                <div className="rounded-lg bg-background/50 p-3 space-y-3">
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <strong className="font-display text-sm">
                      الحرف المختار: {doc.charmap[selectedPairIdx].charCode >= 0x21 ? String.fromCharCode(doc.charmap[selectedPairIdx].charCode) : "·"}{" "}
                      (U+{doc.charmap[selectedPairIdx].charCode.toString(16).toUpperCase().padStart(4, "0")}) → السجل {doc.charmap[selectedPairIdx].glyphIndex}
                    </strong>
                    <Button variant="destructive" size="sm" className="font-display" onClick={handleDeletePair}>
                      حذف ربط هذا الحرف
                    </Button>
                  </div>

                  {editFieldValues.length === 9 && (
                    <div className="space-y-2">
                      <p className="text-xs text-muted-foreground">تعديل حقول السجل (كل تعديل يمر بفحص كامل قبل قبوله — التعديل المُفسِد يُرفض تلقائياً):</p>
                      <div className="grid grid-cols-3 md:grid-cols-9 gap-2" dir="ltr">
                        {FIELD_INFO.map((info, k) => (
                          <label key={info.key} className="text-xs font-mono">
                            <span className="text-muted-foreground block" title={info.desc}>{info.short}</span>
                            <input
                              type="number"
                              value={editFieldValues[k]}
                              onChange={(e) => setEditFieldValues((prev) => prev.map((v, j) => (j === k ? e.target.value : v)))}
                              className="w-full rounded border border-border bg-background px-1 py-0.5"
                            />
                          </label>
                        ))}
                      </div>
                      <Button type="button" variant="outline" size="sm" className="font-display" onClick={() => setShowFieldHelp((s) => !s)}>
                        ؟ ماذا يعني كل حقل
                      </Button>
                      {showFieldHelp && (
                        <div className="rounded border border-border bg-background/70 p-3 space-y-1.5 text-xs">
                          {FIELD_INFO.map((f) => (
                            <p key={f.key}>
                              <strong className="font-display">{f.short}</strong>: {f.desc}
                            </p>
                          ))}
                        </div>
                      )}
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs text-muted-foreground">تحريك رسم الحرف بكسلاً (المعاينة والأطلس يتحدثان فوراً — التطبيق بالزر أدناه):</span>
                        <div className="flex items-center gap-1" dir="ltr">
                          <Button type="button" variant="outline" size="sm" className="w-9 px-0 font-mono" onClick={() => nudgeSelected(-1, 0)} aria-label="تحريك لليسار">◀</Button>
                          <Button type="button" variant="outline" size="sm" className="w-9 px-0 font-mono" onClick={() => nudgeSelected(0, -1)} aria-label="تحريك للأعلى">▲</Button>
                          <Button type="button" variant="outline" size="sm" className="w-9 px-0 font-mono" onClick={() => nudgeSelected(0, 1)} aria-label="تحريك للأسفل">▼</Button>
                          <Button type="button" variant="outline" size="sm" className="w-9 px-0 font-mono" onClick={() => nudgeSelected(1, 0)} aria-label="تحريك لليمين">▶</Button>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <Button size="sm" className="font-display" onClick={handleApplyFieldEdit}>تطبيق تعديل الحقول</Button>
                        <span className="text-xs text-muted-foreground">أو إعادة ربط الحرف بسجل آخر:</span>
                        <input
                          type="number"
                          value={remapGlyphInput}
                          onChange={(e) => setRemapGlyphInput(e.target.value)}
                          className="w-20 rounded border border-border bg-background px-1 py-0.5 text-xs font-mono"
                          dir="ltr"
                        />
                        <Button size="sm" variant="outline" className="font-display" onClick={handleRemapPair}>إعادة ربط</Button>
                      </div>
                      {editStatus && (
                        <div className={`rounded p-2 text-xs flex items-center gap-2 ${editStatus.ok ? "bg-emerald-500/10 text-emerald-600" : "bg-destructive/10 text-destructive"}`}>
                          {editStatus.ok ? <CheckCircle2 className="w-3.5 h-3.5 shrink-0" /> : <XCircle className="w-3.5 h-3.5 shrink-0" />}
                          {editStatus.message}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Add a new character mapped to an existing glyph */}
              <div className="rounded-lg bg-background/50 p-3 space-y-2">
                <strong className="font-display text-sm">إضافة حرف جديد (ربط ذكي بسجل موجود)</strong>
                <p className="text-xs text-muted-foreground">
                  اكتب الحرف نفسه أو رمزه الست عشري (مثل FE8E)، ورقم السجل الذي سيرسمه — الحرف الجديد يستخدم رسماً مجرَّباً دون أي تغيير في الأطلس. يمر بالفحص الكامل قبل القبول.
                </p>
                <div className="flex items-center gap-2 flex-wrap">
                  <input
                    type="text"
                    placeholder="الحرف أو FE8E"
                    value={aliasCharInput}
                    onChange={(e) => setAliasCharInput(e.target.value)}
                    className="w-28 rounded border border-border bg-background px-2 py-1 text-sm font-mono"
                  />
                  <input
                    type="number"
                    placeholder="السجل"
                    value={aliasGlyphInput}
                    onChange={(e) => setAliasGlyphInput(e.target.value)}
                    className="w-24 rounded border border-border bg-background px-2 py-1 text-sm font-mono"
                    dir="ltr"
                  />
                  <Button size="sm" className="font-display" onClick={handleAddAlias}>إضافة الربط</Button>
                </div>
                {editStatus && selectedPairIdx === null && (
                  <div className={`rounded p-2 text-xs flex items-center gap-2 ${editStatus.ok ? "bg-emerald-500/10 text-emerald-600" : "bg-destructive/10 text-destructive"}`}>
                    {editStatus.ok ? <CheckCircle2 className="w-3.5 h-3.5 shrink-0" /> : <XCircle className="w-3.5 h-3.5 shrink-0" />}
                    {editStatus.message}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default RisenFonts;
