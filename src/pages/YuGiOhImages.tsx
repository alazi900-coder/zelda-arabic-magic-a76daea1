/**
 * Style: RTL editor with a warm arcade palette; pixel previews stay crisp and contained on small
 * screens so the original art remains the focus while all image conversion stays in the browser.
 */
import { useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, CheckCircle2, Download, ImageDown, Info, Languages, Loader2, Palette, Replace, RotateCcw, Upload } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  buildReshefImagesRom, decodeReshefImage, decodeReshefTitleLogo, getReshefImageResource, normalizeReshefReplacementPixels, quantizeReshefImagePixels,
  quantizeReshefTitleLogoPixels, readReshefTitlePalette, RESHEF_IMAGE_RESOURCES, RESHEF_TITLE_LOGO, titlePaletteCss, type ReshefImageEdits, type ReshefImagePixels, type ReshefPaletteEdits,
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

function downloadOriginalPng(image: ReshefImagePixels, name: string) {
  const canvas = document.createElement("canvas"); canvas.width = image.width; canvas.height = image.height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("تعذّر تجهيز صورة الأصل للتنزيل.");
  context.putImageData(new ImageData(image.pixels, image.width, image.height), 0, 0);
  canvas.toBlob((blob) => {
    if (!blob) { toast.error("تعذّر إنشاء PNG الأصلية."); return; }
    const url = URL.createObjectURL(blob); const link = document.createElement("a");
    link.href = url; link.download = `${name}-original-${image.width}x${image.height}.png`; link.click(); URL.revokeObjectURL(url);
  }, "image/png");
}

function bgr555ToHex(value: number) {
  const channel = (shift: number) => Math.round(((value >>> shift) & 0x1f) * 255 / 31).toString(16).padStart(2, "0");
  return `#${channel(0)}${channel(5)}${channel(10)}`;
}

function hexToBgr555(hex: string) {
  const value = Number.parseInt(hex.slice(1), 16);
  const component = (shift: number) => Math.round(((value >>> shift) & 0xff) * 31 / 255);
  return component(0) | (component(8) << 5) | (component(16) << 10);
}

