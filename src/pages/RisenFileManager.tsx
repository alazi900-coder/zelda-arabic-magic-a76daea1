import { useState, useCallback, useRef, useMemo } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import {
  ArrowLeft, FolderOpen, Loader2, AlertTriangle, Download, Folder, FileIcon,
  ChevronDown, ChevronRight, X, Eye, Gauge, Zap, TrendingDown, Percent, Settings2,
  Save, PackageCheck, RotateCcw,
} from "lucide-react";
import {
  parseImagesPakHeader, parseImagesPakFileInfoTree, flattenPakTree,
  type RisenPakHeader, type RisenPakNode,
} from "@/lib/risen-images-pak";
import { collectSelectedFiles, totalSelectionSize, allTopLevelPaths } from "@/lib/risen-archive-selection";
import {
  findTpleFloatProperties, applyTpleFloatEdits, spliceFileIntoArchive, TPLE_PROPERTY_INFO,
  type TpleFloatProperty,
} from "@/lib/risen-tple";

const ACCENT = "#4a7c3f";
/** Above this, zip generation can take a while and use a lot of memory — warn before proceeding. */
const LARGE_SELECTION_BYTES = 300 * 1024 * 1024;

function formatBytes(n: number): string {
  if (n < 1024) return `${n} بايت`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} كيلوبايت`;
  return `${(n / (1024 * 1024)).toFixed(1)} ميجابايت`;
}

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/** Picks a representative icon per property based on its (self-descriptive) name. */
function iconForProperty(name: string) {
  if (/deccel|decel/i.test(name)) return TrendingDown;
  if (/accel/i.test(name)) return Zap;
  if (/speed/i.test(name)) return Gauge;
  if (/modifier/i.test(name)) return Percent;
  return Settings2;
}

interface TreeRowProps {
  node: RisenPakNode;
  path: string;
  depth: number;
  expanded: Set<string>;
  toggleExpanded: (path: string) => void;
  selected: Set<string>;
  toggleSelected: (path: string) => void;
  onOpenFile: (path: string, offset: number, size: number) => void;
}

const TreeRow: React.FC<TreeRowProps> = ({ node, path, depth, expanded, toggleExpanded, selected, toggleSelected, onOpenFile }) => {
  const isFolder = node.type === "folder";
  const isExpanded = expanded.has(path);
  const isChecked = selected.has(path);

  return (
    <div>
      <div
        className="flex items-center gap-1.5 py-1 px-1.5 rounded hover:bg-muted/50 text-sm"
        style={{ paddingInlineStart: `${depth * 1.25 + 0.25}rem` }}
      >
        {isFolder ? (
          <button onClick={() => toggleExpanded(path)} className="shrink-0 text-muted-foreground">
            {isExpanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
          </button>
        ) : (
          <span className="w-3.5 h-3.5 shrink-0" />
        )}
        <input
          type="checkbox"
          checked={isChecked}
          onChange={() => toggleSelected(path)}
          className="shrink-0"
        />
        {isFolder ? <Folder className="w-4 h-4 shrink-0 text-muted-foreground" /> : <FileIcon className="w-4 h-4 shrink-0 text-muted-foreground" />}
        <span className="truncate flex-1">{node.name}</span>
        {node.type === "file" && (
          <>
            <span className="text-xs text-muted-foreground shrink-0">{formatBytes(node.size)}</span>
            <button
              onClick={() => onOpenFile(path, node.offset, node.size)}
              className="shrink-0 text-xs px-1.5 py-0.5 rounded border border-border/50 hover:border-primary/50 hover:text-primary flex items-center gap-1"
              title="فتح ومعاينة/تعديل"
            >
              <Eye className="w-3 h-3" /> فتح
            </button>
          </>
        )}
      </div>
      {isFolder && isExpanded && (
        <div>
          {node.children.map((child) => (
            <TreeRow
              key={child.name}
              node={child}
              path={`${path}/${child.name}`}
              depth={depth + 1}
              expanded={expanded}
              toggleExpanded={toggleExpanded}
              selected={selected}
              toggleSelected={toggleSelected}
              onOpenFile={onOpenFile}
            />
          ))}
        </div>
      )}
    </div>
  );
};

interface PropertyRowProps {
  prop: TpleFloatProperty;
  currentValue: number;
  onChange: (valueOffset: number, newValue: number) => void;
}

const PropertyRow: React.FC<PropertyRowProps> = ({ prop, currentValue, onChange }) => {
  const info = TPLE_PROPERTY_INFO[prop.name];
  const Icon = iconForProperty(prop.name);
  const [text, setText] = useState(String(currentValue));

  return (
    <div className="flex items-center gap-3 p-2.5 rounded-lg border border-border/50 bg-background">
      <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0" style={{ backgroundColor: `${ACCENT}1a` }}>
        <Icon className="w-4 h-4" style={{ color: ACCENT }} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="font-display font-bold text-sm">{info?.label ?? prop.name}</div>
        <div className="text-xs text-muted-foreground">
          {info?.description ?? "خاصية رقمية اكتُشفت تلقائياً — غير موثّق معناها بدقة، عدّل بحذر."}
        </div>
        <div className="text-[11px] text-muted-foreground font-mono mt-0.5">{prop.name}</div>
      </div>
      <input
        type="number"
        step="any"
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          const v = parseFloat(e.target.value);
          if (!Number.isNaN(v)) onChange(prop.valueOffset, v);
        }}
        className="w-28 shrink-0 px-2 py-1.5 text-sm rounded border border-border bg-background text-center"
      />
    </div>
  );
};

const RisenFileManager: React.FC = () => {
  const [file, setFile] = useState<File | null>(null);
  const [header, setHeader] = useState<RisenPakHeader | null>(null);
  const [tree, setTree] = useState<RisenPakNode[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [treeSizeWarning, setTreeSizeWarning] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [zipping, setZipping] = useState(false);
  const [zipProgress, setZipProgress] = useState<{ current: number; total: number } | null>(null);

  // Property editor (opened either from inside an archive, or as a standalone loose file).
  const [viewingEntry, setViewingEntry] = useState<{ path: string; offset: number; size: number } | null>(null);
  const [standaloneMode, setStandaloneMode] = useState(false);
  const [entryBytes, setEntryBytes] = useState<Uint8Array | null>(null);
  const [tpleProps, setTpleProps] = useState<TpleFloatProperty[]>([]);
  const [edits, setEdits] = useState<Map<number, number>>(new Map());
  const [resetToken, setResetToken] = useState(0);
  const [entryLoading, setEntryLoading] = useState(false);
  const [entryError, setEntryError] = useState<string | null>(null);
  const [building, setBuilding] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const fsaSupported = typeof window !== "undefined" && "showOpenFilePicker" in window;

  const flatFileCount = useMemo(() => flattenPakTree(tree).length, [tree]);

  const closeEntry = useCallback(() => {
    setViewingEntry(null);
    setStandaloneMode(false);
    setEntryBytes(null);
    setTpleProps([]);
    setEdits(new Map());
    setEntryError(null);
  }, []);

  const loadArchive = useCallback(async (f: File) => {
    setLoading(true);
    setLoadError(null);
    setTreeSizeWarning(null);
    setSelected(new Set());
    setExpanded(new Set());
    closeEntry();
    try {
      const headBuf = await f.slice(0, 48).arrayBuffer();
      let hdr: RisenPakHeader;
      try {
        hdr = parseImagesPakHeader(new Uint8Array(headBuf));
      } catch (g3v0Err) {
        // Not a G3V0 archive — try it as a standalone loose file (e.g. a .tple
        // already extracted from an archive) before giving up entirely.
        const wholeBytes = new Uint8Array(await f.arrayBuffer());
        const props = findTpleFloatProperties(wholeBytes);
        if (props.length === 0) throw g3v0Err;
        setFile(f);
        setEntryBytes(wholeBytes);
        setTpleProps(props);
        setEdits(new Map());
        setViewingEntry({ path: f.name, offset: 0, size: wholeBytes.length });
        setStandaloneMode(true);
        return;
      }

      const tailLen = hdr.totalFileSize - hdr.fileInfoOffset;
      if (tailLen <= 0 || tailLen > 100_000_000) {
        throw new Error("حجم شجرة الملفات غير معقول — قد لا يكون هذا أرشيفاً مدعوماً");
      }
      const tailBuf = await f.slice(hdr.fileInfoOffset, hdr.fileInfoOffset + tailLen).arrayBuffer();
      const { tree: parsedTree, endOffset } = parseImagesPakFileInfoTree(new Uint8Array(tailBuf), hdr);
      if (endOffset !== hdr.totalFileSize) {
        setTreeSizeWarning(
          `تحذير: انتهت قراءة شجرة الملفات عند بايت ${endOffset} بينما حجم الملف ${hdr.totalFileSize} — البنية قد تختلف عن المتوقع، تحقق من النتائج بحذر.`
        );
      }
      setHeader(hdr);
      setTree(parsedTree);
      setFile(f);
      setExpanded(new Set(parsedTree.filter((n) => n.type === "folder").map((n) => n.name)));
    } catch (e) {
      setLoadError(
        e instanceof Error
          ? `${e.message} — هذا العارض يدعم أرشيفات بصيغة G3V0 الهرمية (مثل images.pak أو ملفات .p00/.p01 المشابهة) وملفات .tple منفردة (مستخرَجة مسبقاً)، وليس ملف strings.p00/strings.pak (له بنية مختلفة، استخدم أداة النصوص له).`
          : String(e)
      );
      setFile(null);
      setHeader(null);
      setTree([]);
    } finally {
      setLoading(false);
    }
  }, [closeEntry]);

  const handleOpenFsa = useCallback(async () => {
    if (!window.showOpenFilePicker) return;
    try {
      const [handle] = await window.showOpenFilePicker({
        types: [{ description: "أرشيف Risen 1 أو ملف .tple", accept: { "application/octet-stream": [".pak", ".p00", ".p01", ".p02", ".p03", ".p04", ".p05", ".tple"] } }],
      });
      const f = await handle.getFile();
      await loadArchive(f);
    } catch (e) {
      if (e instanceof Error && e.name !== "AbortError") setLoadError(e.message);
    }
  }, [loadArchive]);

  const handlePlainInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    void loadArchive(f);
  }, [loadArchive]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (loading) return;
    const f = e.dataTransfer.files?.[0];
    if (!f) return;
    void loadArchive(f);
  }, [loading, loadArchive]);

  const handleClose = useCallback(() => {
    setFile(null);
    setHeader(null);
    setTree([]);
    setSelected(new Set());
    setExpanded(new Set());
    setLoadError(null);
    setTreeSizeWarning(null);
    closeEntry();
  }, [closeEntry]);

  const toggleExpanded = useCallback((path: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path); else next.add(path);
      return next;
    });
  }, []);

  const toggleSelected = useCallback((path: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path); else next.add(path);
      return next;
    });
  }, []);

  const selectAll = useCallback(() => setSelected(new Set(allTopLevelPaths(tree))), [tree]);
  const clearSelection = useCallback(() => setSelected(new Set()), []);

  const selectedFiles = useMemo(() => collectSelectedFiles(tree, selected), [tree, selected]);
  const selectedSize = useMemo(() => totalSelectionSize(selectedFiles), [selectedFiles]);

  const handleDownloadZip = useCallback(async () => {
    if (!file || selectedFiles.length === 0) return;
    if (selectedSize > LARGE_SELECTION_BYTES) {
      const ok = window.confirm(
        `التحديد الحالي ${formatBytes(selectedSize)} عبر ${selectedFiles.length} ملف — قد يستغرق وقتاً طويلاً ويستهلك ذاكرة كبيرة. هل تريد المتابعة؟`
      );
      if (!ok) return;
    }
    setZipping(true);
    setZipProgress({ current: 0, total: selectedFiles.length });
    try {
      const JSZip = (await import("jszip")).default;
      const zip = new JSZip();
      for (let i = 0; i < selectedFiles.length; i++) {
        const f = selectedFiles[i];
        const bytes = await file.slice(f.offset, f.offset + f.size).arrayBuffer();
        zip.file(f.path, bytes);
        setZipProgress({ current: i + 1, total: selectedFiles.length });
      }
      const blob = await zip.generateAsync({ type: "blob", compression: "DEFLATE", compressionOptions: { level: 6 } });
      const baseName = file.name.replace(/\.[^.]+$/, "");
      downloadBlob(blob, `${baseName}-ملفات-محددة.zip`);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : String(e));
    } finally {
      setZipping(false);
      setZipProgress(null);
    }
  }, [file, selectedFiles, selectedSize]);

  const openEntry = useCallback(async (path: string, offset: number, size: number) => {
    if (!file) return;
    setEntryLoading(true);
    setEntryError(null);
    setEdits(new Map());
    setResetToken((t) => t + 1);
    try {
      const bytes = new Uint8Array(await file.slice(offset, offset + size).arrayBuffer());
      const props = findTpleFloatProperties(bytes);
      setEntryBytes(bytes);
      setTpleProps(props);
      setViewingEntry({ path, offset, size });
      setStandaloneMode(false);
    } catch (e) {
      setEntryError(e instanceof Error ? e.message : String(e));
    } finally {
      setEntryLoading(false);
    }
  }, [file]);

  const updateEditValue = useCallback((valueOffset: number, newValue: number) => {
    setEdits((prev) => {
      const next = new Map(prev);
      next.set(valueOffset, newValue);
      return next;
    });
  }, []);

  const resetEdits = useCallback(() => {
    setEdits(new Map());
    setResetToken((t) => t + 1);
  }, []);

  const patchedEntryBytes = useMemo(() => {
    if (!entryBytes) return null;
    return applyTpleFloatEdits(entryBytes, edits);
  }, [entryBytes, edits]);

  const downloadEditedFileOnly = useCallback(() => {
    if (!patchedEntryBytes || !viewingEntry) return;
    const name = viewingEntry.path.slice(viewingEntry.path.lastIndexOf("/") + 1);
    downloadBlob(new Blob([patchedEntryBytes as BlobPart]), name);
  }, [patchedEntryBytes, viewingEntry]);

  const buildAndDownloadArchive = useCallback(async () => {
    if (!file || !patchedEntryBytes || !viewingEntry) return;
    setBuilding(true);
    setEntryError(null);
    try {
      const archiveBytes = new Uint8Array(await file.arrayBuffer());
      const rebuilt = spliceFileIntoArchive(archiveBytes, viewingEntry.offset, viewingEntry.size, patchedEntryBytes);
      downloadBlob(new Blob([rebuilt as BlobPart]), file.name);
    } catch (e) {
      setEntryError(e instanceof Error ? e.message : String(e));
    } finally {
      setBuilding(false);
    }
  }, [file, patchedEntryBytes, viewingEntry]);

  if (viewingEntry) {
    const shortName = viewingEntry.path.slice(viewingEntry.path.lastIndexOf("/") + 1);
    const movementProps = tpleProps.filter((p) => (TPLE_PROPERTY_INFO[p.name]?.category ?? "other") === "movement");
    const otherProps = tpleProps.filter((p) => (TPLE_PROPERTY_INFO[p.name]?.category ?? "other") === "other");
    const hasEdits = edits.size > 0;

    return (
      <div className="min-h-screen flex flex-col" dir="rtl">
        <div className="border-b p-3 flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3 min-w-0">
            <Button variant="ghost" size="sm" onClick={standaloneMode ? handleClose : closeEntry}>
              <ArrowLeft className="w-4 h-4 ml-1" /> {standaloneMode ? "رجوع" : "رجوع للقائمة"}
            </Button>
            <div className="min-w-0">
              <div className="font-display font-bold truncate">{shortName}</div>
              <div className="text-xs text-muted-foreground">{formatBytes(viewingEntry.size)} — {tpleProps.length} خاصية رقمية مكتشَفة</div>
            </div>
          </div>
        </div>

        <div className="m-3 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-sm flex gap-2 items-start">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-amber-600" />
          <div>
            <strong className="block mb-1">⚠️ تجريبي</strong>
            هذه البنية استُنتجت من تحليل ملف واحد (وليست من توثيق رسمي). احتفظ بنسخة من الملف الأصلي قبل التعديل، وعدّل قيمة واحدة في كل مرة، وجرّبها داخل اللعبة قبل تعديل المزيد.
          </div>
        </div>

        {entryError && (
          <div className="mx-3 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive flex gap-2 items-start">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{entryError}</span>
          </div>
        )}

        <div className="flex-1 overflow-y-auto p-3 space-y-4">
          {tpleProps.length === 0 ? (
            <div className="text-sm text-muted-foreground p-4 text-center">
              لم يُعثر على خصائص رقمية معروفة قابلة للتعديل في هذا الملف.
            </div>
          ) : (
            <>
              {movementProps.length > 0 && (
                <div>
                  <div className="font-display font-bold mb-2 flex items-center gap-1.5">🏃 سرعة وحركة</div>
                  <div className="space-y-2">
                    {movementProps.map((p) => (
                      <PropertyRow
                        key={`${p.valueOffset}-${resetToken}`}
                        prop={p}
                        currentValue={edits.get(p.valueOffset) ?? p.value}
                        onChange={updateEditValue}
                      />
                    ))}
                  </div>
                </div>
              )}
              {otherProps.length > 0 && (
                <div>
                  <div className="font-display font-bold mb-2 flex items-center gap-1.5">🔧 خصائص أخرى (مكتشَفة تلقائياً)</div>
                  <div className="space-y-2">
                    {otherProps.map((p) => (
                      <PropertyRow
                        key={`${p.valueOffset}-${resetToken}`}
                        prop={p}
                        currentValue={edits.get(p.valueOffset) ?? p.value}
                        onChange={updateEditValue}
                      />
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {tpleProps.length > 0 && (
          <div className="p-3 border-t flex items-center gap-3 flex-wrap">
            <Button variant="outline" size="sm" onClick={resetEdits} disabled={!hasEdits}>
              <RotateCcw className="w-4 h-4 ml-1" /> استعادة الأصل
            </Button>
            <div className="flex-1" />
            <Button variant="outline" onClick={downloadEditedFileOnly} className="font-display font-bold">
              <Save className="w-4 h-4 ml-2" /> تنزيل الملف المعدَّل فقط
            </Button>
            {!standaloneMode && (
              <Button
                onClick={() => void buildAndDownloadArchive()}
                disabled={building}
                className="font-display font-bold"
                style={{ backgroundColor: ACCENT, color: "white" }}
              >
                {building ? (
                  <><Loader2 className="w-4 h-4 ml-2 animate-spin" /> جارٍ البناء...</>
                ) : (
                  <><PackageCheck className="w-4 h-4 ml-2" /> بناء وتنزيل الأرشيف كاملاً</>
                )}
              </Button>
            )}
          </div>
        )}
      </div>
    );
  }

  if (!file || !header) {
    return (
      <div
        className={`min-h-screen flex flex-col items-center justify-center px-4 text-center transition-colors ${dragOver ? "bg-primary/5" : ""}`}
        dir="rtl"
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
      >
        <Link to="/risen" className="absolute top-4 right-4">
          <Button variant="ghost" size="sm"><ArrowLeft className="w-4 h-4 ml-1" /> رجوع</Button>
        </Link>
        <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mb-6" style={{ backgroundColor: `${ACCENT}1a` }}>
          <span className="text-3xl">🗂️</span>
        </div>
        <h1 className="text-2xl md:text-3xl font-display font-bold mb-3">مدير ملفات Risen 1</h1>
        <p className="text-muted-foreground mb-8 max-w-lg font-body">
          افتح أي أرشيف <code className="font-mono text-sm px-1.5 py-0.5 rounded bg-muted">.pak</code> أو{" "}
          <code className="font-mono text-sm px-1.5 py-0.5 rounded bg-muted">.p00</code> / <code className="font-mono text-sm px-1.5 py-0.5 rounded bg-muted">.p01</code> وما شابه
          (مثل images.pak أو templates.p00) لتصفح قائمة ملفاته الداخلية، وافتح أي ملف <code className="font-mono text-sm px-1.5 py-0.5 rounded bg-muted">.tple</code> داخله
          لعرض وتعديل خصائصه الرقمية (كسرعة الحركة) وبناء الأرشيف كاملاً بالتعديل — أو اختر ملفات/مجلدات لتنزيلها كـZIP،
          أو اسحب الملف وأفلته هنا.
        </p>

        {loading ? (
          <div className="flex items-center gap-2 text-muted-foreground">
            <Loader2 className="w-5 h-5 animate-spin" /> جارٍ قراءة الملف...
          </div>
        ) : fsaSupported ? (
          <Button size="lg" onClick={handleOpenFsa} className="font-display font-bold text-lg px-10 py-6" style={{ backgroundColor: ACCENT, color: "white" }}>
            <FolderOpen className="w-5 h-5 ml-2" /> افتح أرشيفاً
          </Button>
        ) : (
          <>
            <Button size="lg" onClick={() => fileInputRef.current?.click()} className="font-display font-bold text-lg px-10 py-6" style={{ backgroundColor: ACCENT, color: "white" }}>
              <FolderOpen className="w-5 h-5 ml-2" /> افتح أرشيفاً
            </Button>
            <input ref={fileInputRef} type="file" className="hidden" onChange={handlePlainInput} />
          </>
        )}

        {loadError && (
          <div className="mt-6 max-w-md rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive flex gap-2 items-start text-right">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{loadError}</span>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col" dir="rtl">
      <div className="border-b p-3 flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3 min-w-0">
          <Link to="/risen"><Button variant="ghost" size="sm"><ArrowLeft className="w-4 h-4 ml-1" /> رجوع</Button></Link>
          <div className="min-w-0">
            <div className="font-display font-bold truncate">{file.name}</div>
            <div className="text-xs text-muted-foreground">{formatBytes(header.totalFileSize)} — {flatFileCount} ملف</div>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={handleClose}><X className="w-4 h-4 ml-1" /> إغلاق</Button>
      </div>

      {treeSizeWarning && (
        <div className="m-3 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-sm flex gap-2 items-start">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-amber-600" />
          <span>{treeSizeWarning}</span>
        </div>
      )}
      {loadError && (
        <div className="m-3 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive flex gap-2 items-start">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{loadError}</span>
        </div>
      )}

      <div className="p-3 flex items-center gap-3 flex-wrap border-b">
        <Button variant="outline" size="sm" onClick={selectAll}>تحديد الكل</Button>
        <Button variant="outline" size="sm" onClick={clearSelection}>إلغاء التحديد</Button>
        <span className="text-sm text-muted-foreground">
          {selected.size === 0 ? "لا يوجد تحديد" : `${selectedFiles.length} ملف محدد — ${formatBytes(selectedSize)}`}
        </span>
        <div className="flex-1" />
        <Button
          onClick={handleDownloadZip}
          disabled={selectedFiles.length === 0 || zipping}
          className="font-display font-bold"
          style={{ backgroundColor: ACCENT, color: "white" }}
        >
          {zipping ? (
            <>
              <Loader2 className="w-4 h-4 ml-2 animate-spin" />
              {zipProgress ? `جارٍ الضغط... ${zipProgress.current}/${zipProgress.total}` : "جارٍ الضغط..."}
            </>
          ) : (
            <>
              <Download className="w-4 h-4 ml-2" /> تنزيل ZIP
            </>
          )}
        </Button>
      </div>

      {entryLoading && (
        <div className="mx-3 mb-2 flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="w-4 h-4 animate-spin" /> جارٍ فتح الملف...
        </div>
      )}
      {entryError && (
        <div className="m-3 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive flex gap-2 items-start">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{entryError}</span>
        </div>
      )}

      <div className="flex-1 overflow-y-auto p-3">
        {tree.map((node) => (
          <TreeRow
            key={node.name}
            node={node}
            path={node.name}
            depth={0}
            expanded={expanded}
            toggleExpanded={toggleExpanded}
            selected={selected}
            toggleSelected={toggleSelected}
            onOpenFile={(p, o, s) => void openEntry(p, o, s)}
          />
        ))}
      </div>
    </div>
  );
};

export default RisenFileManager;
