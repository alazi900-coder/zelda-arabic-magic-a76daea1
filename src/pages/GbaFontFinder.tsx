import { useCallback, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Search, Loader2, Copy, Download, Upload, Pencil, X } from "lucide-react";
import { toast } from "sonner";
import {
  findGbaFonts,
  renderGbaFontCandidate,
  readGbaGlyph,
  writeGbaGlyph,
  gbaGlyphStride,
  gbaGlyphBytes,
  GBA_GLYPH_LAYOUTS,
  type GbaFontCandidate,
  type GbaGlyphLayout,
} from "@/lib/gba/gba-font-finder";

/**
 * أين خطّ هذه اللعبة؟ — صفحةٌ ترفع فيها روم GBA فترى الجواب بعينك، ثمّ
 * تُخرج الخطّ وتعدّله وتكتبه في الروم.
 *
 * البحث اليدوي عن خطّ لعبةٍ واحدة استغرق جلسةً كاملة وفشل ثماني مرّات،
 * وسبب الفشل في كلّها أنّ الباحث يثبّت تخطيطاً ولوناً ثمّ يبحث. والأداة
 * لا تثبّت شيئاً، لكنّها أيضاً **لا تدّعي اليقين**: تختصر ستّة عشر
 * ميغابايت إلى بضعة مواضع، وترسم كلّ واحدٍ منها، والحكم للعين.
 *
 * وبعد الحكم عملٌ: ما فائدة موضعٍ لا يُفتح؟ فمن كلّ مرشّح تُنزَّل بايتاته
 * خاماً، وتُستبدل بملفٍّ معدَّل، ويُنقر الحرف فيُرسم بكسلاً بكسلاً، ثمّ
 * يُنزَّل الروم كاملاً بالخطّ الجديد — والأصل لا يُمَسّ.
 */

function CandidateSheet({
  rom,
  candidate,
  columns,
  onPick,
}: {
  rom: Uint8Array;
  candidate: GbaFontCandidate;
  columns: number;
  onPick?: (index: number) => void;
}) {
  const sheet = useMemo(() => renderGbaFontCandidate(rom, candidate, columns), [rom, candidate, columns]);
  const draw = useCallback(
    (canvas: HTMLCanvasElement | null) => {
      if (!canvas) return;
      canvas.width = sheet.width;
      canvas.height = sheet.height;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.putImageData(
        new ImageData(sheet.rgba as unknown as Uint8ClampedArray<ArrayBuffer>, sheet.width, sheet.height),
        0,
        0
      );
    },
    [sheet]
  );
  return (
    <canvas
      ref={draw}
      style={{ imageRendering: "pixelated" }}
      className="w-full rounded-lg border border-border bg-black cursor-crosshair"
      onClick={(e) => {
        if (!onPick) return;
        const rect = e.currentTarget.getBoundingClientRect();
        const scale = rect.width / sheet.width;
        const cx = Math.floor((e.clientX - rect.left) / scale / (candidate.layout.width + 1));
        const cy = Math.floor((e.clientY - rect.top) / scale / (candidate.layout.height + 1));
        const index = cy * columns + cx;
        if (index >= 0 && index < candidate.glyphs) onPick(index);
      }}
    />
  );
}

/** محرّر بكسلات حرفٍ واحد: نقرةٌ تزيد قيمة اللون، والحفظ يكتب في الروم. */
function GlyphEditor({
  rom,
  candidate,
  index,
  onSave,
  onClose,
}: {
  rom: Uint8Array;
  candidate: GbaFontCandidate;
  index: number;
  onSave: (pixels: Uint8Array) => void;
  onClose: () => void;
}) {
  const { layout } = candidate;
  const [pixels, setPixels] = useState<Uint8Array>(() =>
    Uint8Array.from(readGbaGlyph(rom, candidate.offset, layout, index))
  );
  const levels = (1 << layout.bpp) - 1;

  return (
    <div className="rounded-lg border border-border bg-background p-3 space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">
          الحرف رقم {index} — 0x
          {(candidate.offset + index * gbaGlyphStride(layout)).toString(16).toUpperCase()}
        </span>
        <button onClick={onClose} className="rounded-lg border border-border p-1">
          <X className="w-4 h-4" />
        </button>
      </div>
      <div
        className="grid gap-px bg-border w-fit mx-auto"
        style={{ gridTemplateColumns: `repeat(${layout.width}, minmax(0, 1fr))` }}
      >
        {Array.from(pixels).map((v, i) => (
          <button
            key={i}
            aria-label={`بكسل ${i}`}
            className="w-5 h-5"
            style={{ background: v === 0 ? "hsl(var(--muted))" : `rgb(${120 + (135 * v) / levels} ${120 + (135 * v) / levels} ${120 + (135 * v) / levels})` }}
            onClick={() => {
              const next = Uint8Array.from(pixels);
              next[i] = (next[i] + 1) % (levels + 1);
              setPixels(next);
            }}
          />
        ))}
      </div>
      <div className="flex gap-2">
        <button
          onClick={() => onSave(pixels)}
          className="rounded-lg bg-primary px-3 py-1.5 text-xs text-primary-foreground"
        >
          اكتب الحرف في الروم
        </button>
        <button
          onClick={() => setPixels(new Uint8Array(layout.width * layout.height))}
          className="rounded-lg border border-border px-3 py-1.5 text-xs"
        >
          امسح
        </button>
      </div>
    </div>
  );
}

