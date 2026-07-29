import { useState, useCallback } from "react";
import { Link } from "react-router-dom";
import { Upload, Loader2, ArrowRight, Download } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { applyPkmArabicFont, hasPkmArabicFont, PKM_FONT_OFFSET } from "@/lib/pokemon/pkm-font";
import { looksLikePkmRom } from "@/lib/pokemon/pkm-editor-bridge";

/**
 * Pokémon Ruby Destiny font tool: writes the Arabic glyphs into a ROM.
 *
 * There is nothing to configure. The glyphs are drawn on the pixel grid and
 * ship with the tool, because rasterising a typeface into an 8x16 cell tears
 * the strokes apart — that was tried, and the stem of ك and the bowl of ف came
 * out missing. So the only choice a user has here is which ROM to write them
 * into.
 *
 * The text tool writes the font too, so this page exists for the case that
 * matters on its own: seeing Arabic in the game before any translation is
 * done, to check the font itself.
 */
export default function PokemonFont() {
  const [busy, setBusy] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [result, setResult] = useState<{ name: string; url: string; already: boolean } | null>(null);

  const loadRom = useCallback(async (file: File) => {
    setBusy(true);
    try {
      const rom = new Uint8Array(await file.arrayBuffer());
      if (!looksLikePkmRom(rom)) {
        throw new Error("هذا ليس ملف روم GBA — ارفع ملف ‎.gba‎ الأصلي");
      }
      const already = hasPkmArabicFont(rom);
      const out = applyPkmArabicFont(rom);
      const url = URL.createObjectURL(new Blob([out], { type: "application/octet-stream" }));
      const name = file.name.replace(/\.gba$/i, "") + "-arabic.gba";
      setResult((prev) => {
        if (prev) URL.revokeObjectURL(prev.url);
        return { name, url, already };
      });
      toast.success(
        already
          ? "هذا الروم يحمل الخط العربي أصلاً — أُعيدت كتابته كما هو"
          : `كُتب ١٢٩ شكلاً عربياً في 0x${PKM_FONT_OFFSET.toString(16).toUpperCase()}`
      );
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }, []);

  return (
    <div className="min-h-screen bg-background text-foreground" dir="rtl">
      <div className="mx-auto max-w-3xl px-4 py-10">
        <div className="mb-8 flex items-center justify-between">
          <h1 className="text-2xl font-bold">خط Pokémon Ruby Destiny العربي</h1>
          <div className="flex items-center gap-4 text-sm text-muted-foreground">
            <Link to="/pokemon/text" className="hover:underline">أداة النصوص</Link>
            <Link to="/pokemon" className="hover:underline">
              الرجوع <ArrowRight className="inline h-4 w-4" />
            </Link>
          </div>
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
            if (f) void loadRom(f);
          }}
          className={`flex cursor-pointer flex-col items-center gap-3 rounded-xl border-2 border-dashed p-12 transition ${
            dragOver ? "border-primary bg-primary/5" : "border-muted"
          }`}
        >
          {busy ? (
            <Loader2 className="h-10 w-10 animate-spin" />
          ) : (
            <Upload className="h-10 w-10 text-muted-foreground" />
          )}
          <span className="text-lg font-medium">افتح ملف ‎.gba‎</span>
          <span className="text-sm text-muted-foreground">يُكتب الخط ويُنزَّل روم جديد، والأصل لا يُمَس</span>
          <input
            type="file"
            accept=".gba"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void loadRom(f);
            }}
          />
        </label>

        {result && (
          <div className="mt-6 rounded-xl border p-6">
            <p className="mb-4 text-sm text-muted-foreground">
              {result.already
                ? "كان الخط العربي مكتوباً في هذا الروم من قبل."
                : "الخط جاهز. جرّبه في المحاكي: أي نصّ يستعمل خانات الكانا سيظهر بالعربية."}
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
            الخط يسكن خانات الكانا <code className="rounded bg-muted px-1">0x01</code>–
            <code className="rounded bg-muted px-1">0x81</code>، وهي ١٢٩ خانة لا تطبعها النسخة الإنجليزية — فتبقى الحروف
            اللاتينية والأرقام وعلامات الترقيم كلها سليمة.
          </p>
          <p>
            الحروف مأخوذة من تعريب Mother 3 المرسوم يدوياً على شبكة البكسل، وأُضيف إليها ١٨ شكلاً (ص ض ط ظ ع في بعض
            مواضعها، و ء آ ؛) مرسومة بالأسلوب نفسه.
          </p>
          <p>
            اتجاه الكتابة ما زال من اليسار: الأداة تشكّل الحروف وتعكسها عند البناء، فتظهر الكلمة صحيحة، لكن رقعة قلب
            اتجاه السطر مؤجَّلة.
          </p>
        </div>
      </div>
    </div>
  );
}
