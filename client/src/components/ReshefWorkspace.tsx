/* Style reminder: «مختبر البلاطات» — واجهة RTL عملية، طبقات تقنية خضراء، وتأكيد واضح لما هو مثبت وما يزال قيد التطوير. */
/** تصميم واجهة Reshef: لوحة RTL تقنية داكنة، بخطوط حادة ولمسة أخضر فسفوري، تركز على نص ROM المحلي القابل للتحرير. */
import { useMemo, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, ChevronLeft, Download, FileUp, Hammer, Languages, Search, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { extractReshefEnglishDialogues, sameControls, translationTemplate, type ReshefDialogueRow } from "@/lib/reshef-text";
import { buildReshefArabicRom } from "@/lib/reshef-arabic-builder";

type Props = { onSwitch: () => void };

function normalizeSearch(text: string) {
  return text.replace(/#[0-5]|%/g, " ").replace(/\s+/g, " ").trim().toLowerCase();
}

function saveJson(name: string, value: unknown) {
  const blob = new Blob([JSON.stringify(value, null, 2)], { type: "application/json" });
  const href = URL.createObjectURL(blob);
  const link = document.createElement("a"); link.href = href; link.download = name; link.click(); URL.revokeObjectURL(href);
}

function saveRom(name: string, value: Uint8Array) {
  const blob = new Blob([value], { type: "application/octet-stream" });
  const href = URL.createObjectURL(blob);
  const link = document.createElement("a"); link.href = href; link.download = name; link.click(); URL.revokeObjectURL(href);
}

export function ReshefWorkspace({ onSwitch }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState("");
  const [romBytes, setRomBytes] = useState<Uint8Array | null>(null);
  const [rows, setRows] = useState<ReshefDialogueRow[]>([]);
  const [query, setQuery] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const translated = rows.filter((row) => row.translationAr.trim()).length;
  const visible = useMemo(() => {
    const needle = normalizeSearch(query);
    return rows.filter((row) => normalizeSearch(`${row.sourceDisplay} ${row.translationAr}`).includes(needle)).slice(0, 160);
  }, [rows, query]);

  const loadRom = async (file?: File) => {
    if (!file) return;
    if (!/\.(gba|bin)$/i.test(file.name)) { setNotice("اختر ROM بصيغة GBA أو BIN."); return; }
    const bytes = new Uint8Array(await file.arrayBuffer());
    const extracted = extractReshefEnglishDialogues(bytes);
    if (!extracted.length) { setNotice("لم تظهر سجلات Reshef المتوقعة. تحقق من أن الملف هو النسخة الأمريكية من Reshef of Destruction."); return; }
    setRows(extracted); setRomBytes(bytes); setFileName(file.name); setNotice(`استُخرجت ${extracted.length.toLocaleString("ar-EG")} سجلاً إنجليزياً قابلاً للترجمة.`);
  };

  const importTranslations = async (file?: File) => {
    if (!file || !rows.length) return;
    try {
      const parsed = JSON.parse(await file.text());
      const imported = Array.isArray(parsed) ? parsed : parsed.entries;
      const byId = new Map<string, string>(imported.map((entry: { id: string; translation_ar?: string; translationAr?: string }) => [entry.id, entry.translation_ar ?? entry.translationAr ?? ""]));
      setRows((current) => current.map((row) => ({ ...row, translationAr: byId.get(row.id) ?? row.translationAr })));
      setNotice("تم استيراد الترجمات المطابقة للمعرّفات المستخرجة.");
    } catch { setNotice("ملف الترجمة غير صالح. استخدم قالب JSON الذي تصدّره الأداة."); }
  };

  const buildRom = () => {
    if (!romBytes) return;
    try {
      const result = buildReshefArabicRom(romBytes, rows);
      const outputName = fileName.replace(/\.(gba|bin)$/i, "") + "-ARABIC-RESHEF.gba";
      saveRom(outputName, result.rom);
      setNotice(`تم بناء ${outputName}: حُقنت أشكال خط Pokémon وطُبقت ${result.applied.toLocaleString("ar-EG")} ترجمة (${result.encodedBytes.toLocaleString("ar-EG")} بايت مشفّر).`);
    } catch (error) {
      setNotice(error instanceof Error ? `أُلغي البناء بأمان: ${error.message}` : "أُلغي البناء بأمان بسبب خطأ غير متوقع.");
    }
  };

  return <div className="min-h-screen bg-background text-foreground" dir="rtl">
    <header className="sticky top-0 z-10 flex flex-wrap items-center justify-between gap-3 border-b border-border bg-background/95 px-5 py-4 backdrop-blur md:px-9">
      <div><p className="font-code text-[10px] tracking-[.16em] text-[#a8ff60]">PROFILE · RESHEF-USA · TEXT BANK</p><h1 className="mt-1 font-kufi text-base">محرر نصوص Reshef of Destruction</h1></div>
      <Button variant="outline" className="border-border bg-transparent" onClick={onSwitch}><ChevronLeft className="ml-2 h-4 w-4" />قسم WCT 2004</Button>
    </header>
    <main className="mx-auto max-w-7xl px-5 py-7 md:px-9">
      <section className="relative overflow-hidden border border-border bg-card/80 p-6 md:p-8">
        <div className="technical-grid absolute inset-0 opacity-40" />
        <div className="relative grid gap-6 lg:grid-cols-[1.15fr_.85fr] lg:items-end"><div><div className="mb-4 inline-flex items-center gap-2 border border-[#a8ff60]/30 bg-[#a8ff60]/8 px-3 py-1 font-code text-[10px] tracking-[.14em] text-[#c9ffa0]"><Languages className="h-3 w-3" />EXTRACT · EDIT · EXPORT</div><h2 className="font-kufi text-xl leading-9 md:text-3xl">استخرج الإنجليزية كلها قبل أن تترجم حرفاً واحداً.</h2><p className="mt-3 max-w-2xl text-sm leading-7 text-muted-foreground">تفحص الأداة سجلات اللغة الإنجليزية الفعلية في ROM محلياً، وتحفظ عنوان كل سجل وسعته ورموز التخطيط الخاصة به.</p></div><label onDragOver={(event) => { event.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={(event) => { event.preventDefault(); setDragging(false); void loadRom(event.dataTransfer.files?.[0]); }} className={`block cursor-pointer border border-dashed p-6 text-center ${dragging ? "border-[#a8ff60] bg-[#a8ff60]/8" : "border-border bg-background/35 hover:border-[#a8ff60]/60"}`}><input ref={inputRef} className="sr-only" type="file" accept=".gba,.bin" onChange={(event) => void loadRom(event.target.files?.[0])} /><FileUp className="mx-auto h-7 w-7 text-[#a8ff60]" /><p className="mt-3 text-sm font-semibold">اختر ROM الأصلي لـ Reshef</p><p className="mt-1 font-code text-[10px] text-muted-foreground">USA · GBA / BIN · LOCAL ONLY</p></label></div>
      </section>
      {notice && <p className="mt-5 border-r-2 border-[#a8ff60] bg-[#a8ff60]/7 px-4 py-3 text-sm text-[#ddffc9]">{notice}</p>}
      {rows.length > 0 && <><section className="mt-6 grid gap-4 md:grid-cols-3"><div className="border border-border bg-card p-4"><p className="font-code text-[10px] text-[#a8ff60]">ROM</p><p className="mt-2 truncate text-sm" dir="ltr">{fileName}</p></div><div className="border border-border bg-card p-4"><p className="font-code text-[10px] text-[#a8ff60]">ENGLISH RECORDS</p><p className="mt-2 font-kufi text-2xl">{rows.length.toLocaleString("ar-EG")}</p></div><div className="border border-border bg-card p-4"><p className="font-code text-[10px] text-[#a8ff60]">ARABIC DRAFTS</p><p className="mt-2 font-kufi text-2xl">{translated.toLocaleString("ar-EG")}</p></div></section>
      <section className="mt-6 border border-border bg-card/80 p-5"><div className="flex flex-wrap items-end justify-between gap-4"><div><p className="font-code text-[10px] tracking-[.14em] text-[#a8ff60]">TRANSLATION KIT</p><h2 className="mt-1 font-kufi text-base">الترجمة والتحرير</h2></div><div className="flex flex-wrap gap-2"><label><input className="sr-only" type="file" accept=".json" onChange={(event) => void importTranslations(event.target.files?.[0])} /><Button asChild variant="outline" className="border-border bg-transparent"><span>استيراد JSON</span></Button></label><Button className="rounded-sm bg-[#a8ff60] text-[#102018] hover:bg-[#c7ff94]" onClick={() => saveJson("reshef-english-dialogues.json", translationTemplate(rows))}><Download className="ml-2 h-4 w-4" />تصدير قالب الترجمة</Button><Button className="rounded-sm bg-[#f2c66d] text-[#251b08] hover:bg-[#ffe09c]" onClick={buildRom} disabled={!translated}><Hammer className="ml-2 h-4 w-4" />بناء ROM العربي</Button></div></div><div className="relative mt-5"><Search className="absolute right-3 top-3 h-4 w-4 text-muted-foreground" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="ابحث في النص الإنجليزي أو الترجمة…" className="w-full border border-border bg-background/60 py-2 pr-10 pl-3 text-sm outline-none focus:border-[#a8ff60]" /></div><div className="mt-4 divide-y divide-border border-y border-border">{visible.map((row) => { const valid = !row.translationAr || sameControls(row.sourceRaw, row.translationAr); return <article key={row.id} className="grid gap-3 py-4 lg:grid-cols-[1fr_1fr]"><div><p className="font-code text-[10px] text-[#a8ff60]">{row.id} · الإنجليزية {row.byteCapacity} B · السعة الآمنة {row.recordByteCapacity} B</p><p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-foreground/90" dir="ltr">{row.sourceDisplay}</p></div><div><textarea value={row.translationAr} onChange={(event) => setRows((current) => current.map((item) => item.id === row.id ? { ...item, translationAr: event.target.value } : item))} placeholder="اكتب الترجمة العربية هنا مع حفظ #0 و#1 و% عند وجودها" className={`min-h-20 w-full resize-y border bg-background/55 p-3 text-right text-sm leading-6 outline-none ${valid ? "border-border focus:border-[#a8ff60]" : "border-red-400/70"}`} />{!valid && <p className="mt-1 text-[11px] text-red-300">أضف رموز التحكم نفسها الموجودة في النص الأصلي قبل البناء.</p>}</div></article>; })}</div><p className="mt-3 text-xs text-muted-foreground">تُعرض أول 160 نتيجة للحفاظ على سرعة المتصفح. استخدم البحث للوصول إلى أي سجل.</p></section>
      <section className="mt-6 flex gap-3 border-r-2 border-amber-300/70 bg-amber-300/5 p-4"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" /><p className="text-xs leading-6 text-amber-100/80">البناء يحقن glyphs Pokémon العربية، ويشكّل النص ويعكسه لمحرك Reshef الذي يرسم من اليسار إلى اليمين. يُلغى البناء بالكامل إذا تجاوز أي سجل مترجم سعته الآمنة؛ لن تنتج الأداة ملفاً جزئياً أو متلفاً. استخدم #0 بدلاً من Enter للفصل بين الأسطر.</p></section>
      <section className="mt-4 flex gap-3 border-r-2 border-[#a8ff60] bg-[#a8ff60]/5 p-4"><ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-[#a8ff60]" /><p className="text-xs leading-6 text-muted-foreground">الـROM يبقى داخل المتصفح. تُصدّر الأداة JSON فقط، ولا ترفع الملف أو محتوى النصوص إلى أي خدمة.</p></section></>}
    </main>
  </div>;
}
