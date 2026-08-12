/** مختبر Yu-Gi-Oh!: يسلّم النصوص للمحرر العام نفسه، ولا ينشئ محرراً منفصلاً. */
import { useCallback, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowRight, Boxes, Loader2, ShieldCheck, Upload } from "lucide-react";
import { toast } from "sonner";
import { idbGet, idbSet } from "@/lib/idb-storage";
import { extractReshefEntries, looksLikeReshefRom, RESHEF_BUFFER_KEY, RESHEF_SOURCE_GAME } from "@/lib/yugioh/reshef-editor-bridge";
import { extractWctEntries, looksLikeWctRom, WCT_BUFFER_KEY, WCT_SOURCE_GAME } from "@/lib/yugioh/wct-editor-bridge";
import type { ExtractedEntry } from "@/components/editor/types";
import { APP_VERSION } from "@/lib/version";

type GameId = "reshef" | "wct";

function restore(entries: ExtractedEntry[], saved: Record<string, string> | undefined) {
  const allowed = new Set(entries.map((entry) => `${entry.msbtFile}:${entry.index}`));
  return Object.fromEntries(Object.entries(saved || {}).filter(([key, value]) => allowed.has(key) && value));
}

export default function YuGiOh() {
  const [busy, setBusy] = useState<GameId | null>(null);
  const [drag, setDrag] = useState<GameId | null>(null);
  const navigate = useNavigate();

  const load = useCallback(async (file: File, game: GameId) => {
    setBusy(game);
    try {
      const rom = new Uint8Array(await file.arrayBuffer());
      const entries = game === "reshef"
        ? (() => { if (!looksLikeReshefRom(rom)) throw new Error("هذا ليس ROM Reshef of Destruction (USA) مناسباً."); return extractReshefEntries(rom); })()
        : (() => { if (!looksLikeWctRom(rom)) throw new Error("هذا ليس ROM WCT 2004 مناسباً."); return extractWctEntries(rom); })();
      if (!entries.length) throw new Error("لم يُعثر على سلاسل إنجليزية قابلة للتحرير في هذا ROM.");

      const existing = await idbGet<{ translations?: Record<string, string> }>("editorState");
      const translations = restore(entries, existing?.translations);
      await idbSet("editorState", { entries, translations, freshExtraction: true });
      await idbSet("editor-source-game", game === "reshef" ? RESHEF_SOURCE_GAME : WCT_SOURCE_GAME);
      await idbSet(game === "reshef" ? RESHEF_BUFFER_KEY : WCT_BUFFER_KEY, rom.buffer.slice(0));
      const originals = { ...((await idbGet<Record<string, string>>("originalTexts")) || {}) };
      for (const entry of entries) originals[`${entry.msbtFile}:${entry.index}`] = entry.original;
      await idbSet("originalTexts", originals);
      toast.success(`${game === "reshef" ? "Reshef of Destruction" : "WCT 2004"}: استُخرج ${entries.length.toLocaleString("ar-EG")} نصاً${Object.keys(translations).length ? ` واستُعيدت ${Object.keys(translations).length} ترجمة` : ""}`);
      navigate("/editor");
    } catch (error) {
      toast.error((error as Error).message);
    } finally { setBusy(null); }
  }, [navigate]);

  const cards: { id: GameId; name: string; sub: string; note: string; verified: string }[] = [
    { id: "reshef", name: "Yu-Gi-Oh! Reshef of Destruction", sub: "USA · GBA", note: "يستخرج الحوارات الإنجليزية إلى المحرر العام، ويحفظ السعة ورموز التحكم. من قسم البناء نفسه، ينشئ ROM عربياً ويحقن خط Pokémon المحلي.", verified: "البناء العربي للحوارات متصل ومتحقق" },
    { id: "wct", name: "Yu-Gi-Oh! World Championship Tournament 2004", sub: "USA · GBA", note: "يمسح ROM محلياً ويعرض كل سلاسل ASCII الإنجليزية المرشحة، مع الإزاحة والسعة، داخل المحرر العام نفسه. بناء الحوارات لا يُفعّل قبل توثيق ترميزها.", verified: "استخراج وفهرسة النصوص متصلان بالمحرر" },
  ];

  return <div className="min-h-screen bg-background text-foreground" dir="rtl">
    <main className="mx-auto max-w-4xl px-4 py-10">
      <header className="mb-8 flex items-start justify-between gap-4">
        <div>
          <div className="mb-2 flex items-center gap-2 text-xs font-mono text-primary"><Boxes className="h-4 w-4" /> YU-GI-OH / GBA / LOCAL ROM</div>
          <h1 className="text-3xl font-display font-black">تعريب Yu-Gi-Oh!</h1>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">اختر اللعبة وارفع ROM الأصلي. ستنتقل النصوص إلى محرر الأداة المعتاد نفسه: الفلاتر، البحث، حفظ الترجمات، مراجعة السعة، ثم البناء عندما يكون المسار موثقاً.</p>
          <p className="mt-2 text-xs text-muted-foreground">نسخة الأداة {APP_VERSION} · الملف لا يغادر المتصفح</p>
        </div>
        <Link to="/" className="shrink-0 text-sm text-muted-foreground hover:text-primary">الرجوع <ArrowRight className="inline h-4 w-4" /></Link>
      </header>

      <section className="grid gap-5 md:grid-cols-2">
        {cards.map((card) => <label key={card.id} onDragOver={(e) => { e.preventDefault(); setDrag(card.id); }} onDragLeave={() => setDrag(null)} onDrop={(e) => { e.preventDefault(); setDrag(null); const file = e.dataTransfer.files[0]; if (file) void load(file, card.id); }} className={`group flex min-h-[300px] cursor-pointer flex-col rounded-2xl border bg-card p-6 transition ${drag === card.id ? "border-primary bg-primary/10" : "border-border hover:border-primary/60"} ${busy && busy !== card.id ? "opacity-50" : ""}`}>
          <input className="sr-only" type="file" accept=".gba,application/octet-stream" disabled={busy !== null} onChange={(e) => { const file = e.target.files?.[0]; if (file) void load(file, card.id); e.currentTarget.value = ""; }} />
          <div className="mb-8 flex items-start justify-between gap-3"><div><p className="text-lg font-bold leading-tight">{card.name}</p><p className="mt-1 text-xs font-mono text-primary">{card.sub}</p></div>{busy === card.id ? <Loader2 className="h-7 w-7 animate-spin text-primary" /> : <Upload className="h-7 w-7 text-primary transition-transform group-hover:-translate-y-1" />}</div>
          <p className="flex-1 text-sm leading-6 text-muted-foreground">{card.note}</p>
          <div className="mt-6 flex items-center gap-2 border-t border-border pt-4 text-xs text-emerald-500"><ShieldCheck className="h-4 w-4" />{card.verified}</div>
          <p className="mt-3 text-sm font-semibold text-primary">ارفع ROM الأصلي ←</p>
        </label>)}
      </section>
    </main>
  </div>;
}
