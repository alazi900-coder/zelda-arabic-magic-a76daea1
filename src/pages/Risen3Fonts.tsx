import { useCallback, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Package, Loader2, Download, Type } from "lucide-react";
import { toast } from "sonner";
import {
  parseImagesPakHeader,
  parseImagesPakFileInfoTree,
  type RisenPakHeader,
  type RisenPakNode,
} from "@/lib/risen-images-pak";
import { inflateFontsPakEntry, buildFontsPakArchive } from "@/lib/risen2-fontspak";
import {
  parseRisen3Fnt,
  buildRisen3Fnt,
  looksLikeRisen3Fnt,
  risen3FntName,
  risen3FntAtlas,
  type Risen3FntDocument,
} from "@/lib/risen3-fnt";
import { addArabicToRisen3Fnt, measureRisen3CellMetrics } from "@/lib/risen3-arabic-font-gen";
import { renderArabicGlyphsForRisen3 } from "@/lib/risen3-glyph-render";
import { FREE_ARABIC_FONTS, fetchFreeFontBytes } from "@/lib/risen2-free-fonts";

/**
 * Risen 3 font tool: opens `0_na_fnt.pak`, adds Arabic to a font, writes the
 * archive back.
 *
 * Separate from the Risen 2 tool on purpose. The container is the same and the
 * font object descends from the same one, but the atlas here is a signed
 * distance field — the byte is a distance from the letter's edge, not a shade —
 * so the drawing path is different code entirely. Sharing a page would have
 * meant one format's changes reaching into the other's, and the Risen 2 tool
 * works today.
 */

interface FontEntry {
  path: string;
  name: string;
  bytes: Uint8Array;
  doc: Risen3FntDocument;
}

/** Draws an atlas into a canvas so the translator can see what was written. */
function AtlasPreview({ doc, height = 260 }: { doc: Risen3FntDocument; height?: number }) {
  const draw = useCallback(
    (canvas: HTMLCanvasElement | null) => {
      if (!canvas) return;
      const atlas = risen3FntAtlas(doc);
      canvas.width = atlas.width;
      canvas.height = atlas.height;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      const image = ctx.createImageData(atlas.width, atlas.height);
      for (let i = 0; i < atlas.pixels.length; i++) {
        // The field is drawn as it is stored, so the edge reads as mid grey and
        // anything brighter is inside a letter.
        const v = atlas.pixels[i];
        image.data[i * 4] = v;
        image.data[i * 4 + 1] = v;
        image.data[i * 4 + 2] = v;
        image.data[i * 4 + 3] = 255;
      }
      ctx.putImageData(image, 0, 0);
    },
    [doc]
  );
  return (
    <canvas
      ref={draw}
      style={{ height, imageRendering: "pixelated" }}
      className="w-full rounded-lg border border-border bg-black object-contain"
    />
  );
}

