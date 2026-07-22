import { useState, useCallback, useRef, useEffect, useMemo } from "react";
import { Link } from "react-router-dom";
import { Upload, Loader2, ArrowRight, CheckCircle2, XCircle, Download } from "lucide-react";
import { toast } from "sonner";
import JSZip from "jszip";
import {
  listPakAssets,
  decodeTextureToPng,
  listGlyphs,
  buildFontGlyphs,
  editFontGlyphs,
  listFontPages,
  type MetroidPrimeAssetInfo,
  type MetroidPrimeGlyph,
} from "@/lib/metroid-prime/mp-wasm";
import { renderArabicGlyphsForMp, getMpPresentationForms, type RenderedMpGlyph, type MpAlternateFontOverride } from "@/lib/metroid-prime/mp-arabic-font-gen";
import { auditMpFont, formatMpAuditReportText, buildMpDiagnosticJson, isPlausibleMpGlyph, type MpFontAuditReport } from "@/lib/metroid-prime/mp-font-audit";
import { FREE_ARABIC_FONTS, fetchFreeFontBytes, type FreeFontEntry } from "@/lib/risen2-free-fonts";
import { APP_VERSION } from "@/lib/version";

function downloadBlob(bytes: Uint8Array, filename: string) {
  const blob = new Blob([bytes as unknown as BlobPart], { type: "application/octet-stream" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function charLabel(code: number): string {
  if (code >= 0x21 && code <= 0x7e) return String.fromCharCode(code);
  if (code === 0x20) return "␣";
  if ((code >= 0x0600 && code <= 0x06ff) || (code >= 0xfb50 && code <= 0xfeff)) return String.fromCharCode(code);
  return "·";
}

/** Parses a char/hex/decimal/U+ input into a codepoint (mirrors Risen's parseCharInput). */
function parseCharOrCodeInput(input: string): number | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  const hexMatch = trimmed.match(/^(?:U\+|0x)?([0-9a-fA-F]{2,6})$/);
  if (hexMatch && trimmed.length > 1) {
    const n = parseInt(hexMatch[1], 16);
    if (!Number.isNaN(n) && n <= 0xffff) return n;
  }
  if ([...trimmed].length === 1) return trimmed.codePointAt(0) ?? null;
  return null;
}

/** Small canvas preview of one rasterized glyph's coverage bitmap. */
function GlyphThumb({ glyph, skipped }: { glyph: RenderedMpGlyph; skipped: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || glyph.width === 0 || glyph.height === 0) return;
    canvas.width = glyph.width;
    canvas.height = glyph.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const imageData = ctx.createImageData(glyph.width, glyph.height);
    for (let i = 0; i < glyph.pixels.length; i++) {
      imageData.data[i * 4] = 255;
      imageData.data[i * 4 + 1] = 255;
      imageData.data[i * 4 + 2] = 255;
      imageData.data[i * 4 + 3] = glyph.pixels[i];
    }
    ctx.putImageData(imageData, 0, 0);
  }, [glyph]);

  return (
    <div className={`flex flex-col items-center gap-1 rounded border p-1.5 ${skipped ? "border-amber-500/40 bg-amber-500/10" : "border-border bg-black/60"}`}>
      {glyph.width > 0 && glyph.height > 0 ? (
        <canvas ref={canvasRef} style={{ imageRendering: "pixelated", width: glyph.width * 2, height: glyph.height * 2 }} />
      ) : (
        <div className="flex h-8 w-8 items-center justify-center text-[10px] text-muted-foreground">فراغ</div>
      )}
      <span className="text-[10px] text-muted-foreground" dir="ltr">U+{glyph.code.toString(16).toUpperCase().padStart(4, "0")}</span>
      {skipped && <span className="text-[9px] text-amber-500">موجود مسبقاً</span>}
    </div>
  );
}

