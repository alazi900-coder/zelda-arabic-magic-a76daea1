import { useState, useCallback, useRef, useEffect } from "react";
import { Link } from "react-router-dom";
import { Upload, Loader2, ArrowRight } from "lucide-react";
import { toast } from "sonner";
import {
  listPakAssets,
  decodeTextureToPng,
  listGlyphs,
  type MetroidPrimeAssetInfo,
  type MetroidPrimeGlyph,
} from "@/lib/metroid-prime/mp-wasm";

/**
 * Read-only viewer for Metroid Prime Remastered .pak files: lists every
 * texture (TXTR) asset and renders the selected one on a canvas, with an
 * optional overlay of a FONT asset's glyph boxes (reverse-engineered — see
 * mp-wasm/src/lib.rs) to visually verify the UV-rect understanding against
 * the whole glyph table at once. First step toward a font-editing tool
 * (mirroring /risen2/fonts) — no editing yet, just extraction + display.
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
          <h1 className="text-2xl font-bold">عارض خطوط Metroid Prime Remastered</h1>
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
          <span className="text-sm text-muted-foreground">مرحلة أولى للعرض فقط — بدون تعديل بعد</span>
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
            <span className="text-sm text-muted-foreground">إظهار مربعات حروف خط (فوق الصفحة الأولى للنسيج المعروض):</span>
            {fonts.map((f) => (
              <button
                key={f.id}
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
              {textures.map((a) => (
                <button
                  key={a.id}
                  onClick={() => void selectTexture(a.id)}
                  className={`block w-full border-b px-3 py-2 text-right text-sm hover:bg-muted ${
                    selectedId === a.id ? "bg-primary/10 font-medium" : ""
                  }`}
                >
                  {a.names.length > 0 ? a.names.join(", ") : a.id}
                </button>
              ))}
            </div>
            <div className="md:col-span-2 flex min-h-[300px] items-center justify-center overflow-auto rounded-lg border bg-muted/20 p-4">
              {decoding ? (
                <Loader2 className="h-8 w-8 animate-spin" />
              ) : imageBitmap ? (
                <canvas ref={canvasRef} className="max-h-[65vh] max-w-full" style={{ imageRendering: "pixelated" }} />
              ) : (
                <span className="text-sm text-muted-foreground">اختر نسيجاً من القائمة لعرضه</span>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
