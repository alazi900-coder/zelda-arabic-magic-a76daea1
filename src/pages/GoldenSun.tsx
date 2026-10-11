import { useState, useCallback } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Upload, Loader2, ArrowRight } from "lucide-react";
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
} from "@/lib/goldensun/goldensun2-editor-bridge";
import { auditGoldenSun2Rom, looksLikeGoldenSun2Rom, type GoldenSun2Audit } from "@/lib/goldensun/goldensun2-rom";

/**
 * Golden Sun opener: reads the cartridge's Huffman-compressed string table
 * into the shared editor (`/editor`), which rewrites it when it builds the
 * `.gba` back out. The ROM to open is the one with GoldenSun-AR-RTL-FONT-v8.ups
 * applied: it already has the Arabic font and right-to-left engine, so the
 * build only changes the text.
 */
export default function GoldenSun() {
  const [busy, setBusy] = useState(false);
  const [lostAgeAudit, setLostAgeAudit] = useState<GoldenSun2Audit | null>(null);
  const [catalogBusy, setCatalogBusy] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const navigate = useNavigate();

  // The shared editor stores its active document globally, so preserve each
  // Golden Sun game's translations before switching to the other game.
  const storePreviousGoldenSunTranslations = useCallback(async () => {
    const source = await idbGet<string>("editor-source-game");
    const state = await idbGet<{ translations?: Record<string, string> }>("editorState");
    if (!state?.translations) return;
    if (source === GOLDENSUN2_SOURCE_GAME) {
      await idbSet(GOLDENSUN2_TRANSLATIONS_KEY, state.translations);
    } else if (source === GOLDENSUN_SOURCE_GAME) {
      await idbSet("goldensun1Translations", state.translations);
    }
  }, []);

  const loadLostAgeCatalog = useCallback(async (file: File) => {
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
      const saved = await idbGet<Record<string, string>>(GOLDENSUN2_TRANSLATIONS_KEY);
      await storePreviousGoldenSunTranslations();
      const translations = goldenSun2Translations(catalog, {
        ...(saved || {}),
        ...(existingGame === GOLDENSUN2_SOURCE_GAME ? active?.translations || {} : {}),
      });
      await idbSet("editorState", { entries, translations, freshExtraction: true });
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
  }, [navigate, storePreviousGoldenSunTranslations]);

  const loadRom = useCallback(
    async (file: File) => {
      setBusy(true);
      try {
        const rom = new Uint8Array(await file.arrayBuffer());
        if (looksLikeGoldenSun2Rom(rom)) {
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
        await storePreviousGoldenSunTranslations();
        const translations = restoreGoldenSunTranslations(entries, {
          ...(saved || {}),
          ...(previousGame === GOLDENSUN_SOURCE_GAME ? existing?.translations || {} : {}),
        });

        await idbSet("editorState", { entries, translations, freshExtraction: true });
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
    [navigate, storePreviousGoldenSunTranslations]
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

        <p className="mb-4 text-sm text-muted-foreground">
          <strong>الجزء الأول (AGSE):</strong> يعمل استخراج النصوص الـ ١٠,٧٢٢ وحمايتها وبناء ROM
          باستخدام رقعة <code>GoldenSun-AR-RTL-FONT-v8.ups</code> كما كان.
          <strong> الجزء الثاني (AGFE):</strong> يتعرف على ROM الأصلية (١٦ ميجابايت)،
          ويسمح بفتح كتالوج نصوص مستخرج خارجيًا داخل نفس المحرر، مع حماية الوسوم وحفظ العمل؛
          لكن فك جميع النصوص مباشرة من ROM والبناء النهائي لم يكتمل بعد.
        </p>

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
          <span className="text-xs text-muted-foreground">الملف ٨ ميغابايت ويُقرأ في المتصفّح</span>
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

        {lostAgeAudit && (
          <section className="mt-5 space-y-3 rounded-xl border p-4" aria-label="فحص Golden Sun الجزء الثاني">
            <h2 className="font-semibold">Golden Sun: The Lost Age — الجزء الثاني</h2>
            <p className="text-sm">تعرّفت الأداة على AGFE وحجم {lostAgeAudit.romSize.toLocaleString("ar")} بايت. هذه مرحلة فحص فقط، وليست استخراجًا كاملًا للحوارات: نصوص القصة مضغوطة بصيغة تحتاج مفككًا خاصًا بها.</p>
            <p className="text-sm text-amber-600">لن تستخدم الأداة مفكك Huffman الخاص بالجزء الأول أو تدّعي أن النصوص التشخيصية هي كل الحوارات. يمكنك استيراد كتالوج نصوص JSON مستخرج سابقًا إلى المحرر المشترك، ثم تصدير الترجمات مع فحص الوسوم دون بناء GBA غير مؤكدة.</p>
            <label className="flex cursor-pointer flex-col gap-2 rounded-lg border border-dashed p-3 text-sm">
              <span className="font-semibold">{catalogBusy ? "جارٍ فتح النصوص…" : "فتح كتالوج نصوص الجزء الثاني في المحرر المشترك (.json)"}</span>
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
          <p>
            <strong className="text-foreground">حد الطول</strong> فعلي: كل سطر يُضغَط بعد الترجمة
            ويجب ألا يتجاوز ٢٥٤ بايتاً مضغوطاً — البناء يرفض ويسمّي أي سطر يتجاوزه.
          </p>
        </div>
      </div>
    </div>
  );
}
