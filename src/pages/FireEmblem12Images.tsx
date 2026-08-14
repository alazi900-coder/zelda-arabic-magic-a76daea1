/**
 * Style: RTL pixel-workbench matching the Fire Emblem text tool. Dense controls,
 * clear safety states, and crisp tile previews support small Android screens.
 */
import { useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, CheckCircle2, Download, ImageDown, Info, Loader2, Palette, Replace, Upload } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  buildFE12MenuImageRom, decodeFE12MenuImage, FE12_MENU_IMAGE_RESOURCES,
  type FE12MenuImagePixels, type FE12MenuImageResource, verifyFE12Rom,
} from "@/lib/fe12/fe12-editor-bridge";

function pixelsToUrl(image: FE12MenuImagePixels) {
  const canvas = document.createElement("canvas");
  canvas.width = image.width; canvas.height = image.height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("تعذّر إنشاء معاينة الرسم.");
  context.putImageData(new ImageData(image.pixels, image.width, image.height), 0, 0);
  return canvas.toDataURL("image/png");
}

function fitReplacement(file: File, width: number, height: number): Promise<FE12MenuImagePixels> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = width; canvas.height = height;
      const context = canvas.getContext("2d");
      if (!context) { URL.revokeObjectURL(url); reject(new Error("تعذّر تجهيز صورة الاستبدال.")); return; }
      context.imageSmoothingEnabled = false;
      context.clearRect(0, 0, width, height);
      const scale = Math.min(width / image.naturalWidth, height / image.naturalHeight);
      const drawWidth = Math.max(1, Math.round(image.naturalWidth * scale));
      const drawHeight = Math.max(1, Math.round(image.naturalHeight * scale));
      context.drawImage(image, Math.floor((width - drawWidth) / 2), Math.floor((height - drawHeight) / 2), drawWidth, drawHeight);
      URL.revokeObjectURL(url);
      resolve({ width, height, pixels: context.getImageData(0, 0, width, height).data });
    };
    image.onerror = () => { URL.revokeObjectURL(url); reject(new Error("ملف الصورة غير قابل للقراءة.")); };
    image.src = url;
  });
}

function downloadRom(rom: Uint8Array) {
  const url = URL.createObjectURL(new Blob([rom as BlobPart], { type: "application/octet-stream" }));
  const link = document.createElement("a");
  link.href = url; link.download = "Fire-Emblem-12-Beta2-Menu-AR.nds"; link.click(); URL.revokeObjectURL(url);
}

