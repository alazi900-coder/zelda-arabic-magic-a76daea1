import { useState, useCallback, useRef, useEffect } from "react";
import { Link } from "react-router-dom";
import { Upload, Loader2, ArrowRight } from "lucide-react";
import { toast } from "sonner";
import {
  listPakAssets,
  decodeTextureToPng,
  listGlyphs,
  buildFontGlyphs,
  type MetroidPrimeAssetInfo,
  type MetroidPrimeGlyph,
} from "@/lib/metroid-prime/mp-wasm";
import { renderArabicGlyphsForMp, type RenderedMpGlyph } from "@/lib/metroid-prime/mp-arabic-font-gen";
import { FREE_ARABIC_FONTS, fetchFreeFontBytes } from "@/lib/risen2-free-fonts";

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
        <canvas
          ref={canvasRef}
          style={{ imageRendering: "pixelated", width: glyph.width * 2, height: glyph.height * 2 }}
        />
      ) : (
        <div className="flex h-8 w-8 items-center justify-center text-[10px] text-muted-foreground">فراغ</div>
      )}
      <span className="text-[10px] text-muted-foreground" dir="ltr">
        U+{glyph.code.toString(16).toUpperCase().padStart(4, "0")}
      </span>
      {skipped && <span className="text-[9px] text-amber-500">موجود مسبقاً</span>}
    </div>
  );
}