export default function YuGiOhImages() {
  const romInput = useRef<HTMLInputElement>(null);
  const artInput = useRef<HTMLInputElement>(null);
  const logoInput = useRef<HTMLInputElement>(null);
  const [rom, setRom] = useState<Uint8Array | null>(null);
  const [originals, setOriginals] = useState<Record<string, ReshefImagePixels>>({});
  const [edits, setEdits] = useState<ReshefImageEdits>({});
  const [sourceEdits, setSourceEdits] = useState<ReshefImageEdits>({});
  const [paletteEdits, setPaletteEdits] = useState<ReshefPaletteEdits>({});
  const [titleLogoOriginal, setTitleLogoOriginal] = useState<ReshefImagePixels | null>(null);
  const [titleLogoEdit, setTitleLogoEdit] = useState<ReshefImagePixels | null>(null);
  const [selectedId, setSelectedId] = useState<string>(RESHEF_IMAGE_RESOURCES[0].id);
  const [busy, setBusy] = useState(false);

  const selected = getReshefImageResource(selectedId);
  const original = originals[selectedId];
  const originalPalette = rom ? readReshefTitlePalette(rom) : null;
  const activePalette = paletteEdits[selected.id] ?? originalPalette;
  const current = edits[selected.id] ? { width: selected.width, height: selected.height, pixels: edits[selected.id]! }
    : rom && activePalette ? decodeReshefImage(rom, selected.id, activePalette) : original;
  const hasChanges = Boolean(edits[selected.id] || paletteEdits[selected.id]);
  const hasAnyChanges = hasChanges || Boolean(titleLogoEdit);

  const loadRom = async (file: File) => {
    setBusy(true);
    try {
      const source = new Uint8Array(await file.arrayBuffer());
      if (!looksLikeReshefRom(source)) throw new Error("ارفع ROM الأمريكي الأصلي لـ Reshef of Destruction.");
      const decoded = Object.fromEntries(RESHEF_IMAGE_RESOURCES.map((item) => [item.id, decodeReshefImage(source, item.id)]));
      setRom(source); setOriginals(decoded); setTitleLogoOriginal(decodeReshefTitleLogo(source)); setTitleLogoEdit(null); setEdits({}); setSourceEdits({}); setPaletteEdits({});
      toast.success("تم تحميل موارد رسوم Reshef محلياً. لم يخرج ROM من المتصفح.");
    } catch (error) { toast.error((error as Error).message); } finally { setBusy(false); }
  };

  const replaceSelected = async (file: File) => {
    try {
      const fitted = await fitReplacement(file, selected.width, selected.height);
      const pixels = normalizeReshefReplacementPixels(selected.id, fitted);
      if (!activePalette) throw new Error("تعذّرت قراءة لوحة ألوان مورد NEW GAME.");
      setSourceEdits((previous) => ({ ...previous, [selected.id]: pixels }));
      setEdits((previous) => ({ ...previous, [selected.id]: quantizeReshefImagePixels(selected.id, pixels, activePalette) }));
      toast.success("حُوّلت الصورة إلى 64×16، ثم إلى ألوان لوحة NEW GAME الحالية قبل المعاينة.");
    } catch (error) { toast.error((error as Error).message); }
  };

  const replaceTitleLogo = async (file: File) => {
    if (!rom) return;
    try {
      const fitted = await fitReplacement(file, RESHEF_TITLE_LOGO.width, RESHEF_TITLE_LOGO.height);
      setTitleLogoEdit(quantizeReshefTitleLogoPixels(rom, fitted));
      toast.success("حُوّلت الصورة إلى 240×160 ثم إلى ألوان شعار Reshef الأصلية؛ المناطق الشفافة بقيت من الخلفية الأصلية.");
    } catch (error) { toast.error((error as Error).message); }
  };

  const build = () => {
    if (!rom) return;
    try {
      const result = buildReshefImagesRom(rom, edits, paletteEdits, titleLogoEdit?.pixels); downloadRom(result.rom);
      toast.success(`تم بناء ROM مع ${result.changed.length} مورد رسومي أو لوحة ألوان معدلة.`);
    } catch (error) { toast.error((error as Error).message); }
  };

  const updatePaletteColor = (index: number, value: string) => {
    if (!activePalette || index === 0) return;
    const nextPalette = activePalette.slice(); nextPalette[index] = hexToBgr555(value);
    setPaletteEdits((previous) => ({ ...previous, [selected.id]: nextPalette }));
    const rawPixels = sourceEdits[selected.id];
    if (rawPixels) setEdits((previous) => ({ ...previous, [selected.id]: quantizeReshefImagePixels(selected.id, rawPixels, nextPalette) }));
  };

  return <div className="min-h-screen bg-[#16130f] text-[#f6f0df]" dir="rtl">
    <input ref={romInput} className="sr-only" type="file" accept=".gba,application/octet-stream" onChange={(event) => { const file = event.target.files?.[0]; if (file) void loadRom(file); event.currentTarget.value = ""; }} />
    <input ref={artInput} className="sr-only" type="file" accept="image/png,image/webp,image/bmp" onChange={(event) => { const file = event.target.files?.[0]; if (file) void replaceSelected(file); event.currentTarget.value = ""; }} />
    <input ref={logoInput} className="sr-only" type="file" accept="image/png,image/webp,image/bmp" onChange={(event) => { const file = event.target.files?.[0]; if (file) void replaceTitleLogo(file); event.currentTarget.value = ""; }} />
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
        <div className="min-w-0"><p className="flex items-center gap-2 text-xs font-bold tracking-[0.14em] text-[#e0cb80]"><Languages className="h-4 w-4" />هام: هذه الصفحة للصور فقط</p><h2 className="mt-2 text-lg font-bold text-white">لتعريب الكلام والحوارات، استخدم قسم النصوص</h2><p className="mt-2 max-w-3xl text-sm leading-6 text-[#c9c0aa]">ارفع ROM Reshef من صفحة التعريب، ثم اكتب العربية في جدول النصوص واضغط بناء ROM. هذا المحرر يُستخدم فقط إذا أردت تعديل الرسم الثابت NEW GAME أو شعار شاشة العنوان.</p></div>
        <Link to="/yugioh" className="inline-flex shrink-0 items-center justify-center gap-2 rounded-lg bg-[#d1b34a] px-4 py-2.5 text-sm font-bold text-[#19150c] transition hover:bg-[#e2c660]"><Languages className="h-4 w-4" />فتح تعريب النصوص</Link>
      </section>

      {!rom ? <section className="grid overflow-hidden rounded-2xl border border-[#78663b] bg-[#211c12] md:grid-cols-[1.2fr_0.8fr]">
        <div className="p-7 sm:p-10"><p className="text-xs font-bold tracking-[0.16em] text-[#d7bd62]">الخطوة 01 / ROM أصلي</p><h2 className="mt-4 text-2xl font-bold">حمّل Reshef of Destruction (USA)</h2><p className="mt-4 max-w-lg leading-7 text-[#c9c0aa]">سيُفك مورد شاشة العنوان في المتصفح فقط. لا يتم تحميل ROM أو الصورة إلى خادم.</p><Button className="mt-7 bg-[#cfb044] text-[#19150c] hover:bg-[#e2c660]" disabled={busy} onClick={() => romInput.current?.click()}>{busy ? <Loader2 className="ml-2 h-4 w-4 animate-spin" /> : <Upload className="ml-2 h-4 w-4" />}اختر ROM</Button></div>
        <aside className="border-t border-[#78663b] bg-[#2a2314] p-7 md:border-r md:border-t-0"><Info className="h-6 w-6 text-[#d7bd62]" /><p className="mt-4 text-sm leading-7 text-[#c9c0aa]">يدعم المحرر حالياً مورد <strong className="text-white">NEW GAME</strong> الخام وشعار شاشة العنوان المضغوط بعد تتبعهما إلى ROM الحقيقي. Game Menu وLink Duel وCard Trade ستظل معلّمة «قيد التتبع» حتى نثبت مواردها بدل الكتابة في مكان خاطئ.</p></aside>
      </section> : <>
        <section className="mb-6 grid gap-4 md:grid-cols-[260px_1fr]">
          <aside className="rounded-2xl border border-[#6c5b32] bg-[#211c12] p-3"><p className="px-3 pb-3 pt-2 text-xs font-bold tracking-wider text-[#d7bd62]">الموارد الموثقة</p>{RESHEF_IMAGE_RESOURCES.map((resource) => <button key={resource.id} onClick={() => setSelectedId(resource.id)} className={`w-full rounded-xl p-3 text-right transition ${selectedId === resource.id ? "bg-[#d1b34a] text-[#19150c]" : "text-[#e8dfcc] hover:bg-[#342b19]"}`}><span className="block font-mono text-sm font-bold">{resource.label}</span><span className={`mt-1 block text-xs ${selectedId === resource.id ? "text-[#3d351c]" : "text-[#9b917b]"}`}>{resource.width}×{resource.height} · 4bpp</span></button>)}</aside>
          <div className="rounded-2xl border border-[#6c5b32] bg-[#211c12] p-5 sm:p-7">
            <div className="flex flex-col gap-4 border-b border-[#6c5b32]/60 pb-5 sm:flex-row sm:items-start sm:justify-between"><div><p className="font-mono text-xs text-[#d7bd62]">{selected.format} · RAW ROM</p><h2 className="mt-2 text-2xl font-bold">{selected.label}</h2><p className="mt-2 text-sm text-[#c9c0aa]">{selected.summary}</p></div>{hasChanges ? <span className="inline-flex w-fit items-center gap-2 rounded-full bg-[#253627] px-3 py-1.5 text-xs text-[#bce0ad]"><CheckCircle2 className="h-4 w-4" />تعديل جاهز للبناء</span> : <span className="rounded-full bg-[#3b3220] px-3 py-1.5 text-xs text-[#c9c0aa]">الأصل دون تعديل</span>}</div>
            <div className="mt-7 grid gap-6 lg:grid-cols-2"><div><p className="mb-3 text-xs font-bold text-[#bcb198]">الأصل من ROM</p>{original && <div className="flex min-h-28 items-center justify-center overflow-hidden rounded-xl border border-[#625631] bg-[#0e0c09] p-5 sm:min-h-40 sm:p-6"><img src={pixelsToUrl(original)} alt="NEW GAME الأصلي" className="h-auto w-[256px] max-w-full object-contain sm:w-[320px]" style={{ imageRendering: "pixelated" }} /></div>}</div><div><p className="mb-3 text-xs font-bold text-[#bcb198]">المعاينة بعد الاستبدال</p>{current && <div className="flex min-h-28 items-center justify-center overflow-hidden rounded-xl border border-dashed border-[#827240] bg-[#17130d] p-5 sm:min-h-40 sm:p-6"><img src={pixelsToUrl(current)} alt="معاينة مورد Reshef" className="h-auto w-[256px] max-w-full object-contain sm:w-[320px]" style={{ imageRendering: "pixelated" }} /></div>}</div></div>
            {activePalette && <section className="mt-7 rounded-xl border border-[#625631] bg-[#17130d] p-4 sm:p-5"><div className="flex flex-col gap-2 border-b border-[#625631]/70 pb-4 sm:flex-row sm:items-center sm:justify-between"><div><p className="text-xs font-bold tracking-[0.14em] text-[#d7bd62]">PALETTE / OBJ 0 / VERIFIED</p><h3 className="mt-1 font-bold text-white">ألوان NEW GAME</h3></div><span className="text-xs text-[#9f947c]">اللون 0 للشفافية ومقفل</span></div><div className="mt-4 grid grid-cols-4 gap-2 sm:grid-cols-8">{Array.from(activePalette).map((color, index) => <label key={index} className={`rounded-lg border p-2 text-center ${index === 0 ? "border-[#54492d] opacity-60" : "border-[#76663c] bg-[#211c12]"}`}><span className="mx-auto block h-8 w-full rounded border border-black/30" style={{ backgroundColor: index === 0 ? "repeating-conic-gradient(#211c12 0% 25%, #4b4025 0% 50%) 50% / 10px 10px" : titlePaletteCss(index, activePalette) }} /><input aria-label={`لون ${index}`} className="mt-2 h-7 w-full cursor-pointer bg-transparent" disabled={index === 0} type="color" value={bgr555ToHex(color)} onChange={(event) => updatePaletteColor(index, event.target.value)} /><span className="mt-1 block font-mono text-[10px] text-[#c9c0aa]">{index === 0 ? "شفاف" : `#${index}`}</span></label>)}</div><p className="mt-4 text-xs leading-6 text-[#9f947c]">تُكتب هذه الألوان الستة عشر فقط عند البناء إلى لوحة OBJ0 الموثقة في شاشة العنوان. لا تمس الأداة ألوان شعار اللعبة أو الخلفية.</p></section>}
            <div className="mt-7 flex flex-wrap gap-3"><Button variant="outline" className="border-[#77683a] text-[#e7ddc5] hover:bg-[#342b19] hover:text-white" disabled={!original} onClick={() => original && downloadOriginalPng(original, selected.id)}><ImageDown className="ml-2 h-4 w-4" />تحميل الأصل 64×16</Button><Button className="bg-[#d1b34a] text-[#19150c] hover:bg-[#e2c660]" onClick={() => artInput.current?.click()}><Replace className="ml-2 h-4 w-4" />استبدل بصورة عربية</Button><Button variant="outline" className="border-[#77683a] text-[#e7ddc5] hover:bg-[#342b19] hover:text-white" disabled={!edits[selected.id]} onClick={() => { setEdits((previous) => { const next = { ...previous }; delete next[selected.id]; return next; }); setSourceEdits((previous) => { const next = { ...previous }; delete next[selected.id]; return next; }); }}><RotateCcw className="ml-2 h-4 w-4" />استعادة الصورة</Button><Button variant="outline" className="border-[#77683a] text-[#e7ddc5] hover:bg-[#342b19] hover:text-white" disabled={!paletteEdits[selected.id]} onClick={() => { setPaletteEdits((previous) => { const next = { ...previous }; delete next[selected.id]; return next; }); const rawPixels = sourceEdits[selected.id]; if (rawPixels && originalPalette) setEdits((previous) => ({ ...previous, [selected.id]: quantizeReshefImagePixels(selected.id, rawPixels, originalPalette) })); }}><RotateCcw className="ml-2 h-4 w-4" />استعادة الألوان</Button><Button variant="outline" className="mr-auto border-[#77683a] text-[#e7ddc5] hover:bg-[#342b19] hover:text-white" disabled={!hasAnyChanges} onClick={build}><Download className="ml-2 h-4 w-4" />بناء ROM</Button></div>
            <p className="mt-5 flex gap-2 text-xs leading-6 text-[#9f947c]"><ImageDown className="mt-0.5 h-4 w-4 shrink-0" />أولاً حمّل الأصل وعدّل عليه. عند رفع PNG أو WEBP أو BMP، تُصغَّر الصورة تلقائياً بلا تنعيم إلى 64×16، ويُزال لون الخلفية المتصل بحواف الصورة ليعود إلى شفافية شاشة العنوان، ثم تُكمَّم كل الألوان إلى لوحة NEW GAME الحالية ذات 16 لوناً وتُكتب كبلاطات GBA 4bpp سليمة.</p>
          </div>
        </section>
        <section className="rounded-2xl border border-[#6c5b32] bg-[#211c12] p-5 sm:p-7">
          <div className="flex flex-col gap-4 border-b border-[#6c5b32]/60 pb-5 sm:flex-row sm:items-start sm:justify-between"><div><p className="font-mono text-xs text-[#d7bd62]">TITLE SCREEN / BG3 / 8BPP / LZ77</p><h2 className="mt-2 text-2xl font-bold">{RESHEF_TITLE_LOGO.label}</h2><p className="mt-2 max-w-3xl text-sm leading-6 text-[#c9c0aa]">{RESHEF_TITLE_LOGO.summary} حمّل الأصل، واكتب العربية فوق الشعار مع ترك بقية الخلفية كما هي، ثم ارفعه. ألوان الخلفية الأصلية تبقى ثابتة.</p></div>{titleLogoEdit ? <span className="inline-flex w-fit items-center gap-2 rounded-full bg-[#253627] px-3 py-1.5 text-xs text-[#bce0ad]"><CheckCircle2 className="h-4 w-4" />تعديل شعار جاهز للبناء</span> : <span className="rounded-full bg-[#3b3220] px-3 py-1.5 text-xs text-[#c9c0aa]">الأصل دون تعديل</span>}</div>
          <div className="mt-7 grid gap-6 lg:grid-cols-2"><div><p className="mb-3 text-xs font-bold text-[#bcb198]">شاشة العنوان الأصلية 240×160</p>{titleLogoOriginal && <div className="overflow-hidden rounded-xl border border-[#625631] bg-[#0e0c09] p-2"><img src={pixelsToUrl(titleLogoOriginal)} alt="شعار Reshef الأصلي" className="h-auto w-full" style={{ imageRendering: "pixelated" }} /></div>}</div><div><p className="mb-3 text-xs font-bold text-[#bcb198]">المعاينة بعد التعريب</p>{(titleLogoEdit ?? titleLogoOriginal) && <div className="overflow-hidden rounded-xl border border-dashed border-[#827240] bg-[#17130d] p-2"><img src={pixelsToUrl(titleLogoEdit ?? titleLogoOriginal!)} alt="معاينة شعار Reshef" className="h-auto w-full" style={{ imageRendering: "pixelated" }} /></div>}</div></div>
          <div className="mt-7 flex flex-wrap gap-3"><Button variant="outline" className="border-[#77683a] text-[#e7ddc5] hover:bg-[#342b19] hover:text-white" disabled={!titleLogoOriginal} onClick={() => titleLogoOriginal && downloadOriginalPng(titleLogoOriginal, "reshef-title-screen")}><ImageDown className="ml-2 h-4 w-4" />تحميل أصل الشعار 240×160</Button><Button className="bg-[#d1b34a] text-[#19150c] hover:bg-[#e2c660]" onClick={() => logoInput.current?.click()}><Replace className="ml-2 h-4 w-4" />استبدل بشعار عربي</Button><Button variant="outline" className="border-[#77683a] text-[#e7ddc5] hover:bg-[#342b19] hover:text-white" disabled={!titleLogoEdit} onClick={() => setTitleLogoEdit(null)}><RotateCcw className="ml-2 h-4 w-4" />استعادة الشعار</Button><Button variant="outline" className="mr-auto border-[#77683a] text-[#e7ddc5] hover:bg-[#342b19] hover:text-white" disabled={!hasAnyChanges} onClick={build}><Download className="ml-2 h-4 w-4" />بناء ROM</Button></div>
          <p className="mt-5 flex gap-2 text-xs leading-6 text-[#9f947c]"><Info className="mt-0.5 h-4 w-4 shrink-0" />لا تغيّر حجم الملف يدوياً: الأداة تلائم الصورة بلا تنعيم إلى 240×160 وتستخدم لوحة ألوان الشعار الأصلية ذات 256 لوناً. إذا صار ضغط LZ77 أكبر من السعة الأصلية، توقف الأداة البناء ولا تكتب ROM غير صالح.</p>
        </section>
      </>}
    </main>
  </div>;
}
