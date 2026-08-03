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
  patchRisen3FontDb,
  readRisen3FontCsv,
  risen3FntHashFromPath,
  type Risen3FntDocument,
} from "@/lib/risen3-fnt";
import { addArabicToRisen3Fnt, measureRisen3Metrics } from "@/lib/risen3-arabic-font-gen";
import { renderArabicGlyphsForRisen3 } from "@/lib/risen3-glyph-render";
import { FREE_ARABIC_FONTS, fetchFreeFontBytes } from "@/lib/risen2-free-fonts";
import { verifyRisen3Archive, formatRisen3Report, type Risen3ArchiveReport } from "@/lib/risen3-verify";
import { APP_VERSION } from "@/lib/version";

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
  /** The name in the file's own header — the one the index records it under. */
  name: string;
  bytes: Uint8Array;
  doc: Risen3FntDocument;
  /** The name the index uses, e.g. «Linux Biolinum O_30__sdf». */
  dbName: string | null;
}

/**
 * Past this the game slows down noticeably — measured by the Chinese
 * translation of Risen 3, whose thousands of characters ran into it.
 */
const ATLAS_BUDGET = 1024 * 2048;

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
    dbPath: string;
    dbBytes: Uint8Array;
  } | null>(null);
  const [chosen, setChosen] = useState<Set<string>>(new Set());
  const [fontId, setFontId] = useState(FREE_ARABIC_FONTS[0]?.id ?? "");
  const [results, setResults] = useState<{ path: string; label: string; doc: Risen3FntDocument; note: string }[]>([]);
  const [report, setReport] = useState<Risen3ArchiveReport | null>(null);
  const [built, setBuilt] = useState<Uint8Array | null>(null);

  const preview = useMemo(() => results.find((r) => r.doc) ?? null, [results]);

  const openPak = useCallback(async (file: File) => {
    setBusy("يفكّ الحاوية…");
    setResults([]);
    setReport(null);
    setBuilt(null);
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const header = parseImagesPakHeader(bytes);
      const { tree } = parseImagesPakFileInfoTree(bytes.subarray(header.fileInfoOffset), header);
      const fonts: FontEntry[] = [];
      let dbPath: string | null = null;
      let dbBytes: Uint8Array | null = null;
      let csvBytes: Uint8Array | null = null;
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
          if (path.endsWith(".db")) {
            dbPath = path;
            dbBytes = inner;
            continue;
          }
          if (path.endsWith(".csv")) {
            csvBytes = inner;
            continue;
          }
          if (!looksLikeRisen3Fnt(inner)) continue;
          fonts.push({ path, name: risen3FntName(inner), bytes: inner, doc: parseRisen3Fnt(inner), dbName: null });
        }
      };
      walk(tree, "");
      if (fonts.length === 0) throw new Error("لا خطوط Risen 3 في هذا الملف — المطلوب 0_na_fnt.pak");
      if (!dbBytes || !dbPath) throw new Error("لا فهرس w_fnt_0_na.db في هذا الملف — بدونه لا يمكن تسجيل الحجم الجديد");
      // The index records a font under its full name («…_30__sdf»), which the
      // font's own header does not carry — and two of the seven share a family,
      // so matching on the family would write one font's size into the other's
      // record. The manifest maps the hash in the filename to the full name,
      // and that cannot be ambiguous.
      const byHash = csvBytes ? readRisen3FontCsv(csvBytes) : new Map<string, string>();
      for (const f of fonts) {
        const hash = risen3FntHashFromPath(f.path);
        f.dbName = (hash ? byHash.get(hash) : null) ?? null;
      }
      setArchive({ bytes, header, tree, fonts, dbPath, dbBytes });
      // The text fonts are ticked to begin with: they are the ones that carry
      // the whole Russian alphabet, which is what an Arabic build actually
      // needs and also where its glyphs will live.
      setChosen(new Set(fonts.filter((f) => f.doc.charmap.filter((p) => p.charCode >= 0x400 && p.charCode <= 0x4ff).length >= 200).map((f) => f.path)));
      setResults([]);
      setReport(null);
      setBuilt(null);
      toast.success(`قُرئ ${fonts.length} خطّاً`);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  }, []);

  const inject = useCallback(async () => {
    if (!archive || chosen.size === 0) return;
    setBusy("يرسم الحروف ويبني الحقول…");
    try {
      const entry = FREE_ARABIC_FONTS.find((f) => f.id === fontId);
      if (!entry) throw new Error("اختر خطّاً عربياً أولاً");
      const fontBytes = await fetchFreeFontBytes(entry);

      const out: typeof results = [];
      const refused: string[] = [];
      const replacements = new Map<string, Uint8Array>();
      let db = archive.dbBytes;
      for (const target of archive.fonts.filter((f) => chosen.has(f.path))) {
        const metrics = measureRisen3Metrics(target.doc);
        const { glyphs, fontSize } = await renderArabicGlyphsForRisen3(fontBytes, metrics);
        const label = target.dbName ?? target.name;
        let injected: ReturnType<typeof addArabicToRisen3Fnt>;
        try {
          injected = addArabicToRisen3Fnt(target.doc, glyphs);
        } catch (e) {
          // One font that cannot hold the alphabet must not stop the others.
          refused.push(`«${label}»: ${(e as Error).message}`);
          continue;
        }
        out.push({
          path: target.path,
          label,
          doc: injected.document,
          note:
            `${injected.added} شكلاً | ${injected.reused} في خلايا الروسية` +
            (injected.squeezed > 0 ? ` | ${injected.squeezed} ضُيّق إلى ${Math.round(injected.narrowestScale * 100)}٪ ليدخل` : "") +
            (injected.appended > 0 ? ` | ${injected.appended} في صفوف جديدة` : "") +
            ` | الأطلس ${injected.heightBefore === injected.heightAfter ? "بلا تغيير" : `${injected.heightBefore} ← ${injected.heightAfter}`}` +
            ` | خطّ الكتابة ${metrics.baseline}، الهامش ${metrics.margin}، الحجم ${fontSize}`,
        });

        const bytes = buildRisen3Fnt(injected.document);
        replacements.set(target.path, bytes);
        if (bytes.length !== target.bytes.length) {
          if (!target.dbName) throw new Error(`لم أجد «${label}» في بيان الخطوط — لا أبني ملفاً يرفضه المحرّك`);
          db = patchRisen3FontDb(db, target.dbName, bytes.length);
        }
      }
      if (refused.length > 0) toast.error(refused.join(" | "));
      if (replacements.size === 0) throw new Error(`لم يُحقن أي خطّ. ${refused.join(" | ")}`);
      if (db !== archive.dbBytes) replacements.set(archive.dbPath, db);

      setBusy("يبني الحاوية ويفحصها…");
      const archiveOut = buildFontsPakArchive(archive.bytes, archive.header, archive.tree, replacements);
      // The file is checked as a file, not as an intention: everything that has
      // broken a build so far is read back out of the bytes just written.
      const checked = verifyRisen3Archive(archiveOut.bytes, APP_VERSION, archive.bytes);
      setResults(out.concat(refused.map((r) => ({ path: r, label: "تعذّر", doc: null as never, note: r }))));
      setReport(checked);
      setBuilt(checked.problems.length === 0 ? archiveOut.bytes : null);
      if (checked.problems.length === 0) toast.success("تمّ البناء وسلِم الفحص");
      else toast.error(`${checked.problems.length} مشكلة — التنزيل موقوف، أرسل لي التقرير`);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  }, [archive, chosen, fontId]);

  const download = useCallback(() => {
    if (!built) return;
    const blob = new Blob([built as unknown as ArrayBuffer], { type: "application/octet-stream" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "0_na_fnt.pak";
    a.click();
    URL.revokeObjectURL(url);
    toast.success("نُزّل 0_na_fnt.pak — ضعه مكان الأصلي بعد أخذ نسخة احتياطية");
  }, [built]);

  const copyReport = useCallback(() => {
    if (!report) return;
    void navigator.clipboard.writeText(formatRisen3Report(report));
    toast.success("نُسخ التقرير");
  }, [report]);

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
          <strong className="font-display block mb-1">خذ نسخة احتياطية قبل الاستبدال</strong>
          <p className="text-muted-foreground">
            الأداة تضع الأشكال العربية في خلايا الأبجدية الروسية — لا تستعملها نسخة عربية — فلا يكبر الأطلس ولا يتغيّر حجم الخطّ.
            وإن لم تسع الخلايا كلَّ الأشكال، يكبر الأطلس ويُحدَّث معه الفهرس <code>w_fnt_0_na.db</code>: تركه قديماً هو ما جعل المحرّك يرمي الخطّ كلّه فاختفت النصوص جميعها في أوّل بناء.
            بعد الاستبدال لن تعرض اللعبة الروسية — وهذا لا يكلّف نسخةً عربية شيئاً.
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
            <h2 className="font-display font-bold">اختر الخطوط</h2>
            <p className="text-sm text-muted-foreground">
              الخطوط النصّية مؤشَّرة مسبقاً — وهي التي تحمل الأبجدية الروسية كاملة، وهذا ما يميّز خطّ النصّ عن الزخرفي، وفي خلاياها ستسكن العربية.
            </p>
            <div className="grid gap-2">
              {archive.fonts.map((f) => {
                const atlas = risen3FntAtlas(f.doc);
                const cyrillic = f.doc.charmap.filter((p) => p.charCode >= 0x400 && p.charCode <= 0x4ff).length;
                const on = chosen.has(f.path);
                return (
                  <button
                    key={f.path}
                    onClick={() => {
                      const next = new Set(chosen);
                      if (on) next.delete(f.path);
                      else next.add(f.path);
                      setChosen(next);
                      setResults([]);
                      setReport(null);
                      setBuilt(null);
                    }}
                    className={`flex items-center gap-3 rounded-lg border p-3 text-right transition ${
                      on ? "border-primary bg-primary/5" : "border-border hover:border-primary/40"
                    }`}
                  >
                    <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border ${on ? "border-primary bg-primary text-primary-foreground" : "border-muted-foreground/40"}`}>
                      {on ? "✓" : ""}
                    </span>
                    <span>
                      <span className="block font-medium">{f.dbName ?? f.name ?? f.path}</span>
                      <span className="block text-xs text-muted-foreground">
                        {f.doc.charmap.length} حرفاً | أطلس {atlas.width}×{atlas.height} |{" "}
                        {cyrillic >= 200 ? `خطّ نصّ — ${cyrillic} خانة روسية متاحة` : "زخرفي"}
                      </span>
                    </span>
                  </button>
                );
              })}
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
              disabled={busy !== null || chosen.size === 0}
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-primary-foreground disabled:opacity-50"
            >
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Type className="w-4 h-4" />}
              {busy ?? `ارسم واحقن في ${chosen.size} خطّاً وابنِ`}
            </button>
          </div>
        )}

        {results.length > 0 && (
          <div className="rounded-xl border border-primary/40 bg-primary/5 p-6 space-y-4">
            <h2 className="font-display font-bold">بعد الحقن</h2>
            {results.map((r) => (
              <div key={r.path} className="text-sm">
                <span className="font-medium">{r.label}</span>
                <span className="block text-muted-foreground">{r.note}</span>
              </div>
            ))}
            {preview?.doc && <AtlasPreview doc={preview.doc} height={320} />}
          </div>
        )}

        {report && (
          <div className={`rounded-xl border p-6 space-y-4 ${report.problems.length === 0 ? "border-border bg-card" : "border-destructive/50 bg-destructive/5"}`}>
            <div className="flex items-center justify-between gap-3">
              <h2 className="font-display font-bold">
                {report.problems.length === 0 ? "الفحص: سليم" : `الفحص: ${report.problems.length} مشكلة`}
              </h2>
              <button onClick={copyReport} className="rounded-lg border border-border px-3 py-1.5 text-sm">
                انسخ التقرير
              </button>
            </div>
            {report.problems.length > 0 && (
              <ul className="list-disc space-y-1 pr-5 text-sm">
                {report.problems.map((p) => (
                  <li key={p}>{p}</li>
                ))}
              </ul>
            )}
            <pre className="max-h-72 overflow-auto rounded-lg bg-muted/40 p-3 text-xs" dir="ltr">
              {formatRisen3Report(report)}
            </pre>
            {built ? (
              <button
                onClick={download}
                className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-primary-foreground"
              >
                <Download className="w-4 h-4" /> نزّل 0_na_fnt.pak
              </button>
            ) : (
              <p className="text-sm">
                التنزيل موقوف: ملفٌ بهذه المشاكل يرميه المحرّك بلا أن يقول شيئاً، فتظهر اللعبة بلا نصّ. أرسل لي التقرير.
              </p>
            )}
          </div>
        )}

      </div>
    </div>
  );
}
