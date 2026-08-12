/** محرر صور Yu-Gi-Oh!: RTL عملي، بخلفية داكنة دافئة ومعاينات بكسلية وكتابة محلية فقط. */
import { useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, CheckCircle2, Download, ImageDown, Info, Languages, Loader2, Palette, Replace, RotateCcw, Upload } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  buildReshefImagesRom, decodeReshefImage, getReshefImageResource, RESHEF_IMAGE_RESOURCES,
  type ReshefImageEdits, type ReshefImagePixels,
} from "@/lib/yugioh/reshef-image-editor-bridge";
import { looksLikeReshefRom } from "@/lib/yugioh/reshef-editor-bridge";

function pixelsToUrl(image: ReshefImagePixels) {
  const canvas = document.createElement("canvas");
  canvas.width = image.width; canvas.height = image.height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("تعذّر إنشاء معاينة الصورة.");
  context.putImageData(new ImageData(image.pixels, image.width, image.height), 0, 0);
  return canvas.toDataURL("image/png");
}

function fitReplacement(file: File, width: number, height: number): Promise<Uint8ClampedArray> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file); const image = new Image();
    image.onload = () => {
      const canvas = document.createElement("canvas"); canvas.width = width; canvas.height = height;
      const context = canvas.getContext("2d");
      if (!context) { URL.revokeObjectURL(url); reject(new Error("تعذّر تجهيز صورة الاستبدال.")); return; }
      context.imageSmoothingEnabled = false;
      context.clearRect(0, 0, width, height);
      const scale = Math.min(width / image.naturalWidth, height / image.naturalHeight);
      const drawWidth = Math.max(1, Math.round(image.naturalWidth * scale));
      const drawHeight = Math.max(1, Math.round(image.naturalHeight * scale));
      context.drawImage(image, Math.floor((width - drawWidth) / 2), Math.floor((height - drawHeight) / 2), drawWidth, drawHeight);
      URL.revokeObjectURL(url); resolve(context.getImageData(0, 0, width, height).data);
    };
    image.onerror = () => { URL.revokeObjectURL(url); reject(new Error("ملف الصورة غير قابل للقراءة.")); };
    image.src = url;
  });
}

function downloadRom(bytes: Uint8Array) {
  const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: "application/octet-stream" }));
  const link = document.createElement("a"); link.href = url; link.download = "Yu-Gi-Oh-Reshef-Images-AR.gba"; link.click(); URL.revokeObjectURL(url);
}