/** One row in the free Arabic font library, with a cheap CSS-based preview. */
function FontLibraryRow({ entry, onUse }: { entry: FreeFontEntry; onUse: (entry: FreeFontEntry, role: "main" | "alt") => void }) {
  const [status, setStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [family, setFamily] = useState<string | null>(null);
  const faceRef = useRef<FontFace | null>(null);

  useEffect(() => {
    return () => {
      if (faceRef.current) document.fonts.delete(faceRef.current);
    };
  }, []);

  const handlePreview = useCallback(async () => {
    setStatus("loading");
    try {
      const bytes = await fetchFreeFontBytes(entry);
      const face = new FontFace(`MpLib_${entry.id}`, bytes);
      await face.load();
      document.fonts.add(face);
      faceRef.current = face;
      setFamily(face.family);
      setStatus("ready");
    } catch (e) {
      setStatus("error");
      toast.error((e as Error).message);
    }
  }, [entry]);

  return (
    <div className="flex flex-wrap items-center gap-3 border-b px-2 py-2 last:border-b-0">
      <div className="min-w-[140px] text-sm">
        <div className="font-medium">{entry.name}</div>
        <div className="text-xs text-muted-foreground">{entry.style}</div>
      </div>
      <div className="flex-1 text-lg" style={family ? { fontFamily: family } : undefined}>
        {status === "loading" ? <Loader2 className="h-4 w-4 animate-spin" /> : status === "error" ? <span className="text-xs text-destructive">فشل التحميل</span> : status === "ready" ? "معركة عز حج ٢٣" : <span className="text-xs text-muted-foreground">اضغط معاينة</span>}
      </div>
      <div className="flex gap-1.5">
        {status !== "ready" && (
          <button onClick={handlePreview} className="rounded border px-2 py-1 text-xs hover:bg-muted">معاينة</button>
        )}
        <button onClick={() => onUse(entry, "main")} className="rounded border border-primary/40 bg-primary/10 px-2 py-1 text-xs hover:bg-primary/20">خط أساسي</button>
        <button onClick={() => onUse(entry, "alt")} className="rounded border px-2 py-1 text-xs hover:bg-muted">خط بديل</button>
      </div>
    </div>
  );
}

/**
 * Metroid Prime Remastered font tool — mirrors the feature set of the Risen
 * font tool (glyph table, audit report, alt-font override, smart-link alias,
 * atlas + engine-accurate preview with click-to-select) adapted to MP's
 * FONT format: one central font asset for the whole game (not one file per
 * UI widget), 48-byte records with standard font metrics (see mp-wasm/src/
 * lib.rs and mp-font-audit.ts docblocks for what's been reverse-engineered
 * and confirmed against a real community mod).
 */
export default function MetroidPrimeFont() {
  const [busy, setBusy] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [pakBytes, setPakBytes] = useState<Uint8Array | null>(null);
  const [textures, setTextures] = useState<MetroidPrimeAssetInfo[]>([]);
  const [fonts, setFonts] = useState<MetroidPrimeAssetInfo[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [imageBitmap, setImageBitmap] = useState<ImageBitmap | null>(null);
  const [decoding, setDecoding] = useState(false);
  const [selectedFontId, setSelectedFontId] = useState<string | null>(null);
  const [primaryPageId, setPrimaryPageId] = useState<string | null>(null);
  const [glyphs, setGlyphs] = useState<MetroidPrimeGlyph[] | null>(null);
  const baselineGlyphsRef = useRef<MetroidPrimeGlyph[] | null>(null);
  const [hasEdits, setHasEdits] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const tableWrapRef = useRef<HTMLDivElement>(null);

  const [selectedCode, setSelectedCode] = useState<number | null>(null);
  const [showGrid, setShowGrid] = useState(true);

  const [roundTrip, setRoundTrip] = useState<{ ok: boolean; message: string } | null>(null);
  const [auditReport, setAuditReport] = useState<MpFontAuditReport | null>(null);
  const [auditBusy, setAuditBusy] = useState(false);

  const [showFontLibrary, setShowFontLibrary] = useState(false);
  const [fontEntryId, setFontEntryId] = useState(FREE_ARABIC_FONTS[0].id);
  const [inputText, setInputText] = useState("");
  const [fontSizePx, setFontSizePx] = useState(32);
  const [altFontEntryId, setAltFontEntryId] = useState<string | null>(null);
  const [altLetters, setAltLetters] = useState("");
  const [customMainFont, setCustomMainFont] = useState<{ name: string; bytes: ArrayBuffer } | null>(null);
  const [customAltFont, setCustomAltFont] = useState<{ name: string; bytes: ArrayBuffer } | null>(null);
  const [rendering, setRendering] = useState(false);
  const [previewGlyphs, setPreviewGlyphs] = useState<RenderedMpGlyph[] | null>(null);
  const [existingCodes, setExistingCodes] = useState<Set<number> | null>(null);
  const [building, setBuilding] = useState(false);
  const fontBytesCache = useRef<Map<string, ArrayBuffer>>(new Map());

  const [aliasCharInput, setAliasCharInput] = useState("");
  const [aliasSourceInput, setAliasSourceInput] = useState("");
  const [aliasBusy, setAliasBusy] = useState(false);
  const [aliasStatus, setAliasStatus] = useState<{ ok: boolean; message: string } | null>(null);

  const [editX0, setEditX0] = useState("");
  const [editY0, setEditY0] = useState("");
  const [editAdvance, setEditAdvance] = useState("");
  const [editBusy, setEditBusy] = useState(false);
  const [editStatus, setEditStatus] = useState<{ ok: boolean; message: string } | null>(null);
  const [remapSourceInput, setRemapSourceInput] = useState("");

  const [simText, setSimText] = useState("مرحباً بكم في Metroid Prime");
  const previewCanvasRef = useRef<HTMLCanvasElement>(null);
  const previewHitsRef = useRef<{ x0: number; x1: number; code: number }[]>([]);

  const primaryFlagZero = useMemo(() => glyphs?.filter((g) => g.flag === 0 && isPlausibleMpGlyph(g)) ?? [], [glyphs]);
  const selectedGlyph = useMemo(() => primaryFlagZero.find((g) => g.code === selectedCode) ?? null, [primaryFlagZero, selectedCode]);

  const loadFontBytesFor = useCallback(async (id: string): Promise<ArrayBuffer> => {
    let bytes = fontBytesCache.current.get(id);
    if (!bytes) {
      const entry = FREE_ARABIC_FONTS.find((f) => f.id === id);
      if (!entry) throw new Error("خط غير معروف");
      bytes = await fetchFreeFontBytes(entry);
      fontBytesCache.current.set(id, bytes);
    }
    return bytes;
  }, []);

  const refreshGlyphs = useCallback(async (bytes: Uint8Array, fontId: string) => {
    const g = await listGlyphs(bytes, fontId);
    setGlyphs(g);
    return g;
  }, []);

  const loadPak = useCallback(async (file: File) => {
    setBusy(true);
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const list = await listPakAssets(bytes);
      const textureList = list.filter((a) => a.kind === "TXTR");
      const fontList = list.filter((a) => a.kind === "FONT");
      if (textureList.length === 0) throw new Error("لم يُعثر على أي نسيج (TXTR) في هذا الملف");
      setPakBytes(bytes);
      setTextures(textureList);
      setFonts(fontList);
      setSelectedId(null);
      setImageBitmap(null);
      setSelectedFontId(null);
      setPrimaryPageId(null);
      setGlyphs(null);
      baselineGlyphsRef.current = null;
      setHasEdits(false);
      setPreviewGlyphs(null);
      setExistingCodes(null);
      setAuditReport(null);
      setRoundTrip(null);
      setCustomMainFont(null);
      setCustomAltFont(null);
      setSelectedCode(null);
      toast.success(`تم العثور على ${textureList.length} نسيجاً و${fontList.length} خط من أصل ${list.length} أصلاً`);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }, []);

  const selectTexture = useCallback(
    async (id: string) => {
      if (!pakBytes) return;
      setSelectedId(id);
      setDecoding(true);
      setImageBitmap(null);
      try {
        const png = await decodeTextureToPng(pakBytes, id);
        const blob = new Blob([png as unknown as BlobPart], { type: "image/png" });
        const bitmap = await createImageBitmap(blob);
        setImageBitmap(bitmap);
      } catch (e) {
        toast.error((e as Error).message);
      } finally {
        setDecoding(false);
      }
    },
    [pakBytes]
  );

  const selectFont = useCallback(
    async (fontId: string) => {
      if (!pakBytes) return;
      try {
        const [g, pages] = await Promise.all([refreshGlyphs(pakBytes, fontId), listFontPages(pakBytes, fontId)]);
        setSelectedFontId(fontId);
        const primary = pages[0] ?? null;
        setPrimaryPageId(primary);
        baselineGlyphsRef.current = g;
        setAuditReport(null);
        setRoundTrip(null);
        toast.success(`${g.length} حرفاً في هذا الخط (${g.filter((x) => x.flag === 0).length} منها في الصفحة الأساسية) — تم اختيارها تلقائياً (باللون الأخضر)`);
        if (primary) void selectTexture(primary);
      } catch (e) {
        toast.error((e as Error).message);
      }
    },
    [pakBytes, refreshGlyphs, selectTexture]
  );

  const sortedTextures = useMemo(() => {
    if (!primaryPageId) return textures;
    const primary = textures.filter((t) => t.id === primaryPageId);
    const rest = textures.filter((t) => t.id !== primaryPageId);
    return [...primary, ...rest];
  }, [textures, primaryPageId]);

  const selectPair = useCallback((code: number) => {
    setSelectedCode(code);
    const g = primaryFlagZero.find((x) => x.code === code);
    if (g) {
      setEditX0(String(g.x0));
      setEditY0(String(g.y0));
      setEditAdvance(String(g.advance));
    }
    requestAnimationFrame(() => {
      const row = tableWrapRef.current?.querySelector(`[data-code="${code}"]`);
      row?.scrollIntoView({ block: "nearest" });
    });
  }, [primaryFlagZero]);

  const handleRoundTripTest = useCallback(async () => {
    if (!pakBytes || !selectedFontId || !glyphs) return;
    try {
      const reparsed = await listGlyphs(pakBytes, selectedFontId);
      const same = reparsed.length === glyphs.length && reparsed.every((g, i) => JSON.stringify(g) === JSON.stringify(glyphs[i]));
      setRoundTrip(same
        ? { ok: true, message: `مطابق تماماً — ${reparsed.length} حرفاً` }
        : { ok: false, message: `اختلاف: ${glyphs.length} محفوظ مقابل ${reparsed.length} عند إعادة التحليل` });
    } catch (e) {
      setRoundTrip({ ok: false, message: (e as Error).message });
    }
  }, [pakBytes, selectedFontId, glyphs]);

  const handleRunAudit = useCallback(async () => {
    if (!glyphs || !imageBitmap || !canvasRef.current) return;
    setAuditBusy(true);
    try {
      const canvas = canvasRef.current;
      const ctx = canvas.getContext("2d");
      const rgba = ctx ? ctx.getImageData(0, 0, canvas.width, canvas.height).data : undefined;
      const report = auditMpFont(glyphs, {
        fontLabel: fonts.find((f) => f.id === selectedFontId)?.names[0] ?? selectedFontId ?? "",
        primaryPageRgba: rgba,
        primaryPageWidth: imageBitmap.width,
        primaryPageHeight: imageBitmap.height,
        original: baselineGlyphsRef.current ?? undefined,
      });
      setAuditReport(report);
    } finally {
      setAuditBusy(false);
    }
  }, [glyphs, imageBitmap, fonts, selectedFontId]);

  const handleDownloadAuditReport = useCallback(() => {
    if (!auditReport) return;
    const text = formatMpAuditReportText(auditReport);
    downloadBlob(new TextEncoder().encode(text), "mp-font-audit-report.txt");
  }, [auditReport]);

  const handleDownloadDiagnosticJson = useCallback(() => {
    if (!auditReport) return;
    const json = buildMpDiagnosticJson(auditReport, { appVersion: APP_VERSION, context: "single-font" });
    downloadBlob(new TextEncoder().encode(json), "mp-font-diagnostic.json");
  }, [auditReport]);

  const altOverride = useMemo((): MpAlternateFontOverride | undefined => {
    if (!altLetters.trim()) return undefined;
    const bytes = customAltFont?.bytes ?? (altFontEntryId ? fontBytesCache.current.get(altFontEntryId) : undefined);
    if (!bytes) return undefined;
    const codepoints = new Set<number>();
    for (const ch of altLetters.trim()) {
      if (ch === " ") continue;
      for (const cp of getMpPresentationForms(ch)) codepoints.add(cp);
    }
    return { fontBytes: bytes, codepoints };
  }, [altFontEntryId, altLetters, customAltFont]);

  const handleMainFontUpload = useCallback(async (file: File) => {
    const bytes = await file.arrayBuffer();
    setCustomMainFont({ name: file.name, bytes });
    toast.success(`سيُستخدم ${file.name} كخط أساسي`);
  }, []);

  const handleAltFontUpload = useCallback(async (file: File) => {
    const bytes = await file.arrayBuffer();
    setCustomAltFont({ name: file.name, bytes });
    toast.success(`سيُستخدم ${file.name} كخط بديل`);
  }, []);

  const handlePreview = useCallback(async () => {
    if (!inputText.trim()) { toast.error("اكتب نصاً عربياً أولاً"); return; }
    if (!pakBytes || !selectedFontId) { toast.error("اختر خطاً من القائمة أعلاه أولاً"); return; }
    setRendering(true);
    try {
      const bytes = customMainFont?.bytes ?? (await loadFontBytesFor(fontEntryId));
      const [{ glyphs: rendered }, existing] = await Promise.all([
        renderArabicGlyphsForMp(bytes, inputText, fontSizePx, altOverride),
        listGlyphs(pakBytes, selectedFontId),
      ]);
      setPreviewGlyphs(rendered);
      setExistingCodes(new Set(existing.filter((g) => g.flag === 0).map((g) => g.code)));
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setRendering(false);
    }
  }, [inputText, fontEntryId, fontSizePx, pakBytes, selectedFontId, altOverride, loadFontBytesFor, customMainFont]);

  const handleMerge = useCallback(async () => {
    if (!pakBytes || !selectedId || !selectedFontId || !previewGlyphs || !existingCodes) return;
    const toAdd = previewGlyphs.filter((g) => !existingCodes.has(g.code));
    if (toAdd.length === 0) { toast.error("كل الحروف المعروضة موجودة مسبقاً في هذا الخط"); return; }
    setBuilding(true);
    try {
      const rebuilt = await buildFontGlyphs(pakBytes, selectedId, selectedFontId, toAdd);
      setPakBytes(rebuilt);
      await refreshGlyphs(rebuilt, selectedFontId);
      setHasEdits(true);
      setAuditReport(null);
      setRoundTrip(null);
      const skipped = previewGlyphs.length - toAdd.length;
      toast.success(`تم دمج ${toAdd.length} حرفاً${skipped > 0 ? ` (تخطّي ${skipped} موجود مسبقاً)` : ""} في الخط`);
      setPreviewGlyphs(null);
      setExistingCodes(null);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBuilding(false);
    }
  }, [pakBytes, selectedId, selectedFontId, previewGlyphs, existingCodes, refreshGlyphs]);

  const applyGlyphEdit = useCallback(
    async (opsFn: () => Parameters<typeof editFontGlyphs>[2], successMessage: string): Promise<{ ok: boolean; message: string }> => {
      if (!pakBytes || !selectedFontId) return { ok: false, message: "لا يوجد خط محدد" };
      try {
        const rebuilt = await editFontGlyphs(pakBytes, selectedFontId, opsFn());
        setPakBytes(rebuilt);
        await refreshGlyphs(rebuilt, selectedFontId);
        setHasEdits(true);
        setAuditReport(null);
        setRoundTrip(null);
        return { ok: true, message: successMessage };
      } catch (e) {
        return { ok: false, message: (e as Error).message };
      }
    },
    [pakBytes, selectedFontId, refreshGlyphs]
  );

  const handleAddAlias = useCallback(async () => {
    const code = parseCharOrCodeInput(aliasCharInput);
    const source = parseCharOrCodeInput(aliasSourceInput);
    if (code === null || source === null) { setAliasStatus({ ok: false, message: "أدخل حرفاً أو رمزاً صحيحاً في الحقلين" }); return; }
    setAliasBusy(true);
    const result = await applyGlyphEdit(() => [{ op: "alias", code, source_code: source }], `تمت إضافة ${charLabel(code)} (U+${code.toString(16).toUpperCase()}) بربط ذكي`);
    setAliasStatus(result);
    if (result.ok) { setAliasCharInput(""); setAliasSourceInput(""); }
    setAliasBusy(false);
  }, [aliasCharInput, aliasSourceInput, applyGlyphEdit]);

  const handleApplyFieldEdit = useCallback(async () => {
    if (selectedCode === null) return;
    const x0 = Number(editX0), y0 = Number(editY0), advance = Number(editAdvance);
    if ([x0, y0, advance].some((v) => Number.isNaN(v))) { setEditStatus({ ok: false, message: "قيم غير صالحة" }); return; }
    setEditBusy(true);
    const result = await applyGlyphEdit(() => [{ op: "set_fields", code: selectedCode, x0, y0, advance }], "تم تطبيق التعديل ✅");
    setEditStatus(result);
    setEditBusy(false);
  }, [selectedCode, editX0, editY0, editAdvance, applyGlyphEdit]);

  const handleRemap = useCallback(async () => {
    if (selectedCode === null) return;
    const source = parseCharOrCodeInput(remapSourceInput);
    if (source === null) { setEditStatus({ ok: false, message: "أدخل حرف/رمز المصدر" }); return; }
    setEditBusy(true);
    const result = await applyGlyphEdit(() => [{ op: "remap", code: selectedCode, source_code: source }], "تمت إعادة الربط ✅");
    setEditStatus(result);
    if (result.ok) setRemapSourceInput("");
    setEditBusy(false);
  }, [selectedCode, remapSourceInput, applyGlyphEdit]);

  const handleDeleteSelected = useCallback(async () => {
    if (selectedCode === null) return;
    setEditBusy(true);
    const result = await applyGlyphEdit(() => [{ op: "delete", code: selectedCode }], "تم حذف الحرف ✅");
    setEditStatus(result);
    if (result.ok) setSelectedCode(null);
    setEditBusy(false);
  }, [selectedCode, applyGlyphEdit]);

  const nudgeSelected = useCallback((dx: number, dy: number) => {
    setEditX0((v) => String(Number(v || 0) - dx));
    setEditY0((v) => String(Number(v || 0) - dy));
  }, []);

  const handleDownload = useCallback(() => {
    if (!pakBytes) return;
    downloadBlob(pakBytes, "GuiSysMP1_arabic.pak");
  }, [pakBytes]);

  /** Exports the currently displayed atlas as a real PNG + a CSV of every
   *  glyph's coordinates (pixel box computed from u0/v0/u1/v1 against this
   *  same image, so no extra math is needed to compare them by eye) —
   *  zipped together for manual verification against the image. */
  const handleExportImageAndCoords = useCallback(async () => {
    if (!pakBytes || !selectedId || !imageBitmap) return;
    try {
      const png = await decodeTextureToPng(pakBytes, selectedId);
      const header = "code_hex,char,flag,x0,y0,width,height,advance,u0,v0,u1,v1,box_x_px,box_y_px,box_w_px,box_h_px";
      const rows = primaryFlagZero.map((g) => {
        const boxX = Math.round(g.u0 * imageBitmap.width);
        const boxXEnd = Math.round(g.u1 * imageBitmap.width);
        const boxYTop = Math.round(g.v1 * imageBitmap.height);
        const boxYBottom = Math.round(g.v0 * imageBitmap.height);
        const ch = charLabel(g.code);
        return [
          `U+${g.code.toString(16).toUpperCase().padStart(4, "0")}`,
          `"${ch}"`,
          g.flag, g.x0, g.y0, g.width, g.height, g.advance,
          g.u0, g.v0, g.u1, g.v1,
          boxX, boxYTop, boxXEnd - boxX, boxYBottom - boxYTop,
        ].join(",");
      });
      const csv = [header, ...rows].join("\n");

      const zip = new JSZip();
      zip.file("font-atlas.png", png);
      zip.file("glyph-coordinates.csv", csv);
      const blob = await zip.generateAsync({ type: "blob" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "mp-font-image-and-coords.zip";
      a.click();
      URL.revokeObjectURL(url);
      toast.success(`تم تصدير الصورة و${primaryFlagZero.length} إحداثية في ملف ZIP`);
    } catch (e) {
      toast.error((e as Error).message);
    }
  }, [pakBytes, selectedId, imageBitmap, primaryFlagZero]);

  // Atlas canvas: draw image + pink boxes for every flag=0 glyph + cyan
  // outline for the selected one (using live-pending edit field values).
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !imageBitmap) return;
    canvas.width = imageBitmap.width;
    canvas.height = imageBitmap.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(imageBitmap, 0, 0);

    if (showGrid) {
      ctx.strokeStyle = "rgba(255, 0, 128, 0.7)";
      ctx.lineWidth = 1;
      for (const g of primaryFlagZero) {
        if (g.width <= 0 || g.height <= 0) continue;
        const x = g.u0 * imageBitmap.width;
        const y = g.v1 * imageBitmap.height;
        const w = (g.u1 - g.u0) * imageBitmap.width;
        const h = (g.v0 - g.v1) * imageBitmap.height;
        if (w <= 0 || h <= 0 || w > imageBitmap.width || h > imageBitmap.height) continue;
        ctx.strokeRect(x, y, w, h);
      }
    }
    if (selectedGlyph && selectedGlyph.width > 0) {
      ctx.strokeStyle = "rgba(0, 220, 255, 1)";
      ctx.lineWidth = 2;
      const x = selectedGlyph.u0 * imageBitmap.width;
      const y = selectedGlyph.v1 * imageBitmap.height;
      const w = (selectedGlyph.u1 - selectedGlyph.u0) * imageBitmap.width;
      const h = (selectedGlyph.v0 - selectedGlyph.v1) * imageBitmap.height;
      ctx.strokeRect(x, y, w, h);
    }
  }, [imageBitmap, primaryFlagZero, selectedGlyph, showGrid]);

  const handleCanvasClick = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      const canvas = canvasRef.current;
      if (!canvas || !imageBitmap) return;
      const rect = canvas.getBoundingClientRect();
      const scaleX = canvas.width / rect.width;
      const scaleY = canvas.height / rect.height;
      const px = (e.clientX - rect.left) * scaleX;
      const py = (e.clientY - rect.top) * scaleY;
      for (const g of primaryFlagZero) {
        if (g.width <= 0 || g.height <= 0) continue;
        const x = g.u0 * imageBitmap.width;
        const y = g.v1 * imageBitmap.height;
        const w = (g.u1 - g.u0) * imageBitmap.width;
        const h = (g.v0 - g.v1) * imageBitmap.height;
        if (px >= x && px <= x + w && py >= y && py <= y + h) {
          selectPair(g.code);
          return;
        }
      }
    },
    [imageBitmap, primaryFlagZero, selectPair]
  );

  // Text-preview simulator: blit each shaped char's real atlas box, or a red
  // placeholder box for missing codepoints, using the same live-pending
  // field overrides as the atlas canvas.
  const missingInSim = useMemo(() => {
    const shaped = [...simText].filter((ch) => ch.charCodeAt(0) >= 0x0600 || /[a-zA-Z0-9 .,!?]/.test(ch));
    const missing: number[] = [];
    for (const ch of simText) {
      const cp = ch.charCodeAt(0);
      if (cp === 0x20) continue;
      if (!primaryFlagZero.some((g) => g.code === cp)) missing.push(cp);
    }
    return missing;
  }, [simText, primaryFlagZero]);

  useEffect(() => {
    const canvas = previewCanvasRef.current;
    if (!canvas || !imageBitmap) return;
    const scale = 2;
    const rowHeight = 40;
    canvas.height = rowHeight * scale;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = "#12241a";

    const byCode = new Map(primaryFlagZero.map((g) => [g.code, g]));
    if (selectedGlyph) {
      byCode.set(selectedGlyph.code, {
        ...selectedGlyph,
        x0: Number(editX0 || selectedGlyph.x0),
        y0: Number(editY0 || selectedGlyph.y0),
        advance: Number(editAdvance || selectedGlyph.advance),
      });
    }

    const baselineY = rowHeight * 0.75;
    let penX = 4;
    const hits: { x0: number; x1: number; code: number }[] = [];
    const widths: number[] = [];
    for (const ch of simText) {
      const cp = ch.charCodeAt(0);
      if (cp === 0x20) { penX += 8; continue; }
      const g = byCode.get(cp);
      if (g && g.width > 0) {
        widths.push(penX);
        ctx.drawImage(
          imageBitmap,
          g.u0 * imageBitmap.width, g.v1 * imageBitmap.height, g.width, g.height,
          penX + g.x0, baselineY - g.y0, g.width, g.height
        );
        hits.push({ x0: penX, x1: penX + g.advance, code: cp });
        penX += g.advance;
      } else {
        const w = 14, h = 20;
        ctx.strokeStyle = "rgba(255,60,60,0.9)";
        ctx.lineWidth = 1;
        ctx.strokeRect(penX, baselineY - h, w, h);
        hits.push({ x0: penX, x1: penX + w + 2, code: cp });
        penX += w + 2;
      }
    }
    canvas.width = Math.max(penX + 4, 100);
    // Redraw after resize (canvas resizing clears content).
    ctx.imageSmoothingEnabled = false;
    penX = 4;
    for (const ch of simText) {
      const cp = ch.charCodeAt(0);
      if (cp === 0x20) { penX += 8; continue; }
      const g = byCode.get(cp);
      if (g && g.width > 0) {
        ctx.drawImage(
          imageBitmap,
          g.u0 * imageBitmap.width, g.v1 * imageBitmap.height, g.width, g.height,
          penX + g.x0, baselineY - g.y0, g.width, g.height
        );
        penX += g.advance;
      } else {
        const w = 14, h = 20;
        ctx.strokeStyle = "rgba(255,60,60,0.9)";
        ctx.strokeRect(penX, baselineY - h, w, h);
        penX += w + 2;
      }
    }
    previewHitsRef.current = hits;
  }, [simText, primaryFlagZero, imageBitmap, selectedGlyph, editX0, editY0, editAdvance]);

  const handlePreviewClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = previewCanvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const px = (e.clientX - rect.left) * scaleX;
    const hit = previewHitsRef.current.find((h) => px >= h.x0 && px <= h.x1);
    if (hit) selectPair(hit.code);
  }, [selectPair]);

  return (
    <div className="min-h-screen bg-background text-foreground" dir="rtl">
      <div className="mx-auto max-w-5xl px-4 py-10">
        <div className="mb-8 flex items-center justify-between">
          <h1 className="text-2xl font-bold">أداة خطوط Metroid Prime Remastered</h1>
          <Link to="/" className="text-sm text-muted-foreground hover:underline">
            الرئيسية <ArrowRight className="inline h-4 w-4" />
          </Link>
        </div>

        <label
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files[0]; if (f) void loadPak(f); }}
          className={`flex cursor-pointer flex-col items-center gap-3 rounded-xl border-2 border-dashed p-12 transition ${dragOver ? "border-primary bg-primary/5" : "border-muted"}`}
        >
          {busy ? <Loader2 className="h-10 w-10 animate-spin" /> : <Upload className="h-10 w-10 text-muted-foreground" />}
          <span className="text-lg font-medium">افتح ملف .pak (مثل GuiSysMP1.pak)</span>
          <span className="text-sm text-muted-foreground">استخراج وعرض الخطوط، ثم إدراج وتحرير حروف عربية حقيقية</span>
          <input type="file" accept=".pak" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void loadPak(f); }} />
        </label>

        {fonts.length > 0 && (
          <div className="mt-6 flex flex-wrap items-center gap-2">
            <span className="text-sm text-muted-foreground">اختر خطاً للتعديل عليه:</span>
            {fonts.map((f, i) => (
              <button
                key={`${f.id}-${i}`}
                onClick={() => void selectFont(f.id)}
                className={`rounded-full border px-3 py-1 text-xs ${selectedFontId === f.id ? "bg-primary/20 border-primary" : "hover:bg-muted"}`}
              >
                {f.names.length > 0 ? f.names.join(", ") : f.id}
              </button>
            ))}
          </div>
        )}

        {textures.length > 0 && (
          <div className="mt-4 grid grid-cols-1 gap-6 md:grid-cols-3">
            <div className="md:col-span-1 max-h-[70vh] overflow-y-auto rounded-lg border">
              {sortedTextures.map((a, i) => {
                const isPrimary = a.id === primaryPageId;
                return (
                  <button
                    key={`${a.id}-${i}`}
                    onClick={() => void selectTexture(a.id)}
                    className={`block w-full border-b px-3 py-2 text-right text-sm hover:bg-muted ${
                      isPrimary ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-500 font-bold" : ""
                    } ${selectedId === a.id ? "bg-primary/10 font-medium" : ""}`}
                  >
                    {isPrimary && "⭐ الصفحة الأساسية (أضف الحروف العربية هنا) — "}
                    {a.names.length > 0 ? a.names.join(", ") : a.id}
                  </button>
                );
              })}
            </div>
            <div className="md:col-span-2 flex flex-col gap-3">
              <div className="flex min-h-[300px] items-center justify-center overflow-auto rounded-lg border bg-muted/20 p-4">
                {decoding ? (
                  <Loader2 className="h-8 w-8 animate-spin" />
                ) : imageBitmap ? (
                  <canvas ref={canvasRef} onClick={handleCanvasClick} className="max-h-[65vh] max-w-full cursor-crosshair" style={{ imageRendering: "pixelated" }} />
                ) : (
                  <span className="text-sm text-muted-foreground">اختر نسيجاً من القائمة لعرضه (اختر الصفحة الأساسية الصغيرة لخط الحروف)</span>
                )}
              </div>
              {imageBitmap && (
                <label className="flex items-center gap-2 text-xs text-muted-foreground">
                  <input type="checkbox" checked={showGrid} onChange={(e) => setShowGrid(e.target.checked)} />
                  إظهار مربعات كل الحروف (الوردي) — انقر لاختيار حرف، المختار بإطار سماوي
                </label>
              )}
            </div>
          </div>
        )}

        {glyphs && selectedFontId && (
          <div className="mt-6 flex flex-col gap-3 rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-4">
            <div className="grid grid-cols-2 gap-3 text-center md:grid-cols-4">
              <div><div className="text-xs text-muted-foreground">إجمالي الحروف</div><div className="font-mono text-lg">{glyphs.length}</div></div>
              <div><div className="text-xs text-muted-foreground">الصفحة الأساسية</div><div className="font-mono text-lg">{primaryFlagZero.length}</div></div>
              <div><div className="text-xs text-muted-foreground">أبعاد النسيج</div><div className="font-mono text-lg">{imageBitmap ? `${imageBitmap.width}×${imageBitmap.height}` : "—"}</div></div>
              <div><div className="text-xs text-muted-foreground">حالة التعديل</div><div className="font-mono text-lg">{hasEdits ? "مُعدَّل" : "أصلي"}</div></div>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <button onClick={() => void handleRoundTripTest()} className="rounded-lg border px-3 py-1.5 text-sm hover:bg-muted">اختبار Round-trip</button>
              <button onClick={() => void handleRunAudit()} disabled={auditBusy} className="rounded-lg border px-3 py-1.5 text-sm hover:bg-muted disabled:opacity-50">
                {auditBusy ? "جارٍ الفحص..." : "فحص شامل (بنية + بكسلات)"}
              </button>
              {hasEdits && (
                <button onClick={handleDownload} className="flex items-center gap-1.5 rounded-lg border border-primary/40 bg-primary/10 px-3 py-1.5 text-sm hover:bg-primary/20">
                  <Download className="h-4 w-4" /> تنزيل .pak الحالي
                </button>
              )}
              <button onClick={() => void handleExportImageAndCoords()} className="flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm hover:bg-muted">
                <Download className="h-4 w-4" /> تصدير صورة الخط + الإحداثيات (ZIP)
              </button>
            </div>
            {roundTrip && (
              <div className={`flex items-center gap-2 rounded border p-2 text-sm ${roundTrip.ok ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-500" : "border-destructive/40 bg-destructive/10 text-destructive"}`}>
                {roundTrip.ok ? <CheckCircle2 className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
                {roundTrip.message}
              </div>
            )}
          </div>
        )}

        {auditReport && (
          <div className={`mt-4 rounded-lg border p-4 ${auditReport.errorCount > 0 ? "border-destructive/40 bg-destructive/5" : auditReport.warningCount > 0 ? "border-amber-500/40 bg-amber-500/5" : "border-emerald-500/40 bg-emerald-500/5"}`}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2 font-bold">
                {auditReport.errorCount > 0 ? <XCircle className="h-5 w-5 text-destructive" /> : <CheckCircle2 className="h-5 w-5 text-emerald-500" />}
                سجل الفحص: {auditReport.errorCount} خطأ، {auditReport.warningCount} تحذير
              </div>
              <div className="flex gap-2">
                <button onClick={handleDownloadAuditReport} className="rounded border px-2 py-1 text-xs hover:bg-muted">تقرير نصي</button>
                <button onClick={handleDownloadDiagnosticJson} className="rounded border px-2 py-1 text-xs hover:bg-muted">JSON تشخيصي (للإرسال للمطوّر)</button>
              </div>
            </div>
            {auditReport.headerIssues.length > 0 && (
              <ul className="mt-2 space-y-1 text-sm">
                {auditReport.headerIssues.map((i, idx) => (
                  <li key={idx} className={i.severity === "error" ? "text-destructive" : "text-amber-500"}>[{i.severity === "error" ? "خطأ" : "تحذير"}] {i.message}</li>
                ))}
              </ul>
            )}
            {auditReport.glyphs.some((g) => g.issues.length > 0) && (
              <div className="mt-2 max-h-40 overflow-y-auto text-xs">
                {auditReport.glyphs.filter((g) => g.issues.length > 0).map((g, idx) => (
                  <div key={idx} className="border-t py-1 first:border-t-0">
                    <span className="font-mono">{g.charLabel} (U+{g.code.toString(16).toUpperCase().padStart(4, "0")})</span>{" "}
                    {g.issues.map((i, j) => <span key={j} className={i.severity === "error" ? "text-destructive" : "text-amber-500"}>[{i.message}] </span>)}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {selectedFontId && (
          <div className="mt-6 rounded-lg border">
            <button onClick={() => setShowFontLibrary((s) => !s)} className="flex w-full items-center justify-between px-4 py-3 text-sm font-bold hover:bg-muted">
              مكتبة الخطوط العربية المجانية
              <span className="text-xs text-muted-foreground">{showFontLibrary ? "إخفاء المكتبة" : "عرض المكتبة"}</span>
            </button>
            {showFontLibrary && (
              <div className="divide-y border-t">
                {FREE_ARABIC_FONTS.map((entry) => (
                  <FontLibraryRow
                    key={entry.id}
                    entry={entry}
                    onUse={async (e, role) => {
                      await loadFontBytesFor(e.id);
                      if (role === "main") { setFontEntryId(e.id); setCustomMainFont(null); toast.success(`${e.name} هو الخط الأساسي الآن`); }
                      else { setAltFontEntryId(e.id); setCustomAltFont(null); toast.success(`${e.name} هو الخط البديل الآن`); }
                    }}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {selectedId && selectedFontId && (
          <div className="mt-6 flex flex-col gap-3 rounded-lg border p-4">
            <h2 className="text-sm font-bold">توليد ودمج حروف عربية في هذا الخط</h2>
            <p className="text-xs text-muted-foreground">
              الخطوات: (١) اختر خطاً عربياً — من المكتبة أدناه أو ارفع ملف TTF/OTF من جهازك — (٢) اكتب نصاً عربياً واضغط "معاينة الحروف" — (٣) سيظهر بعدها زر "دمج هذه الحروف بالخط".
            </p>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs text-muted-foreground">خط الرسم الأساسي</label>
              <div className="flex flex-wrap items-center gap-2">
                <select
                  value={fontEntryId}
                  onChange={(e) => { setFontEntryId(e.target.value); setCustomMainFont(null); }}
                  className="rounded border bg-background px-2 py-1.5 text-sm"
                  disabled={!!customMainFont}
                >
                  {FREE_ARABIC_FONTS.map((f) => <option key={f.id} value={f.id}>{f.name} — {f.style}</option>)}
                </select>
                <span className="text-xs text-muted-foreground">أو</span>
                <label className="flex cursor-pointer items-center gap-1.5 rounded border border-dashed px-3 py-1.5 text-xs hover:bg-muted">
                  <Upload className="h-3.5 w-3.5" />
                  {customMainFont ? customMainFont.name : "ارفع خط TTF/OTF من جهازك"}
                  <input type="file" accept=".ttf,.otf" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void handleMainFontUpload(f); }} />
                </label>
                {customMainFont && (
                  <button onClick={() => setCustomMainFont(null)} className="text-xs text-muted-foreground underline hover:text-foreground">إزالة (عودة للمكتبة)</button>
                )}
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs text-muted-foreground">النص العربي</label>
              <input type="text" dir="rtl" value={inputText} onChange={(e) => setInputText(e.target.value)} placeholder="اكتب نصاً عربياً هنا..." className="rounded border bg-background px-2 py-1.5 text-sm" />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs text-muted-foreground">حجم الرسم: {fontSizePx}px</label>
              <input type="range" min={16} max={64} value={fontSizePx} onChange={(e) => setFontSizePx(Number(e.target.value))} />
            </div>
            <div className="flex flex-wrap items-center gap-2 rounded border border-dashed p-2">
              <span className="text-xs text-muted-foreground">
                خط بديل (اختياري): {customAltFont ? customAltFont.name : altFontEntryId ? FREE_ARABIC_FONTS.find((f) => f.id === altFontEntryId)?.name : "—"}
              </span>
              <label className="flex cursor-pointer items-center gap-1.5 rounded border border-dashed px-2 py-1 text-xs hover:bg-muted">
                <Upload className="h-3.5 w-3.5" /> ارفع خطاً بديلاً
                <input type="file" accept=".ttf,.otf" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void handleAltFontUpload(f); }} />
              </label>
              <input type="text" dir="rtl" value={altLetters} onChange={(e) => setAltLetters(e.target.value)} placeholder="حروف من البديل مثل: ع غ" className="flex-1 rounded border bg-background px-2 py-1 text-sm" />
              {altOverride && <span className="text-xs text-emerald-500">سيُؤخذ {altOverride.codepoints.size} شكلاً من البديل</span>}
            </div>
            <button onClick={() => void handlePreview()} disabled={rendering || !inputText.trim()} className="self-start rounded-lg border px-4 py-2 text-sm font-medium hover:bg-muted disabled:opacity-50">
              {rendering ? "جارٍ الرسم..." : "معاينة الحروف"}
            </button>
            {previewGlyphs && existingCodes && (
              <div className="flex flex-col gap-3 border-t pt-3">
                <div className="flex flex-wrap gap-2">
                  {previewGlyphs.map((g, i) => <GlyphThumb key={`${g.code}-${i}`} glyph={g} skipped={existingCodes.has(g.code)} />)}
                </div>
                <p className="text-xs text-muted-foreground">الحروف المظللة بالبرتقالي موجودة مسبقاً ولن تُضاف مجدداً.</p>
                <button onClick={() => void handleMerge()} disabled={building} className="self-start rounded-lg border border-primary/40 bg-primary/10 px-4 py-2 text-sm font-medium hover:bg-primary/20 disabled:opacity-50">
                  {building ? "جارٍ الدمج..." : "✅ دمج هذه الحروف بالخط (تركيب اللغة العربية)"}
                </button>
              </div>
            )}
          </div>
        )}

        {selectedFontId && (
          <div className="mt-6 flex flex-col gap-2 rounded-lg border p-4">
            <h2 className="text-sm font-bold">إضافة حرف جديد (ربط ذكي بسجل موجود)</h2>
            <p className="text-xs text-muted-foreground">اكتب الحرف الجديد نفسه أو رمزه الست عشري (مثل FE8E)، ورمز حرف موجود سيُستخدم رسمه الجديد — بدون أي تغيير في الأطلس.</p>
            <div className="flex flex-wrap items-center gap-2">
              <input value={aliasCharInput} onChange={(e) => setAliasCharInput(e.target.value)} placeholder="الحرف أو FE8E" className="w-32 rounded border bg-background px-2 py-1.5 text-sm" dir="ltr" />
              <input value={aliasSourceInput} onChange={(e) => setAliasSourceInput(e.target.value)} placeholder="المصدر (مثل A أو 41)" className="w-32 rounded border bg-background px-2 py-1.5 text-sm" dir="ltr" />
              <button onClick={() => void handleAddAlias()} disabled={aliasBusy} className="rounded-lg border px-4 py-1.5 text-sm hover:bg-muted disabled:opacity-50">إضافة الربط</button>
            </div>
            {aliasStatus && (
              <div className={`flex items-center gap-2 text-sm ${aliasStatus.ok ? "text-emerald-500" : "text-destructive"}`}>
                {aliasStatus.ok ? <CheckCircle2 className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
                {aliasStatus.message}
              </div>
            )}
          </div>
        )}

        {imageBitmap && primaryFlagZero.length > 0 && (
          <div className="mt-6 rounded-lg border p-4">
            <h2 className="mb-1 text-sm font-bold">محاكي معاينة — كما سيرسمها المحرك حرفياً</h2>
            <p className="mb-2 text-xs text-muted-foreground">يُرسم من نفس بيانات الأطلس والإحداثيات الحقيقية. مربع أحمر = حرف غير موجود بعد. انقر على حرف بالمعاينة لتحديده أدناه.</p>
            <input type="text" dir="rtl" value={simText} onChange={(e) => setSimText(e.target.value)} className="mb-2 w-full rounded border bg-background px-2 py-1.5 text-sm" />
            <div className="overflow-x-auto rounded border bg-[#12241a] p-2">
              <canvas ref={previewCanvasRef} onClick={handlePreviewClick} style={{ imageRendering: "pixelated", cursor: "pointer" }} />
            </div>
            {missingInSim.length > 0 && (
              <p className="mt-2 text-xs text-destructive">
                حروف غير موجودة: {missingInSim.map((cp) => `${charLabel(cp)} (U+${cp.toString(16).toUpperCase().padStart(4, "0")})`).join("، ")}
              </p>
            )}
          </div>
        )}

        {selectedGlyph && (
          <div className="mt-6 rounded-lg border p-4">
            <h2 className="mb-2 text-sm font-bold">تحرير الحرف المحدد: {charLabel(selectedGlyph.code)} (U+{selectedGlyph.code.toString(16).toUpperCase().padStart(4, "0")})</h2>
            <div className="grid grid-cols-3 gap-2">
              <div><label className="text-xs text-muted-foreground">x0 (بروز أيسر)</label><input dir="ltr" value={editX0} onChange={(e) => setEditX0(e.target.value)} className="w-full rounded border bg-background px-2 py-1 text-sm" /></div>
              <div><label className="text-xs text-muted-foreground">y0 (ارتفاع فوق الأساس)</label><input dir="ltr" value={editY0} onChange={(e) => setEditY0(e.target.value)} className="w-full rounded border bg-background px-2 py-1 text-sm" /></div>
              <div><label className="text-xs text-muted-foreground">advance (التباعد)</label><input dir="ltr" value={editAdvance} onChange={(e) => setEditAdvance(e.target.value)} className="w-full rounded border bg-background px-2 py-1 text-sm" /></div>
            </div>
            <div className="mt-2 flex items-center gap-1">
              <span className="text-xs text-muted-foreground ml-2">تحريك بالبكسل:</span>
              <button onClick={() => nudgeSelected(-1, 0)} className="h-6 w-6 rounded border text-xs hover:bg-muted">◀</button>
              <button onClick={() => nudgeSelected(0, -1)} className="h-6 w-6 rounded border text-xs hover:bg-muted">▲</button>
              <button onClick={() => nudgeSelected(0, 1)} className="h-6 w-6 rounded border text-xs hover:bg-muted">▼</button>
              <button onClick={() => nudgeSelected(1, 0)} className="h-6 w-6 rounded border text-xs hover:bg-muted">▶</button>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <button onClick={() => void handleApplyFieldEdit()} disabled={editBusy} className="rounded-lg border border-primary/40 bg-primary/10 px-3 py-1.5 text-sm hover:bg-primary/20 disabled:opacity-50">تطبيق تعديل الحقول</button>
              <input value={remapSourceInput} onChange={(e) => setRemapSourceInput(e.target.value)} placeholder="أعد الربط لحرف آخر" className="w-32 rounded border bg-background px-2 py-1.5 text-sm" dir="ltr" />
              <button onClick={() => void handleRemap()} disabled={editBusy} className="rounded-lg border px-3 py-1.5 text-sm hover:bg-muted disabled:opacity-50">إعادة ربط</button>
              <button onClick={() => void handleDeleteSelected()} disabled={editBusy} className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-1.5 text-sm text-destructive hover:bg-destructive/20 disabled:opacity-50">حذف هذا الحرف</button>
            </div>
            {editStatus && (
              <div className={`mt-2 flex items-center gap-2 text-sm ${editStatus.ok ? "text-emerald-500" : "text-destructive"}`}>
                {editStatus.ok ? <CheckCircle2 className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
                {editStatus.message}
              </div>
            )}
          </div>
        )}

        {primaryFlagZero.length > 0 && (
          <div className="mt-6 rounded-lg border p-4">
            <h2 className="mb-2 text-sm font-bold">جدول الحروف ({primaryFlagZero.length}) — انقر صفاً لاختياره</h2>
            <div ref={tableWrapRef} className="max-h-64 overflow-y-auto overflow-x-auto rounded border">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-card">
                  <tr className="border-b text-right">
                    <th className="px-2 py-1.5">الحرف</th>
                    <th className="px-2 py-1.5">الرمز</th>
                    <th className="px-2 py-1.5" dir="ltr">الصندوق (x0,y0,w,h)</th>
                    <th className="px-2 py-1.5">التباعد</th>
                  </tr>
                </thead>
                <tbody>
                  {primaryFlagZero.map((g, i) => (
                    <tr
                      key={`${g.code}-${i}`}
                      data-code={g.code}
                      onClick={() => selectPair(g.code)}
                      className={`cursor-pointer border-b last:border-b-0 hover:bg-primary/10 ${selectedCode === g.code ? "bg-primary/20" : ""}`}
                    >
                      <td className="px-2 py-1 font-mono">{charLabel(g.code)}</td>
                      <td className="px-2 py-1 font-mono" dir="ltr">U+{g.code.toString(16).toUpperCase().padStart(4, "0")}</td>
                      <td className="px-2 py-1 font-mono" dir="ltr">[{g.x0.toFixed(0)},{g.y0.toFixed(0)}]-{g.width.toFixed(0)}×{g.height.toFixed(0)}</td>
                      <td className="px-2 py-1 font-mono">{g.advance.toFixed(0)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
