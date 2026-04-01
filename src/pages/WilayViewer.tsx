import { useState, useCallback, useRef, useEffect, useMemo } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Upload, Download, ImageDown, Replace, ArrowLeft, ZoomIn, ZoomOut,
  Grid3X3, List, Layers, Eye, EyeOff, Search, RotateCcw, Loader2,
  Image as ImageIcon, X, Check, AlertTriangle, ChevronLeft, ChevronRight
} from "lucide-react";
import {
  analyzeWilay, decodeWilayTextureAsync, exportWilayTextureAsPNG,
  replaceWilayTexture, type WilayInfo, type WilayTextureInfo
} from "@/lib/wilay-parser";
import JSZip from "jszip";

type ChannelMode = 'rgba' | 'red' | 'green' | 'blue' | 'alpha';
type ViewMode = 'grid' | 'list';

interface DecodedTexture {
  canvas: HTMLCanvasElement;
  dataUrl: string;
  width: number;
  height: number;
}

export default function WilayViewer() {
  // File state
  const [wilayFile, setWilayFile] = useState<{ name: string; data: ArrayBuffer } | null>(null);
  const [wilayInfo, setWilayInfo] = useState<WilayInfo | null>(null);
  const [decoded, setDecoded] = useState<Map<number, DecodedTexture>>(new Map());
  const [loading, setLoading] = useState(false);
  const [decodeProgress, setDecodeProgress] = useState({ current: 0, total: 0 });

  // Selection & view
  const [selectedIndex, setSelectedIndex] = useState<number>(-1);
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
  const [replacePreview, setReplacePreview] = useState<{ url: string; file: File; tex: WilayTextureInfo } | null>(null);

  // Hex view
  const [showHex, setShowHex] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const replaceInputRef = useRef<HTMLInputElement>(null);
  const viewerRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<HTMLDivElement>(null);

  // Drag & drop
  const [dragOver, setDragOver] = useState(false);

  const handleFileUpload = useCallback(async (file: File) => {
    setLoading(true);
    setDecoded(new Map());
    setSelectedIndex(-1);
    setZoom(1);
    setPan({ x: 0, y: 0 });
    try {
      const buf = await file.arrayBuffer();
      const info = analyzeWilay(buf);
      setWilayFile({ name: file.name, data: buf });
      setWilayInfo(info);

      const previews = new Map<number, DecodedTexture>();
      setDecodeProgress({ current: 0, total: info.textures.length });
      for (let i = 0; i < info.textures.length; i++) {
        const tex = info.textures[i];
        try {
          const result = await decodeWilayTextureAsync(buf, tex);
          if (result) {
            previews.set(tex.index, {
              canvas: result.canvas,
              dataUrl: result.canvas.toDataURL(),
              width: result.width,
              height: result.height,
            });
          }
        } catch (e) { console.warn(`Decode fail ${tex.index}:`, e); }
        setDecodeProgress({ current: i + 1, total: info.textures.length });
      }
      setDecoded(previews);
      if (info.textures.length > 0) setSelectedIndex(0);
    } catch (e) { console.error('WILAY parse error:', e); }
    setLoading(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) void handleFileUpload(file);
  }, [handleFileUpload]);

  // Export single
  const handleExportTexture = useCallback(async (tex: WilayTextureInfo) => {
    if (!wilayFile) return;
    const blob = await exportWilayTextureAsPNG(wilayFile.data, tex);
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${wilayFile.name}_tex${tex.index}.png`;
    a.click();
    URL.revokeObjectURL(url);
  }, [wilayFile]);

  // Export all as ZIP
  const handleExportAllZip = useCallback(async () => {
    if (!wilayFile || !wilayInfo) return;
    const zip = new JSZip();
    for (const tex of wilayInfo.textures) {
      const blob = await exportWilayTextureAsPNG(wilayFile.data, tex);
      if (blob) zip.file(`tex${tex.index}_${tex.width}x${tex.height}_${tex.formatName}.png`, blob);
    }
    const zipBlob = await zip.generateAsync({ type: 'blob' });
    const url = URL.createObjectURL(zipBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${wilayFile.name}_textures.zip`;
    a.click();
    URL.revokeObjectURL(url);
  }, [wilayFile, wilayInfo]);

  // Export raw mibl
  const handleExportRawMibl = useCallback((tex: WilayTextureInfo) => {
    if (!wilayFile) return;
    const bytes = new Uint8Array(wilayFile.data);
    const raw = bytes.slice(tex.dataOffset, tex.dataOffset + tex.dataSize);
    const blob = new Blob([raw]);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${wilayFile.name}_tex${tex.index}.mibl`;
    a.click();
    URL.revokeObjectURL(url);
  }, [wilayFile]);

  // Replace texture
  const handleStartReplace = useCallback((tex: WilayTextureInfo) => {
    if (tex.type !== 'mibl') return;
    setReplacePreview(null);
    replaceInputRef.current?.click();
  }, []);

  const handleReplaceFileSelected = useCallback((file: File) => {
    if (selectedIndex < 0 || !wilayInfo) return;
    const tex = wilayInfo.textures[selectedIndex];
    if (!tex) return;
    const url = URL.createObjectURL(file);
    setReplacePreview({ url, file, tex });
  }, [selectedIndex, wilayInfo]);

  const handleConfirmReplace = useCallback(async () => {
    if (!replacePreview || !wilayFile || !wilayInfo) return;
    const { file, tex } = replacePreview;
    const img = new Image();
    await new Promise<void>((res, rej) => { img.onload = () => res(); img.onerror = rej; img.src = replacePreview.url; });
    const canvas = document.createElement('canvas');
    canvas.width = tex.width;
    canvas.height = tex.height;
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(img, 0, 0, tex.width, tex.height);
    const imgData = ctx.getImageData(0, 0, tex.width, tex.height);
    const newData = replaceWilayTexture(wilayFile.data, tex, new Uint8Array(imgData.data.buffer), tex.width, tex.height);
    if (!newData) return;

    URL.revokeObjectURL(replacePreview.url);
    setReplacePreview(null);
    setWilayFile({ name: wilayFile.name, data: newData });
    const newInfo = analyzeWilay(newData);
    setWilayInfo(newInfo);

    // Re-decode
    const previews = new Map<number, DecodedTexture>();
    for (const t of newInfo.textures) {
      try {
        const result = await decodeWilayTextureAsync(newData, t);
        if (result) previews.set(t.index, { canvas: result.canvas, dataUrl: result.canvas.toDataURL(), width: result.width, height: result.height });
      } catch {}
    }
    setDecoded(previews);
  }, [replacePreview, wilayFile, wilayInfo]);

  // Download modified file
  const handleDownloadModified = useCallback(() => {
    if (!wilayFile) return;
    const blob = new Blob([wilayFile.data]);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = wilayFile.name;
    a.click();
    URL.revokeObjectURL(url);
  }, [wilayFile]);

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

  // Filtered textures
  const filteredTextures = useMemo(() => {
    if (!wilayInfo) return [];
    return wilayInfo.textures.filter(tex => {
      if (formatFilter !== 'all' && tex.formatName !== formatFilter) return false;
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        return `#${tex.index}`.includes(q) || tex.formatName.toLowerCase().includes(q) || `${tex.width}x${tex.height}`.includes(q);
      }
      return true;
    });
  }, [wilayInfo, formatFilter, searchQuery]);

  // Available formats
  const availableFormats = useMemo(() => {
    if (!wilayInfo) return [];
    return [...new Set(wilayInfo.textures.map(t => t.formatName))];
  }, [wilayInfo]);

  const selectedTex = wilayInfo?.textures[selectedIndex] ?? null;
  const selectedDec = selectedIndex >= 0 ? decoded.get(selectedIndex) : null;

  // Hex view of footer
  const hexData = useMemo(() => {
    if (!showHex || !wilayFile || !selectedTex) return '';
    const bytes = new Uint8Array(wilayFile.data);
    const start = selectedTex.dataOffset + selectedTex.dataSize - 40;
    const end = selectedTex.dataOffset + selectedTex.dataSize;
    if (start < 0) return '';
    const slice = bytes.slice(Math.max(0, start), end);
    const lines: string[] = [];
    for (let i = 0; i < slice.length; i += 16) {
      const hex = Array.from(slice.slice(i, i + 16)).map(b => b.toString(16).padStart(2, '0')).join(' ');
      const ascii = Array.from(slice.slice(i, i + 16)).map(b => b >= 32 && b < 127 ? String.fromCharCode(b) : '.').join('');
      lines.push(`${(start + i).toString(16).padStart(8, '0')}  ${hex.padEnd(47)}  ${ascii}`);
    }
    return lines.join('\n');
  }, [showHex, wilayFile, selectedTex]);

  // Navigate textures
  const goNext = useCallback(() => {
    if (!wilayInfo || selectedIndex >= wilayInfo.textures.length - 1) return;
    setSelectedIndex(i => i + 1);
    resetView();
  }, [wilayInfo, selectedIndex, resetView]);

  const goPrev = useCallback(() => {
    if (selectedIndex <= 0) return;
    setSelectedIndex(i => i - 1);
    resetView();
  }, [selectedIndex, resetView]);

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
  if (!wilayFile) {
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
          </p>
          <input
            ref={fileInputRef}
            type="file"
            className="sr-only"
            accept=".wilay,.WILAY"
            onChange={(e) => { if (e.target.files?.[0]) void handleFileUpload(e.target.files[0]); e.currentTarget.value = ""; }}
          />
          <Button size="lg" className="font-display font-bold text-lg px-12 py-7" onClick={() => fileInputRef.current?.click()}>
            <Upload className="w-5 h-5 ml-2" />
            رفع ملف WILAY
          </Button>
          <p className="text-xs text-muted-foreground">أو اسحب الملف وأفلته هنا</p>
        </div>
      </div>
    );
  }

  // ── Main viewer ──
  return (
    <div className="h-screen flex flex-col bg-background overflow-hidden" dir="rtl">
      {/* Top toolbar */}
      <header className="h-12 border-b border-border flex items-center px-3 gap-2 shrink-0">
        <Link to="/">
          <Button variant="ghost" size="icon" className="h-8 w-8"><ArrowLeft className="w-4 h-4" /></Button>
        </Link>
        <span className="font-mono text-sm truncate max-w-[200px]">📦 {wilayFile.name}</span>
        <span className="text-xs text-muted-foreground">{wilayInfo?.magic} • {wilayInfo?.textures.length} صورة</span>
        <div className="flex-1" />
        <input
          ref={fileInputRef}
          type="file"
          className="sr-only"
          accept=".wilay,.WILAY"
          onChange={(e) => { if (e.target.files?.[0]) void handleFileUpload(e.target.files[0]); e.currentTarget.value = ""; }}
        />
        <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={() => fileInputRef.current?.click()}>
          <Upload className="w-3.5 h-3.5 ml-1" /> فتح ملف آخر
        </Button>
        <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={() => void handleExportAllZip()} disabled={!wilayInfo?.textures.length}>
          <Download className="w-3.5 h-3.5 ml-1" /> تصدير ZIP
        </Button>
        <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={handleDownloadModified}>
          <Download className="w-3.5 h-3.5 ml-1" /> حفظ المعدّل
        </Button>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar - thumbnails */}
        <div className="w-56 border-l border-border flex flex-col shrink-0 bg-card">
          {/* Search & filter */}
          <div className="p-2 space-y-1.5 border-b border-border">
            <div className="relative">
              <Search className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
              <input
                type="text"
                className="w-full h-8 rounded-md border border-input bg-background pr-8 pl-2 text-xs placeholder:text-muted-foreground"
                placeholder="بحث..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            <div className="flex gap-1 flex-wrap">
              <button
                className={`text-[10px] px-1.5 py-0.5 rounded ${formatFilter === 'all' ? 'bg-primary text-primary-foreground' : 'bg-muted hover:bg-muted/80'}`}
                onClick={() => setFormatFilter('all')}
              >
                الكل
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
                {filteredTextures.map(tex => {
                  const dec = decoded.get(tex.index);
                  return (
                    <button
                      key={tex.index}
                      className={`aspect-square rounded overflow-hidden border-2 transition-colors relative ${selectedIndex === tex.index ? 'border-primary' : 'border-transparent hover:border-primary/40'}`}
                      onClick={() => { setSelectedIndex(tex.index); resetView(); setChannelMode('rgba'); }}
                    >
                      {dec ? (
                        <img src={dec.dataUrl} alt={`#${tex.index}`} className="w-full h-full object-contain bg-muted/30" style={{ imageRendering: tex.width < 128 ? 'pixelated' : 'auto' }} />
                      ) : (
                        <div className="w-full h-full bg-muted/30 flex items-center justify-center">
                          <Loader2 className="w-3 h-3 animate-spin text-muted-foreground" />
                        </div>
                      )}
                      <span className="absolute bottom-0 left-0 right-0 bg-background/80 text-[9px] text-center py-0.5 font-mono">
                        #{tex.index}
                      </span>
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="space-y-0.5 p-1">
                {filteredTextures.map(tex => {
                  const dec = decoded.get(tex.index);
                  return (
                    <button
                      key={tex.index}
                      className={`w-full flex items-center gap-2 p-1.5 rounded text-right transition-colors ${selectedIndex === tex.index ? 'bg-primary/10 border border-primary/30' : 'hover:bg-muted/50'}`}
                      onClick={() => { setSelectedIndex(tex.index); resetView(); setChannelMode('rgba'); }}
                    >
                      <div className="w-10 h-10 shrink-0 rounded overflow-hidden bg-muted/30">
                        {dec && <img src={dec.dataUrl} className="w-full h-full object-contain" style={{ imageRendering: tex.width < 128 ? 'pixelated' : 'auto' }} />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-mono">#{tex.index}</div>
                        <div className="text-[10px] text-muted-foreground">{tex.width}×{tex.height} • {tex.formatName}</div>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </ScrollArea>
        </div>

        {/* Main viewer area */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Viewer toolbar */}
          {selectedTex && (
            <div className="h-10 border-b border-border flex items-center px-3 gap-1.5 shrink-0">
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={goPrev} disabled={selectedIndex <= 0}>
                <ChevronRight className="w-4 h-4" />
              </Button>
              <span className="text-xs font-mono min-w-[60px] text-center">
                #{selectedIndex} / {(wilayInfo?.textures.length ?? 1) - 1}
              </span>
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={goNext} disabled={selectedIndex >= (wilayInfo?.textures.length ?? 1) - 1}>
                <ChevronLeft className="w-4 h-4" />
              </Button>

              <div className="w-px h-5 bg-border mx-1" />

              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setZoom(z => Math.min(20, z * 1.5))}>
                <ZoomIn className="w-3.5 h-3.5" />
              </Button>
              <span className="text-xs font-mono w-12 text-center">{Math.round(zoom * 100)}%</span>
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

              <div className="flex-1" />

              <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => void handleExportTexture(selectedTex)}>
                <ImageDown className="w-3 h-3 ml-1" /> PNG
              </Button>
              {selectedTex.type === 'mibl' && (
                <>
                  <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => handleExportRawMibl(selectedTex)}>
                    Raw
                  </Button>
                  <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => handleStartReplace(selectedTex)}>
                    <Replace className="w-3 h-3 ml-1" /> استبدال
                  </Button>
                </>
              )}
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
            style={{ cursor: isPanning ? 'grabbing' : 'grab' }}
          >
            {selectedDec ? (
              <div
                className="absolute inset-0 flex items-center justify-center"
                style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`, transformOrigin: 'center center' }}
              >
                <img
                  src={channelMode === 'rgba' ? selectedDec.dataUrl : getChannelImage(selectedDec, channelMode)}
                  alt={`Texture #${selectedIndex}`}
                  className="max-w-none"
                  style={{ imageRendering: zoom > 2 || (selectedTex?.width ?? 0) < 256 ? 'pixelated' : 'auto' }}
                  draggable={false}
                />
              </div>
            ) : (
              <div className="flex items-center justify-center h-full text-muted-foreground">
                {loading ? (
                  <div className="text-center">
                    <Loader2 className="w-8 h-8 animate-spin mx-auto mb-2" />
                    <p className="text-sm">جاري فك الصور...</p>
                  </div>
                ) : (
                  <p className="text-sm">اختر صورة من القائمة</p>
                )}
              </div>
            )}
          </div>

          {/* Bottom info panel */}
          {selectedTex && (
            <div className="border-t border-border px-3 py-2 shrink-0">
              <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs">
                <span><strong>الأبعاد:</strong> {selectedTex.width} × {selectedTex.height}</span>
                <span><strong>التنسيق:</strong> {selectedTex.formatName}</span>
                <span><strong>النوع:</strong> {selectedTex.type === 'jpeg' ? 'JPEG' : 'Mibl/LBIM'}</span>
                <span><strong>الحجم:</strong> {(selectedTex.dataSize / 1024).toFixed(1)} KB</span>
                <span><strong>Offset:</strong> <code className="font-mono">0x{selectedTex.dataOffset.toString(16)}</code></span>
                {selectedTex.footer && (
                  <>
                    <span><strong>Mipmaps:</strong> {selectedTex.footer.mipmapCount}</span>
                    <span><strong>العمق:</strong> {selectedTex.footer.depth}</span>
                    <span><strong>الإصدار:</strong> {selectedTex.footer.version}</span>
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
            {selectedTex && (
              <p className="text-xs text-muted-foreground">
                <AlertTriangle className="w-3 h-3 inline ml-1 text-yellow-500" />
                سيتم تغيير حجم الصورة الجديدة إلى {selectedTex.width}×{selectedTex.height} لتتوافق مع الأصلية
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