export default function YuGiOhImages() {
  const romInput = useRef<HTMLInputElement>(null);
  const artInput = useRef<HTMLInputElement>(null);
  const [rom, setRom] = useState<Uint8Array | null>(null);
  const [originals, setOriginals] = useState<Record<string, ReshefImagePixels>>({});
  const [edits, setEdits] = useState<ReshefImageEdits>({});
  const [selectedId, setSelectedId] = useState<string>(RESHEF_IMAGE_RESOURCES[0].id);
  const [busy, setBusy] = useState(false);

  const selected = getReshefImageResource(selectedId);
  const original = originals[selectedId];
  const current = edits[selected.id] ? { width: selected.width, height: selected.height, pixels: edits[selected.id]! } : original;

  const loadRom = async (file: File) => {
    setBusy(true);
    try {
      const source = new Uint8Array(await file.arrayBuffer());
      if (!looksLikeReshefRom(source)) throw new Error("ارفع ROM الأمريكي الأصلي لـ Reshef of Destruction.");
      const decoded = Object.fromEntries(RESHEF_IMAGE_RESOURCES.map((item) => [item.id, decodeReshefImage(source, item.id)]));
      setRom(source); setOriginals(decoded); setEdits({});
      toast.success("تم تحميل موارد رسوم Reshef محلياً. لم يخرج ROM من المتصفح.");
    } catch (error) { toast.error((error as Error).message); } finally { setBusy(false); }
  };

  const replaceSelected = async (file: File) => {
    try {
      const pixels = await fitReplacement(file, selected.width, selected.height);
      setEdits((previous) => ({ ...previous, [selected.id]: pixels }));
      toast.success("تمت معاينة الاستبدال؛ سيُكتب داخل ROM فقط عند البناء.");
    } catch (error) { toast.error((error as Error).message); }
  };

  const build = () => {
    if (!rom) return;
    try {
      const result = buildReshefImagesRom(rom, edits); downloadRom(result.rom);
      toast.success(`تم بناء ROM مع ${result.changed.length} مورد رسومي معدل.`);
    } catch (error) { toast.error((error as Error).message); }
  };

  return <div className="min-h-screen bg-[#16130f] text-[#f6f0df]" dir="rtl">
    <input ref={romInput} className="sr-only" type="file" accept=".gba,application/octet-stream" onChange={(event) => { const file = event.target.files?.[0]; if (file) void loadRom(file); event.currentTarget.value = ""; }} />
    <input ref={artInput} className="sr-only" type="file" accept="image/png,image/webp,image/bmp" onChange={(event) => { const file = event.target.files?.[0]; if (file) void replaceSelected(file); event.currentTarget.value = ""; }} />
    <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:py-12">
      <header className="mb-8 flex flex-col gap-5 border-b border-[#6c5b32]/50 pb-7 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="mb-3 flex items-center gap-2 font-mono text-xs tracking-[0.18em] text-[#d7bd62]"><Palette className="h-4 w-4" /> YU-GI-OH / RESHEF / GBA GRAPHICS</p>
          <h1 className="font-display text-3xl font-black tracking-tight sm:text-4xl">محرر صور Reshef</h1>
          <p className="mt-3 max-w-2xl text-sm leading-7 text-[#c9c0aa]">يعرض ويستبدل الرسومات الموثقة في ROM محلياً. الصور ليست حقول نص: كل مورد يحتفظ بأبعاده وتخطيط بلاطاته ولوحة ألوان شاشة العنوان.</p>
        </div>
        <Link to="/yugioh" className="inline-flex items-center gap-2 text-sm text-[#e0cb80] transition hover:text-white"><ArrowRight className="h-4 w-4" />الرجوع إلى نصوص Yu-Gi-Oh!</Link>
      </header>

      <section className="mb-6 flex flex-col gap-4 rounded-2xl border border-[#968044] bg-[#2a2314] p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
        <div className="min-w-0"><p className="flex items-center gap-2 text-xs font-bold tracking-[0.14em] text-[#e0cb80]"><Languages className="h-4 w-4" />هام: هذه الصفحة للصور فقط</p><h2 className="mt-2 text-lg font-bold text-white">لتعريب الكلام والحوارات، استخدم قسم النصوص</h2><p className="mt-2 max-w-3xl text-sm leading-6 text-[#c9c0aa]">ارفع ROM Reshef من صفحة التعريب، ثم اكتب العربية في جدول النصوص واضغط بناء ROM. هذا المحرر يُستخدم فقط إذا أردت استبدال الرسم الثابت لكلمة NEW GAME.</p></div>
        <Link to="/yugioh" className="inline-flex shrink-0 items-center justify-center gap-2 rounded-lg bg-[#d1b34a] px-4 py-2.5 text-sm font-bold text-[#19150c] transition hover:bg-[#e2c660]"><Languages className="h-4 w-4" />فتح تعريب النصوص</Link>
      </section>

      {!rom ? <section className="grid overflow-hidden rounded-2xl border border-[#78663b] bg-[#211c12] md:grid-cols-[1.2fr_0.8fr]">
        <div className="p-7 sm:p-10"><p className="text-xs font-bold tracking-[0.16em] text-[#d7bd62]">الخطوة 01 / ROM أصلي</p><h2 className="mt-4 text-2xl font-bold">حمّل Reshef of Destruction (USA)</h2><p className="mt-4 max-w-lg leading-7 text-[#c9c0aa]">سيُفك مورد شاشة العنوان في المتصفح فقط. لا يتم تحميل ROM أو الصورة إلى خادم.</p><Button className="mt-7 bg-[#cfb044] text-[#19150c] hover:bg-[#e2c660]" disabled={busy} onClick={() => romInput.current?.click()}>{busy ? <Loader2 className="ml-2 h-4 w-4 animate-spin" /> : <Upload className="ml-2 h-4 w-4" />}اختر ROM</Button></div>
        <aside className="border-t border-[#78663b] bg-[#2a2314] p-7 md:border-r md:border-t-0"><Info className="h-6 w-6 text-[#d7bd62]" /><p className="mt-4 text-sm leading-7 text-[#c9c0aa]">الإصدار الأول يدعم مورد <strong className="text-white">NEW GAME</strong> فقط لأنه تم تتبعه إلى بلاطات ROM الحقيقية. Game Menu وLink Duel وCard Trade ظاهرة في قائمتك، لكنها ستظل معلّمة «قيد التتبع» حتى نثبت مواردها بدل الكتابة في مكان خاطئ.</p></aside>
      </section> : <>
        <section className="mb-6 grid gap-4 md:grid-cols-[260px_1fr]">
          <aside className="rounded-2xl border border-[#6c5b32] bg-[#211c12] p-3"><p className="px-3 pb-3 pt-2 text-xs font-bold tracking-wider text-[#d7bd62]">الموارد الموثقة</p>{RESHEF_IMAGE_RESOURCES.map((resource) => <button key={resource.id} onClick={() => setSelectedId(resource.id)} className={`w-full rounded-xl p-3 text-right transition ${selectedId === resource.id ? "bg-[#d1b34a] text-[#19150c]" : "text-[#e8dfcc] hover:bg-[#342b19]"}`}><span className="block font-mono text-sm font-bold">{resource.label}</span><span className={`mt-1 block text-xs ${selectedId === resource.id ? "text-[#3d351c]" : "text-[#9b917b]"}`}>{resource.width}×{resource.height} · 4bpp</span></button>)}</aside>
          <div className="rounded-2xl border border-[#6c5b32] bg-[#211c12] p-5 sm:p-7">
            <div className="flex flex-col gap-4 border-b border-[#6c5b32]/60 pb-5 sm:flex-row sm:items-start sm:justify-between"><div><p className="font-mono text-xs text-[#d7bd62]">{selected.format} · RAW ROM</p><h2 className="mt-2 text-2xl font-bold">{selected.label}</h2><p className="mt-2 text-sm text-[#c9c0aa]">{selected.summary}</p></div>{edits[selected.id] ? <span className="inline-flex w-fit items-center gap-2 rounded-full bg-[#253627] px-3 py-1.5 text-xs text-[#bce0ad]"><CheckCircle2 className="h-4 w-4" />تعديل جاهز للبناء</span> : <span className="rounded-full bg-[#3b3220] px-3 py-1.5 text-xs text-[#c9c0aa]">الأصل دون تعديل</span>}</div>
            <div className="mt-7 grid gap-6 lg:grid-cols-2"><div><p className="mb-3 text-xs font-bold text-[#bcb198]">الأصل من ROM</p>{original && <div className="flex min-h-28 items-center justify-center overflow-hidden rounded-xl border border-[#625631] bg-[#0e0c09] p-5 sm:min-h-40 sm:p-6"><img src={pixelsToUrl(original)} alt="NEW GAME الأصلي" className="h-auto w-[256px] max-w-full object-contain sm:w-[320px]" style={{ imageRendering: "pixelated" }} /></div>}</div><div><p className="mb-3 text-xs font-bold text-[#bcb198]">المعاينة بعد الاستبدال</p>{current && <div className="flex min-h-28 items-center justify-center overflow-hidden rounded-xl border border-dashed border-[#827240] bg-[#17130d] p-5 sm:min-h-40 sm:p-6"><img src={pixelsToUrl(current)} alt="معاينة مورد Reshef" className="h-auto w-[256px] max-w-full object-contain sm:w-[320px]" style={{ imageRendering: "pixelated" }} /></div>}</div></div>
            <div className="mt-7 flex flex-wrap gap-3"><Button className="bg-[#d1b34a] text-[#19150c] hover:bg-[#e2c660]" onClick={() => artInput.current?.click()}><Replace className="ml-2 h-4 w-4" />استبدل بصورة</Button><Button variant="outline" className="border-[#77683a] text-[#e7ddc5] hover:bg-[#342b19] hover:text-white" disabled={!edits[selected.id]} onClick={() => setEdits((previous) => { const next = { ...previous }; delete next[selected.id]; return next; })}><RotateCcw className="ml-2 h-4 w-4" />استعادة الأصل</Button><Button variant="outline" className="mr-auto border-[#77683a] text-[#e7ddc5] hover:bg-[#342b19] hover:text-white" onClick={build}><Download className="ml-2 h-4 w-4" />بناء ROM</Button></div>
            <p className="mt-5 flex gap-2 text-xs leading-6 text-[#9f947c]"><ImageDown className="mt-0.5 h-4 w-4 shrink-0" />ارفع PNG أو WEBP أو BMP. تُصغَّر إلى 64×16 بكسل من دون تنعيم، ثم تُكمَّم إلى لوحة ألوان شاشة العنوان الأصلية. احتفظ بكلمة أو صورة قصيرة وواضحة حتى لا تضيع في الحجم الصغير.</p>
          </div>
        </section>
      </>}
    </main>
  </div>;
}
