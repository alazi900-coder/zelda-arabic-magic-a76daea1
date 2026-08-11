/* Style reminder: "مختبر البلاطات" — لا بطاقات متماثلة؛ مسار عمل تقني RTL مع معاينات بكسلية صادقة. */
import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle, Boxes, CheckCircle2, ChevronLeft, Cpu, Download, FileUp,
  Languages, RotateCcw, ShieldCheck, Sparkles, Wrench,
} from "lucide-react";
import { Button } from "@/components/ui/button";

const ROM_SIZE_MINIMUM = 0x6f8200;
const FONT_BASE = 0x6f7ba8;

type ArabicForms = { isolated: string; final: string; initial?: string; medial?: string; joinsLeft: boolean };
type LabelField = { id: string; flag: string; offset: number; max: number; text: string };

const LETTERS: Record<string, ArabicForms> = {
  "أ": { isolated: "FE83", final: "FE84", joinsLeft: false },
  "إ": { isolated: "FE87", final: "FE88", joinsLeft: false },
  "ا": { isolated: "FE8D", final: "FE8E", joinsLeft: false },
  "ب": { isolated: "FE8F", final: "FE90", initial: "FE91", medial: "FE92", joinsLeft: true },
  "ج": { isolated: "FE9D", final: "FE9E", initial: "FE9F", medial: "FEA0", joinsLeft: true },
  "ر": { isolated: "FEAD", final: "FEAE", joinsLeft: false },
  "ز": { isolated: "FEAF", final: "FEB0", joinsLeft: false },
  "س": { isolated: "FEB1", final: "FEB2", initial: "FEB3", medial: "FEB4", joinsLeft: true },
  "ط": { isolated: "FEC1", final: "FEC2", initial: "FEC3", medial: "FEC4", joinsLeft: true },
  "ف": { isolated: "FED1", final: "FED2", initial: "FED3", medial: "FED4", joinsLeft: true },
  "ل": { isolated: "FEDD", final: "FEDE", initial: "FEDF", medial: "FEE0", joinsLeft: true },
  "م": { isolated: "FEE1", final: "FEE2", initial: "FEE3", medial: "FEE4", joinsLeft: true },
  "ن": { isolated: "FEE5", final: "FEE6", initial: "FEE7", medial: "FEE8", joinsLeft: true },
  "ه": { isolated: "FEE9", final: "FEEA", initial: "FEEB", medial: "FEEC", joinsLeft: true },
  "ي": { isolated: "FEF1", final: "FEF2", initial: "FEF3", medial: "FEF4", joinsLeft: true },
};

const TILES: Record<string, string> = {
  FE83:"000000608060804040404040", FE84:"000000608060C04040407F00", FE87:"004040404040400060806080", FE88:"0080808080807F0060806080", FE8D:"000000000080808080808000", FE8E:"000000000080808080807F00", FE8F:"000000000000008484780020", FE90:"0000000000000084847B0020", FE91:"000000000000001010E00020", FE92:"000000000000002020DF0020", FE9D:"0000000000F0182040908078", FE9E:"00000000E018304F80908070", FE9F:"000000000000601008F00020", FEA0:"000000000000601008FF0020", FEAD:"00000000000020101010A040", FEAE:"000000000000201F1010A040", FEAF:"00000000200020101010A040", FEB0:"000000002000201F1010A040", FEB1:"0000000000000115559A9060", FEB2:"0000000000000115559A9060", FEB3:"00000000000000045454A800", FEB4:"00000000000000045454AB00", FEC1:"00000000404040586444F800", FEC2:"00000000404040586444FA00", FEC3:"00000000404040586444F800", FEC4:"00000000404040586444FA00", FED1:"0000000008000C144C848478", FED2:"0000000008000C144C848778", FED3:"00000000200030503010E000", FED4:"00000000200030503010EF00", FEDD:"000000000008080848888870", FEDE:"000000000008080848888F70", FEDF:"00000000002020202020C000", FEE0:"00000000002020202020DF00", FEE1:"0000000000304848B0808080", FEE2:"0000000000304848B7808080", FEE3:"00000000000000001824E418", FEE4:"00000000000000001824E718", FEE5:"000000000000002088888870", FEE6:"000000000000002088888F70", FEE7:"00000000000010001010E000", FEE8:"00000000000020002020DF00", FEE9:"0000000000A0006090906000", FEEA:"0000000000002060A0E03F00", FEEB:"000000000000001824D42818", FEEC:"00000000000000001824D738", FEF1:"000000000C52908884780050", FEF2:"000000000C52938884780050", FEF3:"000000000000001010E00050", FEF4:"000000000000002020DF0050",
};

