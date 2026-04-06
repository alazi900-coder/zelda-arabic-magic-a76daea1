import { useState, useCallback, useRef, useEffect, useMemo } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Upload, Download, ImageDown, Replace, ArrowLeft, ZoomIn, ZoomOut,
  Grid3X3, List, Layers, Eye, Search, RotateCcw, Loader2,
  Image as ImageIcon, X, Check, AlertTriangle, ChevronLeft, ChevronRight,
  FolderOpen, FileImage, Trash2, Languages
} from "lucide-react";
import {
  analyzeWilay, decodeWilayTextureAsync, exportWilayTextureAsPNG,
  replaceWilayTexture, type WilayInfo, type WilayTextureInfo
} from "@/lib/wilay-parser";
import { unwrapWilaySource, rewrapWilayData } from "@/lib/xbc1-utils";
import JSZip from "jszip";

type ChannelMode = 'rgba' | 'red' | 'green' | 'blue' | 'alpha';
type ViewMode = 'grid' | 'list';

interface DecodedTexture {
  canvas: HTMLCanvasElement;
  dataUrl: string;
  width: number;
  height: number;
}

interface LoadedFile {
  name: string;
  data: ArrayBuffer;
  info: WilayInfo;
  compressionSteps: string[];
  xbc1Header: Uint8Array | null;
}

// Combined texture reference pointing to its parent file
interface CombinedTexture {
  fileIndex: number;
  tex: WilayTextureInfo;
  globalIndex: number;
}

