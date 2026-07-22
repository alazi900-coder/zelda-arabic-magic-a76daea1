import { useState, useCallback } from "react";
import { Link } from "react-router-dom";
import { Upload, Loader2, ArrowRight } from "lucide-react";
import { toast } from "sonner";
import { listPakAssets, decodeTextureToPng, type MetroidPrimeAssetInfo } from "@/lib/metroid-prime/mp-wasm";

/**
 * Read-only viewer for Metroid Prime Remastered .pak files: lists every
 * texture (TXTR) asset and renders the selected one on a canvas. First
 * step toward a font-editing tool (mirroring /risen2/fonts) — no editing
 * yet, just extraction + display, to validate the WASM decode pipeline
 * (retrolib compiled to WebAssembly) against real game files.
 */
export default function MetroidPrimeFont() {
  const [busy, setBusy] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [pakBytes, setPakBytes] = useState<Uint8Array | null>(null);
  const [assets, setAssets] = useState<MetroidPrimeAssetInfo[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [decoding, setDecoding] = useState(false);

  const loadPak = useCallback(async (file: File) => {
    setBusy(true);
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const list = await listPakAssets(bytes);
      const textures = list.filter((a) => a.kind === "TXTR");
      if (textures.length === 0) {
        throw new Error("لم يُعثر على أي نسيج (TXTR) في هذا الملف");
      }
      setPakBytes(bytes);
      setAssets(textures);
      setSelectedId(null);
      setImageUrl(null);
      toast.success(`تم العثور على ${textures.length} نسيجاً من أصل ${list.length} أصلاً`);
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
      setImageUrl(null);
      try {
        const png = await decodeTextureToPng(pakBytes, id);
        const blob = new Blob([png as unknown as BlobPart], { type: "image/png" });
        setImageUrl(URL.createObjectURL(blob));
      } catch (e) {
        toast.error((e as Error).message);
      } finally {
        setDecoding(false);
      }
    },
    [pakBytes]
  );

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

        {assets.length > 0 && (
          <div className="mt-8 grid grid-cols-1 gap-6 md:grid-cols-3">
            <div className="md:col-span-1 max-h-[70vh] overflow-y-auto rounded-lg border">
              {assets.map((a) => (
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
            <div className="md:col-span-2 flex min-h-[300px] items-center justify-center rounded-lg border bg-muted/20 p-4">
              {decoding ? (
                <Loader2 className="h-8 w-8 animate-spin" />
              ) : imageUrl ? (
                <img src={imageUrl} alt={selectedId ?? ""} className="max-h-[65vh] max-w-full" style={{ imageRendering: "pixelated" }} />
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