const DEFAULT_FIELDS: LabelField[] = [
  { id: "japan", flag: "اليابان", offset: 0x6852a6, max: 8, text: "ياباني" },
  { id: "uk", flag: "إنجلترا", offset: 0x6852b0, max: 7, text: "إنجليزي" },
  { id: "germany", flag: "ألمانيا", offset: 0x6852b8, max: 6, text: "ألماني" },
  { id: "france", flag: "فرنسا", offset: 0x6852c0, max: 6, text: "فرنسي" },
  { id: "italy", flag: "إيطاليا", offset: 0x6852c8, max: 7, text: "إيطالي" },
  { id: "spain", flag: "إسبانيا", offset: 0x6852d0, max: 7, text: "إسباني" },
];

function formsFor(text: string): string[] {
  const letters = Array.from(text.replace(/\s/g, ""));
  if (!letters.length) throw new Error("أدخل تسمية عربية.");
  letters.forEach((letter) => { if (!LETTERS[letter]) throw new Error(`الحرف «${letter}» غير مدعوم في النسخة الحالية من الخط.`); });
  const logical = letters.map((letter) => LETTERS[letter]);
  const output = letters.map((letter, index) => {
    const char = LETTERS[letter];
    const previous = logical[index - 1];
    const next = logical[index + 1];
    const joinsPrevious = Boolean(previous?.joinsLeft);
    const joinsNext = char.joinsLeft && Boolean(next);
    if (joinsPrevious && joinsNext && char.medial) return char.medial;
    if (joinsPrevious) return char.final;
    if (joinsNext && char.initial) return char.initial;
    return char.isolated;
  });
  return output.reverse();
}

function tileBytes(codepoint: string) {
  const hex = TILES[codepoint];
  if (!hex) throw new Error(`لا توجد بلاطة للحرف U+${codepoint}`);
  return new Uint8Array(hex.match(/.{1,2}/g)!.map((value) => Number.parseInt(value, 16)));
}

function PixelPreview({ value }: { value: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    let forms: string[] = [];
    try { forms = formsFor(value); } catch { return; }
    const scale = 3;
    canvas.width = forms.length * 8 * scale;
    canvas.height = 12 * scale;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.fillStyle = "#111c22";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    forms.forEach((form, column) => {
      const glyph = tileBytes(form);
      glyph.forEach((row, y) => {
        for (let x = 0; x < 8; x += 1) {
          if (row & (1 << (7 - x))) {
            ctx.fillStyle = "#04080b";
            ctx.fillRect((column * 8 + x + 1) * scale, (y + 1) * scale, scale, scale);
            ctx.fillStyle = "#f5f6ec";
            ctx.fillRect((column * 8 + x) * scale, y * scale, scale, scale);
          }
        }
      });
    });
  }, [value]);
  return <canvas ref={ref} className="h-9 max-w-full border border-white/10 bg-[#111c22]" style={{ imageRendering: "pixelated" }} />;
}

function buildRom(original: Uint8Array, fields: LabelField[]) {
  if (original.length < ROM_SIZE_MINIMUM) throw new Error("الملف أصغر من ROM Yu-Gi-Oh! World Championship Tournament 2004 المدعوم.");
  const prepared = fields.map((field) => ({ ...field, forms: formsFor(field.text) }));
  prepared.forEach((field) => {
    if (field.forms.length > field.max) throw new Error(`${field.flag}: الحد المتاح هو ${field.max} حروف.`);
  });
  const glyphs = Array.from(new Set(prepared.flatMap((field) => field.forms)));
  if (glyphs.length > 46) throw new Error("عدد أشكال الحروف يتجاوز الخانات الآمنة في هذا الإصدار.");
  const codeFor = new Map(glyphs.map((glyph, index) => [glyph, 0x41 + index]));
  const result = new Uint8Array(original);
  glyphs.forEach((glyph) => result.set(tileBytes(glyph), FONT_BASE + codeFor.get(glyph)! * 12));
  prepared.forEach((field) => {
    const bytes = field.forms.map((glyph) => codeFor.get(glyph)!);
    result.fill(0, field.offset, field.offset + field.max + 1);
    result.set(bytes, field.offset);
  });
  return { rom: result, glyphCount: glyphs.length, labelCount: prepared.length };
}

function formatSize(bytes: number) { return `${(bytes / (1024 * 1024)).toFixed(2)} MB`; }

