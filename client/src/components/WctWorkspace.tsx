/* Style reminder: واجهة WCT تتبع «مختبر البلاطات» الداكن، تعرض بيانات ROM بصدق وتفصل الاستخراج الكامل عن الباني المُثبت للتسميات. */
import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, ChevronLeft, Download, FileUp, Hammer, Languages, RotateCcw, Search, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { buildWctLabelRom, DEFAULT_WCT_LABELS, type WctLabelField, wctFormsFor, wctTileBytes } from "@/lib/wct-arabic";
import { extractWctEnglishStrings, wctTranslationTemplate, type WctTextRow } from "@/lib/wct-text";

type Props = { onSwitch: () => void };

function saveFile(name: string, value: BlobPart, type: string) {
  const blob = new Blob([value], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url; anchor.download = name; anchor.click(); URL.revokeObjectURL(url);
}

function PixelPreview({ value }: { value: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    let forms: string[] = [];
    try { forms = wctFormsFor(value); } catch { return; }
    const scale = 3;
    canvas.width = forms.length * 8 * scale;
    canvas.height = 12 * scale;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.fillStyle = "#111c22"; ctx.fillRect(0, 0, canvas.width, canvas.height);
    forms.forEach((form, column) => {
      wctTileBytes(form).forEach((row, y) => {
        for (let x = 0; x < 8; x += 1) if (row & (1 << (7 - x))) {
          ctx.fillStyle = "#04080b"; ctx.fillRect((column * 8 + x + 1) * scale, (y + 1) * scale, scale, scale);
          ctx.fillStyle = "#f5f6ec"; ctx.fillRect((column * 8 + x) * scale, y * scale, scale, scale);
        }
      });
    });
  }, [value]);
  return <canvas ref={ref} className="h-9 max-w-full border border-white/10 bg-[#111c22]" style={{ imageRendering: "pixelated" }} />;
}

function normalize(text: string) { return text.toLowerCase().replace(/\s+/g, " ").trim(); }

function TileSpecimen() {
  const glyph = wctTileBytes("FE8D");
  return <div className="grid w-fit grid-cols-8 gap-px border border-[#a8ff60]/35 bg-[#a8ff60]/10 p-1" aria-label="معاينة بلاطة عربية 8 في 12">
    {Array.from({ length: 96 }, (_, index) => {
      const row = Math.floor(index / 8);
      const column = index % 8;
      const active = Boolean(glyph[row] & (1 << (7 - column)));
      return <span key={index} className={`h-1.5 w-1.5 ${active ? "bg-[#d7ffc0]" : "bg-[#17302d]"}`} />;
    })}
  </div>;
}

function ProcessRail({ loaded, rows, drafts }: { loaded: boolean; rows: number; drafts: number }) {
  const stages = [
    { no: "01", title: "فحص ROM", detail: loaded ? "مقروء محلياً" : "بانتظار الملف", active: loaded },
    { no: "02", title: "مراجعة النص", detail: rows ? `${rows.toLocaleString("ar-EG")} سجل` : "كتالوج ASCII", active: rows > 0 },
    { no: "03", title: "بلاطات الخط", detail: "معاينة 8×12", active: loaded },
    { no: "04", title: "بناء وتصدير", detail: drafts ? `${drafts.toLocaleString("ar-EG")} مسودة` : "اختبار التسميات", active: false },
  ];
  return <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
    {stages.map((stage, index) => <article key={stage.no} className={`relative min-w-0 border p-3 ${stage.active ? "border-[#a8ff60]/45 bg-[#a8ff60]/8" : "border-border bg-card/55"}`}>
      <span className="absolute left-2 top-2 h-1.5 w-1.5 bg-[#a8ff60]" />
      <p className="font-code text-[10px] tracking-[.16em] text-[#a8ff60]">{stage.no} / {index === 0 ? "SCAN" : index === 1 ? "TEXT" : index === 2 ? "TILE" : "BUILD"}</p>
      <h3 className="mt-2 font-kufi text-xs">{stage.title}</h3>
      <p className="mt-1 text-[11px] text-muted-foreground">{stage.detail}</p>
    </article>)}
  </div>;
}

