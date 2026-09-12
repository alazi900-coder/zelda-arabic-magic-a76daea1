import { useCallback, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Upload, Loader2, ArrowRight, Download, Image as ImageIcon } from "lucide-react";
import { toast } from "sonner";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { patchTitleLogoArchive, LOGO_WIDTH, LOGO_HEIGHT } from "@/lib/mm3d/pipeline";

/**
 * Majora's Mask 3D title-logo importer: the "ZELDA" wordmark there isn't a
 * flat texture (unlike Phantom Hourglass) — it's real carved 3D geometry,
 * confirmed this session by decoding real triangle counts (32–100
 * triangles per letter shape) out of the extracted title_logo.cmb. So a
 * texture swap alone does nothing; this instead removes those 5 lettering
 * meshes and adds one new flat quad carrying the uploaded logo, cloned
 * from the file's own flat "© Nintendo" plane as a structural template.
 *
 * Input is the loose `zelda2_mag.gar.lzs` file (LayeredFS-extractable from
 * the ROM's RomFS, or already sitting on disk from a prior extraction) —
 * not the .3ds/.cia ROM container itself.
 */

const CHECKERBOARD_BG =
  "linear-gradient(45deg, #808080 25%, transparent 25%), linear-gradient(-45deg, #808080 25%, transparent 25%), " +
  "linear-gradient(45deg, transparent 75%, #808080 75%), linear-gradient(-45deg, transparent 75%, #808080 75%)";

function rgbaToDataUrl(data: Uint8ClampedArray, width: number, height: number): string {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d")!;
  ctx.putImageData(new ImageData(data, width, height), 0, 0);
  return canvas.toDataURL("image/png");
}

/** Fits the source image into the logo texture's size (contain, transparent
 * letterbox), then optionally treats near-black pixels as transparent. */
async function loadAndFit(file: File, blackToTransparent: boolean): Promise<Uint8ClampedArray> {
  const bitmap = await createImageBitmap(file);
  const canvas = document.createElement("canvas");
  canvas.width = LOGO_WIDTH;
  canvas.height = LOGO_HEIGHT;
  const ctx = canvas.getContext("2d")!;
  const scale = Math.min(LOGO_WIDTH / bitmap.width, LOGO_HEIGHT / bitmap.height);
  const w = bitmap.width * scale;
  const h = bitmap.height * scale;
  ctx.drawImage(bitmap, (LOGO_WIDTH - w) / 2, (LOGO_HEIGHT - h) / 2, w, h);
  const imageData = ctx.getImageData(0, 0, LOGO_WIDTH, LOGO_HEIGHT);
  if (blackToTransparent) {
    const d = imageData.data;
    for (let i = 0; i < d.length; i += 4) {
      if (d[i] < 24 && d[i + 1] < 24 && d[i + 2] < 24) d[i + 3] = 0;
    }
  }
  return imageData.data;
}