export default function WilayViewer() {
  // Multi-file state
  const [files, setFiles] = useState<LoadedFile[]>([]);
  const [decoded, setDecoded] = useState<Map<string, DecodedTexture>>(new Map()); // key = "fileIdx:texIdx"
  const [loading, setLoading] = useState(false);
  const [decodeProgress, setDecodeProgress] = useState({ current: 0, total: 0 });
  const [parseErrors, setParseErrors] = useState<string[]>([]);

  // Selection & view
  const [selectedGlobalIndex, setSelectedGlobalIndex] = useState<number>(-1);
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const [channelMode, setChannelMode] = useState<ChannelMode>('rgba');
  const [showCheckerboard, setShowCheckerboard] = useState(true);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState({ x: 0, y: 0 });

  // Filter
  const [searchQuery, setSearchQuery] = useState('');
  const [formatFilter, setFormatFilter] = useState<string>('all');

  // Replace
  const [replacePreview, setReplacePreview] = useState<{ url: string; file: File; ct: CombinedTexture } | null>(null);

  // Hex view
  const [showHex, setShowHex] = useState(false);
  const [pixelPerfect, setPixelPerfect] = useState(false);
  const [modifiedFiles, setModifiedFiles] = useState<Set<number>>(new Set());

  const fileInputRef = useRef<HTMLInputElement>(null);
  const replaceInputRef = useRef<HTMLInputElement>(null);
  const viewerRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<HTMLDivElement>(null);

  // Drag & drop
  const [dragOver, setDragOver] = useState(false);
  const [viewerSize, setViewerSize] = useState({ width: 0, height: 0 });

  // Build combined textures list from all files
  const combinedTextures = useMemo<CombinedTexture[]>(() => {
    const result: CombinedTexture[] = [];
    let gi = 0;
    for (let fi = 0; fi < files.length; fi++) {
      for (const tex of files[fi].info.textures) {
        result.push({ fileIndex: fi, tex, globalIndex: gi++ });
      }
    }
    return result;
  }, [files]);

  const texKey = (fi: number, ti: number) => `${fi}:${ti}`;

  // Recursively read all files from directory entries (for drag & drop folders)
  const readEntriesRecursive = useCallback(async (entry: FileSystemEntry): Promise<File[]> => {
    if (entry.isFile) {
      return new Promise((resolve) => {
        (entry as FileSystemFileEntry).file(f => resolve([f]), () => resolve([]));
      });
    }
    if (entry.isDirectory) {
      const dirReader = (entry as FileSystemDirectoryEntry).createReader();
      const entries = await new Promise<FileSystemEntry[]>((resolve) => {
        const allEntries: FileSystemEntry[] = [];
        const readBatch = () => {
          dirReader.readEntries((batch) => {
            if (batch.length === 0) { resolve(allEntries); return; }
            allEntries.push(...batch);
            readBatch();
          }, () => resolve(allEntries));
        };
        readBatch();
      });
      const filesArrays = await Promise.all(entries.map(e => readEntriesRecursive(e)));
      return filesArrays.flat();
    }
    return [];
  }, []);

  const handleFilesUpload = useCallback(async (fileArray: File[]) => {
    if (fileArray.length === 0) return;
    setLoading(true);
    setParseErrors([]);
    const errors: string[] = [];
    const newFiles: LoadedFile[] = [];

    for (let i = 0; i < fileArray.length; i++) {
      const file = fileArray[i];
      try {
        const rawBuffer = await file.arrayBuffer();
        const source = await unwrapWilaySource(rawBuffer);
        const info = analyzeWilay(source.data);
        const sourceMagic = source.changed ? `${source.outerMagic} → ${source.innerMagic}` : source.outerMagic;
        const unwrapLabel = source.steps.length > 0 ? ` بعد فك ${source.steps.join(" + ")}` : "";
        const displayName = file.webkitRelativePath || file.name;

        if (!info.valid) {
          errors.push(`${displayName}: صيغة غير مدعومة (${sourceMagic})`);
          continue;
        }

        if (info.textures.length === 0) {
          errors.push(`${displayName}: لا يحتوي على صور${unwrapLabel} (${info.magic} v${info.version}، ${(source.data.byteLength / 1024).toFixed(0)} KB)`);
        }

        newFiles.push({ name: displayName, data: source.data, info, compressionSteps: source.steps, xbc1Header: source.xbc1Header });
      } catch (e) {
        errors.push(`${file.name}: خطأ في القراءة — ${e instanceof Error ? e.message : String(e)}`);
      }
    }

    setParseErrors(errors);
    setFiles(prev => [...prev, ...newFiles]);

    const existingFileCount = files.length;
    const newDecoded = new Map(decoded);
    let totalNew = newFiles.reduce((s, f) => s + f.info.textures.length, 0);
    let doneNew = 0;
    setDecodeProgress({ current: 0, total: totalNew });

    for (let fi = 0; fi < newFiles.length; fi++) {
      const lf = newFiles[fi];
      for (const tex of lf.info.textures) {
        try {
          const result = await decodeWilayTextureAsync(lf.data, tex);
          if (result) {
            newDecoded.set(texKey(existingFileCount + fi, tex.index), {
              canvas: result.canvas,
              dataUrl: result.canvas.toDataURL(),
              width: result.width,
              height: result.height,
            });
          }
        } catch (e) {
          console.warn(`Decode fail ${lf.name}#${tex.index}:`, e);
        }
        doneNew++;
        setDecodeProgress({ current: doneNew, total: totalNew });
      }
    }

    setDecoded(newDecoded);
    if (newFiles.length > 0 && newFiles.some(f => f.info.textures.length > 0)) {
      setSelectedGlobalIndex(prev => prev < 0 ? 0 : prev);
    }
    setLoading(false);
  }, [files, decoded]);

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const items = e.dataTransfer.items;
    const allFiles: File[] = [];

    // Check for directory entries (webkitGetAsEntry)
    if (items && items.length > 0) {
      const entries: FileSystemEntry[] = [];
      for (let i = 0; i < items.length; i++) {
        const entry = items[i].webkitGetAsEntry?.();
        if (entry) entries.push(entry);
      }
      if (entries.length > 0) {
        for (const entry of entries) {
          const extracted = await readEntriesRecursive(entry);
          allFiles.push(...extracted);
        }
      }
    }

    // Fallback to regular files if no entries
    if (allFiles.length === 0 && e.dataTransfer.files.length > 0) {
      for (let i = 0; i < e.dataTransfer.files.length; i++) {
        allFiles.push(e.dataTransfer.files[i]);
      }
    }

    if (allFiles.length > 0) void handleFilesUpload(allFiles);
  }, [handleFilesUpload, readEntriesRecursive]);

  const handleRemoveFile = useCallback((fileIndex: number) => {
    setFiles(prev => prev.filter((_, i) => i !== fileIndex));
    setDecoded(prev => {
      const next = new Map<string, DecodedTexture>();
      prev.forEach((v, k) => {
        const [fi] = k.split(':').map(Number);
        if (fi < fileIndex) next.set(k, v);
        else if (fi > fileIndex) next.set(texKey(fi - 1, Number(k.split(':')[1])), v);
      });
      return next;
    });
    setSelectedGlobalIndex(-1);
  }, []);

  // Export single
  const handleExportTexture = useCallback(async (ct: CombinedTexture) => {
    const lf = files[ct.fileIndex];
    if (!lf) return;
    const blob = await exportWilayTextureAsPNG(lf.data, ct.tex);
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${lf.name}_tex${ct.tex.index}.png`;
    a.click();
    URL.revokeObjectURL(url);
  }, [files]);

  // Export all as ZIP
  const handleExportAllZip = useCallback(async () => {
    if (files.length === 0) return;
    const zip = new JSZip();
    for (const lf of files) {
      const folder = files.length > 1 ? zip.folder(lf.name.replace(/\.[^.]+$/, ''))! : zip;
      for (const tex of lf.info.textures) {
        const blob = await exportWilayTextureAsPNG(lf.data, tex);
        if (blob) folder.file(`tex${tex.index}_${tex.width}x${tex.height}_${tex.formatName}.png`, blob);
      }
    }
    const zipBlob = await zip.generateAsync({ type: 'blob' });
    const url = URL.createObjectURL(zipBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = files.length === 1 ? `${files[0].name}_textures.zip` : 'wilay_textures.zip';
    a.click();
    URL.revokeObjectURL(url);
  }, [files]);

  // Export raw mibl
  const handleExportRawMibl = useCallback((ct: CombinedTexture) => {
    const lf = files[ct.fileIndex];
    if (!lf) return;
    const bytes = new Uint8Array(lf.data);
    const raw = bytes.slice(ct.tex.dataOffset, ct.tex.dataOffset + ct.tex.dataSize);
    const blob = new Blob([raw]);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${lf.name}_tex${ct.tex.index}.mibl`;
    a.click();
    URL.revokeObjectURL(url);
  }, [files]);

  // Replace texture
  const handleStartReplace = useCallback((ct: CombinedTexture) => {
    if (ct.tex.type !== 'mibl') return;
    setReplacePreview(null);
    replaceInputRef.current?.click();
  }, []);

  const handleReplaceFileSelected = useCallback((file: File) => {
    const ct = combinedTextures[selectedGlobalIndex];
    if (!ct) return;
    const url = URL.createObjectURL(file);
    setReplacePreview({ url, file, ct });
  }, [selectedGlobalIndex, combinedTextures]);

  const handleConfirmReplace = useCallback(async () => {
    if (!replacePreview) return;
    const { ct } = replacePreview;
    const lf = files[ct.fileIndex];
    if (!lf) return;

    const img = new Image();
    await new Promise<void>((res, rej) => { img.onload = () => res(); img.onerror = rej; img.src = replacePreview.url; });
    const canvas = document.createElement('canvas');
    canvas.width = ct.tex.width;
    canvas.height = ct.tex.height;
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(img, 0, 0, ct.tex.width, ct.tex.height);
    const imgData = ctx.getImageData(0, 0, ct.tex.width, ct.tex.height);
    const newData = replaceWilayTexture(lf.data, ct.tex, new Uint8Array(imgData.data.buffer), ct.tex.width, ct.tex.height);
    if (!newData) return;

    URL.revokeObjectURL(replacePreview.url);
    setReplacePreview(null);

    const newInfo = analyzeWilay(newData);
    setFiles(prev => prev.map((f, i) => i === ct.fileIndex ? { ...f, data: newData, info: newInfo } : f));
    setModifiedFiles(prev => new Set(prev).add(ct.fileIndex));

    // Re-decode for this file
    const newDecoded = new Map(decoded);
    for (const t of newInfo.textures) {
      try {
        const result = await decodeWilayTextureAsync(newData, t);
        if (result) newDecoded.set(texKey(ct.fileIndex, t.index), { canvas: result.canvas, dataUrl: result.canvas.toDataURL(), width: result.width, height: result.height });
      } catch {}
    }
    setDecoded(newDecoded);
  }, [replacePreview, files, decoded]);

  // Download modified file (re-wrapped with original compression)
  const handleDownloadModified = useCallback(async (fileIndex: number) => {
    const lf = files[fileIndex];
    if (!lf) return;
    const rewrapped = await rewrapWilayData(lf.data, lf.compressionSteps, lf.xbc1Header);
    const blob = new Blob([rewrapped], { type: 'application/octet-stream' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = lf.name;
    a.click();
    URL.revokeObjectURL(url);
  }, [files]);

  // Download all modified files as ZIP (skip unmodified)
  const handleDownloadAllModified = useCallback(async () => {
    if (modifiedFiles.size === 0) return;
    if (modifiedFiles.size === 1) {
      const idx = Array.from(modifiedFiles)[0];
      await handleDownloadModified(idx);
      return;
    }
    const zip = new JSZip();
    for (const idx of modifiedFiles) {
      const lf = files[idx];
      if (lf) {
        const rewrapped = await rewrapWilayData(lf.data, lf.compressionSteps, lf.xbc1Header);
        zip.file(lf.name, rewrapped);
      }
    }
    const zipBlob = await zip.generateAsync({ type: 'blob' });
    const url = URL.createObjectURL(zipBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'modified_wilay_files.zip';
    a.click();
    URL.revokeObjectURL(url);
  }, [files, modifiedFiles, handleDownloadModified]);

  // Channel filter canvas
  const getChannelImage = useCallback((dec: DecodedTexture, mode: ChannelMode): string => {
    if (mode === 'rgba') return dec.dataUrl;
    const canvas = document.createElement('canvas');
    canvas.width = dec.width;
    canvas.height = dec.height;
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(dec.canvas, 0, 0);
    const imgData = ctx.getImageData(0, 0, dec.width, dec.height);
    const d = imgData.data;
    for (let i = 0; i < d.length; i += 4) {
      switch (mode) {
        case 'red':   d[i + 1] = 0; d[i + 2] = 0; d[i + 3] = 255; break;
        case 'green': d[i] = 0;     d[i + 2] = 0; d[i + 3] = 255; break;
        case 'blue':  d[i] = 0;     d[i + 1] = 0; d[i + 3] = 255; break;
        case 'alpha': { const a = d[i + 3]; d[i] = a; d[i + 1] = a; d[i + 2] = a; d[i + 3] = 255; break; }
      }
    }
    ctx.putImageData(imgData, 0, 0);
    return canvas.toDataURL();
  }, []);

  // Pan & Zoom
  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    setZoom(z => Math.max(0.1, Math.min(20, z * (e.deltaY < 0 ? 1.15 : 0.87))));
  }, []);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button === 0) { setIsPanning(true); setPanStart({ x: e.clientX - pan.x, y: e.clientY - pan.y }); }
  }, [pan]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (isPanning) setPan({ x: e.clientX - panStart.x, y: e.clientY - panStart.y });
  }, [isPanning, panStart]);

  const handleMouseUp = useCallback(() => setIsPanning(false), []);

  const resetView = useCallback(() => { setZoom(1); setPan({ x: 0, y: 0 }); }, []);

  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer) return;

    const updateViewerSize = () => {
      setViewerSize({
        width: viewer.clientWidth,
        height: viewer.clientHeight,
      });
    };

    updateViewerSize();

    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', updateViewerSize);
      return () => window.removeEventListener('resize', updateViewerSize);
    }

    const observer = new ResizeObserver(updateViewerSize);
    observer.observe(viewer);

    return () => observer.disconnect();
  }, [files.length]);

  // Filtered textures
  const filteredTextures = useMemo(() => {
    return combinedTextures.filter(ct => {
      if (formatFilter !== 'all' && ct.tex.formatName !== formatFilter) return false;
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        const fileName = files[ct.fileIndex]?.name?.toLowerCase() ?? '';
        return `#${ct.globalIndex}`.includes(q) || ct.tex.formatName.toLowerCase().includes(q) || `${ct.tex.width}x${ct.tex.height}`.includes(q) || fileName.includes(q);
      }
      return true;
    });
  }, [combinedTextures, formatFilter, searchQuery, files]);

  // Available formats
  const availableFormats = useMemo(() => {
    return [...new Set(combinedTextures.map(ct => ct.tex.formatName))];
  }, [combinedTextures]);

  const selectedCT = combinedTextures[selectedGlobalIndex] ?? null;
  const selectedDec = selectedCT ? decoded.get(texKey(selectedCT.fileIndex, selectedCT.tex.index)) ?? null : null;
  const selectedDisplayMetrics = useMemo(() => {
    if (!selectedDec) {
      return { scale: zoom, width: 0, height: 0 };
    }

    if (viewerSize.width === 0 || viewerSize.height === 0) {
      return {
        scale: zoom,
        width: Math.max(selectedDec.width * zoom, 1),
        height: Math.max(selectedDec.height * zoom, 1),
      };
    }

    const availableWidth = Math.max(viewerSize.width - 32, 1);
    const availableHeight = Math.max(viewerSize.height - 32, 1);
    const fitScale = Math.min(availableWidth / selectedDec.width, availableHeight / selectedDec.height);
    const boundedFitScale = Number.isFinite(fitScale) && fitScale > 0
      ? Math.min(fitScale, pixelPerfect ? 12 : 8)
      : 1;
    const scale = boundedFitScale * zoom;

    return {
      scale,
      width: Math.max(selectedDec.width * scale, 1),
      height: Math.max(selectedDec.height * scale, 1),
    };
  }, [selectedDec, viewerSize, zoom, pixelPerfect]);

  // Hex view of footer
  const hexData = useMemo(() => {
    if (!showHex || !selectedCT) return '';
    const lf = files[selectedCT.fileIndex];
    if (!lf) return '';
    const bytes = new Uint8Array(lf.data);
    const start = selectedCT.tex.dataOffset + selectedCT.tex.dataSize - 40;
    const end = selectedCT.tex.dataOffset + selectedCT.tex.dataSize;
    if (start < 0) return '';
    const slice = bytes.slice(Math.max(0, start), end);
    const lines: string[] = [];
    for (let i = 0; i < slice.length; i += 16) {
      const hex = Array.from(slice.slice(i, i + 16)).map(b => b.toString(16).padStart(2, '0')).join(' ');
      const ascii = Array.from(slice.slice(i, i + 16)).map(b => b >= 32 && b < 127 ? String.fromCharCode(b) : '.').join('');
      lines.push(`${(start + i).toString(16).padStart(8, '0')}  ${hex.padEnd(47)}  ${ascii}`);
    }
    return lines.join('\n');
  }, [showHex, selectedCT, files]);

  // Navigate textures
  const goNext = useCallback(() => {
    if (selectedGlobalIndex >= combinedTextures.length - 1) return;
    setSelectedGlobalIndex(i => i + 1);
    resetView();
  }, [combinedTextures, selectedGlobalIndex, resetView]);

  const goPrev = useCallback(() => {
    if (selectedGlobalIndex <= 0) return;
    setSelectedGlobalIndex(i => i - 1);
    resetView();
  }, [selectedGlobalIndex, resetView]);

  // Keyboard
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { e.preventDefault(); goNext(); }
      if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') { e.preventDefault(); goPrev(); }
      if (e.key === '+' || e.key === '=') setZoom(z => Math.min(20, z * 1.2));
      if (e.key === '-') setZoom(z => Math.max(0.1, z * 0.8));
      if (e.key === '0') resetView();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [goNext, goPrev, resetView]);

  // ── No file loaded: Upload screen ──
  if (files.length === 0) {
    return (
      <div className="min-h-screen flex flex-col bg-background" dir="rtl">
        <header className="h-14 border-b border-border flex items-center px-4 gap-3">
          <Link to="/">
            <Button variant="ghost" size="sm"><ArrowLeft className="w-4 h-4 ml-1" /> الرئيسية</Button>
          </Link>
          <h1 className="font-display font-bold text-lg">🖼️ أداة WILAY الاحترافية</h1>
        </header>
        <div
          ref={dragRef}
          className={`flex-1 flex flex-col items-center justify-center gap-6 p-8 ${dragOver ? 'bg-primary/5 border-2 border-dashed border-primary' : ''}`}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
        >
          <div className="w-24 h-24 rounded-full bg-primary/10 flex items-center justify-center">
            <ImageIcon className="w-12 h-12 text-primary" />
          </div>
          <h2 className="text-2xl font-display font-bold">عارض صور WILAY</h2>
          <p className="text-muted-foreground text-center max-w-md">
            عرض واستخراج وتعديل صور واجهة ألعاب Xenoblade بصيغة WILAY
            <br />
            <span className="text-xs">يدعم LAHD, LAGP, LAPS — أنسجة Mibl و JPEG</span>
            <br />
            <span className="text-xs text-primary font-bold">✨ يمكنك رفع عدة ملفات في وقت واحد</span>
          </p>
          <input
            ref={fileInputRef}
            type="file"
            className="sr-only"
            multiple
            onChange={(e) => { if (e.target.files && e.target.files.length > 0) void handleFilesUpload(Array.from(e.target.files)); e.currentTarget.value = ""; }}
          />
          <Button size="lg" className="font-display font-bold text-lg px-12 py-7" onClick={() => fileInputRef.current?.click()}>
            <Upload className="w-5 h-5 ml-2" />
            رفع ملفات WILAY
          </Button>
          <p className="text-xs text-muted-foreground">أو اسحب الملفات وأفلتها هنا • يقبل أي امتداد</p>

          {parseErrors.length > 0 && (
            <div className="bg-destructive/10 border border-destructive/30 rounded-lg p-4 max-w-md w-full">
              <p className="text-sm font-bold text-destructive mb-2">⚠️ أخطاء:</p>
              {parseErrors.map((err, i) => (
                <p key={i} className="text-xs text-destructive/80">{err}</p>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  const totalTextures = combinedTextures.length;

  // ── Main viewer ──
  return (
    <div className="h-screen flex flex-col bg-background overflow-hidden" dir="rtl">
      {/* Top toolbar */}
      <header className="h-12 border-b border-border flex items-center px-3 gap-2 shrink-0">
        <Link to="/">
          <Button variant="ghost" size="icon" className="h-8 w-8"><ArrowLeft className="w-4 h-4" /></Button>
        </Link>
        <span className="text-xs text-muted-foreground">
          <FolderOpen className="w-3.5 h-3.5 inline ml-1" />
          {files.length} ملف • {totalTextures} صورة
        </span>
        <div className="flex-1" />
        <input
          ref={fileInputRef}
          type="file"
          className="sr-only"
          multiple
          onChange={(e) => { if (e.target.files && e.target.files.length > 0) void handleFilesUpload(Array.from(e.target.files)); e.currentTarget.value = ""; }}
        />
        <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={() => fileInputRef.current?.click()}>
          <Upload className="w-3.5 h-3.5 ml-1" /> إضافة ملفات
        </Button>
        <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={() => void handleExportAllZip()} disabled={totalTextures === 0}>
          <Download className="w-3.5 h-3.5 ml-1" /> تصدير ZIP
        </Button>
        {modifiedFiles.size > 0 && (
          <Button variant="default" size="sm" className="h-8 text-xs" onClick={() => void handleDownloadAllModified()}>
            <Download className="w-3.5 h-3.5 ml-1" /> حفظ المعدلة ({modifiedFiles.size})
          </Button>
        )}
      </header>

      {/* Parse errors banner */}
      {parseErrors.length > 0 && (
        <div className="bg-destructive/10 border-b border-destructive/30 px-3 py-1.5 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 text-destructive shrink-0 mt-0.5" />
          <div className="flex-1 text-xs text-destructive/80 space-y-0.5">
            {parseErrors.map((err, i) => <p key={i}>{err}</p>)}
          </div>
          <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0" onClick={() => setParseErrors([])}>
            <X className="w-3 h-3" />
          </Button>
        </div>
      )}

      <div className="flex flex-1 flex-col md:flex-row overflow-hidden">
        {/* Sidebar - thumbnails */}
        <div className="order-2 md:order-1 w-full md:w-56 h-48 md:h-auto border-b md:border-b-0 md:border-l border-border flex flex-col shrink-0 bg-card">
          {/* File list (collapsible) */}
          {files.length > 1 && (
            <div className="border-b border-border p-1.5 space-y-0.5 max-h-28 overflow-y-auto">
              {files.map((lf, fi) => (
                <div key={fi} className="flex items-center gap-1 text-[10px] bg-muted/30 rounded px-1.5 py-0.5">
                  <FileImage className="w-3 h-3 shrink-0 text-primary" />
                  <span className="truncate flex-1 font-mono">{lf.name}</span>
                  <span className="text-muted-foreground">{lf.info.textures.length}</span>
                  <button onClick={() => handleRemoveFile(fi)} className="hover:text-destructive">
                    <Trash2 className="w-2.5 h-2.5" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Search & filter */}
          <div className="p-2 space-y-1.5 border-b border-border">
            <div className="relative">
              <Search className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
              <input
                type="text"
                className="w-full h-8 rounded-md border border-input bg-background pr-8 pl-2 text-xs placeholder:text-muted-foreground"
                placeholder="بحث بالاسم أو الرقم..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            <div className="flex gap-1 flex-wrap">
              <button
                className={`text-[10px] px-1.5 py-0.5 rounded ${formatFilter === 'all' ? 'bg-primary text-primary-foreground' : 'bg-muted hover:bg-muted/80'}`}
                onClick={() => setFormatFilter('all')}
              >
                الكل ({totalTextures})
              </button>
              {availableFormats.map(f => (
                <button
                  key={f}
                  className={`text-[10px] px-1.5 py-0.5 rounded font-mono ${formatFilter === f ? 'bg-primary text-primary-foreground' : 'bg-muted hover:bg-muted/80'}`}
                  onClick={() => setFormatFilter(f)}
                >
                  {f}
                </button>
              ))}
            </div>
            <div className="flex gap-1">
              <Button variant={viewMode === 'grid' ? 'default' : 'ghost'} size="icon" className="h-6 w-6" onClick={() => setViewMode('grid')}>
                <Grid3X3 className="w-3 h-3" />
              </Button>
              <Button variant={viewMode === 'list' ? 'default' : 'ghost'} size="icon" className="h-6 w-6" onClick={() => setViewMode('list')}>
                <List className="w-3 h-3" />
              </Button>
            </div>
          </div>

          {/* Thumbnail list */}
          <ScrollArea className="flex-1">
            {loading && (
              <div className="p-4 text-center">
                <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2 text-primary" />
                <p className="text-xs text-muted-foreground">{decodeProgress.current}/{decodeProgress.total}</p>
              </div>
            )}
            {viewMode === 'grid' ? (
              <div className="grid grid-cols-2 gap-1 p-1.5">
                {filteredTextures.map(ct => {
                  const dec = decoded.get(texKey(ct.fileIndex, ct.tex.index));
                  return (
                    <button
                      key={ct.globalIndex}
                      className={`aspect-square rounded overflow-hidden border-2 transition-colors relative ${selectedGlobalIndex === ct.globalIndex ? 'border-primary' : 'border-transparent hover:border-primary/40'}`}
                      onClick={() => { setSelectedGlobalIndex(ct.globalIndex); resetView(); setChannelMode('rgba'); }}
                    >
                      {dec ? (
                        <img src={dec.dataUrl} alt={`#${ct.globalIndex}`} className="w-full h-full object-contain bg-muted/30" style={{ imageRendering: 'auto' }} />
                      ) : (
                        <div className="w-full h-full bg-muted/30 flex items-center justify-center">
                          <Loader2 className="w-3 h-3 animate-spin text-muted-foreground" />
                        </div>
                      )}
                      <span className="absolute bottom-0 left-0 right-0 bg-background/80 text-[9px] text-center py-0.5 font-mono flex items-center justify-center gap-1">
                        <span>#{ct.globalIndex}</span>
                        <span className="px-1 rounded bg-primary/20 text-primary text-[8px]">{ct.tex.formatName}</span>
                      </span>
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="space-y-0.5 p-1">
                {filteredTextures.map(ct => {
                  const dec = decoded.get(texKey(ct.fileIndex, ct.tex.index));
                  return (
                    <button
                      key={ct.globalIndex}
                      className={`w-full flex items-center gap-2 p-1.5 rounded text-right transition-colors ${selectedGlobalIndex === ct.globalIndex ? 'bg-primary/10 border border-primary/30' : 'hover:bg-muted/50'}`}
                      onClick={() => { setSelectedGlobalIndex(ct.globalIndex); resetView(); setChannelMode('rgba'); }}
                    >
                      <div className="w-10 h-10 shrink-0 rounded overflow-hidden bg-muted/30">
                        {dec && <img src={dec.dataUrl} className="w-full h-full object-contain" style={{ imageRendering: 'auto' }} />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-mono">#{ct.globalIndex} {files.length > 1 && <span className="text-muted-foreground">({files[ct.fileIndex]?.name})</span>}</div>
                        <div className="text-[10px] text-muted-foreground">{ct.tex.width}×{ct.tex.height} • {ct.tex.formatName}</div>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}

            {filteredTextures.length === 0 && !loading && (
              <div className="p-6 text-center text-muted-foreground">
                <ImageIcon className="w-8 h-8 mx-auto mb-2 opacity-50" />
                <p className="text-sm">لا توجد صور</p>
                <p className="text-xs mt-1">تأكد أن الملفات بصيغة WILAY صحيحة (LAHD/LAGP)</p>
              </div>
            )}
          </ScrollArea>
        </div>

        {/* Main viewer area */}
        <div className="order-1 md:order-2 flex-1 flex flex-col overflow-hidden">
          {/* Viewer toolbar */}
          {selectedCT && (
            <div className="min-h-10 border-b border-border flex items-center px-3 py-1 gap-1.5 gap-y-1 shrink-0 flex-wrap">
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={goPrev} disabled={selectedGlobalIndex <= 0}>
                <ChevronRight className="w-4 h-4" />
              </Button>
              <span className="text-xs font-mono min-w-[60px] text-center shrink-0">
                #{selectedGlobalIndex} / {totalTextures - 1}
              </span>
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={goNext} disabled={selectedGlobalIndex >= totalTextures - 1}>
                <ChevronLeft className="w-4 h-4" />
              </Button>

              <div className="w-px h-5 bg-border mx-1" />

              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setZoom(z => Math.min(20, z * 1.5))}>
                <ZoomIn className="w-3.5 h-3.5" />
              </Button>
              <span className="text-xs font-mono w-12 text-center shrink-0">{Math.round(selectedDisplayMetrics.scale * 100)}%</span>
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setZoom(z => Math.max(0.1, z / 1.5))}>
                <ZoomOut className="w-3.5 h-3.5" />
              </Button>
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={resetView} title="إعادة تعيين">
                <RotateCcw className="w-3.5 h-3.5" />
              </Button>

              <div className="w-px h-5 bg-border mx-1" />

              {/* Channel selector */}
              {(['rgba', 'red', 'green', 'blue', 'alpha'] as ChannelMode[]).map(ch => (
                <button
                  key={ch}
                  className={`text-[10px] px-1.5 py-1 rounded font-mono ${channelMode === ch
                    ? ch === 'red' ? 'bg-red-500/20 text-red-400'
                    : ch === 'green' ? 'bg-green-500/20 text-green-400'
                    : ch === 'blue' ? 'bg-blue-500/20 text-blue-400'
                    : ch === 'alpha' ? 'bg-muted text-foreground'
                    : 'bg-primary text-primary-foreground'
                    : 'hover:bg-muted'
                  }`}
                  onClick={() => setChannelMode(ch)}
                >
                  {ch === 'rgba' ? 'RGBA' : ch === 'alpha' ? 'A' : ch[0].toUpperCase()}
                </button>
              ))}

              <div className="w-px h-5 bg-border mx-1" />

              <Button
                variant={showCheckerboard ? 'default' : 'ghost'}
                size="icon"
                className="h-7 w-7"
                onClick={() => setShowCheckerboard(!showCheckerboard)}
                title="خلفية شطرنجية"
              >
                <Layers className="w-3.5 h-3.5" />
              </Button>

              <Button
                variant={showHex ? 'default' : 'ghost'}
                size="icon"
                className="h-7 w-7"
                onClick={() => setShowHex(!showHex)}
                title="عرض Hex"
              >
                <Eye className="w-3.5 h-3.5" />
              </Button>

              <button
                className={`shrink-0 whitespace-nowrap text-[10px] px-2 py-1 rounded font-mono border ${pixelPerfect ? 'bg-primary text-primary-foreground border-primary' : 'bg-muted/50 hover:bg-muted border-border'}`}
                onClick={() => setPixelPerfect(p => !p)}
                title={pixelPerfect ? 'وضع نقطي (Pixel-perfect)' : 'وضع سلس (Smooth)'}
              >
                {pixelPerfect ? '🔲 نقطي' : '🔵 سلس'}
              </button>

              <div className="flex-1" />

              <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => void handleExportTexture(selectedCT)}>
                <ImageDown className="w-3 h-3 ml-1" /> PNG
              </Button>
              {selectedCT.tex.type === 'mibl' && (
                <>
                  <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => handleExportRawMibl(selectedCT)}>
                    Raw
                  </Button>
                  <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => handleStartReplace(selectedCT)}>
                    <Replace className="w-3 h-3 ml-1" /> استبدال
                  </Button>
                </>
              )}
              <Button variant="default" size="sm" className="h-7 text-xs" onClick={() => handleDownloadModified(selectedCT.fileIndex)}>
                <Download className="w-3 h-3 ml-1" /> حفظ ملف WILAY
              </Button>
            </div>
          )}

          {/* Image viewer */}
          <div
            ref={viewerRef}
            className={`flex-1 overflow-hidden relative select-none ${showCheckerboard ? 'checkerboard-bg' : 'bg-muted/20'}`}
            onWheel={handleWheel}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            style={{ cursor: isPanning ? 'grabbing' : 'grab' }}
          >
            {selectedDec && (
              <Button
                variant={pixelPerfect ? 'default' : 'secondary'}
                size="sm"
                className="absolute top-2 right-2 z-20 h-8 px-2 text-xs md:hidden"
                onClick={() => setPixelPerfect(p => !p)}
              >
                {pixelPerfect ? 'نقطي' : 'سلس'}
              </Button>
            )}
            {dragOver && (
              <div className="absolute inset-0 z-10 bg-primary/10 border-2 border-dashed border-primary flex items-center justify-center">
                <p className="text-primary font-bold text-lg">أفلت الملفات هنا لإضافتها</p>
              </div>
            )}
            {selectedDec ? (
              <div
                className="absolute inset-0 flex items-center justify-center"
                style={{ transform: `translate(${pan.x}px, ${pan.y}px)`, transformOrigin: 'center center' }}
              >
                <img
                  src={channelMode === 'rgba' ? selectedDec.dataUrl : getChannelImage(selectedDec, channelMode)}
                  alt={`Texture #${selectedGlobalIndex}`}
                  className="max-w-none shrink-0"
                  style={{
                    width: selectedDisplayMetrics.width,
                    height: selectedDisplayMetrics.height,
                    imageRendering: pixelPerfect ? 'pixelated' : 'auto',
                  }}
                  draggable={false}
                />
              </div>
            ) : (
              <div className="flex items-center justify-center h-full text-muted-foreground">
                {loading ? (
                  <div className="text-center">
                    <Loader2 className="w-8 h-8 animate-spin mx-auto mb-2" />
                    <p className="text-sm">جاري فك الصور...</p>
                    <p className="text-xs mt-1">{decodeProgress.current}/{decodeProgress.total}</p>
                  </div>
                ) : totalTextures === 0 ? (
                  <div className="text-center space-y-2">
                    <AlertTriangle className="w-10 h-10 mx-auto text-yellow-500" />
                    <p className="text-sm font-bold">لا توجد صور في الملفات المرفوعة</p>
                    <p className="text-xs max-w-sm">قد تكون الملفات من نوع LAPS (بدون صور) أو بصيغة غير مدعومة. جرب ملفات أخرى.</p>
                    <Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()}>
                      <Upload className="w-4 h-4 ml-1" /> رفع ملفات أخرى
                    </Button>
                  </div>
                ) : (
                  <p className="text-sm">اختر صورة من القائمة</p>
                )}
              </div>
            )}
          </div>

          {/* Bottom info panel */}
          {selectedCT && (
            <div className="border-t border-border px-3 py-2 shrink-0">
              <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs">
                {files.length > 1 && <span><strong>الملف:</strong> {files[selectedCT.fileIndex]?.name}</span>}
                <span><strong>الأبعاد:</strong> {selectedCT.tex.width} × {selectedCT.tex.height}</span>
                <span><strong>التنسيق:</strong> {selectedCT.tex.formatName}</span>
                <span><strong>النوع:</strong> {selectedCT.tex.type === 'jpeg' ? 'JPEG' : 'Mibl/LBIM'}</span>
                <span><strong>الحجم:</strong> {(selectedCT.tex.dataSize / 1024).toFixed(1)} KB</span>
                <span><strong>Offset:</strong> <code className="font-mono">0x{selectedCT.tex.dataOffset.toString(16)}</code></span>
                {selectedCT.tex.footer && (
                  <>
                    <span><strong>Mipmaps:</strong> {selectedCT.tex.footer.mipmapCount}</span>
                    <span><strong>العمق:</strong> {selectedCT.tex.footer.depth}</span>
                    <span><strong>الإصدار:</strong> {selectedCT.tex.footer.version}</span>
                  </>
                )}
              </div>

              {/* Hex view */}
              {showHex && hexData && (
                <pre className="mt-2 text-[10px] font-mono bg-muted/50 rounded p-2 overflow-x-auto max-h-24 leading-relaxed">
                  {hexData}
                </pre>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Replace preview dialog */}
      {replacePreview && (
        <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-card border border-border rounded-xl p-6 max-w-2xl w-full space-y-4">
            <h3 className="font-display font-bold text-lg">مقارنة قبل / بعد الاستبدال</h3>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground text-center">الأصلية</p>
                <div className="aspect-square bg-muted/30 rounded-lg flex items-center justify-center overflow-hidden checkerboard-bg">
                  {selectedDec && <img src={selectedDec.dataUrl} className="max-w-full max-h-full object-contain" />}
                </div>
              </div>
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground text-center">الجديدة</p>
                <div className="aspect-square bg-muted/30 rounded-lg flex items-center justify-center overflow-hidden checkerboard-bg">
                  <img src={replacePreview.url} className="max-w-full max-h-full object-contain" />
                </div>
              </div>
            </div>
            {selectedCT && (
              <p className="text-xs text-muted-foreground">
                <AlertTriangle className="w-3 h-3 inline ml-1 text-yellow-500" />
                سيتم تغيير حجم الصورة الجديدة إلى {selectedCT.tex.width}×{selectedCT.tex.height} لتتوافق مع الأصلية
              </p>
            )}
            <div className="flex gap-2 justify-end">
              <Button variant="ghost" onClick={() => { URL.revokeObjectURL(replacePreview.url); setReplacePreview(null); }}>
                <X className="w-4 h-4 ml-1" /> إلغاء
              </Button>
              <Button onClick={() => void handleConfirmReplace()}>
                <Check className="w-4 h-4 ml-1" /> تأكيد الاستبدال
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Hidden replace input */}
      <input
        ref={replaceInputRef}
        type="file"
        className="sr-only"
        accept="image/png,image/jpeg,image/webp"
        onChange={(e) => { if (e.target.files?.[0]) handleReplaceFileSelected(e.target.files[0]); e.currentTarget.value = ""; }}
      />

      {/* Checkerboard CSS */}
      <style>{`
        .checkerboard-bg {
          background-image:
            linear-gradient(45deg, hsl(var(--muted)) 25%, transparent 25%),
            linear-gradient(-45deg, hsl(var(--muted)) 25%, transparent 25%),
            linear-gradient(45deg, transparent 75%, hsl(var(--muted)) 75%),
            linear-gradient(-45deg, transparent 75%, hsl(var(--muted)) 75%);
          background-size: 20px 20px;
          background-position: 0 0, 0 10px, 10px -10px, -10px 0px;
        }
      `}</style>
    </div>
  );
}