export default function Risen3Fonts() {
  const [busy, setBusy] = useState<string | null>(null);
  const [archive, setArchive] = useState<{
    bytes: Uint8Array;
    header: RisenPakHeader;
    tree: RisenPakNode[];
    fonts: FontEntry[];
  } | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [fontId, setFontId] = useState(FREE_ARABIC_FONTS[0]?.id ?? "");
  const [result, setResult] = useState<{ path: string; doc: Risen3FntDocument; note: string } | null>(null);

  const current = useMemo(
    () => archive?.fonts.find((f) => f.path === selected) ?? null,
    [archive, selected]
  );

  const openPak = useCallback(async (file: File) => {
    setBusy("يفكّ الحاوية…");
    setResult(null);
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const header = parseImagesPakHeader(bytes);
      const { tree } = parseImagesPakFileInfoTree(bytes.subarray(header.fileInfoOffset), header);
      const fonts: FontEntry[] = [];
      const walk = (nodes: RisenPakNode[], prefix: string) => {
        for (const node of nodes) {
          const path = prefix ? `${prefix}/${node.name}` : node.name;
          if (node.type === "folder") {
            walk(node.children, path);
            continue;
          }
          let inner: Uint8Array;
          try {
            inner = inflateFontsPakEntry(bytes, node);
          } catch {
            continue;
          }
          if (!looksLikeRisen3Fnt(inner)) continue;
          fonts.push({ path, name: risen3FntName(inner), bytes: inner, doc: parseRisen3Fnt(inner) });
        }
      };
      walk(tree, "");
      if (fonts.length === 0) throw new Error("لا خطوط Risen 3 في هذا الملف — المطلوب 0_na_fnt.pak");
      setArchive({ bytes, header, tree, fonts });
      setSelected(fonts[0].path);
      toast.success(`قُرئ ${fonts.length} خطّاً`);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  }, []);

  const inject = useCallback(async () => {
    if (!current) return;
    setBusy("يرسم الحروف ويبني الحقول…");
    try {
      const entry = FREE_ARABIC_FONTS.find((f) => f.id === fontId);
      if (!entry) throw new Error("اختر خطّاً عربياً أولاً");
      const fontBytes = await fetchFreeFontBytes(entry);
      const metrics = measureRisen3CellMetrics(current.doc);
      const { glyphs, fontSize } = await renderArabicGlyphsForRisen3(fontBytes, metrics);
      const out = addArabicToRisen3Fnt(current.doc, glyphs);
      setResult({
        path: current.path,
        doc: out.document,
        note:
          `${out.added} شكلاً أُضيف` +
          (out.replaced.length > 0 ? ` و${out.replaced.length} أُعيدت كتابته` : "") +
          ` | الخلية ${metrics.cellHeight} وخط الكتابة ${metrics.baseline} وحجم الرسم ${fontSize}` +
          ` | الأطلس ${out.heightBefore} ← ${out.heightAfter}`,
      });
      toast.success("تمّ الحقن — عاين الأطلس قبل التنزيل");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  }, [current, fontId]);

  const download = useCallback(() => {
    if (!archive || !result) return;
    setBusy("يعيد بناء الحاوية…");
    try {
      const replacements = new Map<string, Uint8Array>([[result.path, buildRisen3Fnt(result.doc)]]);
      const built = buildFontsPakArchive(archive.bytes, archive.header, archive.tree, replacements);
      const blob = new Blob([built.bytes as unknown as ArrayBuffer], { type: "application/octet-stream" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "0_na_fnt.pak";
      a.click();
      URL.revokeObjectURL(url);
      toast.success("نُزّل 0_na_fnt.pak — ضعه مكان الأصلي بعد أخذ نسخة احتياطية");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  }, [archive, result]);

  return (
    <div className="min-h-screen bg-background p-4 md:p-8" dir="rtl">
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <Link to="/risen" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
            <ArrowRight className="w-4 h-4" /> الرجوع
          </Link>
          <h1 className="text-2xl font-display font-bold">أداة خطوط Risen 3</h1>
        </div>

        <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 text-sm">
          <strong className="font-display block mb-1">لم تُجرَّب داخل اللعبة بعد</strong>
          <p className="text-muted-foreground">
            الصيغة مفكوكة والخطوط السبعة تُعاد بناءً بايتاً ببايت، والحقول المولّدة تطابق حقول اللعبة نفسها ضمن نصف بكسل.
            لكن تكبير الأطلس لم يُجرَّب في Risen 3 بعد — خذ نسخة احتياطية من <code>0_na_fnt.pak</code> قبل الاستبدال، وابدأ بخطّ واحد لتعرف أيّها السبب لو حدث خلل.
          </p>
        </div>

        <div className="rounded-xl border border-border bg-card p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-lg bg-primary/15 flex items-center justify-center">
              <Package className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h2 className="font-display font-bold">افتح 0_na_fnt.pak</h2>
              <p className="text-sm text-muted-foreground">
                من <code>Risen 3 Titan Lords Enhanced Edition/data/packed</code>
              </p>
            </div>
          </div>
          <input
            type="file"
            accept=".pak"
            className="block w-full text-sm file:mr-4 file:rounded-lg file:border-0 file:bg-primary file:px-4 file:py-2 file:text-primary-foreground"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void openPak(f);
            }}
          />
        </div>

        {archive && (
          <div className="rounded-xl border border-border bg-card p-6 space-y-4">
            <h2 className="font-display font-bold">اختر الخطّ</h2>
            <div className="grid gap-2">
              {archive.fonts.map((f) => {
                const atlas = risen3FntAtlas(f.doc);
                const cyrillic = f.doc.charmap.filter((p) => p.charCode >= 0x400 && p.charCode <= 0x4ff).length;
                return (
                  <button
                    key={f.path}
                    onClick={() => {
                      setSelected(f.path);
                      setResult(null);
                    }}
                    className={`rounded-lg border p-3 text-right transition ${
                      selected === f.path ? "border-primary bg-primary/5" : "border-border hover:border-primary/40"
                    }`}
                  >
                    <div className="font-medium">{f.name || f.path}</div>
                    <div className="text-xs text-muted-foreground">
                      {f.doc.charmap.length} حرفاً | أطلس {atlas.width}×{atlas.height} |{" "}
                      {cyrillic >= 200 ? "خطّ نصّ (يحمل الروسية كاملة)" : "زخرفي"}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {current && (
          <div className="rounded-xl border border-border bg-card p-6 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-primary/15 flex items-center justify-center">
                <Type className="w-5 h-5 text-primary" />
              </div>
              <h2 className="font-display font-bold">أضف العربية إلى «{current.name}»</h2>
            </div>
            <select
              value={fontId}
              onChange={(e) => setFontId(e.target.value)}
              className="w-full rounded-lg border border-border bg-background p-2 text-sm"
            >
              {FREE_ARABIC_FONTS.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name} — {f.style}
                </option>
              ))}
            </select>
            <button
              onClick={() => void inject()}
              disabled={busy !== null}
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-primary-foreground disabled:opacity-50"
            >
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Type className="w-4 h-4" />}
              {busy ?? "ارسم واحقن"}
            </button>

            <div>
              <div className="mb-2 text-sm text-muted-foreground">الأطلس الحالي</div>
              <AtlasPreview doc={current.doc} />
            </div>
          </div>
        )}

        {result && (
          <div className="rounded-xl border border-primary/40 bg-primary/5 p-6 space-y-4">
            <h2 className="font-display font-bold">بعد الحقن</h2>
            <p className="text-sm text-muted-foreground">{result.note}</p>
            <AtlasPreview doc={result.doc} height={320} />
            <button
              onClick={download}
              disabled={busy !== null}
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-primary-foreground disabled:opacity-50"
            >
              <Download className="w-4 h-4" /> نزّل 0_na_fnt.pak
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
