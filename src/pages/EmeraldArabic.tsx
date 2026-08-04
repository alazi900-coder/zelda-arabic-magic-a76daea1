import { useCallback, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Download, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { renderEmeraldLine, type EmeraldFont } from "@/lib/gba/emerald-font";
import {
  EMERALD_CARRIER_CODES,
  applyEmeraldArabicFont,
  encodeArabicForEmerald,
} from "@/lib/gba/emerald-arabic";

/**
 * الخطّ العربي في Pokémon Emerald — ارفع الروم، وانظر، ونزّل.
 *
 * والنظر هنا ليس زينة: الحكم على خطٍّ عربيّ هو أن تتّصل حروفه، والاتّصال
 * تقرّره جداول العروض لا شكل الحرف وحده. فالمعاينة ترسم السطر كما يرسمه
 * المحرّك نفسه — خليّةً خليّة بمقدار عرضها — لا صفّاً من الحروف متجاورة.
 */

function LinePreview({ rom, font, text }: { rom: Uint8Array; font: EmeraldFont; text: string }) {
  const bytes = useMemo(() => encodeArabicForEmerald(text).bytes, [text]);
  const draw = useCallback(
    (canvas: HTMLCanvasElement | null) => {
      if (!canvas || bytes.length === 0) return;
      const line = renderEmeraldLine(rom, font, bytes, 3);
      canvas.width = line.width;
      canvas.height = line.height;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.putImageData(new ImageData(line.rgba, line.width, line.height), 0, 0);
    },
    [rom, font, bytes]
  );
  return (
    <canvas
      ref={draw}
      style={{ imageRendering: "pixelated" }}
      className="max-w-full rounded-lg border border-border bg-white"
    />
  );
}

export default function EmeraldArabic() {
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState("");
  const [patched, setPatched] = useState<{ rom: Uint8Array; font: EmeraldFont; count: number } | null>(null);
  const [text, setText] = useState("أهلاً بك في عالم البوكيمون");

  const open = useCallback(async (file: File) => {
    setBusy(true);
    setPatched(null);
    try {
      const rom = new Uint8Array(await file.arrayBuffer());
      const result = applyEmeraldArabicFont(rom);
      setPatched({ rom: result.rom, font: result.fonts[0], count: result.fonts.length });
      setName(file.name);
      toast.success(`${result.fonts.length} خطوطٍ حُقنت فيها العربية`);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }, []);

  const download = useCallback(() => {
    if (!patched) return;
    const blob = new Blob([patched.rom as BlobPart], { type: "application/octet-stream" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = name.replace(/\.gba$/i, "") + " (عربي).gba";
    a.click();
    URL.revokeObjectURL(url);
  }, [patched, name]);

  return (
    <div className="min-h-screen bg-background p-4 md:p-8" dir="rtl">
      <div className="max-w-3xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <Link to="/" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
            <ArrowRight className="w-4 h-4" /> الرجوع
          </Link>
          <h1 className="text-2xl font-display font-bold">الخطّ العربي في Pokémon Emerald</h1>
        </div>

        <div className="rounded-xl border border-border bg-card p-6 space-y-4">
          <p className="text-sm text-muted-foreground">
            ارفع روم Emerald، فيُبحث عن خطّه ببنيته لا بعنوانٍ محفوظ — لأنّ الترجمات تنقله — ثمّ
            تُرسم الحروف العربية في {EMERALD_CARRIER_CODES.length} خانةً لا يطبعها البناء الإنجليزي.
            وتبقى الحروف اللاتينية والأرقام و<code className="text-xs">Lv</code> و
            <code className="text-xs">PK</code> و<code className="text-xs">MN</code> والأقواس
            والأسهم كما هي.
          </p>
          <input
            type="file"
            accept=".gba,.bin"
            disabled={busy}
            className="block w-full text-sm file:mr-4 file:rounded-lg file:border-0 file:bg-primary file:px-4 file:py-2 file:text-primary-foreground disabled:opacity-50"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void open(f);
            }}
          />
          {busy && (
            <p className="inline-flex items-center gap-2 text-sm">
              <Loader2 className="w-4 h-4 animate-spin" /> يبحث عن الخطّ ويرسم الحروف…
            </p>
          )}
        </div>

        {patched && (
          <div className="rounded-xl border border-border bg-card p-6 space-y-4">
            <div className="text-sm">
              <span className="text-muted-foreground">{name} — {patched.count} خطوط، أوّلها عند </span>
              <span className="font-mono">0x{patched.font.glyphs.toString(16).toUpperCase()}</span>
              <span className="text-muted-foreground"> والعروض عند </span>
              <span className="font-mono">0x{patched.font.widths.toString(16).toUpperCase()}</span>
            </div>

            <div className="space-y-2">
              <label className="block text-sm text-muted-foreground">
                اكتب جملةً لترى كيف يرسمها المحرّك
              </label>
              <input
                value={text}
                onChange={(e) => setText(e.target.value)}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
              />
              <LinePreview rom={patched.rom} font={patched.font} text={text} />
            </div>

            <button
              onClick={download}
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm text-primary-foreground"
            >
              <Download className="w-4 h-4" /> نزّل الروم
            </button>
            <p className="text-xs text-muted-foreground">
              الخطّ وحده لا يترجم شيئاً: نصوص اللعبة ما تزال إنجليزية حتّى تُحقن الترجمة. وهذا
              الروم يُجرَّب للتأكّد أنّ الإنجليزية سليمة.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