export default function FireEmblem12Images() {
  const romInput = useRef<HTMLInputElement>(null);
  const imageInput = useRef<HTMLInputElement>(null);
  const [rom, setRom] = useState<Uint8Array | null>(null);
  const [originals, setOriginals] = useState<Record<string, FE12MenuImagePixels>>({});
  const [edits, setEdits] = useState<Record<string, FE12MenuImagePixels>>({});
  const [selectedId, setSelectedId] = useState<FE12MenuImageResource["id"]>(FE12_MENU_IMAGE_RESOURCES[0].id);
  const [busy, setBusy] = useState(false);
  const selected = FE12_MENU_IMAGE_RESOURCES.find((item) => item.id === selectedId)!;
  const original = originals[selectedId];
  const current = edits[selectedId] || original;
  const originalUrl = useMemo(() => original ? pixelsToUrl(original) : "", [original]);
  const currentUrl = useMemo(() => current ? pixelsToUrl(current) : "", [current]);

  const loadRom = async (file: File) => {
    setBusy(true);
    try {
      const source = new Uint8Array(await file.arrayBuffer());
      const verified = await verifyFE12Rom(source);
      if (!verified.valid) throw new Error(verified.reason);
      const decoded = Object.fromEntries(FE12_MENU_IMAGE_RESOURCES.map((item) => [item.id, decodeFE12MenuImage(source, item.id)]));
      setRom(source); setOriginals(decoded); setEdits({});
      toast.success("تم تحميل رسوم قوائم Beta 2 محلياً. لم يخرج ROM من جهازك.");
    } catch (error) { toast.error((error as Error).message); } finally { setBusy(false); }
  };

  const replaceSelected = async (file: File) => {
    if (!current) return;
    try {
      const fitted = await fitReplacement(file, current.width, current.height);
      setEdits((previous) => ({ ...previous, [selectedId]: fitted }));
      toast.success(`تم احتواء الصورة إلى ${current.width}×${current.height} ثم مطابقتها للوحة ألوان اللعبة عند البناء.`);
    } catch (error) { toast.error((error as Error).message); }
  };

  const build = () => {
    if (!rom || Object.keys(edits).length === 0) return;
    try {
      let output = rom;
      const changed: string[] = [];
      for (const resource of FE12_MENU_IMAGE_RESOURCES) {
        const edit = edits[resource.id];
        if (!edit) continue;
        const result = buildFE12MenuImageRom(output, resource.id, edit);
        output = result.rom; changed.push(result.path);
      }
      downloadRom(output);
      toast.success(`تم بناء ROM مع ${changed.length} مورد رسوم قائمة معدل.`);
    } catch (error) { toast.error((error as Error).message); }
  };

  return <div className="min-h-screen bg-[#101926] text-[#eff5ff]" dir="rtl">
    <input ref={romInput} className="sr-only" type="file" accept=".nds,application/octet-stream" onChange={(event) => { const file = event.target.files?.[0]; if (file) void loadRom(file); event.currentTarget.value = ""; }} />
    <input ref={imageInput} className="sr-only" type="file" accept="image/png,image/webp,image/bmp" onChange={(event) => { const file = event.target.files?.[0]; if (file) void replaceSelected(file); event.currentTarget.value = ""; }} />
    <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:py-12">
      <header className="mb-8 flex flex-col gap-5 border-b border-sky-200/15 pb-7 sm:flex-row sm:items-end sm:justify-between">
        <div><p className="mb-3 flex items-center gap-2 font-mono text-xs tracking-[0.18em] text-sky-300"><Palette className="h-4 w-4" /> FIRE EMBLEM 12 / DS / MENU GRAPHICS</p><h1 className="text-3xl font-black tracking-tight sm:text-4xl">محرر صور قوائم Fire Emblem</h1><p className="mt-3 max-w-2xl text-sm leading-7 text-slate-300">يعالج الرسومات الثابتة التي لا تكون حقول نص، مثل تسمية بدء اللعبة ودرجات الصعوبة. تبقى الأبعاد وبلاطات 4bpp ولوحة الألوان الأصلية من اللعبة.</p></div>
        <Link to="/fire-emblem-12" className="inline-flex items-center gap-2 text-sm text-sky-200 transition hover:text-white"><ArrowRight className="h-4 w-4" />الرجوع إلى محرر النصوص</Link>
      </header>
      <section className="mb-6 rounded-2xl border border-sky-300/25 bg-sky-950/40 p-5"><p className="flex items-center gap-2 text-xs font-bold tracking-[0.14em] text-sky-200"><Info className="h-4 w-4" />التمييز المهم</p><p className="mt-2 text-sm leading-7 text-slate-200"><strong>Start a new game.</strong> ووصف درجات الصعوبة تظهر في محرر النصوص ضمن <code dir="ltr">m/MM</code>. أمّا الكلمات المرئية <strong>NEW GAME</strong> و<strong>NORMAL</strong> و<strong>HARD</strong> فهي رسومات بلاطية، وهذا القسم هو مكان تعديلها.</p></section>
      {!rom ? <section className="grid overflow-hidden rounded-2xl border border-sky-200/20 bg-[#172334] md:grid-cols-[1.2fr_0.8fr]"><div className="p-7 sm:p-10"><p className="text-xs font-bold tracking-[0.16em] text-sky-300">الخطوة 01 / ROM الإنجليزي</p><h2 className="mt-4 text-2xl font-bold">حمّل Fire Emblem 12 Beta 2</h2><p className="mt-4 max-w-lg leading-7 text-slate-300">يتحقق المحرر من النسخة الإنجليزية المعتمدة ثم يقرأ موارد القائمة داخل المتصفح فقط.</p><Button className="mt-7 bg-sky-300 text-[#102033] hover:bg-sky-200" disabled={busy} onClick={() => romInput.current?.click()}>{busy ? <Loader2 className="ml-2 h-4 w-4 animate-spin" /> : <Upload className="ml-2 h-4 w-4" />}اختر ROM</Button></div><aside className="border-t border-sky-200/20 bg-[#111b2a] p-7 md:border-r md:border-t-0"><ImageDown className="h-6 w-6 text-sky-300" /><p className="mt-4 text-sm leading-7 text-slate-300">الصور المستبدلة تُحتوى تلقائياً إلى أبعاد المورد، وتُحوّل عند البناء إلى لوحة الألوان الأصلية. الخلفية الشفافة تظل شفافة.</p></aside></section> : <>
        <section className="mb-6 grid gap-4 md:grid-cols-[240px_1fr]"><aside className="rounded-2xl border border-sky-200/20 bg-[#172334] p-3"><p className="px-3 pb-3 pt-2 text-xs font-bold tracking-wider text-sky-300">الرسومات الموثقة</p>{FE12_MENU_IMAGE_RESOURCES.map((resource) => <button key={resource.id} onClick={() => setSelectedId(resource.id)} className={`w-full rounded-xl p-3 text-right transition ${selectedId === resource.id ? "bg-sky-300 text-[#102033]" : "text-slate-200 hover:bg-sky-950/60"}`}><span className="block font-bold">{resource.label}</span><span className={`mt-1 block font-mono text-[11px] ${selectedId === resource.id ? "text-sky-950" : "text-slate-400"}`}>{resource.id}</span></button>)}</aside>
          <div className="rounded-2xl border border-sky-200/20 bg-[#172334] p-5 sm:p-7"><div className="flex flex-col gap-4 border-b border-sky-200/15 pb-5 sm:flex-row sm:items-start sm:justify-between"><div><p className="font-mono text-xs text-sky-300">4BPP / PALETTE-LOCKED</p><h2 className="mt-2 text-2xl font-bold">{selected.label}</h2><p className="mt-2 text-sm text-slate-300">{selected.summary}</p></div>{edits[selectedId] ? <span className="inline-flex w-fit items-center gap-2 rounded-full bg-emerald-400/15 px-3 py-1.5 text-xs text-emerald-200"><CheckCircle2 className="h-4 w-4" />تعديل جاهز للبناء</span> : <span className="w-fit rounded-full bg-slate-700/60 px-3 py-1.5 text-xs text-slate-300">الأصل دون تعديل</span>}</div>
            {current && <><div className="mt-6 grid gap-5 sm:grid-cols-2"><div><p className="mb-2 text-xs font-bold text-slate-400">الأصل من ROM</p><div className="flex min-h-36 items-center justify-center rounded-xl border border-sky-200/15 bg-[#0b1320] p-5"><img src={originalUrl} alt="رسم القائمة الأصلي" className="w-full max-w-xs object-contain" style={{ imageRendering: "pixelated" }} /></div></div><div><p className="mb-2 text-xs font-bold text-slate-400">المعاينة بعد الاستبدال</p><div className="flex min-h-36 items-center justify-center rounded-xl border border-dashed border-sky-200/30 bg-[#0b1320] p-5"><img src={currentUrl} alt="معاينة رسم القائمة" className="w-full max-w-xs object-contain" style={{ imageRendering: "pixelated" }} /></div></div></div><div className="mt-6 flex flex-col gap-3 sm:flex-row"><Button className="bg-sky-300 text-[#102033] hover:bg-sky-200" onClick={() => imageInput.current?.click()}><Replace className="ml-2 h-4 w-4" />استبدال الرسم بصورة عربية</Button><Button variant="outline" className="border-sky-200/30 text-sky-100 hover:bg-sky-950/60" disabled={Object.keys(edits).length === 0} onClick={build}><Download className="ml-2 h-4 w-4" />بناء ROM الرسومات</Button></div><p className="mt-4 text-xs leading-6 text-slate-400">هذه معاينة للبلاطات الخام للمورد. لا تحذف الخلفية إن كانت جزءاً من الرسم؛ استخدم الشفافية فقط للمناطق التي تريد إبقاءها شفافة.</p></>}</div></section>
      </>}
    </main>
  </div>;
}