/**
 * Metroid Prime Remastered font tool: extracts and displays every texture
 * (TXTR) and FONT asset in a .pak file, and lets you rasterize real Arabic
 * text (via Canvas 2D + the project's Arabic shaping) and insert the
 * resulting glyphs into a FONT asset's atlas — see mp-wasm/src/lib.rs for
 * the reverse-engineered format (no official spec exists) and
 * mp-arabic-font-gen.ts for the rasterization.
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
  const [glyphs, setGlyphs] = useState<MetroidPrimeGlyph[] | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Free-form Arabic glyph editor state.
  const [fontEntryId, setFontEntryId] = useState(FREE_ARABIC_FONTS[0].id);
  const [inputText, setInputText] = useState("");
  const [fontSizePx, setFontSizePx] = useState(32);
  const [rendering, setRendering] = useState(false);
  const [previewGlyphs, setPreviewGlyphs] = useState<RenderedMpGlyph[] | null>(null);
  const [existingCodes, setExistingCodes] = useState<Set<number> | null>(null);
  const [building, setBuilding] = useState(false);
  const fontBytesCache = useRef<Map<string, ArrayBuffer>>(new Map());

  const loadPak = useCallback(async (file: File) => {
    setBusy(true);
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const list = await listPakAssets(bytes);
      const textureList = list.filter((a) => a.kind === "TXTR");
      const fontList = list.filter((a) => a.kind === "FONT");
      if (textureList.length === 0) {
        throw new Error("لم يُعثر على أي نسيج (TXTR) في هذا الملف");
      }
      setPakBytes(bytes);
      setTextures(textureList);
      setFonts(fontList);
      setSelectedId(null);
      setImageBitmap(null);
      setSelectedFontId(null);
      setGlyphs(null);
      setPreviewGlyphs(null);
      setExistingCodes(null);
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

  const toggleGlyphOverlay = useCallback(
    async (fontId: string) => {
      if (!pakBytes) return;
      if (selectedFontId === fontId) {
        setSelectedFontId(null);
        setGlyphs(null);
        return;
      }
      try {
        const g = await listGlyphs(pakBytes, fontId);
        setSelectedFontId(fontId);
        setGlyphs(g);
        toast.success(`${g.length} حرفاً في هذا الخط`);
      } catch (e) {
        toast.error((e as Error).message);
      }
    },
    [pakBytes, selectedFontId]
  );

  const handlePreview = useCallback(async () => {
    if (!inputText.trim()) {
      toast.error("اكتب نصاً عربياً أولاً");
      return;
    }
    if (!pakBytes || !selectedFontId) {
      toast.error("اختر خطاً من القائمة أعلاه أولاً");
      return;
    }
    setRendering(true);
    try {
      const entry = FREE_ARABIC_FONTS.find((f) => f.id === fontEntryId)!;
      let bytes = fontBytesCache.current.get(entry.id);
      if (!bytes) {
        bytes = await fetchFreeFontBytes(entry);
        fontBytesCache.current.set(entry.id, bytes);
      }
      const [{ glyphs: rendered }, existing] = await Promise.all([
        renderArabicGlyphsForMp(bytes, inputText, fontSizePx),
        listGlyphs(pakBytes, selectedFontId),
      ]);
      setPreviewGlyphs(rendered);
      setExistingCodes(new Set(existing.map((g) => g.code)));
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setRendering(false);
    }
  }, [inputText, fontEntryId, fontSizePx, pakBytes, selectedFontId]);

  const handleBuild = useCallback(async () => {
    if (!pakBytes || !selectedId || !selectedFontId || !previewGlyphs || !existingCodes) return;
    const toAdd = previewGlyphs.filter((g) => !existingCodes.has(g.code));
    if (toAdd.length === 0) {
      toast.error("كل الحروف المعروضة موجودة مسبقاً في هذا الخط");
      return;
    }
    setBuilding(true);
    try {
      const rebuilt = await buildFontGlyphs(pakBytes, selectedId, selectedFontId, toAdd);
      const blob = new Blob([rebuilt as unknown as BlobPart], { type: "application/octet-stream" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "GuiSysMP1_arabic.pak";
      a.click();
      URL.revokeObjectURL(url);
      const skipped = previewGlyphs.length - toAdd.length;
      toast.success(
        `تم إدراج ${toAdd.length} حرفاً${skipped > 0 ? ` (تخطّي ${skipped} موجود مسبقاً)` : ""} — تحقّق منها بإعادة رفعها هنا`
      );
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBuilding(false);
    }
  }, [pakBytes, selectedId, selectedFontId, previewGlyphs, existingCodes]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !imageBitmap) return;
    canvas.width = imageBitmap.width;
    canvas.height = imageBitmap.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(imageBitmap, 0, 0);

    if (glyphs) {
      ctx.strokeStyle = "rgba(0, 255, 128, 0.8)";
      ctx.lineWidth = 1;
      for (const g of glyphs) {
        if (g.width <= 0 || g.height <= 0) continue;
        const x = g.u0 * imageBitmap.width;
        const y = g.v1 * imageBitmap.height;
        const w = (g.u1 - g.u0) * imageBitmap.width;
        const h = (g.v0 - g.v1) * imageBitmap.height;
        if (w <= 0 || h <= 0 || w > imageBitmap.width || h > imageBitmap.height) continue;
        ctx.strokeRect(x, y, w, h);
      }
    }
  }, [imageBitmap, glyphs]);

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
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            const f = e.dataTransfer.files[0];
            if (f) void loadPak(f);
          }}
          className={`flex cursor-pointer flex-col items-center gap-3 rounded-xl border-2 border-dashed p-12 transition ${
            dragOver ? "border-primary bg-primary/5" : "border-muted"
          }`}
        >
          {busy ? <Loader2 className="h-10 w-10 animate-spin" /> : <Upload className="h-10 w-10 text-muted-foreground" />}
          <span className="text-lg font-medium">افتح ملف .pak (مثل GuiSysMP1.pak)</span>
          <span className="text-sm text-muted-foreground">استخراج وعرض الخطوط، ثم إدراج حروف عربية حقيقية</span>
          <input
            type="file"
            accept=".pak"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void loadPak(f);
            }}
          />
        </label>

        {fonts.length > 0 && (
          <div className="mt-6 flex flex-wrap items-center gap-2">
            <span className="text-sm text-muted-foreground">اختر خطاً للتعديل عليه (يعرض أيضاً مربعات حروفه فوق النسيج):</span>
            {fonts.map((f, i) => (
              <button
                key={`${f.id}-${i}`}
                onClick={() => void toggleGlyphOverlay(f.id)}
                className={`rounded-full border px-3 py-1 text-xs ${
                  selectedFontId === f.id ? "bg-primary/20 border-primary" : "hover:bg-muted"
                }`}
              >
                {f.names.length > 0 ? f.names.join(", ") : f.id}
              </button>
            ))}
          </div>
        )}

        {textures.length > 0 && (
          <div className="mt-4 grid grid-cols-1 gap-6 md:grid-cols-3">
            <div className="md:col-span-1 max-h-[70vh] overflow-y-auto rounded-lg border">
              {textures.map((a, i) => (
                <button
                  key={`${a.id}-${i}`}
                  onClick={() => void selectTexture(a.id)}
                  className={`block w-full border-b px-3 py-2 text-right text-sm hover:bg-muted ${
                    selectedId === a.id ? "bg-primary/10 font-medium" : ""
                  }`}
                >
                  {a.names.length > 0 ? a.names.join(", ") : a.id}
                </button>
              ))}
            </div>
            <div className="md:col-span-2 flex flex-col gap-3">
              <div className="flex min-h-[300px] items-center justify-center overflow-auto rounded-lg border bg-muted/20 p-4">
                {decoding ? (
                  <Loader2 className="h-8 w-8 animate-spin" />
                ) : imageBitmap ? (
                  <canvas ref={canvasRef} className="max-h-[65vh] max-w-full" style={{ imageRendering: "pixelated" }} />
                ) : (
                  <span className="text-sm text-muted-foreground">اختر نسيجاً من القائمة لعرضه</span>
                )}
              </div>

              {selectedId && selectedFontId && (
                <div className="flex flex-col gap-3 rounded-lg border p-4">
                  <h2 className="text-sm font-bold">إضافة حروف عربية إلى هذا الخط</h2>

                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs text-muted-foreground">خط الرسم (يُستخدم لرسم أشكال الحروف)</label>
                    <select
                      value={fontEntryId}
                      onChange={(e) => setFontEntryId(e.target.value)}
                      className="rounded border bg-background px-2 py-1.5 text-sm"
                    >
                      {FREE_ARABIC_FONTS.map((f) => (
                        <option key={f.id} value={f.id}>
                          {f.name} — {f.style}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs text-muted-foreground">النص العربي</label>
                    <input
                      type="text"
                      dir="rtl"
                      value={inputText}
                      onChange={(e) => setInputText(e.target.value)}
                      placeholder="اكتب نصاً عربياً هنا..."
                      className="rounded border bg-background px-2 py-1.5 text-sm"
                    />
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs text-muted-foreground">حجم الرسم: {fontSizePx}px</label>
                    <input
                      type="range"
                      min={16}
                      max={64}
                      value={fontSizePx}
                      onChange={(e) => setFontSizePx(Number(e.target.value))}
                    />
                  </div>

                  <button
                    onClick={() => void handlePreview()}
                    disabled={rendering}
                    className="self-start rounded-lg border px-4 py-2 text-sm font-medium hover:bg-muted disabled:opacity-50"
                  >
                    {rendering ? "جارٍ الرسم..." : "معاينة الحروف"}
                  </button>

                  {previewGlyphs && existingCodes && (
                    <div className="flex flex-col gap-3 border-t pt-3">
                      <div className="flex flex-wrap gap-2">
                        {previewGlyphs.map((g, i) => (
                          <GlyphThumb key={`${g.code}-${i}`} glyph={g} skipped={existingCodes.has(g.code)} />
                        ))}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        الحروف المظللة بالبرتقالي موجودة مسبقاً في هذا الخط ولن تُضاف مجدداً.
                      </p>
                      <button
                        onClick={() => void handleBuild()}
                        disabled={building}
                        className="self-start rounded-lg border border-primary/40 bg-primary/10 px-4 py-2 text-sm font-medium hover:bg-primary/20 disabled:opacity-50"
                      >
                        {building ? "جارٍ البناء..." : "بناء وتنزيل .pak معدَّل"}
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
