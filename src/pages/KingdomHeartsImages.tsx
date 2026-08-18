/**
 * STYLE: أداة عملية داكنة بلمسة كهرمانية، مستوحاة من تدفق Risen Images:
 * قائمة موارد، معاينة كبيرة، استبدال آمن وسجل تعديلات. لا تستخدم زخرفة زائدة
 * حتى تظل عملية على الهاتف أثناء تعريب صور واجهة PSP.
 */

import { ChangeEvent, PointerEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import JSZip from "jszip";
import { ArrowLeft, CheckCircle2, Download, Eraser, FileImage, FolderArchive, ImageDown, Loader2, RotateCcw, Search, SlidersHorizontal, Upload } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { cropTim2Rgba, parseTim2, replaceTim2Rgba, Tim2Asset, Tim2Picture } from "@/lib/khbbs-tim2";
import { decodePngRawNoCanvas } from "@/lib/png-decode";
import { encodePngRawNoCanvas } from "@/lib/png-encode";

type Tim2Resource = { id: string; path: string; asset: Tim2Asset; working: Uint8Array; preview: string; modified: boolean };
type Region = { x: number; y: number; width: number; height: number };

function canvasDataUrl(rgba: Uint8ClampedArray, width: number, height: number, maxWidth?: number): string {
  const canvas = document.createElement("canvas");
  const scale = maxWidth ? Math.min(1, maxWidth / width) : 1;
  canvas.width = Math.max(1, Math.round(width * scale));
  canvas.height = Math.max(1, Math.round(height * scale));
  const source = document.createElement("canvas");
  source.width = width; source.height = height;
  source.getContext("2d")!.putImageData(new ImageData(rgba, width, height), 0, 0);
  const context = canvas.getContext("2d")!;
  context.imageSmoothingEnabled = false;
  context.drawImage(source, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/png");
}

function downloadBytes(bytes: Uint8Array, fileName: string, type: string) {
  const url = URL.createObjectURL(new Blob([bytes], { type }));
  const anchor = document.createElement("a"); anchor.href = url; anchor.download = fileName; anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function decodeUpload(file: File): Promise<{ rgba: Uint8ClampedArray; width: number; height: number }> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const decoded = await decodePngRawNoCanvas(bytes);
  if (decoded) return decoded;
  const bitmap = await createImageBitmap(file);
  const canvas = document.createElement("canvas"); canvas.width = bitmap.width; canvas.height = bitmap.height;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("لا يمكن قراءة الصورة في هذا المتصفح.");
  context.drawImage(bitmap, 0, 0); bitmap.close();
  return { rgba: context.getImageData(0, 0, canvas.width, canvas.height).data, width: canvas.width, height: canvas.height };
}

function firstPicture(resource: Tim2Resource): Tim2Picture { return parseTim2(resource.working.buffer.slice(resource.working.byteOffset, resource.working.byteOffset + resource.working.byteLength)).pictures[0]; }

export default function KingdomHeartsImages() {
  const inputRef = useRef<HTMLInputElement>(null);
  const replacementRef = useRef<HTMLInputElement>(null);
  const [resources, setResources] = useState<Tim2Resource[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [preserveAlpha, setPreserveAlpha] = useState(true);
  const [regionMode, setRegionMode] = useState(false);
  const [clearRegion, setClearRegion] = useState(false);
  const [region, setRegion] = useState<Region | null>(null);
  const dragStart = useRef<{ x: number; y: number } | null>(null);

  const selected = resources.find((resource) => resource.id === selectedId) ?? null;
  const selectedPicture = useMemo(() => selected ? firstPicture(selected) : null, [selected]);
  const visible = useMemo(() => resources.filter((resource) => resource.path.toLowerCase().includes(search.toLowerCase())), [resources, search]);
  const modifiedCount = resources.filter((resource) => resource.modified).length;

  const refreshResource = useCallback((id: string, working: Uint8Array, modified = true) => {
    setResources((previous) => previous.map((resource) => {
      if (resource.id !== id) return resource;
      const asset = parseTim2(working.buffer.slice(working.byteOffset, working.byteOffset + working.byteLength));
      const picture = asset.pictures[0];
      return { ...resource, asset, working, preview: canvasDataUrl(picture.rgba, picture.width, picture.height, 180), modified };
    }));
  }, []);

  const openFiles = useCallback(async (files: File[]) => {
    setLoading(true);
    try {
      const rawFiles: { path: string; bytes: Uint8Array }[] = [];
      for (const file of files) {
        if (file.name.toLowerCase().endsWith(".zip")) {
          const archive = await JSZip.loadAsync(file);
          for (const entry of Object.values(archive.files)) if (!entry.dir && entry.name.toLowerCase().endsWith(".tm2")) rawFiles.push({ path: entry.name, bytes: await entry.async("uint8array") });
        } else if (file.name.toLowerCase().endsWith(".tm2")) rawFiles.push({ path: file.name, bytes: new Uint8Array(await file.arrayBuffer()) });
      }
      if (!rawFiles.length) throw new Error("لم يُعثر على ملفات TIM2 داخل الملفات المحددة.");
      const accepted: Tim2Resource[] = [];
      const rejected: string[] = [];
      for (const item of rawFiles) {
        try {
          const asset = parseTim2(item.bytes.buffer.slice(item.bytes.byteOffset, item.bytes.byteOffset + item.bytes.byteLength));
          const picture = asset.pictures[0];
          accepted.push({ id: `${item.path}:${accepted.length}`, path: item.path, asset, working: item.bytes, preview: canvasDataUrl(picture.rgba, picture.width, picture.height, 180), modified: false });
        } catch { rejected.push(item.path); }
      }
      if (!accepted.length) throw new Error("لم تكن أي من الملفات موارد TIM2 مفهرسة 8bpp مدعومة.");
      setResources(accepted); setSelectedId(accepted[0].id); setRegion(null);
      toast.success(`تم فتح ${accepted.length} مورد TIM2`);
      if (rejected.length) toast.warning(`تُرك ${rejected.length} مورد غير مدعوم دون تغيير`);
    } catch (error) { toast.error(error instanceof Error ? error.message : "تعذر فتح موارد TIM2."); }
    finally { setLoading(false); }
  }, []);

  const exportPng = useCallback(async (cropped = false) => {
    if (!selectedPicture || !selected) return;
    const source = cropped && region ? cropTim2Rgba(selectedPicture, region) : { rgba: selectedPicture.rgba, width: selectedPicture.width, height: selectedPicture.height };
    const bytes = await encodePngRawNoCanvas(source.rgba, source.width, source.height);
    if (bytes) downloadBytes(bytes, `${selected.path.split("/").pop()?.replace(/\.tm2$/i, "")}${cropped ? "_region" : ""}.png`, "image/png");
  }, [region, selected, selectedPicture]);

  const replaceFromFile = useCallback(async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]; event.target.value = "";
    if (!file || !selected || !selectedPicture) return;
    try {
      const imported = await decodeUpload(file);
      const targetRegion = regionMode && region ? region : undefined;
      const output = replaceTim2Rgba(selected.asset, 0, imported.rgba, imported.width, imported.height, { preserveOriginalAlpha: preserveAlpha, region: targetRegion, clearRegionBeforeComposite: regionMode && clearRegion });
      refreshResource(selected.id, output);
      toast.success(targetRegion ? "تم تركيب البديل داخل المنطقة المحددة." : "تمت مواءمة الصورة البديلة وحفظها في المورد.");
    } catch (error) { toast.error(error instanceof Error ? error.message : "تعذر إدراج الصورة البديلة."); }
  }, [clearRegion, preserveAlpha, refreshResource, region, regionMode, selected, selectedPicture]);

  const resetSelected = useCallback(() => {
    if (!selected) return;
    refreshResource(selected.id, selected.asset.raw.slice(), false); setRegion(null); toast.success("أعيد المورد المحدد إلى الأصل.");
  }, [refreshResource, selected]);

  const buildZip = useCallback(async () => {
    if (!resources.length) return;
    setLoading(true);
    try {
      const zip = new JSZip();
      resources.forEach((resource) => zip.file(resource.path, resource.working));
      downloadBytes(new Uint8Array(await zip.generateAsync({ type: "arraybuffer", compression: "DEFLATE", compressionOptions: { level: 6 } })), "Kingdom_Hearts_BBS_TIM2_Arabic.zip", "application/zip");
      toast.success(`تم بناء ZIP: ${modifiedCount} مورد معدل من ${resources.length}.`);
    } catch (error) { toast.error(error instanceof Error ? error.message : "تعذر بناء أرشيف TIM2."); }
    finally { setLoading(false); }
  }, [modifiedCount, resources]);

  const pointFromEvent = useCallback((event: PointerEvent<HTMLImageElement>) => {
    if (!selectedPicture) return { x: 0, y: 0 };
    const bounds = event.currentTarget.getBoundingClientRect();
    return { x: Math.max(0, Math.min(selectedPicture.width - 1, Math.floor(((event.clientX - bounds.left) / bounds.width) * selectedPicture.width))), y: Math.max(0, Math.min(selectedPicture.height - 1, Math.floor(((event.clientY - bounds.top) / bounds.height) * selectedPicture.height)))};
  }, [selectedPicture]);

  const onPointerDown = (event: PointerEvent<HTMLImageElement>) => { if (!regionMode) return; event.currentTarget.setPointerCapture(event.pointerId); dragStart.current = pointFromEvent(event); };
  const onPointerMove = (event: PointerEvent<HTMLImageElement>) => {
    if (!regionMode || !dragStart.current) return;
    const end = pointFromEvent(event); const start = dragStart.current;
    setRegion({ x: Math.min(start.x, end.x), y: Math.min(start.y, end.y), width: Math.abs(end.x - start.x) + 1, height: Math.abs(end.y - start.y) + 1 });
  };
  const onPointerUp = () => { dragStart.current = null; };

  useEffect(() => { setRegion(null); }, [selectedId]);

  return (
    <main dir="rtl" className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border bg-card/70 backdrop-blur"><div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-4"><div className="flex items-center gap-3"><Link to="/kingdom-hearts-bbs" className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-border hover:border-amber-500/70" aria-label="العودة إلى Kingdom Hearts"><ArrowLeft className="h-5 w-5" /></Link><div><p className="font-mono text-xs text-amber-500">PSP · TIM2 IMAGE RESOURCES</p><h1 className="font-display text-xl font-black md:text-2xl">أداة صور Kingdom Hearts</h1></div></div>{resources.length > 0 && <Button onClick={buildZip} disabled={loading} className="bg-amber-500 font-bold text-black hover:bg-amber-400"><FolderArchive className="ml-2 h-4 w-4" />بناء ZIP ({modifiedCount})</Button>}</div></header>
      {!resources.length ? <section className="mx-auto max-w-3xl px-4 py-16 text-center"><div className="rounded-3xl border-2 border-dashed border-border bg-card/40 p-8 md:p-14"><div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-amber-500/15 text-amber-500"><FileImage className="h-8 w-8" /></div><h2 className="font-display text-2xl font-black">افتح صور TIM2</h2><p className="mx-auto mt-3 max-w-xl leading-relaxed text-muted-foreground">ارفع ملفات <bdi>.TM2</bdi> متعددة أو أرشيف ZIP. ستظهر المعاينات، والتنزيل، والرفع، والاستبدال الجزئي. تحفظ الأداة ترويسة المورد ولوحته وترميز 8bpp.</p><input ref={inputRef} className="hidden" type="file" accept=".tm2,.zip,application/zip" multiple onChange={(event) => void openFiles(Array.from(event.target.files ?? []))} /><Button size="lg" disabled={loading} onClick={() => inputRef.current?.click()} className="mt-7 bg-amber-500 font-bold text-black hover:bg-amber-400">{loading ? <Loader2 className="ml-2 h-5 w-5 animate-spin" /> : <Upload className="ml-2 h-5 w-5" />}{loading ? "جارٍ قراءة الموارد" : "اختر TIM2 أو ZIP"}</Button><p className="mt-5 text-xs text-muted-foreground">المعالجة محلية داخل المتصفح؛ لا يرفع المورد إلى خادم.</p></div></section> : <section className="mx-auto grid max-w-7xl gap-4 p-4 lg:grid-cols-[280px_minmax(0,1fr)_300px]">
        <aside className="rounded-2xl border border-border bg-card/50 p-3"><div className="relative mb-3"><Search className="absolute right-3 top-3 h-4 w-4 text-muted-foreground" /><Input value={search} onChange={(event) => setSearch(event.target.value)} className="pr-9" placeholder="ابحث باسم المورد" /></div><p className="mb-2 text-xs text-muted-foreground">{visible.length} مورد · {modifiedCount} معدل</p><div className="max-h-[62vh] space-y-2 overflow-y-auto pr-1">{visible.map((resource) => <button key={resource.id} onClick={() => setSelectedId(resource.id)} className={`w-full rounded-xl border p-2 text-right transition-colors ${selectedId === resource.id ? "border-amber-500 bg-amber-500/10" : "border-border hover:border-amber-500/50"}`}><img src={resource.preview} alt="" className="h-20 w-full rounded-lg bg-black/20 object-contain" /><div className="mt-1 flex items-center gap-1 text-xs"><span className="truncate" dir="ltr">{resource.path}</span>{resource.modified && <CheckCircle2 className="mr-auto h-3.5 w-3.5 shrink-0 text-emerald-500" />}</div></button>)}</div></aside>
        <section className="min-w-0 rounded-2xl border border-border bg-card/40 p-4">{selected && selectedPicture && <><div className="mb-3 flex flex-wrap items-center justify-between gap-2"><div><p className="font-mono text-sm" dir="ltr">{selected.path}</p><p className="text-xs text-muted-foreground">{selectedPicture.width} × {selectedPicture.height} · 8bpp · لوحة 256 لوناً{selected.asset.pictures.length > 1 ? ` · يعرض الصورة الأولى من ${selected.asset.pictures.length}` : ""}</p></div><div className="flex gap-2"><Button variant="outline" size="sm" onClick={() => void exportPng(false)}><Download className="ml-1 h-4 w-4" />PNG</Button><Button variant="outline" size="sm" disabled={!region} onClick={() => void exportPng(true)}><ImageDown className="ml-1 h-4 w-4" />المنطقة</Button></div></div><div className="relative flex min-h-[340px] items-center justify-center overflow-auto rounded-xl border border-border bg-[linear-gradient(45deg,#141922_25%,transparent_25%),linear-gradient(-45deg,#141922_25%,transparent_25%),linear-gradient(45deg,transparent_75%,#141922_75%),linear-gradient(-45deg,transparent_75%,#141922_75%)] bg-[length:22px_22px] bg-[position:0_0,0_11px,11px_-11px,-11px_0px]"><div className="relative inline-block"><img src={canvasDataUrl(selectedPicture.rgba, selectedPicture.width, selectedPicture.height)} alt={selected.path} className={`max-h-[56vh] max-w-full select-none object-contain ${regionMode ? "cursor-crosshair" : ""}`} onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} draggable={false} />{region && <div className="pointer-events-none absolute border-2 border-amber-400 bg-amber-400/10" style={{ left: `${(region.x / selectedPicture.width) * 100}%`, top: `${(region.y / selectedPicture.height) * 100}%`, width: `${(region.width / selectedPicture.width) * 100}%`, height: `${(region.height / selectedPicture.height) * 100}%` }} />}</div></div><p className="mt-3 text-xs leading-relaxed text-muted-foreground">{regionMode ? "اسحب فوق الصورة لاختيار منطقة. سيُركّب الرفع داخلها فقط، وتظل بقية الصورة كما هي." : "رفع صورة بديلة يستبدل المورد كله بعد مواءمتها تلقائياً للأبعاد الأصلية."}</p></>}</section>
        <aside className="space-y-4 rounded-2xl border border-border bg-card/50 p-4"><div><h2 className="flex items-center gap-2 font-bold"><SlidersHorizontal className="h-4 w-4 text-amber-500" />الاستبدال الآمن</h2><input ref={replacementRef} className="hidden" type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => void replaceFromFile(event)} /><Button className="mt-3 w-full bg-amber-500 font-bold text-black hover:bg-amber-400" disabled={!selected || loading || (regionMode && !region)} onClick={() => replacementRef.current?.click()}><Upload className="ml-2 h-4 w-4" />رفع صورة معربة</Button><Button variant="outline" className="mt-2 w-full" disabled={!selected || !selected.modified} onClick={resetSelected}><RotateCcw className="ml-2 h-4 w-4" />تراجع عن هذا المورد</Button></div><div className="space-y-3 border-t border-border pt-4"><div className="flex items-center gap-2"><Checkbox id="alpha" checked={preserveAlpha} onCheckedChange={(value) => setPreserveAlpha(value === true)} /><Label htmlFor="alpha" className="cursor-pointer text-sm">حفظ شفافية الأصل</Label></div><div className="flex items-center gap-2"><Checkbox id="region" checked={regionMode} onCheckedChange={(value) => { setRegionMode(value === true); if (value !== true) setRegion(null); }} /><Label htmlFor="region" className="cursor-pointer text-sm">تحرير جزء من الصورة</Label></div>{regionMode && <><div className="flex items-center gap-2"><Checkbox id="clear" checked={clearRegion} onCheckedChange={(value) => setClearRegion(value === true)} /><Label htmlFor="clear" className="cursor-pointer text-sm">تنظيف خلفية المنطقة الشفافة</Label></div>{region && <div className="rounded-lg bg-muted/60 p-2 text-xs"><b>المنطقة:</b> X {region.x} · Y {region.y}<br />{region.width} × {region.height} بكسل</div>}</>}</div><div className="rounded-xl border border-amber-500/25 bg-amber-500/5 p-3 text-xs leading-relaxed text-muted-foreground"><Eraser className="mb-1 h-4 w-4 text-amber-500" />الملف المرفوع يطابق أبعاد المورد تلقائياً. تحفظ الأداة ترويسة TIM2 ولوحة الألوان الأصلية، ثم تختار أقرب لون متاح من اللوحة لتجنب تغيير ترميز اللعبة.</div></aside>
      </section>}
    </main>
  );
}
