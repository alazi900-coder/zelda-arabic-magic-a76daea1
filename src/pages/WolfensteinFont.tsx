import { useState, useCallback, useRef, useEffect } from "react";
import { Link } from "react-router-dom";
import { Upload, Loader2, ArrowRight, Save } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { idbSet, idbGet } from "@/lib/idb-storage";
import { openIpa, readPackagesFile } from "@/lib/wolfrpg/wolf-ipa";
import { parseWolfFont, wolfCellOrigin, wolfPalette } from "@/lib/wolfrpg/wolf-font";
import { encodeArabicForWolf, WOLF_FIRST_CODE, WOLF_LAST_CODE } from "@/lib/wolfrpg/wolf-charmap";
import { buildWolfArabicFonts, WOLF_DEFAULT_WIDTH_FACTOR } from "@/lib/wolfrpg/wolf-glyph-raster";
import { buildWolfM3Fonts, type WolfM3Fit } from "@/lib/wolfrpg/wolf-m3-glyphs";
import { WOLF_BUFFER_KEY, WOLF_FONTS_KEY, WOLF_FONT_FILES } from "@/lib/wolfrpg/wolf-editor-bridge";

const SAMPLES = ["متابعة", "لعبة جديدة", "خيارات", "استيقظت في زنزانة مظلمة.", "اضغط على الزر لفتح الباب"];
const PREVIEW_FONT = "Font_16p_Light.bmp";
const ZOOM = 4;

/**
 * Draws a line the way the engine does — one whole cell per byte, cells butted
 * together with no spacing. Judging the preview is judging the build, because
 * this is the same operation the game performs.
 */
function drawLine(ctx: CanvasRenderingContext2D, bmp: Uint8Array, codes: number[], y: number) {
  const font = parseWolfFont(bmp);
  const palette = wolfPalette(font);
  const image = ctx.createImageData(font.cellWidth * codes.length, font.cellHeight);
  codes.forEach((code, i) => {
    if (code < WOLF_FIRST_CODE || code > WOLF_LAST_CODE) return;
    const { x: ox, y: oy } = wolfCellOrigin(font, code - WOLF_FIRST_CODE);
    for (let cy = 0; cy < font.cellHeight; cy++) {
      for (let cx = 0; cx < font.cellWidth; cx++) {
        const index = font.pixels[(oy + cy) * font.width + ox + cx];
        if (index === 0) continue;
        const [r, g, b] = palette[index] || [255, 255, 255];
        const o = (cy * image.width + i * font.cellWidth + cx) * 4;
        image.data[o] = r;
        image.data[o + 1] = g;
        image.data[o + 2] = b;
        image.data[o + 3] = 255;
      }
    }
  });
  const scratch = document.createElement("canvas");
  scratch.width = image.width;
  scratch.height = image.height;
  scratch.getContext("2d")!.putImageData(image, 0, 0);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(scratch, 0, y, image.width * ZOOM, image.height * ZOOM);
  return image.height * ZOOM;
}

/**
 * Wolfenstein RPG font tool: rasterises an Arabic .ttf into the game's five
 * bitmap fonts and stores them for the build step.
 */
