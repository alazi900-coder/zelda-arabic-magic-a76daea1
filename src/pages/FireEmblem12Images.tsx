/**
 * Style: RTL pixel-workbench matching the Fire Emblem text tool. Dense controls,
 * clear safety states, and crisp tile previews support small Android screens.
 */
import { useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, ImageDown, Info, Loader2, Palette, Upload } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  decodeFE12MenuImage, FE12_MENU_IMAGE_RESOURCES,
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

export default function FireEmblem12Images() {
  // Style: RTL pixel-workbench. Resource bytes remain viewable, but writing is blocked
  // until the title-screen tile maps are verified; raw 4bpp banks are not full images.
  const tileMapVerified = false;
  const romInput = useRef<HTMLInputElement>(null);
  const [rom, setRom] = useState<Uint8Array | null>(null);
  const [originals, setOriginals] = useState<Record<string, FE12MenuImagePixels>>({});
  const [selectedId, setSelectedId] = useState<FE12MenuImageResource["id"]>(FE12_MENU_IMAGE_RESOURCES[0].id);
  const [busy, setBusy] = useState(false);
  const selected = FE12_MENU_IMAGE_RESOURCES.find((item) => item.id === selectedId)!;
  const original = originals[selectedId];
  const originalUrl = useMemo(() => original ? pixelsToUrl(original) : "", [original]);

  const loadRom = async (file: File) => {
    setBusy(true);
    try {
      const source = new Uint8Array(await file.arrayBuffer());
      const verified = await verifyFE12Rom(source);
      if (!verified.valid) throw new Error(verified.reason);
      const decoded = Object.fromEntries(FE12_MENU_IMAGE_RESOURCES.map((item) => [item.id, decodeFE12MenuImage(source, item.id)]));
      setRom(source); setOriginals(decoded);
      toast.success("تم تحميل رسوم قوائم Beta 2 محلياً. لم يخرج ROM من جهازك.");
    } catch (error) { toast.error((error as Error).message); } finally { setBusy(false); }
  };

  return <div className="min-h-screen bg-[#101926] text-[#eff5ff]" dir="rtl">
    <input ref={romInput} className="sr-only" type="file" accept=".nds,application/octet-stream" onChange={(event) => { const file = event.target.files?.[0]; if (file) void loadRom(file); event.currentTarget.value = ""; }} />
    <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:py-12">
      <header className="mb-8 flex flex-col gap-5 border-b border-sky-200/15 pb-7 sm:flex-row sm:items-end sm:justify-between">
        <div><p className="mb-3 flex items-center gap-2 font-mono text-xs tracking-[0.18em] text-sky-300"><Palette className="h-4 w-4" /> FIRE EMBLEM 12 / DS / MENU GRAPHICS</p><h1 className="text-3xl font-black tracking-tight sm:text-4xl">فاحص رسومات قوائم Fire Emblem</h1><p className="mt-3 max-w-2xl text-sm leading-7 text-slate-300">يعرض موارد 4bpp الخام للتشخيص فقط. لا يتيح استبدالها حتى تُستعاد خريطة مواضع بلاطات شاشة القائمة الفعلية.</p></div>
        <Link to="/fire-emblem-12" className="inline-flex items-center gap-2 text-sm text-sky-200 transition hover:text-white"><ArrowRight className="h-4 w-4" />الرجوع إلى محرر النصوص</Link>
      </header>
      <section className="mb-6 rounded-2xl border border-amber-300/30 bg-amber-950/20 p-5"><p className="flex items-center gap-2 text-xs font-bold tracking-[0.14em] text-amber-200"><Info className="h-4 w-4" />تنبيه أمان: التحرير متوقف مؤقتاً</p><p className="mt-2 text-sm leading-7 text-slate-200">المعاينة أدناه هي بنك بلاطات 8×8 وليست صورة كلمة كاملة. كانت الواجهة تعرضه كصورة قابلة للاستبدال، وهذا قد يكتب قطعاً في مواضع خاطئة. لذلك لا يمكن رفع صورة عربية أو بناء ROM من هذا القسم قبل توثيق خريطة مواضع البلاطات الفعلية.</p></section>
      {!rom ? <section className="grid overflow-hidden rounded-2xl border border-sky-200/20 bg-[#172334] md:grid-cols-[1.2fr_0.8fr]"><div className="p-7 sm:p-10"><p className="text-xs font-bold tracking-[0.16em] text-sky-300">الخطوة 01 / ROM الإنجليزي</p><h2 className="mt-4 text-2xl font-bold">حمّل Fire Emblem 12 Beta 2</h2><p className="mt-4 max-w-lg leading-7 text-slate-300">يتحقق الفاحص من النسخة الإنجليزية المعتمدة ثم يعرض بنك البلاطات للتشخيص داخل المتصفح فقط.</p><Button className="mt-7 bg-sky-300 text-[#102033] hover:bg-sky-200" disabled={busy} onClick={() => romInput.current?.click()}>{busy ? <Loader2 className="ml-2 h-4 w-4 animate-spin" /> : <Upload className="ml-2 h-4 w-4" />}اختر ROM</Button></div><aside className="border-t border-sky-200/20 bg-[#111b2a] p-7 md:border-r md:border-t-0"><ImageDown className="h-6 w-6 text-sky-300" /><p className="mt-4 text-sm leading-7 text-slate-300">هذا القسم لا يغيّر ROM ولا ينشئ ملفاً جديداً. الاستبدال سيعود فقط بعد توثيق خريطة مواضع البلاطات الفعلية.</p></aside></section> : <>
        <section className="mb-6 grid gap-4 md:grid-cols-[240px_1fr]"><aside className="rounded-2xl border border-sky-200/20 bg-[#172334] p-3"><p className="px-3 pb-3 pt-2 text-xs font-bold tracking-wider text-sky-300">الرسومات الموثقة</p>{FE12_MENU_IMAGE_RESOURCES.map((resource) => <button key={resource.id} onClick={() => setSelectedId(resource.id)} className={`w-full rounded-xl p-3 text-right transition ${selectedId === resource.id ? "bg-sky-300 text-[#102033]" : "text-slate-200 hover:bg-sky-950/60"}`}><span className="block font-bold">{resource.label}</span><span className={`mt-1 block font-mono text-[11px] ${selectedId === resource.id ? "text-sky-950" : "text-slate-400"}`}>{resource.id}</span></button>)}</aside>
          <div className="rounded-2xl border border-sky-200/20 bg-[#172334] p-5 sm:p-7"><div className="flex flex-col gap-4 border-b border-sky-200/15 pb-5 sm:flex-row sm:items-start sm:justify-between"><div><p className="font-mono text-xs text-sky-300">4BPP / RAW TILE BANK</p><h2 className="mt-2 text-2xl font-bold">{selected.label}</h2><p className="mt-2 text-sm text-slate-300">{selected.summary}</p></div><span className="w-fit rounded-full bg-amber-400/15 px-3 py-1.5 text-xs text-amber-200">غير قابل للتحرير بأمان</span></div>
            {original && <><div className="mt-6 grid gap-5 sm:grid-cols-2"><div><p className="mb-2 text-xs font-bold text-slate-400">بلاطات خام من ROM — للتشخيص فقط</p><div className="flex min-h-36 items-center justify-center rounded-xl border border-sky-200/15 bg-[#0b1320] p-5"><img src={originalUrl} alt="بلاطات قائمة خام من ROM" className="w-full max-w-xs object-contain" style={{ imageRendering: "pixelated" }} /></div></div><div><p className="mb-2 text-xs font-bold text-slate-400">لماذا لا تظهر كلمة كاملة؟</p><div className="flex min-h-36 items-center justify-center rounded-xl border border-dashed border-amber-300/30 bg-[#0b1320] p-5 text-center text-sm leading-7 text-slate-400">اللعبة ترتّب هذه القطع بخريطة مواضع مستقلة.<br />إلى أن تُستخرج تلك الخريطة، لا يمكن استبدالها بصورة عربية بأمان.</div></div></div><p className="mt-6 text-xs leading-6 text-slate-400">لا يوجد زر رفع أو بناء في هذا القسم حالياً، لحماية ROM من كتابة بلاطات في مواضع خاطئة.</p></>}</div></section>
      </>}
    </main>
  </div>;
}
