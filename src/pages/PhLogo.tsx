import { useCallback, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Upload, Loader2, ArrowRight, Download, Image as ImageIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { findNdsFile, looksLikeNdsRom, writeNdsFile } from "@/lib/nds/nds-rom";
import {
  buildTitleBin,
  encodeTitleTexture,
  TITLE_TEXTURE_HEIGHT,
  TITLE_TEXTURE_WIDTH,
  type RgbaImage,
} from "@/lib/ph/ph-title-texture";

/**
 * Phantom Hourglass title-logo importer: takes a PNG the user designed
 * (any size) and a copy of the game's .nds ROM, and hands back a ROM with
 * that image baked into the title screen's 3D texture in the game's own
 * format — LZ10-compressed NARC, 256×128, ≤255-color indexed palette.
 *
 * No art is generated here. Redrawing "The Legend of Zelda" in Arabic in
 * the original's carved-wood style is a design task, not a data-conversion
 * one; this page only removes the format as an obstacle once that art
 * exists.
 */

const TITLE_TEXTURE_PATH = "English/Menu/Tex2D/title.bin";

const CHECKERBOARD_BG =
  "linear-gradient(45deg, #808080 25%, transparent 25%), linear-gradient(-45deg, #808080 25%, transparent 25%), " +
  "linear-gradient(45deg, transparent 75%, #808080 75%), linear-gradient(-45deg, transparent 75%, #808080 75%)";

function rgbaToDataUrl(img: RgbaImage): string {
  const canvas = document.createElement("canvas");
  canvas.width = img.width;
  canvas.height = img.height;
  const ctx = canvas.getContext("2d")!;
  const imageData = new ImageData(img.data, img.width, img.height);
  ctx.putImageData(imageData, 0, 0);
  return canvas.toDataURL("image/png");
}

/** Fits the source image into 256×128 (contain, transparent letterbox),
 * then optionally treats near-black pixels as transparent — most logo
 * exports have a solid black backdrop rather than real alpha. */
async function loadAndFit(file: File, blackToTransparent: boolean): Promise<RgbaImage> {
  const bitmap = await createImageBitmap(file);
  const canvas = document.createElement("canvas");
  canvas.width = TITLE_TEXTURE_WIDTH;
  canvas.height = TITLE_TEXTURE_HEIGHT;
  const ctx = canvas.getContext("2d")!;
  const scale = Math.min(TITLE_TEXTURE_WIDTH / bitmap.width, TITLE_TEXTURE_HEIGHT / bitmap.height);
  const w = bitmap.width * scale;
  const h = bitmap.height * scale;
  ctx.drawImage(bitmap, (TITLE_TEXTURE_WIDTH - w) / 2, (TITLE_TEXTURE_HEIGHT - h) / 2, w, h);
  const imageData = ctx.getImageData(0, 0, TITLE_TEXTURE_WIDTH, TITLE_TEXTURE_HEIGHT);
  if (blackToTransparent) {
    const d = imageData.data;
    for (let i = 0; i < d.length; i += 4) {
      if (d[i] < 24 && d[i + 1] < 24 && d[i + 2] < 24) d[i + 3] = 0;
    }
  }
  return { width: TITLE_TEXTURE_WIDTH, height: TITLE_TEXTURE_HEIGHT, data: imageData.data };
}

export default function PhLogo() {
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [blackToTransparent, setBlackToTransparent] = useState(true);
  const [busy, setBusy] = useState(false);
  const [dragOver, setDragOver] = useState<"logo" | "rom" | null>(null);
  const [colorCount, setColorCount] = useState<number | null>(null);
  const [result, setResult] = useState<{ name: string; url: string } | null>(null);
  const romInputRef = useRef<HTMLInputElement>(null);

  const refreshPreview = useCallback(async (file: File, black: boolean) => {
    try {
      const fitted = await loadAndFit(file, black);
      setPreview(rgbaToDataUrl(fitted));
      setColorCount(encodeTitleTexture(fitted).sourceColorCount);
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

  const onRomFile = useCallback(
    async (file: File) => {
      if (!logoFile) {
        toast.error("ارفع صورة الشعار أولاً");
        return;
      }
      setBusy(true);
      try {
        const rom = new Uint8Array(await file.arrayBuffer());
        if (!looksLikeNdsRom(rom)) {
          throw new Error("هذا ليس ملف روم NDS — ارفع ملف ‎.nds‎ الأصلي");
        }
        const ndsFile = findNdsFile(rom, TITLE_TEXTURE_PATH);
        if (!ndsFile) {
          throw new Error(`لم يُعثر على ${TITLE_TEXTURE_PATH} داخل هذا الروم`);
        }
        const sourceTitleBin = rom.subarray(ndsFile.start, ndsFile.end);

        const fitted = await loadAndFit(logoFile, blackToTransparent);
        const encoded = encodeTitleTexture(fitted);
        const newTitleBin = buildTitleBin(encoded, sourceTitleBin);
        const patchedRom = writeNdsFile(rom, ndsFile, newTitleBin);

        const url = URL.createObjectURL(
          new Blob([patchedRom.slice().buffer as ArrayBuffer], { type: "application/octet-stream" })
        );
        const name = file.name.replace(/\.nds$/i, "") + "-arabic-logo.nds";
        setResult((prev) => {
          if (prev) URL.revokeObjectURL(prev.url);
          return { name, url };
        });
        toast.success(
          encoded.sourceColorCount > 255
            ? `تم — قُلِّصت ألوان الصورة من ${encoded.sourceColorCount} إلى ٢٥٥ لوناً (حد صيغة اللعبة)`
            : "تم تركيب الشعار في نسخة جديدة من الروم"
        );
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
          <h1 className="text-2xl font-bold">شعار عنوان Phantom Hourglass</h1>
          <Link to="/" className="text-sm text-muted-foreground hover:underline">
            الرجوع <ArrowRight className="inline h-4 w-4" />
          </Link>
        </div>

        <p className="mb-6 text-sm text-muted-foreground">
          ارفع صورة الشعار الذي صممته (أي مقاس)، ثم ارفع نسخة الروم — تنزل نسخة جديدة بالشعار مركّباً على شاشة العنوان
          الفعلية بصيغة اللعبة (نسيج 256×128، ضغط LZ10). لا رسم هنا — فقط تحويل الصيغة.
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
            <div className="space-y-2 text-sm">
              <label className="flex items-center gap-2">
                <Checkbox checked={blackToTransparent} onCheckedChange={(c) => onToggleBlack(c === true)} />
                اعتبر الأسود شفافاً (خلفية الشعار)
              </label>
              {colorCount !== null && (
                <p className="text-muted-foreground">
                  {colorCount} لوناً في الصورة
                  {colorCount > 255 ? " — ستُقلَّص إلى ٢٥٥ (حد صيغة اللعبة)" : ""}
                </p>
              )}
            </div>
          </div>
        )}

        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver("rom");
          }}
          onDragLeave={() => setDragOver(null)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(null);
            const f = e.dataTransfer.files[0];
            if (f) void onRomFile(f);
          }}
          onClick={() => romInputRef.current?.click()}
          className={`mt-6 flex cursor-pointer flex-col items-center gap-3 rounded-xl border-2 border-dashed p-8 transition ${
            dragOver === "rom" ? "border-primary bg-primary/5" : "border-muted"
          } ${!logoFile ? "opacity-50" : ""}`}
        >
          {busy ? <Loader2 className="h-8 w-8 animate-spin" /> : <Upload className="h-8 w-8 text-muted-foreground" />}
          <span className="text-lg font-medium">٢. افتح ملف الروم (.nds)</span>
          <input
            ref={romInputRef}
            type="file"
            accept=".nds"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void onRomFile(f);
            }}
          />
        </div>

        {result && (
          <div className="mt-6 rounded-xl border p-6">
            <p className="mb-4 text-sm text-muted-foreground">الروم جاهز. جرّبه في المحاكي.</p>
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
            الشعار على شاشة العنوان نسيج ثلاثي الأبعاد مسطّح، لا نموذج — أرشيف NARC مضغوط بـLZ10 يحوي لوحة ألوان
            (NTFP) وبيانات بكسلات (NTFT) بصيغة 8bpp Palette256.
          </p>
          <p>الصورة تُلائَم داخل 256×128 (نسبتها الأصلية محفوظة، وما تبقّى شفاف)، ثم تُقتطع ألوانها لتناسب حد ٢٥٥ لوناً.</p>
        </div>
      </div>
    </div>
  );
}