export default function WolfensteinFont() {
  const [busy, setBusy] = useState(false);
  const [originals, setOriginals] = useState<Record<string, Uint8Array> | null>(null);
  const [built, setBuilt] = useState<Record<string, Uint8Array> | null>(null);
  const [widthFactor, setWidthFactor] = useState(WOLF_DEFAULT_WIDTH_FACTOR);
  const [ttf, setTtf] = useState<ArrayBuffer | null>(null);
  const [ttfName, setTtfName] = useState("");
  const [saved, setSaved] = useState(false);
  // Where the glyphs come from. Mother 3's Arabic is drawn by hand on the
  // pixel grid, and its ink is 9x13 — so the 12x16 and 13x18 cells take it
  // untouched, which is the whole reason to prefer it over rasterising an
  // outline at a size where the pen is thinner than a pixel. The 10x12 menu
  // font and the 22x25 title cannot take it whole; `m3-mixed` leaves those two
  // to the .ttf, `m3-all` scales the drawing into them as well.
  const [source, setSource] = useState<"ttf" | "m3-mixed" | "m3-all">("m3-mixed");
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const readFonts = useCallback(async (ipaBytes: Uint8Array) => {
    const ipa = await openIpa(ipaBytes);
    const out: Record<string, Uint8Array> = {};
    for (const name of WOLF_FONT_FILES) out[name] = await readPackagesFile(ipa, name);
    return out;
  }, []);

  // Reuse the .ipa already opened by the text tool, so the archive is picked
  // once per session rather than once per tool.
  useEffect(() => {
    void (async () => {
      const buf = await idbGet<ArrayBuffer>(WOLF_BUFFER_KEY);
      if (!buf) return;
      try {
        setOriginals(await readFonts(new Uint8Array(buf)));
      } catch {
        /* a stale buffer is not worth a message; the user can open a file */
      }
    })();
  }, [readFonts]);

  const loadIpa = useCallback(
    async (file: File) => {
      setBusy(true);
      try {
        const bytes = new Uint8Array(await file.arrayBuffer());
        setOriginals(await readFonts(bytes));
        await idbSet(WOLF_BUFFER_KEY, bytes.buffer.slice(0));
        toast.success(`قُرئت خطوط اللعبة الخمسة من ${file.name}`);
      } catch (e) {
        toast.error((e as Error).message);
      } finally {
        setBusy(false);
      }
    },
    [readFonts]
  );

  const build = useCallback(async () => {
    if (!originals) return;
    if (source !== "m3-all" && !ttf) return;
    setBusy(true);
    setSaved(false);
    try {
      const result =
        source === "ttf"
          ? await buildWolfArabicFonts(originals, ttf!.slice(0), widthFactor)
          : await buildWolfM3Fonts(originals, {
              fit: (source === "m3-all" ? "scale" : "skip") as WolfM3Fit,
              fontBytes: ttf?.slice(0),
              widthFactor,
            });
      setBuilt(result);
      toast.success(`رُسمت الأشكال العربية في ${Object.keys(result).length} خطوط`);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }, [originals, ttf, widthFactor, source]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const bmp = built?.[PREVIEW_FONT];
    if (!canvas || !bmp) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    let y = 0;
    for (const text of SAMPLES) {
      const codes = [...encodeArabicForWolf(text).text].map((c) => c.charCodeAt(0));
      y += drawLine(ctx, bmp, codes, y) + 8;
    }
  }, [built]);

  const save = useCallback(async () => {
    if (!built) return;
    const store: Record<string, ArrayBuffer> = {};
    for (const [name, bytes] of Object.entries(built)) store[name] = bytes.buffer.slice(0) as ArrayBuffer;
    await idbSet(WOLF_FONTS_KEY, store);
    setSaved(true);
    toast.success("حُفظ الخط — سيُدرَج في ملف .ipa الذي يبنيه المحرر");
  }, [built]);

  return (
    <div className="min-h-screen bg-background text-foreground" dir="rtl">
      <div className="mx-auto max-w-3xl px-4 py-10">
        <div className="mb-8 flex items-center justify-between">
          <h1 className="text-2xl font-bold">خط Wolfenstein RPG العربي</h1>
          <div className="flex items-center gap-4 text-sm text-muted-foreground">
            <Link to="/wolfenstein/text" className="hover:underline">أداة النصوص</Link>
            <Link to="/wolfenstein" className="hover:underline">
              الرجوع <ArrowRight className="inline h-4 w-4" />
            </Link>
          </div>
        </div>

        <div className="space-y-6">
          <section className="rounded-xl border p-5">
            <h2 className="mb-3 font-semibold">١ · ملف اللعبة</h2>
            {originals ? (
              <p className="text-sm text-muted-foreground">
                جاهز — قُرئت خطوط اللعبة الخمسة.{" "}
                <label className="cursor-pointer text-primary hover:underline">
                  اختر ملفاً آخر
                  <input
                    type="file"
                    accept=".ipa,.zip"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) void loadIpa(f);
                    }}
                  />
                </label>
              </p>
            ) : (
              <label className="flex cursor-pointer items-center gap-3 rounded-lg border-2 border-dashed p-6">
                {busy ? <Loader2 className="h-6 w-6 animate-spin" /> : <Upload className="h-6 w-6 text-muted-foreground" />}
                <span>افتح ملف .ipa لقراءة خطوط اللعبة</span>
                <input
                  type="file"
                  accept=".ipa,.zip"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) void loadIpa(f);
                  }}
                />
              </label>
            )}
          </section>

          <section className="rounded-xl border p-5">
            <h2 className="mb-3 font-semibold">٢ · الخط العربي</h2>
            <div className="mb-4 grid gap-2 sm:grid-cols-3">
              {([
                ["m3-mixed", "ماذر٣ + TTF للمقاسين الصغير والعنوان", "الأشكال المرسومة يدوياً بحجمها الأصلي في خانتَي ١٢×١٦ و١٣×١٨، وخطّك للمقاسين اللذين لا يسعانها"],
                ["m3-all", "ماذر٣ لكل المقاسات", "بلا حاجة إلى ‎.ttf‎؛ المقاسان الآخران يُحجَّم لهما الرسم وتفقد الحروف بعض حدّتها"],
                ["ttf", "خطّك وحده", "السلوك السابق: رسم ملف ‎.ttf‎ في كل الخانات"],
              ] as const).map(([id, label, hint]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => { setSource(id); setBuilt(null); }}
                  className={`rounded-lg border p-3 text-right text-sm transition-colors ${
                    source === id ? "border-primary bg-primary/10" : "border-border/60 hover:border-primary/40"
                  }`}
                >
                  <span className="block font-semibold">{label}</span>
                  <span className="mt-1 block text-xs text-muted-foreground">{hint}</span>
                </button>
              ))}
            </div>
            <label className="flex cursor-pointer items-center gap-3 rounded-lg border-2 border-dashed p-6">
              <Upload className="h-6 w-6 text-muted-foreground" />
              <span>{ttfName || "اختر ملف .ttf أو .otf"}</span>
              <input
                type="file"
                accept=".ttf,.otf"
                className="hidden"
                onChange={async (e) => {
                  const f = e.target.files?.[0];
                  if (!f) return;
                  setTtf(await f.arrayBuffer());
                  setTtfName(f.name);
                  setBuilt(null);
                }}
              />
            </label>
            <div className="mt-4 flex items-center gap-3">
              <label className="text-sm text-muted-foreground" htmlFor="wolf-width">
                عرض الحرف
              </label>
              <Input
                id="wolf-width"
                type="number"
                step="0.1"
                min="1"
                max="3"
                value={widthFactor}
                onChange={(e) => setWidthFactor(Number(e.target.value) || WOLF_DEFAULT_WIDTH_FACTOR)}
                className="w-24"
              />
              <span className="text-xs text-muted-foreground">
                ١٫٠ = النسب الطبيعية. خليّة اللعبة أعرض ممّا تحتاجه العربية بنحو ١٫٧ مرّة، و١٫٦ هي القيمة المجرَّبة داخل
                اللعبة.
              </span>
            </div>
            <Button
              className="mt-4"
              onClick={() => void build()}
              disabled={!originals || (source !== "m3-all" && !ttf) || busy}
            >
              {busy ? <Loader2 className="ml-2 h-4 w-4 animate-spin" /> : null}
              ارسم الأشكال العربية
            </Button>
          </section>

          {built ? (
            <section className="rounded-xl border p-5">
              <h2 className="mb-3 font-semibold">٣ · المعاينة</h2>
              <p className="mb-3 text-sm text-muted-foreground">
                كل سطر مركَّب من الخط المبني نفسه، خليّة بخليّة، كما يفعل المحرّك.
              </p>
              <canvas ref={canvasRef} width={640} height={SAMPLES.length * (16 * ZOOM + 8)} className="max-w-full rounded bg-black" />
              <Button className="mt-4" onClick={() => void save()} variant={saved ? "outline" : "default"}>
                <Save className="ml-2 h-4 w-4" />
                {saved ? "محفوظ" : "احفظ الخط للبناء"}
              </Button>
            </section>
          ) : null}
        </div>

        <div className="mt-8 space-y-2 text-sm text-muted-foreground">
          <p>
            يُعاد رسم بيانات البكسل فقط؛ الترويسة واللوحة والأبعاد تُنسخ كما هي، لأن المحرّك يقرأ مقاس الخليّة من الأبعاد.
          </p>
          <p>
            ١٢٩ خانة تحمل الأشكال العربية، و١٦ خانة تبقى لاتينية: الأرقام و
            <code className="rounded bg-muted px-1">! % . :</code> وفاصل الأسطر{" "}
            <code className="rounded bg-muted px-1">|</code>.
          </p>
        </div>
      </div>
    </div>
  );
}
