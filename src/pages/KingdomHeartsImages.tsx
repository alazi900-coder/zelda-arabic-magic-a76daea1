/**
 * STYLE: محاكاة عملية مباشرة لتجربة Risen Images: معرض موارد كبير في اليسار
 * ولوحة معاينة/تعديل في اليمين، ثم مساحة مستقلة للتركيب الجزئي. اللون الأخضر
 * وترتيب الضوابط مقصودان لتكون تجربة المستخدم المألوفة من Risen نفسها، بينما
 * تحافظ عمليات TIM2 هنا على الترويسة واللوحة والفهارس الأصلية.
 */

import { ChangeEvent, PointerEvent, useCallback, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import JSZip from "jszip";
import {
  ArrowLeft, CheckCircle2, Crop, Download, Eraser, FileImage, FolderArchive,
  FolderOpen, ImageDown, Loader2, Maximize, Replace, RotateCcw, Search,
  Target, Undo2, Upload, X, ZoomIn, ZoomOut,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { cropTim2Rgba, parseTim2, replaceTim2Rgba, Tim2Asset, Tim2Picture } from "@/lib/khbbs-tim2";
import { decodePngRawNoCanvas } from "@/lib/png-decode";
import { encodePngRawNoCanvas } from "@/lib/png-encode";
import { detectRegionBounds } from "@/lib/risen-image-composite";

const ACCENT = "#4a7c3f";
type Region = { x: number; y: number; width: number; height: number };
type Tim2Resource = { id: string; path: string; asset: Tim2Asset; working: Uint8Array; preview: string; modified: boolean };
type ImportedImage = { name: string; rgba: Uint8ClampedArray; width: number; height: number };
type DragState = { x: number; y: number; mode: "target" | "source" };

function canvasDataUrl(rgba: Uint8ClampedArray, width: number, height: number, maxWidth?: number): string {
  const source = document.createElement("canvas");
  source.width = width; source.height = height;
  source.getContext("2d")!.putImageData(new ImageData(rgba, width, height), 0, 0);
  const canvas = document.createElement("canvas");
  const scale = maxWidth ? Math.min(1, maxWidth / width) : 1;
  canvas.width = Math.max(1, Math.round(width * scale)); canvas.height = Math.max(1, Math.round(height * scale));
  const context = canvas.getContext("2d")!;
  context.imageSmoothingEnabled = false;
  context.drawImage(source, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/png");
}

function downloadBytes(bytes: Uint8Array, fileName: string, type: string) {
  const url = URL.createObjectURL(new Blob([bytes], { type }));
  const link = document.createElement("a");
  link.href = url; link.download = fileName; link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function decodeUpload(file: File): Promise<ImportedImage> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const decoded = await decodePngRawNoCanvas(bytes);
  if (decoded) return { name: file.name, ...decoded };
  const bitmap = await createImageBitmap(file);
  const canvas = document.createElement("canvas"); canvas.width = bitmap.width; canvas.height = bitmap.height;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("لا يمكن قراءة الصورة في هذا المتصفح.");
  context.drawImage(bitmap, 0, 0); bitmap.close();
  return { name: file.name, rgba: context.getImageData(0, 0, canvas.width, canvas.height).data, width: canvas.width, height: canvas.height };
}

function firstPicture(resource: Tim2Resource): Tim2Picture {
  return parseTim2(resource.working.buffer.slice(resource.working.byteOffset, resource.working.byteOffset + resource.working.byteLength)).pictures[0];
}

function clampRegion(region: Region, width: number, height: number): Region {
  const x = Math.max(0, Math.min(width - 1, Math.floor(region.x)));
  const y = Math.max(0, Math.min(height - 1, Math.floor(region.y)));
  return {
    x,
    y,
    width: Math.max(1, Math.min(width - x, Math.floor(region.width))),
    height: Math.max(1, Math.min(height - y, Math.floor(region.height))),
  };
}

function fileStem(path: string) { return path.split("/").pop()?.replace(/\.tm2$/i, "") ?? "TIM2"; }

export default function KingdomHeartsImages() {
  const archiveInputRef = useRef<HTMLInputElement>(null);
  const replaceInputRef = useRef<HTMLInputElement>(null);
  const overlayInputRef = useRef<HTMLInputElement>(null);
  const dragRef = useRef<DragState | null>(null);

  const [resources, setResources] = useState<Tim2Resource[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [archiveName, setArchiveName] = useState("TIM2 resources");
  const [search, setSearch] = useState("");
  const [activeFolder, setActiveFolder] = useState("all");
  const [loading, setLoading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [preserveAlpha, setPreserveAlpha] = useState(true);
  const [compositeMode, setCompositeMode] = useState(false);
  const [autoDetect, setAutoDetect] = useState(false);
  const [region, setRegion] = useState<Region | null>(null);
  const [cleanSource, setCleanSource] = useState<Region | null>(null);
  const [pickingCleanSource, setPickingCleanSource] = useState(false);
  const [overlay, setOverlay] = useState<ImportedImage | null>(null);
  const [zoom, setZoom] = useState(1);

  const selected = resources.find((item) => item.id === selectedId) ?? null;
  const selectedPicture = useMemo(() => selected ? firstPicture(selected) : null, [selected]);
  const folders = useMemo(() => Array.from(new Set(resources.map((item) => item.path.split("/")[0] || "ROOT"))).sort(), [resources]);
  const visible = useMemo(() => resources.filter((item) => {
    const inFolder = activeFolder === "all" || (item.path.split("/")[0] || "ROOT") === activeFolder;
    return inFolder && item.path.toLowerCase().includes(search.trim().toLowerCase());
  }), [activeFolder, resources, search]);
  const modified = resources.filter((item) => item.modified);

  const refreshResource = useCallback((id: string, working: Uint8Array, isModified = true) => {
    setResources((current) => current.map((item) => {
      if (item.id !== id) return item;
      const asset = parseTim2(working.buffer.slice(working.byteOffset, working.byteOffset + working.byteLength));
      const picture = asset.pictures[0];
      return { ...item, asset, working, preview: canvasDataUrl(picture.rgba, picture.width, picture.height, 180), modified: isModified };
    }));
  }, []);

  const openFiles = useCallback(async (files: File[]) => {
    setLoading(true);
    try {
      const raw: { path: string; bytes: Uint8Array }[] = [];
      for (const file of files) {
        if (file.name.toLowerCase().endsWith(".zip")) {
          const zip = await JSZip.loadAsync(file);
          for (const entry of Object.values(zip.files)) if (!entry.dir && entry.name.toLowerCase().endsWith(".tm2")) raw.push({ path: entry.name, bytes: await entry.async("uint8array") });
        } else if (file.name.toLowerCase().endsWith(".tm2")) raw.push({ path: file.name, bytes: new Uint8Array(await file.arrayBuffer()) });
      }
      if (!raw.length) throw new Error("لم يُعثر على ملفات TIM2 داخل الملفات المحددة.");
      const accepted: Tim2Resource[] = [];
      let rejected = 0;
      for (const item of raw) {
        try {
          const asset = parseTim2(item.bytes.buffer.slice(item.bytes.byteOffset, item.bytes.byteOffset + item.bytes.byteLength));
          const picture = asset.pictures[0];
          accepted.push({ id: `${item.path}:${accepted.length}`, path: item.path, asset, working: item.bytes, preview: canvasDataUrl(picture.rgba, picture.width, picture.height, 180), modified: false });
        } catch { rejected += 1; }
      }
      if (!accepted.length) throw new Error("لم تكن الملفات موارد TIM2 مفهرسة 8bpp مدعومة.");
      setResources(accepted); setSelectedId(accepted[0].id); setArchiveName(files[0]?.name ?? "TIM2 resources");
      setSearch(""); setActiveFolder("all"); setCompositeMode(false); setRegion(null); setCleanSource(null); setOverlay(null);
      toast.success(`تم فتح ${accepted.length} مورد TIM2`);
      if (rejected) toast.warning(`تُرك ${rejected} مورد غير مدعوم دون تغيير`);
    } catch (error) { toast.error(error instanceof Error ? error.message : "تعذّر فتح موارد TIM2."); }
    finally { setLoading(false); }
  }, []);

  const selectResource = (id: string) => {
    setSelectedId(id); setCompositeMode(false); setRegion(null); setCleanSource(null); setOverlay(null); setZoom(1);
  };

  const exportPng = useCallback(async (cropped = false) => {
    if (!selected || !selectedPicture) return;
    const image = cropped && region ? cropTim2Rgba(selectedPicture, region) : { rgba: selectedPicture.rgba, width: selectedPicture.width, height: selectedPicture.height };
    const png = await encodePngRawNoCanvas(image.rgba, image.width, image.height);
    if (png) downloadBytes(png, `${fileStem(selected.path)}${cropped ? "_region" : ""}.png`, "image/png");
  }, [region, selected, selectedPicture]);

  const exportTim2 = () => { if (selected) downloadBytes(selected.working, `${fileStem(selected.path)}.tm2`, "application/octet-stream"); };

  const replaceWhole = useCallback(async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]; event.target.value = "";
    if (!file || !selected) return;
    try {
      setLoading(true);
      const image = await decodeUpload(file);
      refreshResource(selected.id, replaceTim2Rgba(selected.asset, 0, image.rgba, image.width, image.height, { preserveOriginalAlpha: preserveAlpha }));
      toast.success("تمت مواءمة الصورة البديلة وحفظها في المورد.");
    } catch (error) { toast.error(error instanceof Error ? error.message : "تعذّر إدراج الصورة البديلة."); }
    finally { setLoading(false); }
  }, [preserveAlpha, refreshResource, selected]);

  const chooseOverlay = useCallback(async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]; event.target.value = "";
    if (!file) return;
    try { setOverlay(await decodeUpload(file)); }
    catch (error) { toast.error(error instanceof Error ? error.message : "تعذّر قراءة صورة التركيب."); }
  }, []);

  const confirmComposite = useCallback(() => {
    if (!selected || !region || !overlay) return;
    try {
      setLoading(true);
      // مطابقة لمسار Risen: إذا اختيرت رقعة خلفية نظيفة، تُمد داخل المنطقة
      // أولاً ثم يوضع التعريب فوقها ضمن بناء واحد؛ ما خارج المنطقة لا يتغير.
      let baseAsset = selected.asset;
      if (cleanSource && selectedPicture) {
        const cleanPatch = cropTim2Rgba(selectedPicture, cleanSource);
        const cleaned = replaceTim2Rgba(baseAsset, 0, cleanPatch.rgba, cleanPatch.width, cleanPatch.height, { preserveOriginalAlpha: preserveAlpha, region });
        baseAsset = parseTim2(cleaned.buffer.slice(cleaned.byteOffset, cleaned.byteOffset + cleaned.byteLength));
      }
      refreshResource(selected.id, replaceTim2Rgba(baseAsset, 0, overlay.rgba, overlay.width, overlay.height, { preserveOriginalAlpha: preserveAlpha, region }));
      toast.success(cleanSource ? "أعيدت الخلفية الأصلية ثم رُكّب التعريب داخل المنطقة المحددة." : "تم تركيب التعريب داخل المنطقة المحددة فقط.");
      setCompositeMode(false); setOverlay(null); setCleanSource(null);
    } catch (error) { toast.error(error instanceof Error ? error.message : "تعذّر تركيب الصورة."); }
    finally { setLoading(false); }
  }, [cleanSource, overlay, preserveAlpha, refreshResource, region, selected, selectedPicture]);

  const applyCleanSource = useCallback(() => {
    if (!selected || !selectedPicture || !region || !cleanSource) return;
    try {
      const cleanPatch = cropTim2Rgba(selectedPicture, cleanSource);
      refreshResource(selected.id, replaceTim2Rgba(selected.asset, 0, cleanPatch.rgba, cleanPatch.width, cleanPatch.height, { preserveOriginalAlpha: preserveAlpha, region }));
      toast.success("تم تغطية النص القديم برقعة من الخلفية الأصلية.");
    } catch (error) { toast.error(error instanceof Error ? error.message : "تعذّر تنظيف المنطقة."); }
  }, [cleanSource, preserveAlpha, refreshResource, region, selected, selectedPicture]);

  const resetSelected = () => {
    if (!selected) return;
    refreshResource(selected.id, selected.asset.raw.slice(), false);
    setRegion(null); setCleanSource(null); setOverlay(null);
    toast.success("أعيد المورد المحدد إلى أصله.");
  };

  const buildZip = useCallback(async () => {
    if (!resources.length) return;
    setLoading(true);
    try {
      const zip = new JSZip(); resources.forEach((item) => zip.file(item.path, item.working));
      downloadBytes(new Uint8Array(await zip.generateAsync({ type: "arraybuffer", compression: "DEFLATE", compressionOptions: { level: 6 } })), "Kingdom_Hearts_BBS_TIM2_Arabic.zip", "application/zip");
      toast.success(`تم بناء ZIP: ${modified.length} مورد معدل من ${resources.length}.`);
    } catch (error) { toast.error(error instanceof Error ? error.message : "تعذّر بناء أرشيف TIM2."); }
    finally { setLoading(false); }
  }, [modified.length, resources]);

  const pointFromEvent = useCallback((event: PointerEvent<HTMLImageElement>) => {
    if (!selectedPicture) return { x: 0, y: 0 };
    const box = event.currentTarget.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(selectedPicture.width - 1, Math.floor(((event.clientX - box.left) / box.width) * selectedPicture.width))),
      y: Math.max(0, Math.min(selectedPicture.height - 1, Math.floor(((event.clientY - box.top) / box.height) * selectedPicture.height))),
    };
  }, [selectedPicture]);

  const onPointerDown = (event: PointerEvent<HTMLImageElement>) => {
    if (!selectedPicture) return;
    const point = pointFromEvent(event);
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = { ...point, mode: pickingCleanSource ? "source" : "target" };
  };
  const onPointerMove = (event: PointerEvent<HTMLImageElement>) => {
    if (!selectedPicture || !dragRef.current) return;
    const point = pointFromEvent(event); const start = dragRef.current;
    const next = clampRegion({ x: Math.min(start.x, point.x), y: Math.min(start.y, point.y), width: Math.abs(point.x - start.x) + 1, height: Math.abs(point.y - start.y) + 1 }, selectedPicture.width, selectedPicture.height);
    if (start.mode === "source") setCleanSource(next); else setRegion(next);
  };
  const onPointerUp = (event: PointerEvent<HTMLImageElement>) => {
    const start = dragRef.current;
    dragRef.current = null;
    if (!start || !selectedPicture) return;
    if (start.mode === "source") { setPickingCleanSource(false); return; }

    // يبقى السحب يدوياً دائماً، حتى عندما يكون الكشف التلقائي مفعلاً. النقر
    // الثابت فقط هو الذي يطلب من الكاشف إيجاد حدود العنصر أسفل المؤشر.
    const point = pointFromEvent(event);
    const wasDrag = Math.abs(point.x - start.x) > 3 || Math.abs(point.y - start.y) > 3;
    if (!autoDetect || wasDrag) return;
    const detected = detectRegionBounds(selectedPicture.rgba, selectedPicture.width, selectedPicture.height, start.x, start.y);
    if (detected) {
      setRegion({ x: detected.x, y: detected.y, width: detected.w, height: detected.h });
      toast.success("تم اكتشاف حدود العنصر. اسحب فوق الصورة لتحديد مساحة أكبر يدوياً.");
    } else {
      toast.message("لم تُكتشف حدود مناسبة؛ اسحب لتحديد المنطقة يدوياً.");
    }
  };

  const updateRegionField = (field: keyof Region, value: string) => {
    if (!selectedPicture) return;
    const number = Number.parseInt(value, 10);
    if (!Number.isFinite(number)) return;
    const current = region ?? { x: 0, y: 0, width: Math.max(1, Math.floor(selectedPicture.width / 2)), height: Math.max(1, Math.floor(selectedPicture.height / 2)) };
    setRegion(clampRegion({ ...current, [field]: number }, selectedPicture.width, selectedPicture.height));
  };

  const openComposite = () => { if (selectedPicture) { setCompositeMode(true); setZoom(1); setAutoDetect(false); } };
  const closeAll = () => { setResources([]); setSelectedId(null); setCompositeMode(false); setRegion(null); setCleanSource(null); setOverlay(null); };

  if (!resources.length) return (
    <main dir="rtl" className={`min-h-screen flex flex-col items-center justify-center px-4 text-center transition-colors ${dragOver ? "bg-primary/5" : ""}`} onDragOver={(event) => { event.preventDefault(); setDragOver(true); }} onDragLeave={() => setDragOver(false)} onDrop={(event) => { event.preventDefault(); setDragOver(false); void openFiles(Array.from(event.dataTransfer.files)); }}>
      <Link to="/kingdom-hearts-bbs" className="absolute right-4 top-4"><Button variant="ghost" size="sm"><ArrowLeft className="ml-1 h-4 w-4" />رجوع</Button></Link>
      <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-primary/10" style={{ color: ACCENT, backgroundColor: `${ACCENT}1a` }}><FileImage className="h-8 w-8" /></div>
      <h1 className="mb-3 font-display text-2xl font-bold md:text-3xl">أداة صور Kingdom Hearts</h1>
      <p className="mb-8 max-w-lg text-muted-foreground">افتح أرشيف <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-sm">TIM2.zip</code> أو ملفات <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-sm">.TM2</code> مباشرة لعرضها وتنزيلها وتعديلها، أو اسحبها وأفلتها هنا.</p>
      <input ref={archiveInputRef} type="file" accept=".tm2,.zip,application/zip" multiple className="hidden" onChange={(event) => void openFiles(Array.from(event.target.files ?? []))} />
      <Button size="lg" disabled={loading} onClick={() => archiveInputRef.current?.click()} className="px-10 py-6 font-display text-lg font-bold text-white" style={{ backgroundColor: ACCENT }}>
        {loading ? <Loader2 className="ml-2 h-5 w-5 animate-spin" /> : <FolderOpen className="ml-2 h-5 w-5" />}{loading ? "جارٍ قراءة الموارد..." : "افتح TIM2 أو ZIP"}
      </Button>
      <p className="mt-4 max-w-md text-xs text-muted-foreground">تعمل المعالجة داخل المتصفح فقط. تعيد الأداة بناء الفهارس من لوحة الألوان الأصلية ولا تغيّر ترويسة المورد.</p>
    </main>
  );

  if (compositeMode && selected && selectedPicture) return (
    <main dir="rtl" className="flex min-h-screen flex-col">
      <header className="flex flex-wrap items-center gap-3 border-b border-border px-4 py-3"><Button size="sm" variant="ghost" onClick={() => { setCompositeMode(false); setOverlay(null); setCleanSource(null); }}><ArrowLeft className="ml-1 h-4 w-4" />رجوع</Button><span className="flex-1 truncate font-mono text-xs text-muted-foreground" dir="ltr">{selected.path}</span><div className="flex items-center gap-1"><Button size="icon" variant="outline" className="h-8 w-8" onClick={() => setZoom((value) => Math.max(0.25, value / 1.25))} title="تصغير"><ZoomOut className="h-3.5 w-3.5" /></Button><span className="w-12 text-center font-mono text-xs">{Math.round(zoom * 100)}%</span><Button size="icon" variant="outline" className="h-8 w-8" onClick={() => setZoom((value) => Math.min(8, value * 1.25))} title="تكبير"><ZoomIn className="h-3.5 w-3.5" /></Button><Button size="sm" variant="outline" onClick={() => setZoom(1)}><Maximize className="ml-1 h-3.5 w-3.5" />ملائمة</Button><Button size="sm" variant="outline" onClick={() => setZoom(1)}>100%</Button></div></header>
      <p className="px-4 pt-3 text-xs text-muted-foreground">اسحب دائماً لتحديد مساحة كاملة للشعار أو النص. عند تفعيل الكشف التلقائي، النقر فقط يكشف حدود العنصر أسفل المؤشر ولا يمنع السحب. يمكن تعديل X/Y/العرض/الارتفاع يدوياً. اسحب رقعة نظيفة من الخلفية لمسح النص القديم قبل التركيب عند الحاجة.</p>
      <section className="flex min-h-0 flex-1 flex-col gap-3 p-3 md:flex-row">
        <div className="min-h-[320px] flex-1 overflow-auto rounded border border-border" style={{ backgroundImage: "repeating-conic-gradient(#88888844 0% 25%, transparent 0% 50%)", backgroundSize: "16px 16px" }}><div className="relative w-fit"><img src={canvasDataUrl(selectedPicture.rgba, selectedPicture.width, selectedPicture.height)} alt={selected.path} draggable={false} className={`block select-none ${pickingCleanSource ? "cursor-copy" : "cursor-crosshair"}`} style={{ width: selectedPicture.width * zoom, height: selectedPicture.height * zoom, maxWidth: "none", imageRendering: "pixelated" }} onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} />{region && <div className="pointer-events-none absolute border-2 border-emerald-400 bg-emerald-400/10" style={{ left: region.x * zoom, top: region.y * zoom, width: region.width * zoom, height: region.height * zoom }} />}{cleanSource && <div className="pointer-events-none absolute border-2 border-sky-400 bg-sky-400/10" style={{ left: cleanSource.x * zoom, top: cleanSource.y * zoom, width: cleanSource.width * zoom, height: cleanSource.height * zoom }} />}</div></div>
        <aside className="flex w-full shrink-0 flex-col gap-3 md:w-72"><div className="grid grid-cols-4 gap-1.5">{([ ["x", "X"], ["y", "Y"], ["width", "العرض"], ["height", "الارتفاع"] ] as [keyof Region, string][]).map(([field, label]) => <div key={field} className="flex flex-col items-center gap-0.5"><Label className="text-[10px] text-muted-foreground">{label}</Label><Input type="number" min={0} className="h-8 px-1 text-center font-mono text-xs" value={region?.[field] ?? 0} onChange={(event) => updateRegionField(field, event.target.value)} /></div>)}</div>
          <div className="flex items-center gap-2"><Checkbox id="tim2-auto-detect" checked={autoDetect} onCheckedChange={(value) => setAutoDetect(value === true)} /><Label htmlFor="tim2-auto-detect" className="cursor-pointer text-xs">انقر لاكتشاف حدود العنصر تلقائياً</Label></div>
          <div className="rounded border border-border bg-muted/30 p-2"><div className="text-[11px] font-medium">🧹 إزالة المحتوى القديم واستعادة الخلفية (اختياري)</div><p className="mt-1 text-[10px] leading-relaxed text-muted-foreground">اسحب مربعاً فوق جزء نظيف من الخلفية. عند الضغط على «تركيب» ستُمد الرقعة تلقائياً لتغطي موضع النص أو الشعار القديم، ثم يوضع التعريب فوقها؛ لا تتغير البكسلات خارج منطقة التركيب.</p><Button size="sm" variant={pickingCleanSource ? "default" : "outline"} className="mt-2 w-full" disabled={!region} onClick={() => setPickingCleanSource((value) => !value)}><Target className="ml-1 h-3.5 w-3.5" />{pickingCleanSource ? "اسحب الآن فوق خلفية نظيفة" : "حدد رقعة خلفية نظيفة"}</Button>{cleanSource && <p className="mt-2 text-center font-mono text-[10px] text-muted-foreground">المصدر: {cleanSource.width}×{cleanSource.height} عند ({cleanSource.x}, {cleanSource.y}) — سيطبق تلقائياً عند التركيب</p>}<Button size="sm" variant="secondary" className="mt-2 w-full" disabled={!region || !cleanSource || loading} onClick={applyCleanSource}><Eraser className="ml-1 h-3.5 w-3.5" />إزالة الجزء الآن (خلفية فقط)</Button></div>
          <Button size="sm" variant="outline" disabled={!region} onClick={() => void exportPng(true)}><Download className="ml-1 h-3.5 w-3.5" />تصدير المنطقة كـ PNG</Button>
          <input ref={overlayInputRef} type="file" accept=".png,.jpg,.jpeg,.webp" className="hidden" onChange={(event) => void chooseOverlay(event)} />
          <Button size="sm" variant="outline" onClick={() => overlayInputRef.current?.click()}><ImageDown className="ml-1 h-3.5 w-3.5" />{overlay ? "تغيير صورة التركيب" : "اختر صورة التركيب"}</Button>{overlay && <p className="truncate text-center text-[11px] text-muted-foreground">{overlay.name} · {overlay.width}×{overlay.height}</p>}
          <div className="flex items-start gap-2"><Checkbox id="tim2-alpha-composite" checked={preserveAlpha} onCheckedChange={(value) => setPreserveAlpha(value === true)} /><Label htmlFor="tim2-alpha-composite" className="cursor-pointer text-[11px] leading-relaxed text-muted-foreground">استخدم شفافية المورد الأصلي داخل منطقة التركيب.</Label></div>
          <div className="flex gap-2"><Button size="sm" className="flex-1 text-white" style={{ backgroundColor: ACCENT }} disabled={!region || !overlay || loading} onClick={confirmComposite}>{loading ? <Loader2 className="ml-1 h-3.5 w-3.5 animate-spin" /> : <Crop className="ml-1 h-3.5 w-3.5" />}{cleanSource ? "استعادة الخلفية ثم تركيب" : "تركيب"}</Button><Button size="sm" variant="ghost" onClick={() => { setCompositeMode(false); setOverlay(null); setCleanSource(null); }}><X className="ml-1 h-3.5 w-3.5" />إلغاء</Button></div>
        </aside>
      </section>
    </main>
  );

  return (
    <main dir="rtl" className="flex min-h-screen flex-col">
      <header className="flex flex-wrap items-center gap-3 border-b border-border px-4 py-3"><Link to="/kingdom-hearts-bbs"><Button variant="ghost" size="sm"><ArrowLeft className="ml-1 h-4 w-4" />رجوع</Button></Link><span className="font-display font-bold">صور Kingdom Hearts</span><span className="font-mono text-sm text-muted-foreground" dir="ltr">{archiveName}</span><span className="text-xs text-muted-foreground">({resources.length} مورد)</span><div className="flex-1" /><Button variant="outline" size="sm" onClick={closeAll}>إغلاق</Button><Button size="sm" disabled={loading} className="font-bold text-white" style={{ backgroundColor: ACCENT }} onClick={() => void buildZip()}><FolderArchive className="ml-1 h-4 w-4" />بناء ZIP ({modified.length})</Button></header>
      <section className="flex min-h-0 flex-1 flex-col md:flex-row">
        <section className="flex min-w-0 flex-1 flex-col"><div className="flex flex-col gap-2 border-b border-border p-3"><div className="flex items-center gap-2"><Search className="h-4 w-4 shrink-0 text-muted-foreground" /><Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="ابحث بالاسم..." className="text-sm" /></div><div className="flex flex-wrap gap-2"><Button variant={activeFolder === "all" ? "secondary" : "outline"} size="sm" className="text-xs" onClick={() => setActiveFolder("all")}>الكل ({resources.length})</Button>{folders.map((folder) => <Button key={folder} variant={activeFolder === folder ? "secondary" : "outline"} size="sm" className="text-xs" onClick={() => setActiveFolder(folder)}>{folder} ({resources.filter((item) => (item.path.split("/")[0] || "ROOT") === folder).length})</Button>)}</div></div><div className="grid flex-1 grid-cols-3 content-start gap-2 overflow-y-auto p-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6">{visible.map((item) => <button key={item.id} onClick={() => selectResource(item.id)} className={`flex flex-col gap-1 rounded border p-2 text-right transition-colors ${item.id === selectedId ? "border-primary bg-primary/10" : "border-border hover:bg-muted/50"}`} title={item.path}><div className="flex aspect-square items-center justify-center overflow-hidden rounded bg-muted/40"><img src={item.preview} alt="" className="max-h-full max-w-full object-contain" style={{ imageRendering: "pixelated" }} /></div><span className="flex items-center gap-1 truncate font-mono text-[10px] text-muted-foreground" dir="ltr">{fileStem(item.path)}{item.modified && <CheckCircle2 className="mr-auto h-3.5 w-3.5 shrink-0 text-emerald-500" />}</span></button>)}{visible.length === 0 && <p className="col-span-full py-8 text-center text-sm text-muted-foreground">لا توجد نتائج مطابقة</p>}</div></section>
        <aside className="flex w-full shrink-0 flex-col gap-3 border-t border-border p-4 md:w-80 md:border-r md:border-t-0">{!selected || !selectedPicture ? <p className="mt-8 text-center text-sm text-muted-foreground">اختر صورة من القائمة للمعاينة</p> : <><p className="break-all font-mono text-xs text-muted-foreground" dir="ltr">{selected.path}</p><div className="flex aspect-square items-center justify-center overflow-hidden rounded" style={{ backgroundImage: "repeating-conic-gradient(#88888844 0% 25%, transparent 0% 50%)", backgroundSize: "16px 16px" }}><img src={canvasDataUrl(selectedPicture.rgba, selectedPicture.width, selectedPicture.height)} alt={selected.path} className="max-h-full max-w-full object-contain" style={{ imageRendering: "pixelated" }} /></div><div className="space-y-0.5 text-center text-xs text-muted-foreground"><p>{selectedPicture.width}×{selectedPicture.height} — 8bpp — لوحة 256 لوناً</p><p>{selected.asset.pictures.length > 1 ? `يُعرض المورد الأول من ${selected.asset.pictures.length}` : "مورد TIM2 مفهرس"}</p></div><div className="flex flex-col gap-2"><Button size="sm" variant="outline" onClick={() => void exportPng(false)}><ImageDown className="ml-1 h-3.5 w-3.5" />تنزيل PNG</Button><Button size="sm" variant="outline" onClick={exportTim2}><Download className="ml-1 h-3.5 w-3.5" />تنزيل TIM2 الأصلي/المعدل</Button><div className="flex items-start gap-2"><Checkbox id="tim2-alpha-full" checked={preserveAlpha} onCheckedChange={(value) => setPreserveAlpha(value === true)} /><Label htmlFor="tim2-alpha-full" className="cursor-pointer text-[11px] leading-relaxed text-muted-foreground">استخدم شفافية الصورة الأصلية؛ تتجاهل الأداة خلفية البديل في المواضع الشفافة من الأصل.</Label></div><input ref={replaceInputRef} type="file" accept=".png,.jpg,.jpeg,.webp" className="hidden" onChange={(event) => void replaceWhole(event)} /><Button size="sm" disabled={loading} className="text-white" style={{ backgroundColor: ACCENT }} onClick={() => replaceInputRef.current?.click()}>{loading ? <Loader2 className="ml-1 h-3.5 w-3.5 animate-spin" /> : <Replace className="ml-1 h-3.5 w-3.5" />}استبدال...</Button><p className="text-[11px] leading-relaxed text-muted-foreground">تطابق الصورة البديلة أبعاد المورد تلقائياً، ثم تُطابق مع أقرب ألوان لوحة اللعبة الأصلية.</p><Button size="sm" variant="outline" onClick={openComposite}><Crop className="ml-1 h-3.5 w-3.5" />تركيب صورة داخل منطقة محددة</Button><p className="text-[11px] leading-relaxed text-muted-foreground">للشعارات والصور المجمعة: عدّل موضع النص فقط، فتظل الخلفية وبقية الصورة دون تغيير.</p>{selected.modified && <Button size="sm" variant="ghost" onClick={resetSelected}><Undo2 className="ml-1 h-3.5 w-3.5" />تراجع عن هذا التعديل</Button>}</div></>}</aside>
      </section>
      {modified.length > 0 && <footer className="border-t border-border px-4 py-3"><p className="mb-2 text-xs font-display font-bold">تعديلات هذه الجلسة ({modified.length})</p><div className="flex max-h-20 flex-wrap gap-x-3 gap-y-1 overflow-y-auto">{modified.map((item) => <span key={item.id} className="font-mono text-[11px] text-muted-foreground" dir="ltr">{item.path}</span>)}</div></footer>}
    </main>
  );
}
