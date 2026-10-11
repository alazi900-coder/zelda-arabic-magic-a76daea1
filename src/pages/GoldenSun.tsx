import { useState, useCallback, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Upload, Loader2, ArrowRight, BookOpen, BookMarked, ShieldCheck, FileText } from "lucide-react";
import { toast } from "sonner";
import { idbSet, idbGet } from "@/lib/idb-storage";
import {
  extractGoldenSunEditorEntries,
  restoreGoldenSunTranslations,
  detectGoldenSunLayout,
  isBrokenGoldenSunRtlRom,
  GOLDENSUN_BROKEN_RTL_MESSAGE,
  GOLDENSUN_BUFFER_KEY,
  GOLDENSUN_SOURCE_GAME,
  GOLDENSUN_UNKNOWN_ROM_MESSAGE,
} from "@/lib/goldensun/goldensun-editor-bridge";
import { APP_VERSION } from "@/lib/version";
import {
  parseGoldenSun2Catalog, goldenSun2ToEditorEntries, goldenSun2Translations,
  GOLDENSUN2_SOURCE_GAME, GOLDENSUN2_BUFFER_KEY, GOLDENSUN2_TRANSLATIONS_KEY,
  GOLDENSUN2_CATALOG_SIG_KEY, goldenSun2CatalogFingerprint,
} from "@/lib/goldensun/goldensun2-editor-bridge";
import { auditGoldenSun2Rom, looksLikeGoldenSun2Rom, type GoldenSun2Audit } from "@/lib/goldensun/goldensun2-rom";

/**
 * Golden Sun opener: reads the cartridge's Huffman-compressed string table
 * into the shared editor (`/editor`), which rewrites it when it builds the
 * `.gba` back out. The ROM to open is the one with GoldenSun-AR-RTL-FONT-v8.ups
 * applied: it already has the Arabic font and right-to-left engine, so the
 * build only changes the text.
 */
type GoldenSunPart = "first" | "second";

