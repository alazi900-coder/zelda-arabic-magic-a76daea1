import { useState, useCallback, useRef, useMemo } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import {
  ArrowLeft, FolderOpen, Loader2, AlertTriangle, Download, Folder, FileIcon,
  ChevronDown, ChevronRight, X,
} from "lucide-react";
import {
  parseImagesPakHeader, parseImagesPakFileInfoTree, flattenPakTree,
  type RisenPakHeader, type RisenPakNode,
} from "@/lib/risen-images-pak";
import { collectSelectedFiles, totalSelectionSize, allTopLevelPaths } from "@/lib/risen-archive-selection";

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

interface TreeRowProps {
  node: RisenPakNode;
  path: string;
  depth: number;
  expanded: Set<string>;
  toggleExpanded: (path: string) => void;
  selected: Set<string>;
  toggleSelected: (path: string) => void;
}

const TreeRow: React.FC<TreeRowProps> = ({ node, path, depth, expanded, toggleExpanded, selected, toggleSelected }) => {
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
        {node.type === "file" && <span className="text-xs text-muted-foreground shrink-0">{formatBytes(node.size)}</span>}
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
            />
          ))}
        </div>
      )}
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

  const fileInputRef = useRef<HTMLInputElement>(null);
  const fsaSupported = typeof window !== "undefined" && "showOpenFilePicker" in window;

  const flatFileCount = useMemo(() => flattenPakTree(tree).length, [tree]);

  const loadArchive = useCallback(async (f: File) => {
    setLoading(true);
    setLoadError(null);
    setTreeSizeWarning(null);
    setSelected(new Set());
    setExpanded(new Set());
    try {
      const headBuf = await f.slice(0, 48).arrayBuffer();
      const hdr = parseImagesPakHeader(new Uint8Array(headBuf));

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
          ? `${e.message} — هذا العارض يدعم أرشيفات بصيغة G3V0 الهرمية (مثل images.pak أو ملفات .p00/.p01 المشابهة)، وليس ملف strings.p00/strings.pak (له بنية مختلفة، استخدم أداة النصوص له).`
          : String(e)
      );
      setFile(null);
      setHeader(null);
      setTree([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const handleOpenFsa = useCallback(async () => {
    if (!window.showOpenFilePicker) return;
    try {
      const [handle] = await window.showOpenFilePicker({
        types: [{ description: "أرشيف Risen 1", accept: { "application/octet-stream": [".pak", ".p00", ".p01", ".p02", ".p03", ".p04", ".p05"] } }],
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
  }, []);

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
          (مثل images.pak أو templates.p00) لتصفح قائمة ملفاته الداخلية بدون فتح محتواها، واختيار ملف أو أكثر أو مجلد كامل لتنزيله كملف ZIP —
          بدون تحميل الأرشيف كاملاً للذاكرة، أو اسحب الملف وأفلته هنا.
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
          />
        ))}
      </div>
    </div>
  );
};

export default RisenFileManager;
