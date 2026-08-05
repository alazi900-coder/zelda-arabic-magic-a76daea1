import { useCallback, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Search, Loader2, Copy } from "lucide-react";
import { toast } from "sonner";
import {
  findGbaFonts,
  renderGbaFontCandidate,
  type GbaFontCandidate,
} from "@/lib/gba/gba-font-finder";

/**
 * أين خطّ هذه اللعبة؟ — صفحةٌ ترفع فيها روم GBA فترى الجواب بعينك.
 *
 * البحث اليدوي عن خطّ لعبةٍ واحدة استغرق جلسةً كاملة وفشل ثماني مرّات،
 * وسبب الفشل في كلّها أنّ الباحث يثبّت تخطيطاً ولوناً ثمّ يبحث. والأداة
 * لا تثبّت شيئاً، لكنّها أيضاً **لا تدّعي اليقين**: تختصر ستّة عشر
 * ميغابايت إلى بضعة مواضع، وترسم كلّ واحدٍ منها، والحكم للعين — فالحروف
 * لا تُخطئها عين، والأنماط المزخرفة تُخطئها المقاييس.
 */

function CandidateSheet({ rom, candidate }: { rom: Uint8Array; candidate: GbaFontCandidate }) {
  const draw = useCallback(
    (canvas: HTMLCanvasElement | null) => {
      if (!canvas) return;
      const sheet = renderGbaFontCandidate(rom, candidate, 32);
      canvas.width = sheet.width;
      canvas.height = sheet.height;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.putImageData(new ImageData(sheet.rgba as unknown as Uint8ClampedArray<ArrayBuffer>, sheet.width, sheet.height), 0, 0);
    },
    [rom, candidate]
  );
  return (
    <canvas
      ref={draw}
      style={{ imageRendering: "pixelated" }}
      className="w-full rounded-lg border border-border bg-black"
    />
  );
}

export default function GbaFontFinder() {
  const [busy, setBusy] = useState(false);
  const [rom, setRom] = useState<Uint8Array | null>(null);
  const [name, setName] = useState("");
  const [found, setFound] = useState<GbaFontCandidate[]>([]);
  const [seconds, setSeconds] = useState(0);

  const open = useCallback(async (file: File) => {
    setBusy(true);
    setFound([]);
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      if (bytes.length < 0x8000) throw new Error("هذا الملف أصغر من أن يكون روم GBA");
      const started = performance.now();
      // البحث ثقيل ويجمّد الصفحة لحظة؛ يُترك للمتصفّح أن يرسم أوّلاً.
      await new Promise((resolve) => setTimeout(resolve, 30));
      const candidates = findGbaFonts(bytes, { limit: 12 });
      setSeconds((performance.now() - started) / 1000);
      setRom(bytes);
      setName(file.name);
      setFound(candidates);
      if (candidates.length === 0) toast.warning("لم أجد ما يشبه خطّاً في هذا الروم");
      else toast.success(`${candidates.length} موضعاً يشبه خطّاً`);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }, []);

  return (
    <div className="min-h-screen bg-background p-4 md:p-8" dir="rtl">
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <Link to="/" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
            <ArrowRight className="w-4 h-4" /> الرجوع
          </Link>
          <h1 className="text-2xl font-display font-bold">أين خطّ هذه اللعبة؟</h1>
        </div>

        <div className="rounded-xl border border-border bg-card p-6 space-y-4">
          <p className="text-sm text-muted-foreground">
            ارفع روم لعبة GBA، فتُمسح بايتاته كلّها بحثاً عن مواضع تشبه خطّاً — بلا افتراضٍ لمقاس الحرف
            ولا لألوانه، وبفكّ الرسوم المضغوطة. ثمّ تُرسم لك المواضع لتحكم بعينك: الحروف لا تُخطئها عين،
            والزخارف تُخطئها المقاييس.
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
              <Loader2 className="w-4 h-4 animate-spin" /> يمسح الروم ويفكّ الرسوم المضغوطة…
            </p>
          )}
        </div>

        {found.length > 0 && (
          <p className="text-sm text-muted-foreground">
            {name} — {found.length} مرشّحاً في {seconds.toFixed(1)} ثانية
          </p>
        )}

        {rom &&
          found.map((c) => {
            const address = `0x${c.offset.toString(16).toUpperCase().padStart(6, "0")}`;
            const where = c.compressedAt === undefined
              ? address
              : `${address} داخل كتلة مضغوطة عند 0x${c.compressedAt.toString(16).toUpperCase()}`;
            return (
              <div key={`${c.compressedAt ?? "raw"}-${c.offset}-${c.layout.width}x${c.layout.height}x${c.layout.bpp}`}
                className="rounded-xl border border-border bg-card p-4 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <span className="font-mono text-sm">{where}</span>
                    <span className="block text-xs text-muted-foreground">
                      {c.layout.width}×{c.layout.height} بـ{c.layout.bpp} بتات | {c.glyphs} خليّة |{" "}
                      {c.detail.colours} ألوان | حبر {Math.round(c.detail.inkMedian * 100)}٪ |{" "}
                      {c.detail.unique} شكلاً مختلفاً | فراغات {c.detail.blanks}
                    </span>
                  </div>
                  <button
                    onClick={() => {
                      void navigator.clipboard.writeText(where);
                      toast.success("نُسخ العنوان");
                    }}
                    className="inline-flex items-center gap-1 rounded-lg border border-border px-3 py-1.5 text-xs"
                  >
                    <Copy className="w-3 h-3" /> انسخ العنوان
                  </button>
                </div>
                <CandidateSheet rom={rom} candidate={c} />
              </div>
            );
          })}

        {!busy && rom && found.length === 0 && (
          <div className="rounded-xl border border-border bg-card p-6 text-sm">
            لا موضع يشبه خطّاً في هذا الروم. وهذا جوابٌ لا صمت: أداةٌ تُجيب دائماً لا يُوثق بها حين تجيب.
            <Search className="inline w-4 h-4 mr-1" />
          </div>
        )}
      </div>
    </div>
  );
}