export default function GoldenSun() {
  const [selectedPart, setSelectedPart] = useState<GoldenSunPart>("first");
  const [savedCounts, setSavedCounts] = useState({ first: 0, second: 0 });
  const [busy, setBusy] = useState(false);
  const [lostAgeAudit, setLostAgeAudit] = useState<GoldenSun2Audit | null>(null);
  const [catalogBusy, setCatalogBusy] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    let active = true;
    void Promise.all([
      idbGet<{ translations?: Record<string, string> }>("editorState:goldensun"),
      idbGet<{ translations?: Record<string, string> }>("editorState:goldensun2"),
    ]).then(([first, second]) => {
      if (active) setSavedCounts({
        first: Object.keys(first?.translations || {}).filter(k => first?.translations?.[k]?.trim()).length,
        second: Object.keys(second?.translations || {}).filter(k => second?.translations?.[k]?.trim()).length,
      });
    });
    return () => { active = false; };
  }, [selectedPart]);

  useEffect(() => {
    if (selectedPart !== "second") return;
    let active = true;
    void idbGet<ArrayBuffer>(GOLDENSUN2_BUFFER_KEY).then(buf => {
      if (!active || !buf) return;
      const rom = new Uint8Array(buf);
      if (looksLikeGoldenSun2Rom(rom)) setLostAgeAudit(auditGoldenSun2Rom(rom));
    });
    return () => { active = false; };
  }, [selectedPart]);


  // The shared editor stores its active document globally, so preserve each
  // Golden Sun game's translations before switching to the other game.
  const storePreviousGoldenSunTranslations = useCallback(async () => {
    const source = await idbGet<string>("editor-source-game");
    const state = await idbGet<{ translations?: Record<string, string> }>("editorState");
    if (!state?.translations) return;
    if (source === GOLDENSUN2_SOURCE_GAME) {
      await idbSet(GOLDENSUN2_TRANSLATIONS_KEY, state.translations);
      const signature = await idbGet<string>(GOLDENSUN2_CATALOG_SIG_KEY);
      if (signature) await idbSet(GOLDENSUN2_TRANSLATIONS_KEY + ":" + signature, state.translations);
    } else if (source === GOLDENSUN_SOURCE_GAME) {
      await idbSet("goldensun1Translations", state.translations);
    }
  }, []);

  const openSavedProject = useCallback(async () => {
    try {
      const game = selectedPart === "first" ? GOLDENSUN_SOURCE_GAME : GOLDENSUN2_SOURCE_GAME;
      const buffer = await idbGet<ArrayBuffer>(selectedPart === "first" ? GOLDENSUN_BUFFER_KEY : GOLDENSUN2_BUFFER_KEY);
      if (!buffer) throw new Error("لم يُحفظ ROM لهذا الجزء بعد. ارفعه أولًا.");
      const snapshot = await idbGet<{
        entries?: Array<{ msbtFile: string; index: number; original: string }>;
        translations?: Record<string, string>;
        protectedEntries?: string[]; technicalBypass?: string[]; clearedKeys?: string[];
      }>("editorState:" + game);
      if (!snapshot?.entries?.length) throw new Error("لا توجد جلسة سابقة محفوظة لهذا الجزء.");
      await storePreviousGoldenSunTranslations();
      await idbSet("editorState", { ...snapshot, freshExtraction: true });
      await idbSet("editor-source-game", game);
      const originals = { ...((await idbGet<Record<string, string>>("originalTexts")) || {}) };
      for (const e of snapshot.entries) originals[`${e.msbtFile}:${e.index}`] = e.original;
      await idbSet("originalTexts", originals);
      navigate("/editor");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    }
  }, [selectedPart, navigate, storePreviousGoldenSunTranslations]);

  const loadLostAgeCatalog = useCallback(async (file: File) => {
    if (selectedPart !== "second") {
      toast.error("اختر قسم الجزء الثاني أولًا");
      return;
    }
    setCatalogBusy(true);
    try {
      const rom = await idbGet<ArrayBuffer>(GOLDENSUN2_BUFFER_KEY);
      if (!rom || !looksLikeGoldenSun2Rom(new Uint8Array(rom))) {
        throw new Error("ارفع ROM الجزء الثاني AGFE أولًا قبل ملف النصوص");
      }
      const catalog = parseGoldenSun2Catalog(JSON.parse(await file.text()));
      const entries = goldenSun2ToEditorEntries(catalog);
      const existingGame = await idbGet<string>("editor-source-game");
      const active = await idbGet<{ translations?: Record<string, string> }>("editorState");
      const signature = goldenSun2CatalogFingerprint(catalog);
      const previousSignature = await idbGet<string>(GOLDENSUN2_CATALOG_SIG_KEY);
      const saved = await idbGet<Record<string, string>>(GOLDENSUN2_TRANSLATIONS_KEY + ":" + signature);
      const savedSnapshot = await idbGet<{
        protectedEntries?: string[]; technicalBypass?: string[]; clearedKeys?: string[];
      }>("editorState:goldensun2:" + signature);
      await storePreviousGoldenSunTranslations();
      const translations = goldenSun2Translations(catalog, {
        ...(saved || {}),
        ...(existingGame === GOLDENSUN2_SOURCE_GAME && previousSignature === signature
          ? active?.translations || {} : {}),
      });
      await idbSet(GOLDENSUN2_CATALOG_SIG_KEY, signature);
      await idbSet("editorState", {
        entries, translations, freshExtraction: true,
        protectedEntries: savedSnapshot?.protectedEntries || [],
        technicalBypass: savedSnapshot?.technicalBypass || [],
        clearedKeys: savedSnapshot?.clearedKeys || [],
      });
      await idbSet("editor-source-game", GOLDENSUN2_SOURCE_GAME);
      const originals = { ...((await idbGet<Record<string, string>>("originalTexts")) || {}) };
      for (const e of entries) originals[`${e.msbtFile}:${e.index}`] = e.original;
      await idbSet("originalTexts", originals);
      toast.success(`فُتح ${entries.length} نصًا من كتالوج الجزء الثاني في المحرر المشترك — الوسوم التقنية محمية عند التصدير`);
      navigate("/editor");
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setCatalogBusy(false);
    }
  }, [navigate, storePreviousGoldenSunTranslations, selectedPart]);

  const loadRom = useCallback(
    async (file: File) => {
      setBusy(true);
      try {
        const rom = new Uint8Array(await file.arrayBuffer());
        const isSecond = looksLikeGoldenSun2Rom(rom);
        if (selectedPart === "first" && isSecond) throw new Error("هذا ملف الجزء الثاني؛ اختر قسم The Lost Age أولًا");
        if (selectedPart === "second" && !isSecond) throw new Error("هذا ليس ROM الجزء الثاني AGFE؛ اختر ملفه الصحيح");
        if (isSecond) {
          const audit = auditGoldenSun2Rom(rom);
          if (!audit.sizeMatches) throw new Error("حجم ROM الجزء الثاني ليس 16 ميجابايت — لن تُقبل نسخة غير معروفة");
          await idbSet(GOLDENSUN2_BUFFER_KEY, rom.buffer.slice(0));
          setLostAgeAudit(audit);
          toast.info("تعرّفنا على الجزء الثاني AGFE. فحص ROM متاح، لكن استخراج الحوارات المضغوطة والبناء غير مفعّلين لحين تأكيد خريطتهما.");
          return;
        }
        setLostAgeAudit(null);
        const layout = detectGoldenSunLayout(rom);
        if (!layout) throw new Error(isBrokenGoldenSunRtlRom(rom) ? GOLDENSUN_BROKEN_RTL_MESSAGE : GOLDENSUN_UNKNOWN_ROM_MESSAGE);
        const entries = extractGoldenSunEditorEntries(rom, layout);
        if (entries.length === 0) throw new Error("لم يُعثر على نصوص في هذا الروم");

        const existing = await idbGet<{ translations?: Record<string, string> }>("editorState");
        const previousGame = await idbGet<string>("editor-source-game");
        const saved = await idbGet<Record<string, string>>("goldensun1Translations");
        const savedSnapshot = await idbGet<{
          protectedEntries?: string[]; technicalBypass?: string[]; clearedKeys?: string[];
        }>("editorState:goldensun");
        await storePreviousGoldenSunTranslations();
        const translations = restoreGoldenSunTranslations(entries, {
          ...(saved || {}),
          ...(previousGame === GOLDENSUN_SOURCE_GAME ? existing?.translations || {} : {}),
        });

        await idbSet("editorState", {
          entries, translations, freshExtraction: true,
          protectedEntries: savedSnapshot?.protectedEntries || [],
          technicalBypass: savedSnapshot?.technicalBypass || [],
          clearedKeys: savedSnapshot?.clearedKeys || [],
        });
        await idbSet("editor-source-game", GOLDENSUN_SOURCE_GAME);
        await idbSet(GOLDENSUN_BUFFER_KEY, rom.buffer.slice(0));

        const originals: Record<string, string> = {
          ...((await idbGet<Record<string, string>>("originalTexts")) || {}),
        };
        for (const e of entries) originals[`${e.msbtFile}:${e.index}`] = e.original;
        await idbSet("originalTexts", originals);

        const restored = Object.keys(translations).length;
        if (layout.id === "vanilla") {
          toast.warning("هذا روم أصلي بلا رقعة الاتجاه — الروم المبني سيظهر من اليسار لليمين. طبّق GoldenSun-AR-RTL-FONT-v8.ups أولاً.");
        }
        toast.success(
          `استُخرج ${entries.length.toLocaleString("ar")} نصاً` +
            (restored > 0 ? ` — واسترجاع ${restored.toLocaleString("ar")} ترجمة محفوظة` : "")
        );
        navigate("/editor");
      } catch (e) {
        toast.error((e as Error).message);
      } finally {
        setBusy(false);
      }
    },
    [navigate, storePreviousGoldenSunTranslations, selectedPart]
  );

  return (
    <div className="min-h-screen bg-background text-foreground" dir="rtl">
      <div className="mx-auto max-w-3xl px-4 py-10">
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">تعريب Golden Sun</h1>
            <p className="text-xs text-muted-foreground">نسخة الأداة {APP_VERSION}</p>
          </div>
          <Link to="/" className="text-sm text-muted-foreground hover:underline">
            الرجوع <ArrowRight className="inline h-4 w-4" />
          </Link>
        </div>

        <div className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-2" role="group" aria-label="اختر جزء Golden Sun">
          <button type="button" aria-pressed={selectedPart === "first"} disabled={busy || catalogBusy}
            onClick={() => { setSelectedPart("first"); setLostAgeAudit(null); }}
            className={`rounded-xl border-2 p-4 text-right transition-colors ${selectedPart === "first" ? "border-primary bg-primary/5" : "border-border hover:bg-muted/50"}`}>
            <div className="mb-2 flex items-center gap-2"><BookOpen className="h-5 w-5" /><strong>الجزء الأول</strong></div>
            <p className="text-sm text-muted-foreground">Golden Sun · AGSE · 8 MB</p>
            <p className="mt-2 text-xs">استخراج النصوص، الترجمة، الحماية وبناء GBA</p>
            <p className="mt-2 text-xs text-muted-foreground">الترجمات المحفوظة: {savedCounts.first.toLocaleString("ar")}</p>
          </button>
          <button type="button" aria-pressed={selectedPart === "second"} disabled={busy || catalogBusy}
            onClick={() => setSelectedPart("second")}
            className={`rounded-xl border-2 p-4 text-right transition-colors ${selectedPart === "second" ? "border-primary bg-primary/5" : "border-border hover:bg-muted/50"}`}>
            <div className="mb-2 flex items-center gap-2"><BookMarked className="h-5 w-5" /><strong>الجزء الثاني</strong></div>
            <p className="text-sm text-muted-foreground">The Lost Age · AGFE · 16 MB</p>
            <p className="mt-2 text-xs">محرر مشترك وحماية وسوم؛ بناء GBA قيد التطوير</p>
            <p className="mt-2 text-xs text-muted-foreground">الترجمات المحفوظة: {savedCounts.second.toLocaleString("ar")}</p>
          </button>
        </div>

        <div className="mb-5 flex items-start gap-2 rounded-lg border p-3 text-sm">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
          <span>البرومبتات، مزوّدو الترجمة، أدوات المراجعة، إعدادات المحرر وقواعد حماية الوسوم مشتركة. محفوظات النصوص والترجمات لكل جزء مستقلة.</span>
        </div>
        <p className="mb-3 text-sm text-muted-foreground">
          {selectedPart === "first"
            ? "الجزء الأول: افتح ROM الأصلية أو النسخة التي تحتوي على رقعة GoldenSun-AR-RTL-FONT-v8.ups. يُفتح المحرر ثم يمكنك بناء GBA."
            : "الجزء الثاني: افتح ROM AGFE بحجم 16 MB ثم حمّل كتالوج نصوص JSON إلى نفس المحرر. يمكن تصدير الترجمة، لكن إعادة بناء GBA لم تُتحقق بعد."}
        </p>
        <button type="button" className="mb-4 flex items-center gap-2 rounded-lg border px-4 py-2 text-sm font-semibold hover:bg-muted" onClick={() => void openSavedProject()}>
          <FileText className="h-4 w-4" />
          متابعة آخر ترجمات محفوظة للجزء {selectedPart === "first" ? "الأول" : "الثاني"}
        </button>

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
          className={`flex cursor-pointer flex-col items-center gap-2 rounded-xl border-2 border-dashed p-10 text-center transition ${
            dragOver ? "border-primary bg-primary/5" : "border-muted"
          }`}
        >
          {busy ? <Loader2 className="h-8 w-8 animate-spin" /> : <Upload className="h-8 w-8 text-muted-foreground" />}
          <span className="font-medium">{busy ? "يُقرأ الروم…" : "أفلت ملف ‎.gba‎ هنا أو اضغط للاختيار"}</span>
          <span className="text-xs text-muted-foreground">{selectedPart === "first" ? "الجزء الأول — ٨ ميجابايت" : "الجزء الثاني — ١٦ ميجابايت"} ويُقرأ في المتصفح</span>
          <input
            type="file"
            accept=".gba"
            className="hidden"
            disabled={busy}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void loadRom(f);
              e.target.value = "";
            }}
          />
        </label>

        {selectedPart === "second" && lostAgeAudit && (
          <section className="mt-5 space-y-3 rounded-xl border p-4" aria-label="فحص Golden Sun الجزء الثاني">
            <h2 className="font-semibold">Golden Sun: The Lost Age — الجزء الثاني</h2>
            <p className="text-sm">تعرّفت الأداة على AGFE وحجم {lostAgeAudit.romSize.toLocaleString("ar")} بايت. هذه مرحلة فحص فقط، وليست استخراجًا كاملًا للحوارات: نصوص القصة مضغوطة بصيغة تحتاج مفككًا خاصًا بها.</p>
            <p className="text-sm text-amber-600">لن تستخدم الأداة مفكك Huffman الخاص بالجزء الأول أو تدّعي أن النصوص التشخيصية هي كل الحوارات. يمكنك استيراد كتالوج نصوص JSON مستخرج سابقًا إلى المحرر المشترك، ثم تصدير الترجمات مع فحص الوسوم دون بناء GBA غير مؤكدة.</p>
            <label className="flex cursor-pointer flex-col gap-2 rounded-lg border border-dashed p-3 text-sm">
              <span className="font-semibold">{catalogBusy ? "جارٍ فتح النصوص…" : "فتح كتالوج نصوص الجزء الثاني في المحرر المشترك (.json؛ يدعم حقلي source وarabic)"}</span>
              <span className="text-xs text-muted-foreground">مثال: {"{\"entries\":[{\"index\":0,\"original\":\"Hello\\\\x03World\",\"translation\":\"مرحبًا\\\\x03بكم\"}]}"} — يُحفظ الرمز التقني كما هو.</span>
              <input className="text-xs" type="file" accept=".json,application/json" disabled={catalogBusy} onChange={e => {
                const f = e.target.files?.[0]; if (f) void loadLostAgeCatalog(f); e.target.value = "";
              }} />
            </label>
            <button type="button" className="rounded-lg border px-3 py-2 text-sm hover:bg-muted" onClick={() => {
              const blob = new Blob([JSON.stringify(lostAgeAudit, null, 2)], { type: "application/json" });
              const url = URL.createObjectURL(blob);
              const link = document.createElement("a");
              link.href = url; link.download = "golden-sun-2-rom-audit.json"; link.click();
              URL.revokeObjectURL(url);
            }}>تنزيل تقرير فحص ROM</button>
            <p className="text-xs text-muted-foreground">عُثر على {lostAgeAudit.samplePlainStrings.length} سلسلة ASCII تشخيصية. لا تُعدّ ترجمة للحوار.</p>
          </section>
        )}

        <div className="mt-6 space-y-2 text-xs text-muted-foreground">
          <p>
            <strong className="text-foreground">الرموز التقنية</strong> تظهر كـ<code>{"\\xNN"}</code>{" "}
            (مثلاً <code>{"\\x02"}</code> نهاية الصندوق، <code>{"\\x03"}</code> سطر جديد،
            <code>{"\\x11\\x01"}</code> اسم البطل). السطر الذي يسقط منه واحد منها يُرفض ولا يُكتب.
          </p>
          {selectedPart === "first" ? (
            <p><strong className="text-foreground">حد الطول للجزء الأول:</strong> ٢٥٤ بايتاً مضغوطاً للسطر؛ البناء يرفض ما يتجاوز ذلك.</p>
          ) : (
            <p><strong className="text-foreground">الجزء الثاني:</strong> لم يُحدد حد النصوص المضغوطة بعد؛ لن تدّعي الأداة أن ترجمات JSON قابلة للبناء حتى يكتمل محرك AGFE.</p>
          )}
        </div>
      </div>
    </div>
  );
}