export function WctWorkspace({ onSwitch }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [romBytes, setRomBytes] = useState<Uint8Array | null>(null);
  const [fileName, setFileName] = useState("");
  const [labels, setLabels] = useState<WctLabelField[]>(DEFAULT_WCT_LABELS);
  const [rows, setRows] = useState<WctTextRow[]>([]);
  const [query, setQuery] = useState("");
  const [notice, setNotice] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [dragging, setDragging] = useState(false);
  const [isBuilding, setBuilding] = useState(false);
  const labelValidation = useMemo(() => {
    try {
      const forms = labels.flatMap((label) => wctFormsFor(label.text));
      labels.forEach((label) => { if (wctFormsFor(label.text).length > label.max) throw new Error(`${label.flag} يتجاوز المساحة المتاحة.`); });
      return { valid: true, glyphs: new Set(forms).size, error: "" };
    } catch (error) { return { valid: false, glyphs: 0, error: (error as Error).message }; }
  }, [labels]);
  const translated = rows.filter((row) => row.translationAr.trim()).length;
  const pointed = rows.filter((row) => row.pointerCount > 0).length;
  const visible = useMemo(() => {
    const needle = normalize(query);
    return rows.filter((row) => normalize(`${row.sourceRaw} ${row.translationAr}`).includes(needle)).slice(0, 180);
  }, [query, rows]);

  const loadRom = async (file?: File) => {
    if (!file) return;
    if (!/\.(gba|bin)$/i.test(file.name)) { setNotice({ kind: "error", text: "اختر ملف ROM بصيغة GBA أو BIN." }); return; }
    const bytes = new Uint8Array(await file.arrayBuffer());
    const extracted = extractWctEnglishStrings(bytes);
    if (!extracted.length) { setNotice({ kind: "error", text: "لم تظهر سلاسل ASCII إنجليزية مرشحة. تحقق من أن الملف هو النسخة الأمريكية غير المضغوطة من WCT 2004." }); return; }
    setRomBytes(bytes); setFileName(file.name); setRows(extracted);
    setNotice({ kind: "ok", text: `اكتمل فحص ROM محلياً: ${extracted.length.toLocaleString("ar-EG")} سلسلة إنجليزية مرشحة.` });
  };

  const buildLabels = () => {
    if (!romBytes || !labelValidation.valid) return;
    setBuilding(true); setNotice(null);
    try {
      const built = buildWctLabelRom(romBytes, labels);
      const outputName = fileName.replace(/\.(gba|bin)$/i, "") + "-Arabic-labels.gba";
      saveFile(outputName, built.rom, "application/octet-stream");
      setNotice({ kind: "ok", text: `تم بناء ROM لاختبار التسميات: ${built.labelCount} تسميات و${built.glyphCount} شكلاً عربياً.` });
    } catch (error) { setNotice({ kind: "error", text: error instanceof Error ? error.message : "تعذر بناء ROM." }); }
    finally { setBuilding(false); }
  };

  const importTranslations = async (file?: File) => {
    if (!file || !rows.length) return;
    try {
      const parsed = JSON.parse(await file.text());
      const entries = Array.isArray(parsed) ? parsed : parsed.entries;
      const translations = new Map<string, string>(entries.map((entry: { id: string; translation_ar?: string; translationAr?: string }) => [entry.id, entry.translation_ar ?? entry.translationAr ?? ""]));
      setRows((current) => current.map((row) => ({ ...row, translationAr: translations.get(row.id) ?? row.translationAr })));
      setNotice({ kind: "ok", text: "تم استيراد الترجمات المطابقة لمعرّفات WCT المستخرجة." });
    } catch { setNotice({ kind: "error", text: "ملف الترجمة غير صالح. استخدم قالب JSON الصادر من الأداة." }); }
  };

  return <div className="min-h-screen w-full overflow-x-hidden bg-background text-foreground" dir="rtl">
    <header className="sticky top-0 z-10 flex flex-wrap items-center justify-between gap-3 border-b border-border bg-background/95 px-5 py-4 backdrop-blur md:px-9">
      <div className="flex min-w-0 items-center gap-3"><div className="relative grid h-11 w-11 shrink-0 place-items-center border border-[#a8ff60]/65 bg-[#0a1b1e] font-kufi text-base text-[#d7ffc0] shadow-[inset_0_0_0_3px_#10282a]"><span>ض</span><i className="absolute -left-1 top-2 h-1.5 w-1 bg-[#a8ff60]" /><i className="absolute -right-1 bottom-2 h-1.5 w-1 bg-[#a8ff60]" /></div><div className="min-w-0"><p className="font-code text-[10px] tracking-[.16em] text-[#a8ff60]">PROFILE · WCT2004 · ASCII TEXT SCAN</p><h1 className="mt-1 break-words font-kufi text-base">مختبر البلاطات · <span dir="ltr">World Championship Tournament 2004</span></h1></div></div>
      <Button variant="outline" className="border-border bg-transparent" onClick={onSwitch}><ChevronLeft className="ml-2 h-4 w-4" />محرر Reshef</Button>
    </header>
    <main className="mx-auto max-w-7xl px-5 py-7 md:px-9">
      <section className="relative overflow-hidden border border-border bg-card/80 p-6 md:p-8"><div className="technical-grid absolute inset-0 opacity-40" /><div className="relative grid gap-6 lg:grid-cols-[1.15fr_.85fr] lg:items-end"><div className="min-w-0"><div className="mb-4 inline-flex items-center gap-2 border border-[#a8ff60]/30 bg-[#a8ff60]/8 px-3 py-1 font-code text-[10px] tracking-[.14em] text-[#c9ffa0]"><Languages className="h-3 w-3" />SCAN · EDIT · EXPORT</div><h2 className="font-kufi text-xl leading-9 md:text-3xl">افحص ROM كاملاً قبل أن تترجم.</h2><p className="mt-3 max-w-2xl text-sm leading-7 text-muted-foreground">يمسح هذا القسم ملف WCT محلياً ويجمع السلاسل الإنجليزية ASCII المنتهية بـ <span dir="ltr">00</span>، مع إزاحتها وسعتها ودليل المؤشر المباشر عند وجوده.</p></div><label onDragOver={(event) => { event.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={(event) => { event.preventDefault(); setDragging(false); void loadRom(event.dataTransfer.files?.[0]); }} className={`block min-w-0 cursor-pointer border border-dashed p-6 text-center ${dragging ? "border-[#a8ff60] bg-[#a8ff60]/8" : "border-border bg-background/35 hover:border-[#a8ff60]/60"}`}><input ref={inputRef} className="sr-only" type="file" accept=".gba,.bin" onChange={(event) => void loadRom(event.target.files?.[0])} /><FileUp className="mx-auto h-7 w-7 text-[#a8ff60]" /><p className="mt-3 text-sm font-semibold">اختر ROM الأصلي لـWCT 2004</p><p className="mt-1 font-code text-[10px] text-muted-foreground">USA · GBA / BIN · LOCAL ONLY</p></label></div></section>
      <section className="mt-6 grid gap-4 lg:grid-cols-[minmax(0,1fr)_255px]" aria-label="مسار معالجة ROM"><div className="border border-border bg-card/70 p-4"><div className="mb-3 flex items-center justify-between gap-3"><div><p className="font-code text-[10px] tracking-[.16em] text-[#a8ff60]">PROCESS RAIL</p><h2 className="mt-1 font-kufi text-sm">المسار القابل للفحص</h2></div><span className="font-code text-[10px] text-muted-foreground" dir="ltr">0x08000000 → 0x086F8200</span></div><ProcessRail loaded={Boolean(romBytes)} rows={rows.length} drafts={translated} /></div><aside className="flex items-center gap-4 border border-[#a8ff60]/25 bg-[#0b1a1d] p-4"><TileSpecimen /><div className="min-w-0"><p className="font-code text-[10px] tracking-[.15em] text-[#a8ff60]">FONT CELL</p><p className="mt-1 font-kufi text-xs">بلاطة عربية 8×12</p><p className="mt-1 font-code text-[10px] text-muted-foreground" dir="ltr">BASE 0x6F7BA8</p></div></aside></section>
      {notice && <section className={`mt-5 border-r-2 px-4 py-3 text-sm ${notice.kind === "ok" ? "border-[#a8ff60] bg-[#a8ff60]/7 text-[#ddffc9]" : "border-red-400 bg-red-400/10 text-red-100"}`}>{notice.text}</section>}
      {rows.length > 0 && <><section className="mt-6 grid gap-4 md:grid-cols-4"><div className="border border-border bg-card p-4"><p className="font-code text-[10px] text-[#a8ff60]">ROM</p><p className="mt-2 truncate text-sm" dir="ltr">{fileName}</p></div><div className="border border-border bg-card p-4"><p className="font-code text-[10px] text-[#a8ff60]">ASCII CANDIDATES</p><p className="mt-2 font-kufi text-2xl">{rows.length.toLocaleString("ar-EG")}</p></div><div className="border border-border bg-card p-4"><p className="font-code text-[10px] text-[#a8ff60]">DIRECT POINTERS</p><p className="mt-2 font-kufi text-2xl">{pointed.toLocaleString("ar-EG")}</p></div><div className="border border-border bg-card p-4"><p className="font-code text-[10px] text-[#a8ff60]">ARABIC DRAFTS</p><p className="mt-2 font-kufi text-2xl">{translated.toLocaleString("ar-EG")}</p></div></section>
      <section className="mt-6 border border-border bg-card/80 p-5"><div className="flex flex-wrap items-end justify-between gap-4"><div><p className="font-code text-[10px] tracking-[.14em] text-[#a8ff60]">FULL TEXT CATALOGUE</p><h2 className="mt-1 font-kufi text-base">السلاسل الإنجليزية المستخرجة</h2></div><div className="flex flex-wrap gap-2"><label><input className="sr-only" type="file" accept=".json" onChange={(event) => void importTranslations(event.target.files?.[0])} /><Button asChild variant="outline" className="border-border bg-transparent"><span>استيراد JSON</span></Button></label><Button className="rounded-sm bg-[#a8ff60] text-[#102018] hover:bg-[#c7ff94]" onClick={() => saveFile("wct2004-english-text-catalogue.json", JSON.stringify(wctTranslationTemplate(rows), null, 2), "application/json")}><Download className="ml-2 h-4 w-4" />تصدير قالب الترجمة</Button></div></div><div className="relative mt-5"><Search className="absolute right-3 top-3 h-4 w-4 text-muted-foreground" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="ابحث في النص الإنجليزي أو الترجمة…" className="w-full border border-border bg-background/60 py-2 pr-10 pl-3 text-sm outline-none focus:border-[#a8ff60]" /></div><div className="mt-4 divide-y divide-border border-y border-border">{visible.map((row) => <article key={row.id} className="grid gap-3 py-4 lg:grid-cols-[1fr_1fr]"><div><p className="font-code text-[10px] text-[#a8ff60]">{row.id} · {row.byteCapacity} B · {row.pointerCount ? `PTR ×${row.pointerCount}` : "SCAN"}</p><p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-foreground/90" dir="ltr">{row.sourceDisplay}</p></div><textarea value={row.translationAr} onChange={(event) => setRows((current) => current.map((item) => item.id === row.id ? { ...item, translationAr: event.target.value } : item))} placeholder="اكتب مسودة الترجمة العربية هنا" className="min-h-20 w-full resize-y border border-border bg-background/55 p-3 text-right text-sm leading-6 outline-none focus:border-[#a8ff60]" /></article>)}</div><p className="mt-3 text-xs leading-6 text-muted-foreground">تُعرض أول 180 نتيجة للحفاظ على سرعة المتصفح. يستمر المسح على ROM كاملاً، ويمكنك الوصول إلى أي سجل بالبحث أو ملف JSON.</p></section>
      <section className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1fr)_300px]"><section className="panel-glow border border-border bg-card/80 p-5 md:p-6"><div className="flex flex-wrap items-end justify-between gap-3"><div><p className="font-code text-[10px] tracking-[.16em] text-[#a8ff60]">VERIFIED FONT TEST</p><h2 className="mt-1 font-kufi text-base">تسميات شاشة اختيار اللغة</h2></div><Button variant="outline" size="sm" className="border-border bg-transparent text-foreground" onClick={() => setLabels(DEFAULT_WCT_LABELS)}><RotateCcw className="ml-2 h-3.5 w-3.5" />استعادة الافتراضي</Button></div><div className="mt-5 divide-y divide-border border-y border-border">{labels.map((label) => { let error = ""; try { if (wctFormsFor(label.text).length > label.max) error = `الحد ${label.max}`; } catch (reason) { error = (reason as Error).message; } return <div key={label.id} className="grid gap-3 py-4 md:grid-cols-[92px_minmax(0,1fr)_150px] md:items-center"><div><p className="text-sm">{label.flag}</p><p className="font-code text-[10px] text-muted-foreground">0x{label.offset.toString(16).toUpperCase()}</p></div><div><input value={label.text} onChange={(event) => setLabels((current) => current.map((item) => item.id === label.id ? { ...item, text: event.target.value } : item))} className={`w-full bg-background/65 px-3 py-2 text-right text-sm outline-none ring-1 ${error ? "ring-red-400/75" : "ring-border focus:ring-[#a8ff60]"}`} /><p className={`mt-1 text-[10px] ${error ? "text-red-300" : "text-muted-foreground"}`}>{error || `${Array.from(label.text.replace(/\s/g, "")).length}/${label.max} مواضع`}</p></div><div className="md:justify-self-end"><PixelPreview value={label.text} /></div></div>; })}</div></section><aside className="space-y-4"><section className="panel-glow overflow-hidden border border-border bg-card"><div className="border-b border-border bg-[#a8ff60]/7 px-5 py-4"><p className="font-code text-[10px] tracking-[.16em] text-[#a8ff60]">SAFE BUILD</p><h2 className="mt-1 font-kufi text-sm">اختبار التسميات المثبت</h2></div><div className="space-y-4 p-5 text-sm"><div className="flex items-center justify-between"><span className="text-muted-foreground">ROM مرفوع</span>{romBytes ? <CheckCircle2 className="h-4 w-4 text-[#a8ff60]" /> : <span className="font-code text-[10px]">PENDING</span>}</div><div className="flex items-center justify-between"><span className="text-muted-foreground">أشكال الخط</span><span className="font-code text-xs">{labelValidation.valid ? `${labelValidation.glyphs}/46` : "ERR"}</span></div><div className="flex items-center justify-between"><span className="text-muted-foreground">الأعلام</span><span className="inline-flex items-center gap-1 text-xs text-[#a8ff60]"><ShieldCheck className="h-3.5 w-3.5" />محميّة</span></div></div><div className="border-t border-border p-5"><Button disabled={!romBytes || !labelValidation.valid || isBuilding} onClick={buildLabels} className="w-full rounded-sm bg-[#a8ff60] text-[#102018] hover:bg-[#c7ff94] disabled:bg-muted disabled:text-muted-foreground"><Hammer className="ml-2 h-4 w-4" />{isBuilding ? "يبني ROM…" : "ابنِ اختبار التسميات"}</Button></div></section><section className="border-r-2 border-amber-300/70 bg-amber-300/5 p-4"><div className="flex gap-3"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" /><p className="text-xs leading-6 text-amber-100/80">المستخرج الجديد يقرأ الكتالوج الكامل محلياً، لكن بناء حوار WCT مؤجل عمداً حتى تثبيت ترميز كل رموز التحكم ومسار عرض الحوار في ROM فعلي. الزر الحالي يبني فقط اختبار التسميات الذي ظهر سابقاً داخل اللعبة.</p></div></section></aside></section></>}
    </main>
  </div>;
}