export default function Home() {
  const [romFile, setRomFile] = useState<File | null>(null);
  const [fields, setFields] = useState(DEFAULT_FIELDS);
  const [notice, setNotice] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [isDragging, setDragging] = useState(false);
  const [isBuilding, setBuilding] = useState(false);

  const validation = useMemo(() => {
    try {
      const forms = fields.flatMap((field) => formsFor(field.text));
      fields.forEach((field) => { if (formsFor(field.text).length > field.max) throw new Error(`${field.flag} يتجاوز المساحة المتاحة.`); });
      return { valid: true, glyphs: new Set(forms).size, error: "" };
    } catch (error) { return { valid: false, glyphs: 0, error: (error as Error).message }; }
  }, [fields]);

  const acceptFile = (file?: File) => {
    if (!file) return;
    if (!/\.(gba|bin)$/i.test(file.name)) {
      setNotice({ kind: "error", text: "اختر ملف ROM بصيغة GBA أو BIN." });
      return;
    }
    setRomFile(file);
    setNotice({ kind: "ok", text: "تم فحص اسم الملف. ستبقى معالجة ROM داخل المتصفح." });
  };

  const updateField = (id: string, text: string) => setFields((current) => current.map((field) => field.id === id ? { ...field, text } : field));

  const download = async () => {
    if (!romFile || !validation.valid) return;
    setBuilding(true);
    setNotice(null);
    try {
      const source = new Uint8Array(await romFile.arrayBuffer());
      const built = buildRom(source, fields);
      const blob = new Blob([built.rom], { type: "application/octet-stream" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = romFile.name.replace(/\.(gba|bin)$/i, "") + "-Arabic-labels.gba";
      anchor.click();
      URL.revokeObjectURL(url);
      setNotice({ kind: "ok", text: `تم بناء ROM: ${built.labelCount} تسميات و${built.glyphCount} شكلًا عربيًا.` });
    } catch (error) {
      setNotice({ kind: "error", text: (error as Error).message });
    } finally { setBuilding(false); }
  };

  return (
    <div className="min-h-screen bg-background text-foreground" dir="rtl">
      <div className="flex min-h-screen">
        <aside className="hidden w-72 shrink-0 flex-col border-l border-border bg-sidebar p-6 lg:flex">
          <div className="flex items-center gap-3">
            <img src="/manus-storage/yugioh-tool-logo_3f5b7458.png" className="h-12 w-12 rounded-sm bg-[#a8ff60]/10 p-1" alt="رمز أداة Yu-Gi-Oh! العربية" />
            <div><p className="font-kufi text-sm leading-6">مختبر البلاطات</p><p className="font-code text-[10px] tracking-[0.18em] text-[#a8ff60]">YU-GI-OH! · GBA</p></div>
          </div>
          <nav className="mt-14 space-y-3">
            {[{ icon: FileUp, label: "ملف اللعبة", n: "01" }, { icon: Languages, label: "التسميات العربية", n: "02" }, { icon: Boxes, label: "معاينة الخط", n: "03" }, { icon: Wrench, label: "بناء النسخة", n: "04" }].map(({ icon: Icon, label, n }, index) => (
              <div key={label} className={`flex items-center gap-3 border-r-2 px-3 py-3 ${index === 0 ? "border-[#a8ff60] bg-[#a8ff60]/8 text-[#efffe3]" : "border-transparent text-muted-foreground"}`}>
                <span className="font-code text-xs text-[#a8ff60]">{n}</span><Icon className="h-4 w-4" /><span className="text-sm">{label}</span>
              </div>
            ))}
          </nav>
          <div className="mt-auto rounded-sm border border-border bg-card/70 p-4">
            <ShieldCheck className="mb-3 h-5 w-5 text-[#a8ff60]" />
            <p className="text-sm font-semibold">معالجة محلية</p>
            <p className="mt-1 text-xs leading-6 text-muted-foreground">لا يُرفع ROM إلى خادم؛ تتم قراءة الملف وبناؤه في المتصفح ثم يُنزّل إلى جهازك.</p>
          </div>
        </aside>

        <main className="min-w-0 flex-1">
          <header className="flex items-center justify-between border-b border-border px-5 py-4 md:px-9">
            <div className="flex items-center gap-3 lg:hidden"><img src="/manus-storage/yugioh-tool-logo_3f5b7458.png" className="h-10 w-10" alt="" /><span className="font-kufi text-xs">مختبر البلاطات</span></div>
            <div className="hidden text-xs text-muted-foreground md:block">أداة عربية مخصّصة لـ <span className="font-code text-foreground">World Championship Tournament 2004</span></div>
            <div className="flex items-center gap-2 text-xs"><span className="h-2 w-2 animate-pulse rounded-full bg-[#a8ff60]" /> <span className="text-muted-foreground">المسار: محلي وآمن</span></div>
          </header>

          <section className="relative overflow-hidden border-b border-border px-5 py-10 md:px-9 md:py-14">
            <img src="/manus-storage/yugioh-tool-tile-grid_5672ba5e.png" alt="" className="absolute inset-0 h-full w-full object-cover opacity-[0.13]" />
            <div className="technical-grid absolute inset-0 opacity-40" />
            <img src="/manus-storage/yugioh-tool-cartridge_d0d94b1a.png" alt="خرطوشة ألعاب مجردة" className="absolute -left-14 top-0 hidden h-full w-[48%] object-cover object-center opacity-80 lg:block" />
            <div className="relative max-w-3xl">
              <div className="mb-4 inline-flex items-center gap-2 border border-[#a8ff60]/30 bg-[#a8ff60]/8 px-3 py-1 font-code text-[10px] tracking-[0.14em] text-[#c9ffa0]"><Cpu className="h-3 w-3" /> PROFILE · WCT2004 · 8×12</div>
              <h1 className="font-kufi text-2xl leading-[1.8] md:text-4xl">ثبّت خطك قبل أن تبني <span className="text-[#a8ff60]">ROM</span>.</h1>
              <p className="mt-4 max-w-2xl text-sm leading-8 text-muted-foreground md:text-base">هذا القسم يكتب بلاطات الحروف العربية البكسلية المُصحّحة في موضع خط Yu-Gi-Oh! المعروف، ويحدّث أسماء اللغات الستة فقط. لا يلمس الأعلام أو رسومات الواجهة.</p>
            </div>
          </section>

          <div className="grid gap-6 px-5 py-7 md:px-9 xl:grid-cols-[minmax(0,1fr)_300px]">
            <div className="space-y-6">
              <section className="panel-glow border border-border bg-card/80 p-5 md:p-6">
                <div className="mb-5 flex flex-wrap items-start justify-between gap-3"><div><p className="font-code text-[10px] tracking-[0.16em] text-[#a8ff60]">01 / INPUT ROM</p><h2 className="mt-1 font-kufi text-base">ارفع ملف اللعبة الأصلي</h2></div><span className="rounded-full border border-border px-3 py-1 font-code text-[10px] text-muted-foreground">GBA / BIN</span></div>
                <label onDragOver={(event) => { event.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={(event) => { event.preventDefault(); setDragging(false); acceptFile(event.dataTransfer.files?.[0]); }} className={`block cursor-pointer border border-dashed p-7 text-center transition-colors ${isDragging ? "border-[#a8ff60] bg-[#a8ff60]/8" : "border-border bg-background/30 hover:border-[#a8ff60]/55"}`}>
                  <input type="file" accept=".gba,.bin" className="sr-only" onChange={(event) => acceptFile(event.target.files?.[0])} />
                  <FileUp className="mx-auto h-7 w-7 text-[#a8ff60]" />
                  <p className="mt-3 text-sm font-semibold">اسحب ROM الأصلي هنا، أو اختره من جهازك</p>
                  <p className="mt-1 text-xs text-muted-foreground">الملف لا يغادر جهازك أثناء استخدام الأداة.</p>
                </label>
                {romFile && <div className="mt-4 flex items-center justify-between border-r-2 border-[#a8ff60] bg-[#a8ff60]/6 px-4 py-3"><div><p className="font-code text-xs text-[#e5ffcf]" dir="ltr">{romFile.name}</p><p className="mt-1 text-xs text-muted-foreground">{formatSize(romFile.size)} · جاهز للبناء</p></div><CheckCircle2 className="h-5 w-5 text-[#a8ff60]" /></div>}
              </section>

              <section className="panel-glow border border-border bg-card/80 p-5 md:p-6">
                <div className="flex flex-wrap items-end justify-between gap-3"><div><p className="font-code text-[10px] tracking-[0.16em] text-[#a8ff60]">02 / ARABIC LABELS</p><h2 className="mt-1 font-kufi text-base">ترجمة شاشة اختيار اللغة</h2></div><p className="text-xs text-muted-foreground">الحقول تستخدم مساحة النص الأصلية نفسها.</p></div>
                <div className="mt-5 divide-y divide-border border-y border-border">
                  {fields.map((field) => {
                    let error = "";
                    try { if (formsFor(field.text).length > field.max) error = `الحد ${field.max}`; } catch (reason) { error = (reason as Error).message; }
                    return <div key={field.id} className="grid gap-3 py-4 md:grid-cols-[92px_minmax(0,1fr)_150px] md:items-center"><div><p className="text-sm">{field.flag}</p><p className="font-code text-[10px] text-muted-foreground">0x{field.offset.toString(16).toUpperCase()}</p></div><div><input value={field.text} onChange={(event) => updateField(field.id, event.target.value)} className={`w-full bg-background/65 px-3 py-2 text-right text-sm outline-none ring-1 transition ${error ? "ring-red-400/75" : "ring-border focus:ring-[#a8ff60]"}`} /><p className={`mt-1 text-[10px] ${error ? "text-red-300" : "text-muted-foreground"}`}>{error || `${Array.from(field.text.replace(/\s/g, "")).length}/${field.max} مواضع`}</p></div><div className="md:justify-self-end"><PixelPreview value={field.text} /></div></div>;
                  })}
                </div>
                <div className="mt-4 flex flex-wrap items-center justify-between gap-3"><p className="text-xs leading-6 text-muted-foreground">الخط المتاح الآن يغطي الحروف المستخدمة في التسميات الافتراضية. ستظهر رسالة واضحة للحرف غير المضاف بدل بناء ROM معطوب.</p><Button variant="outline" size="sm" className="border-border bg-transparent text-foreground hover:bg-accent" onClick={() => setFields(DEFAULT_FIELDS)}><RotateCcw className="ml-2 h-3.5 w-3.5" />استعادة الافتراضي</Button></div>
              </section>
            </div>

            <aside className="space-y-6">
              <section className="panel-glow overflow-hidden border border-border bg-card">
                <div className="border-b border-border bg-[#a8ff60]/7 px-5 py-4"><p className="font-code text-[10px] tracking-[0.16em] text-[#a8ff60]">BUILD STATUS</p><h2 className="mt-1 font-kufi text-sm">فحص سلامة العملية</h2></div>
                <div className="space-y-4 p-5 text-sm">
                  <div className="flex items-center justify-between"><span className="text-muted-foreground">ROM مرفوع</span>{romFile ? <CheckCircle2 className="h-4 w-4 text-[#a8ff60]" /> : <span className="font-code text-[10px]">PENDING</span>}</div>
                  <div className="flex items-center justify-between"><span className="text-muted-foreground">أشكال الخط</span><span className="font-code text-xs">{validation.valid ? `${validation.glyphs}/46` : "ERR"}</span></div>
                  <div className="flex items-center justify-between"><span className="text-muted-foreground">رسومات الأعلام</span><span className="inline-flex items-center gap-1 text-xs text-[#a8ff60]"><ShieldCheck className="h-3.5 w-3.5" />محميّة</span></div>
                </div>
                <div className="border-t border-border p-5"><Button disabled={!romFile || !validation.valid || isBuilding} onClick={download} className="w-full rounded-sm bg-[#a8ff60] text-[#102018] hover:bg-[#c7ff94] disabled:bg-muted disabled:text-muted-foreground"><Download className="ml-2 h-4 w-4" />{isBuilding ? "يبني ROM…" : "ابنِ ملف اللعبة"}</Button><p className="mt-3 text-center text-[10px] leading-5 text-muted-foreground">ينزّل الملف باسم جديد؛ لا يستبدل ROM الأصلي.</p></div>
              </section>
              <section className="border-r-2 border-amber-300/70 bg-amber-300/5 p-4"><div className="flex gap-3"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" /><p className="text-xs leading-6 text-amber-100/75">هذه المرحلة تبني أسماء اللغات وخطها فقط. ترجمة الحوارات والقوائم الرئيسية تحتاج جدول نصوص منفصلًا قبل أن تصبح جزءًا من الأداة.</p></div></section>
              {notice && <section className={`border p-4 text-xs leading-6 ${notice.kind === "ok" ? "border-[#a8ff60]/40 bg-[#a8ff60]/8 text-[#d7ffc0]" : "border-red-400/40 bg-red-400/8 text-red-100"}`}><div className="flex gap-2">{notice.kind === "ok" ? <Sparkles className="mt-1 h-4 w-4 shrink-0" /> : <AlertTriangle className="mt-1 h-4 w-4 shrink-0" />}<p>{notice.text}</p></div></section>}
            </aside>
          </div>
          <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-5 py-5 text-[11px] text-muted-foreground md:px-9"><span>YU-GI-OH! WCT 2004 · Arabic label patcher</span><span className="font-code" dir="ltr">font: 0x6F7BA8 · text: 0x6852A6</span></footer>
        </main>
      </div>
    </div>
  );
}