export default function MajorasMaskLogo() {
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [blackToTransparent, setBlackToTransparent] = useState(true);
  const [busy, setBusy] = useState(false);
  const [dragOver, setDragOver] = useState<"logo" | "archive" | null>(null);
  const [result, setResult] = useState<{ name: string; url: string } | null>(null);
  const archiveInputRef = useRef<HTMLInputElement>(null);

  const refreshPreview = useCallback(async (file: File, black: boolean) => {
    try {
      const fitted = await loadAndFit(file, black);
      setPreview(rgbaToDataUrl(fitted, LOGO_WIDTH, LOGO_HEIGHT));
    } catch (e) {
      toast.error((e as Error).message);
    }
  }, []);

  const onLogoFile = useCallback(
    (file: File) => {
      setLogoFile(file);
      setResult(null);
      void refreshPreview(file, blackToTransparent);
    },
    [blackToTransparent, refreshPreview]
  );

  const onToggleBlack = useCallback(
    (checked: boolean) => {
      setBlackToTransparent(checked);
      if (logoFile) void refreshPreview(logoFile, checked);
    },
    [logoFile, refreshPreview]
  );

  const onArchiveFile = useCallback(
    async (file: File) => {
      if (!logoFile) {
        toast.error("ارفع صورة الشعار أولاً");
        return;
      }
      setBusy(true);
      try {
        const archive = new Uint8Array(await file.arrayBuffer());
        const fitted = await loadAndFit(logoFile, blackToTransparent);
        const patched = patchTitleLogoArchive(archive, fitted);

        const url = URL.createObjectURL(new Blob([patched.slice().buffer as ArrayBuffer], { type: "application/octet-stream" }));
        const name = file.name.replace(/\.gar\.lzs$/i, "").replace(/\.lzs$/i, "") + "-arabic-logo.gar.lzs";
        setResult((prev) => {
          if (prev) URL.revokeObjectURL(prev.url);
          return { name, url };
        });
        toast.success("تم استبدال شعار العنوان بالعربية");
      } catch (e) {
        toast.error((e as Error).message);
      } finally {
        setBusy(false);
      }
    },
    [logoFile, blackToTransparent]
  );

  return (
    <div className="min-h-screen bg-background text-foreground" dir="rtl">
      <div className="mx-auto max-w-3xl px-4 py-10">
        <div className="mb-8 flex items-center justify-between">
          <h1 className="text-2xl font-bold">شعار عنوان Majora's Mask 3D</h1>
          <Link to="/" className="text-sm text-muted-foreground hover:underline">
            الرجوع <ArrowRight className="inline h-4 w-4" />
          </Link>
        </div>

        <p className="mb-6 text-sm text-muted-foreground">
          شعار "ZELDA" هنا مجسّم ثلاثي الأبعاد فعلي، لا نسيج مسطّح — لذلك هذه الأداة تحذف حروفه وتضيف بدلاً منها لوحة
          مسطّحة جديدة تحمل شعارك. ارفع صورة الشعار، ثم ارفع ملف <code dir="ltr">zelda2_mag.gar.lzs</code> المستخرج من
          اللعبة.
        </p>

        <label
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver("logo");
          }}
          onDragLeave={() => setDragOver(null)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(null);
            const f = e.dataTransfer.files[0];
            if (f) onLogoFile(f);
          }}
          className={`flex cursor-pointer flex-col items-center gap-3 rounded-xl border-2 border-dashed p-8 transition ${
            dragOver === "logo" ? "border-primary bg-primary/5" : "border-muted"
          }`}
        >
          {logoFile ? <ImageIcon className="h-8 w-8 text-muted-foreground" /> : <Upload className="h-8 w-8 text-muted-foreground" />}
          <span className="text-lg font-medium">{logoFile ? logoFile.name : "١. افتح صورة الشعار (PNG)"}</span>
          <input
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) onLogoFile(f);
            }}
          />
        </label>

        {preview && (
          <div className="mt-4 flex items-center gap-6">
            <div
              className="shrink-0 overflow-hidden rounded-lg border"
              style={{ backgroundImage: CHECKERBOARD_BG, backgroundSize: "16px 16px", backgroundPosition: "0 0, 0 8px, 8px -8px, -8px 0px" }}
            >
              <img src={preview} alt="معاينة الشعار بعد التحويل لمقاس اللعبة" width={256} height={128} className="block" />
            </div>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox checked={blackToTransparent} onCheckedChange={(c) => onToggleBlack(c === true)} />
              اعتبر الأسود شفافاً (خلفية الشعار)
            </label>
          </div>
        )}

        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver("archive");
          }}
          onDragLeave={() => setDragOver(null)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(null);
            const f = e.dataTransfer.files[0];
            if (f) void onArchiveFile(f);
          }}
          onClick={() => archiveInputRef.current?.click()}
          className={`mt-6 flex cursor-pointer flex-col items-center gap-3 rounded-xl border-2 border-dashed p-8 transition ${
            dragOver === "archive" ? "border-primary bg-primary/5" : "border-muted"
          } ${!logoFile ? "opacity-50" : ""}`}
        >
          {busy ? <Loader2 className="h-8 w-8 animate-spin" /> : <Upload className="h-8 w-8 text-muted-foreground" />}
          <span className="text-lg font-medium">
            ٢. افتح <span dir="ltr">zelda2_mag.gar.lzs</span>
          </span>
          <input
            ref={archiveInputRef}
            type="file"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void onArchiveFile(f);
            }}
          />
        </div>

        {result && (
          <div className="mt-6 rounded-xl border p-6">
            <p className="mb-4 text-sm text-muted-foreground">
              الأرشيف جاهز. ضعه في مكان ملف <span dir="ltr">zelda2_mag.gar.lzs</span> الأصلي عبر LayeredFS في المحاكي
              (Citra / Lime3DS)، أو في مسار RomFS المقابل.
            </p>
            <a href={result.url} download={result.name}>
              <Button size="lg" className="font-bold">
                <Download className="ml-2 h-5 w-5" />
                نزّل {result.name}
              </Button>
            </a>
          </div>
        )}

        <div className="mt-8 space-y-2 text-sm text-muted-foreground">
          <p>
            الحروف الخمسة الأصلية (وطبقة اللمعان المتحركة فوقها) تُحذف بالكامل، وتُستبدل بلوحة مسطّحة واحدة بنفس أبعاد
            النسيج الأصلي (256×128) في نفس موضع الشعار.
          </p>
          <p>
            هذه الأداة تعدّل ملف <span dir="ltr">.cmb</span> (نموذج ثلاثي الأبعاد) داخل أرشيف{" "}
            <span dir="ltr">GAR</span> مضغوط بصيغة Grezzo LZSS — وهي مخصّصة لهذا الملف تحديداً، لا محرر عام.
          </p>
        </div>
      </div>
    </div>
  );
}