export default function GbaFontFinder() {
  const [busy, setBusy] = useState(false);
  const [rom, setRom] = useState<Uint8Array | null>(null);
  const [name, setName] = useState("");
  const [found, setFound] = useState<GbaFontCandidate[]>([]);
  const [seconds, setSeconds] = useState(0);
  const [dirty, setDirty] = useState(0);
  const [editing, setEditing] = useState<{ key: string; index: number } | null>(null);

  // إدخالٌ يدوي: من عرف موضع خطّه لا يحتاج أن ينتظر البحث.
  const [manualAt, setManualAt] = useState("0x6F9DB0");
  const [manualLayout, setManualLayout] = useState("8x8x1m");
  const [manualGlyphs, setManualGlyphs] = useState("282");

  const open = useCallback(async (file: File) => {
    setBusy(true);
    setFound([]);
    setEditing(null);
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      if (bytes.length < 0x8000) throw new Error("هذا الملف أصغر من أن يكون روم GBA");
      const started = performance.now();
      // البحث ثقيل ويجمّد الصفحة لحظة؛ يُترك للمتصفّح أن يرسم أوّلاً.
      await new Promise((resolve) => setTimeout(resolve, 30));
      const candidates = findGbaFonts(bytes, { limit: 16 });
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

  const addManual = useCallback(() => {
    if (!rom) return toast.error("ارفع الروم أوّلاً");
    const at = Number.parseInt(manualAt.trim(), manualAt.trim().toLowerCase().startsWith("0x") ? 16 : 16);
    const glyphs = Number.parseInt(manualGlyphs, 10);
    const [w, h, rest] = manualLayout.split("x");
    const bpp = Number.parseInt(rest, 10);
    const layout: GbaGlyphLayout = {
      width: Number.parseInt(w, 10),
      height: Number.parseInt(h, 10),
      bpp,
      msbFirst: rest.endsWith("m"),
    };
    if (!Number.isFinite(at) || at < 0 || at >= rom.length) return toast.error("عنوانٌ خارج الروم");
    if (!Number.isFinite(glyphs) || glyphs < 1) return toast.error("عدد الحروف غير صالح");
    setFound((prev) => [
      {
        offset: at,
        layout,
        glyphs,
        score: 99,
        detail: { colours: 1 << bpp, inkMedian: 0, baselineRows: 0, blanks: 0, unique: glyphs },
      },
      ...prev,
    ]);
    toast.success("أُضيف الموضع اليدوي في أعلى القائمة");
  }, [rom, manualAt, manualLayout, manualGlyphs]);

  const download = (bytes: Uint8Array, filename: string) => {
    const url = URL.createObjectURL(new Blob([bytes.slice().buffer as ArrayBuffer], { type: "application/octet-stream" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  };

  const tableBytes = (c: GbaFontCandidate) => c.glyphs * gbaGlyphStride(c.layout);

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
            ولا لألوانه ولا لترتيب بتّاته، وبفكّ الرسوم المضغوطة. ثمّ تُرسم لك المواضع لتحكم بعينك، ومن
            كلّ موضعٍ تُخرج بايتات الخطّ أو تعدّل حروفه وتنزّل الروم من جديد.
          </p>
          <input
            type="file"
            accept="*/*"
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

        {rom && (
          <div className="rounded-xl border border-border bg-card p-4 space-y-3">
            <p className="text-sm font-medium">موضعٌ تعرفه؟ افتحه مباشرة</p>
            <div className="flex flex-wrap gap-2">
              <input
                value={manualAt}
                onChange={(e) => setManualAt(e.target.value)}
                placeholder="0x6F9DB0"
                className="flex-1 min-w-32 rounded-lg border border-border bg-background px-3 py-1.5 font-mono text-sm"
              />
              <select
                value={manualLayout}
                onChange={(e) => setManualLayout(e.target.value)}
                className="rounded-lg border border-border bg-background px-3 py-1.5 text-sm"
              >
                {["8x8x1m", "8x8x1", "8x16x1m", "8x16x1", "8x8x2", "8x8x4", "8x16x4", "16x16x4"].map((v) => (
                  <option key={v} value={v}>
                    {v.replace("x1m", "×١ بت مقلوب").replace(/x(\d)$/, " ×$1 بت")}
                  </option>
                ))}
              </select>
              <input
                value={manualGlyphs}
                onChange={(e) => setManualGlyphs(e.target.value)}
                className="w-24 rounded-lg border border-border bg-background px-3 py-1.5 text-sm"
              />
              <button onClick={addManual} className="rounded-lg bg-primary px-4 py-1.5 text-sm text-primary-foreground">
                اعرض
              </button>
            </div>
            {dirty > 0 && (
              <button
                onClick={() => download(rom, name.replace(/\.gba$/i, "") + "-font.gba")}
                className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm text-primary-foreground"
              >
                <Download className="w-4 h-4" /> نزّل الروم بعد {dirty} تعديلاً
              </button>
            )}
          </div>
        )}

        {found.length > 0 && (
          <p className="text-sm text-muted-foreground">
            {name} — {found.length} مرشّحاً في {seconds.toFixed(1)} ثانية
          </p>
        )}

        {rom &&
          found.map((c) => {
            const address = `0x${c.offset.toString(16).toUpperCase().padStart(6, "0")}`;
            const key = `${c.compressedAt ?? "raw"}-${c.offset}-${c.layout.width}x${c.layout.height}x${c.layout.bpp}${c.layout.msbFirst ? "m" : ""}`;
            const where =
              c.compressedAt === undefined
                ? address
                : `${address} داخل كتلة مضغوطة عند 0x${c.compressedAt.toString(16).toUpperCase()}`;
            const columns = c.layout.width > 8 ? 16 : 32;
            const editable = c.compressedAt === undefined;
            return (
              <div key={key} className="rounded-xl border border-border bg-card p-4 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <span className="font-mono text-sm">{where}</span>
                    <span className="block text-xs text-muted-foreground">
                      {c.layout.width}×{c.layout.height} بـ{c.layout.bpp} بتات
                      {c.layout.msbFirst ? " (بتّ مقلوب)" : ""} | {c.glyphs} خليّة | {gbaGlyphBytes(c.layout)} بايت
                      للحرف | {c.detail.unique} شكلاً مختلفاً
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      onClick={() => {
                        void navigator.clipboard.writeText(where);
                        toast.success("نُسخ العنوان");
                      }}
                      className="inline-flex items-center gap-1 rounded-lg border border-border px-3 py-1.5 text-xs"
                    >
                      <Copy className="w-3 h-3" /> العنوان
                    </button>
                    {editable && (
                      <>
                        <button
                          onClick={() =>
                            download(
                              rom.slice(c.offset, c.offset + tableBytes(c)),
                              `font-${address}-${c.layout.width}x${c.layout.height}-${c.layout.bpp}bpp.bin`
                            )
                          }
                          className="inline-flex items-center gap-1 rounded-lg border border-border px-3 py-1.5 text-xs"
                        >
                          <Download className="w-3 h-3" /> استخرج البايتات
                        </button>
                        <label className="inline-flex cursor-pointer items-center gap-1 rounded-lg border border-border px-3 py-1.5 text-xs">
                          <Upload className="w-3 h-3" /> استبدلها
                          <input
                            type="file"
                            accept="*/*"
                            className="hidden"
                            onChange={async (e) => {
                              const f = e.target.files?.[0];
                              if (!f) return;
                              const bytes = new Uint8Array(await f.arrayBuffer());
                              if (bytes.length > tableBytes(c)) {
                                toast.error(`الملف أكبر من مساحة الجدول (${tableBytes(c)} بايت)`);
                                return;
                              }
                              rom.set(bytes, c.offset);
                              setDirty((n) => n + 1);
                              toast.success(`كُتب ${bytes.length} بايت في ${address}`);
                            }}
                          />
                        </label>
                      </>
                    )}
                  </div>
                </div>

                <CandidateSheet
                  rom={rom}
                  candidate={c}
                  columns={columns}
                  onPick={editable ? (index) => setEditing({ key, index }) : undefined}
                />
                {editable && (
                  <p className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                    <Pencil className="w-3 h-3" /> انقر أيّ حرفٍ في الورقة لتعدّله بكسلاً بكسلاً
                  </p>
                )}

                {editing?.key === key && (
                  <GlyphEditor
                    rom={rom}
                    candidate={c}
                    index={editing.index}
                    onClose={() => setEditing(null)}
                    onSave={(pixels) => {
                      writeGbaGlyph(rom, c.offset, c.layout, editing.index, pixels);
                      setDirty((n) => n + 1);
                      setEditing(null);
                      toast.success("كُتب الحرف — نزّل الروم حين تنتهي");
                    }}
                  />
                )}
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
