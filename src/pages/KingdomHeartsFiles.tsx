/**
 * STYLE: مدير موارد Kingdom Hearts عملي كهرماني، مهيأ للهاتف، يقرأ DAT محلياً
 * ويتيح فتحاً قابلاً للكتابة لمسار TIM2 وفك BBS المحلي، مع إبقاء التصفح والتنزيل خفيفين وواضحين.
 */

import { type ChangeEvent, useCallback, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { AlertTriangle, ArrowLeft, CheckSquare, ChevronDown, ClipboardCopy, Download, FileArchive, FileDown, FileSearch, Files, FolderOpen, Image, Loader2, Search, Square, Type, Unlock, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { discoverKHBbs0CtdEntries, indexKHBbsDatFiles, formatBbsBytes, formatBbsHash, getBbsEntryFilename, readBbsArchiveEntry, type BbsArchiveEntry, type BbsArchiveIndex } from "@/lib/khbbs-bbsa";
import { clearKHBbsDatWritableWorkspace, hasKHBbsDatWritableWorkspace, openKHBbsDatWritableWorkspace } from "@/lib/khbbs-dat-workspace";
import { clearKHBbsBbsWorkspace, readKHBbsCtdSelection, setKHBbsBbsWorkspace, setKHBbsFontReplacement } from "@/lib/khbbs-bbs-workspace";
import { openKHBbsInEditor } from "@/lib/khbbs-editor-bridge";
import { decryptKHBbsPgdFile, inspectKHBbsPgdHeader, scanKHBbsFileSignatures, type KHBbsFileSignatureScan, type KHBbsPgdHeaderInspection } from "@/lib/khbbs-pgd";
import { toast } from "sonner";

const LARGE_ZIP_BYTES = 300 * 1024 * 1024;

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function FolderGroup({
  directory, entries, selected, toggleSelected, onDownload, downloadingId, fontCandidateIds,
}: {
  directory: string;
  entries: BbsArchiveEntry[];
  selected: Set<string>;
  toggleSelected: (id: string) => void;
  onDownload: (entry: BbsArchiveEntry) => void;
  downloadingId: string | null;
  fontCandidateIds: Set<string>;
}) {
  const [open, setOpen] = useState(false);
  const downloadable = entries.filter((entry) => entry.downloadAvailable).length;
  return (
    <section className="overflow-hidden rounded-2xl border border-border bg-card/60">
      <button onClick={() => setOpen((value) => !value)} className="flex w-full items-center gap-3 px-4 py-3 text-right transition-colors hover:bg-amber-500/10">
        <ChevronDown className={`h-4 w-4 shrink-0 text-amber-500 transition-transform ${open ? "rotate-0" : "-rotate-90"}`} />
        <FolderOpen className="h-5 w-5 shrink-0 text-amber-500" />
        <span className="min-w-0 flex-1 truncate font-bold">{directory}</span>
        <span className="shrink-0 text-xs text-muted-foreground">{entries.length} ملف · {downloadable} متاح</span>
      </button>
      {open && (
        <div className="border-t border-border/70">
          {entries.map((entry) => {
            const checked = selected.has(entry.id);
            const filename = getBbsEntryFilename(entry);
            const isFontCandidate = fontCandidateIds.has(entry.id);
            return (
              <div key={entry.id} className="flex items-center gap-2 border-b border-border/50 px-3 py-2.5 last:border-b-0">
                <button
                  onClick={() => entry.downloadAvailable && toggleSelected(entry.id)}
                  disabled={!entry.downloadAvailable}
                  title={entry.downloadAvailable ? "تحديد الملف للتنزيل كـ ZIP" : "الملف غير متاح حتى ترفع DAT المصدر"}
                  className="shrink-0 text-amber-500 disabled:cursor-not-allowed disabled:text-muted-foreground/35"
                >
                  {checked ? <CheckSquare className="h-5 w-5" /> : <Square className="h-5 w-5" />}
                </button>
                <FileArchive className="h-4 w-4 shrink-0 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <p dir="ltr" className={`truncate font-mono text-xs font-semibold ${isFontCandidate ? "text-amber-500" : ""}`}>{isFontCandidate ? `FONT ARCHIVE · ${filename}` : filename}</p>
                  <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
                    {isFontCandidate ? "تم التعرّف عليه من mesfont وcmdfont · " : ""}{entry.isVerifiedCtd ? "CTD مؤكّد بالترويسة · " : entry.ctdVerification === "mismatch" ? "ليست CTD؛ تم تصحيح الامتداد · " : entry.extension === "ctd" ? "CTD من توقيع مجموعة المورد؛ تحقّق فردي متاح · " : ""}{formatBbsHash(entry.fileHash)} · BBS{entry.archiveIndex}.DAT · {formatBbsBytes(entry.allocatedBytes)} · {entry.isStreamed ? "تدفق غير قابل للتنزيل" : entry.downloadAvailable ? "جاهز" : "DAT المصدر غير مرفوع"}
                  </p>
                </div>
                <Button variant="outline" size="icon" disabled={!entry.downloadAvailable || downloadingId === entry.id} onClick={() => onDownload(entry)} title="تنزيل المورد كما هو في الأرشيف">
                  {downloadingId === entry.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileDown className="h-4 w-4" />}
                </Button>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

export default function KingdomHeartsFiles() {
  const inputRef = useRef<HTMLInputElement>(null);
  const fontInputRef = useRef<HTMLInputElement>(null);
  const decryptInputRef = useRef<HTMLInputElement>(null);
  const inspectInputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();
  const [archive, setArchive] = useState<BbsArchiveIndex | null>(null);
  const [loading, setLoading] = useState(false);
  const [zipping, setZipping] = useState(false);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState("");
  const [extension, setExtension] = useState("all");
  const [error, setError] = useState<string | null>(null);
  const [fontCandidateIds, setFontCandidateIds] = useState<Set<string>>(new Set());
  const [flatZip, setFlatZip] = useState(true);
  const [ctdChecking, setCtdChecking] = useState(false);
  const [ctdProgress, setCtdProgress] = useState<{ completed: number; total: number } | null>(null);
  const [openingCtd, setOpeningCtd] = useState(false);
  const [selectingFont, setSelectingFont] = useState(false);
  const [fontSelection, setFontSelection] = useState<{ filename: string; archiveIndexes: number[] } | null>(null);
  const [writableWorkspace, setWritableWorkspace] = useState(() => hasKHBbsDatWritableWorkspace());
  const [decryptingBbs, setDecryptingBbs] = useState(false);
  const [bbsInspecting, setBbsInspecting] = useState(false);
  const [bbsScanProgress, setBbsScanProgress] = useState<{ completed: number; total: number } | null>(null);
  const [bbsInspection, setBbsInspection] = useState<(KHBbsPgdHeaderInspection & KHBbsFileSignatureScan & { filename: string; fileSize: number }) | null>(null);
  const writablePickerSupported = typeof window !== "undefined" && "showOpenFilePicker" in window;

  const openArchives = useCallback(async (uploads: File[]) => {
    setLoading(true);
    setError(null);
    setSelected(new Set());
    setFontCandidateIds(new Set());
    setFontSelection(null);
    setExtension("ctd");
    clearKHBbsDatWritableWorkspace();
    clearKHBbsBbsWorkspace();
    setWritableWorkspace(false);
    try {
      const indexed = await indexKHBbsDatFiles(uploads);
      setKHBbsBbsWorkspace(indexed);
      setArchive(indexed);
      setCtdProgress(null);
    } catch (caught) {
      setArchive(null);
      setError(caught instanceof Error ? caught.message : "تعذر قراءة فهرس ملفات DAT.");
    } finally {
      setLoading(false);
    }
  }, []);

  const openWritableArchives = useCallback(async () => {
    if (!window.showOpenFilePicker) return;
    setLoading(true);
    setError(null);
    setSelected(new Set());
    setFontCandidateIds(new Set());
    setFontSelection(null);
    setExtension("ctd");
    try {
      const handles = await window.showOpenFilePicker({
        multiple: true,
        types: [{ description: "Kingdom Hearts BBS DAT", accept: { "application/octet-stream": [".dat"] } }],
      });
      const indexed = await openKHBbsDatWritableWorkspace(handles);
      setKHBbsBbsWorkspace(indexed);
      setArchive(indexed);
      setWritableWorkspace(true);
      setCtdProgress(null);
    } catch (caught) {
      if (caught instanceof Error && caught.name === "AbortError") return;
      clearKHBbsDatWritableWorkspace();
      clearKHBbsBbsWorkspace();
      setWritableWorkspace(false);
      setArchive(null);
      setError(caught instanceof Error ? caught.message : "تعذر فتح ملفات DAT بصلاحية الكتابة.");
    } finally {
      setLoading(false);
    }
  }, []);

  const discoverCtd = useCallback(async () => {
    if (!archive || ctdChecking) return;
    setCtdChecking(true);
    setCtdProgress({ completed: 0, total: archive.archives.get(0)?.size ?? 0 });
    setError(null);
    try {
      const result = await discoverKHBbs0CtdEntries(archive, (completed, total) => setCtdProgress({ completed, total }));
      setExtension("ctd");
      const report = `اكتشاف CTD المباشر في BBS0 اكتمل: ${result.confirmed} ملف @CTD مطابق للفهرس من ${result.scannedSectors.toLocaleString("ar")} قطاعاً${result.unmatched ? `؛ ${result.unmatched} ترويسة @CTD لم تطابق بداية مورد مفهرس، فتم تجاهلها لحماية حجم الملفات` : ""}.`;
      setArchive((current) => current ? { ...current, entries: [...current.entries], warnings: [...current.warnings.filter((warning) => !warning.startsWith("اكتشاف CTD المباشر")), report] } : current);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "تعذر اكتشاف ملفات CTD داخل BBS0.");
    } finally {
      setCtdChecking(false);
    }
  }, [archive, ctdChecking]);

  const filteredEntries = useMemo(() => {
    if (!archive) return [];
    const normalizedQuery = query.trim().toLowerCase();
    return archive.entries.filter((entry) => {
      const matchesExtension = extension === "all" || entry.extension === extension;
      if (!matchesExtension) return false;
      if (!normalizedQuery) return true;
      const searchable = `${entry.directory} ${entry.extension} ${formatBbsHash(entry.fileHash)} ${formatBbsHash(entry.directoryHash)} BBS${entry.archiveIndex}`.toLowerCase();
      return searchable.includes(normalizedQuery);
    });
  }, [archive, extension, query]);

  const groups = useMemo(() => {
    const grouped = new Map<string, BbsArchiveEntry[]>();
    for (const entry of filteredEntries) grouped.set(entry.directory, [...(grouped.get(entry.directory) ?? []), entry]);
    return [...grouped.entries()].sort(([left], [right]) => left.localeCompare(right));
  }, [filteredEntries]);

  const extensions = useMemo(() => [...new Set(archive?.entries.map((entry) => entry.extension) ?? [])].filter((item) => item !== "ctd").sort(), [archive]);
  const visibleCtdCount = useMemo(() => filteredEntries.filter((entry) => entry.downloadAvailable && entry.extension === "ctd").length, [filteredEntries]);
  const selectedEntries = useMemo(() => filteredEntries.filter((entry) => selected.has(entry.id) && entry.downloadAvailable), [filteredEntries, selected]);
  const selectedCtdEntries = useMemo(() => selectedEntries.filter((entry) => entry.isVerifiedCtd && !entry.isStreamed), [selectedEntries]);
  const selectedBytes = useMemo(() => selectedEntries.reduce((total, entry) => total + entry.allocatedBytes, 0), [selectedEntries]);

  const toggleSelected = useCallback((id: string) => {
    setSelected((previous) => {
      const next = new Set(previous);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  const downloadEntry = useCallback(async (entry: BbsArchiveEntry) => {
    if (!archive) return;
    setDownloadingId(entry.id);
    try {
      downloadBlob(await readBbsArchiveEntry(entry, archive.archives), getBbsEntryFilename(entry));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "تعذر تنزيل المورد.");
    } finally {
      setDownloadingId(null);
    }
  }, [archive]);

  const downloadSelectedZip = useCallback(async () => {
    if (!archive || selectedEntries.length === 0) return;
    if (selectedBytes > LARGE_ZIP_BYTES && !window.confirm(`حجم الموارد المحددة ${formatBbsBytes(selectedBytes)}. قد يستهلك إنشاء ZIP ذاكرة كبيرة في الهاتف. هل تريد المتابعة؟`)) return;
    setZipping(true);
    setError(null);
    try {
      const JSZip = (await import("jszip")).default;
      const zip = new JSZip();
      const usedFlatNames = new Set<string>();
      for (const entry of selectedEntries) {
        const originalName = getBbsEntryFilename(entry);
        let filename = originalName;
        let suffix = 2;
        while (flatZip && usedFlatNames.has(filename.toLowerCase())) {
          const extensionIndex = originalName.lastIndexOf(".");
          const stem = extensionIndex >= 0 ? originalName.slice(0, extensionIndex) : originalName;
          const ext = extensionIndex >= 0 ? originalName.slice(extensionIndex) : "";
          filename = `${stem}_${suffix}${ext}`;
          suffix += 1;
        }
        usedFlatNames.add(filename.toLowerCase());
        const zipPath = flatZip
          ? `khbbs-files/${filename}`
          : `${entry.directory.replace(/[^A-Za-z0-9/_-]/g, "unknown")}/${filename}`;
        zip.file(zipPath, await readBbsArchiveEntry(entry, archive.archives));
      }
      downloadBlob(await zip.generateAsync({ type: "blob", compression: "DEFLATE", compressionOptions: { level: 6 } }), flatZip ? "khbbs-files-flat.zip" : "khbbs-selected-files.zip");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "تعذر بناء ZIP.");
    } finally {
      setZipping(false);
    }
  }, [archive, flatZip, selectedBytes, selectedEntries]);

  const openSelectedCtdInEditor = useCallback(async () => {
    if (selectedCtdEntries.length === 0) return;
    setOpeningCtd(true);
    setError(null);
    try {
      const result = await openKHBbsInEditor(await readKHBbsCtdSelection(selectedCtdEntries));
      toast.success(`تم فتح ${result.fileCount} ملف CTD وفيها ${result.entryCount} نص في المحرر`);
      if (result.rejected.length > 0) toast.warning(`تم تجاهل ${result.rejected.length} عنصر غير صالح`);
      navigate("/editor");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "تعذر فتح ملفات CTD في المحرر.");
    } finally {
      setOpeningCtd(false);
    }
  }, [navigate, selectedCtdEntries]);

  const selectArabicFont = useCallback(async (event: ChangeEvent<HTMLInputElement>) => {
    const upload = event.target.files?.[0];
    event.target.value = "";
    if (!upload) return;
    setSelectingFont(true);
    setError(null);
    try {
      const sources = await setKHBbsFontReplacement(upload);
      const archiveIndexes = [...new Set(sources.map((source) => source.archiveIndex))].sort((left, right) => left - right);
      setFontSelection({ filename: upload.name, archiveIndexes });
      toast.success(`تم ربط ${upload.name} بمورد الخط المؤكد.`);
    } catch (caught) {
      setFontSelection(null);
      setError(caught instanceof Error ? caught.message : "تعذر ربط الخط العربي بملفات BBS.");
    } finally {
      setSelectingFont(false);
    }
  }, []);

  const decryptBbsFiles = useCallback(async (uploads: File[]) => {
    if (uploads.length === 0 || decryptingBbs) return;
    setDecryptingBbs(true);
    setError(null);
    try {
      let decryptedCount = 0;
      let copiedBbs0 = 0;
      const usedArchives = new Set<number>();
      const outputs: { file: File; name: string }[] = [];
      for (const upload of uploads) {
        const match = upload.name.match(/^BBS([0-3])\.DAT$/i);
        if (!match) throw new Error("اختر BBS0.DAT أو BBS1.DAT أو BBS2.DAT أو BBS3.DAT فقط لفك التشفير.");
        const archiveNumber = Number(match[1]);
        if (usedArchives.has(archiveNumber)) throw new Error(`تم اختيار BBS${archiveNumber}.DAT أكثر من مرة.`);
        usedArchives.add(archiveNumber);
        if (archiveNumber === 0) {
          outputs.push({ file: upload, name: "BBS0.DAT" });
          copiedBbs0 += 1;
          continue;
        }
        const result = await decryptKHBbsPgdFile(upload);
        outputs.push({ file: result.file, name: `BBS${archiveNumber}.DAT` });
        decryptedCount += 1;
      }
      outputs.forEach(({ file, name }) => downloadBlob(file, name));
      const parts = [decryptedCount > 0 ? `تم فك ${decryptedCount} ملف` : "", copiedBbs0 > 0 ? "تم تنزيل BBS0 كما هو" : ""].filter(Boolean);
      toast.success(parts.join("؛ ") || "اكتمل فك ملفات BBS.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "تعذر فك ملف BBS.");
    } finally {
      setDecryptingBbs(false);
    }
  }, [decryptingBbs]);

  const inspectBbsFile = useCallback(async (upload: File | undefined) => {
    if (!upload) return;
    setBbsInspecting(true);
    setError(null);
    setBbsScanProgress({ completed: 0, total: upload.size });
    try {
      const header = new Uint8Array(await upload.slice(0, 0x100).arrayBuffer());
      const scan = await scanKHBbsFileSignatures(upload, (completed, total) => setBbsScanProgress({ completed, total }));
      setBbsInspection({ ...inspectKHBbsPgdHeader(header), ...scan, filename: upload.name, fileSize: upload.size });
      toast.success("اكتمل فحص BBS المحلي وتحديد تواقيع المحتوى.");
    } catch (caught) {
      setBbsInspection(null);
      setError(caught instanceof Error ? caught.message : "تعذر قراءة ترويسة ملف BBS.");
    } finally {
      setBbsInspecting(false);
      setBbsScanProgress(null);
    }
  }, []);

  const copyBbsInspection = useCallback(async () => {
    if (!bbsInspection) return;
    const text = [
      `الملف: ${bbsInspection.filename}`,
      `الحجم: ${formatBbsBytes(bbsInspection.fileSize)}`,
      `PGD: ${bbsInspection.pgdOffset === null ? "غير موجود عند 0x0 أو 0x90" : `موجود عند 0x${bbsInspection.pgdOffset.toString(16).toUpperCase()}`}`,
      `مسح المحتوى: ${formatBbsBytes(bbsInspection.scannedBytes)}`,
      `التواقيع الداخلية: ${bbsInspection.signatures.length ? bbsInspection.signatures.map((item) => `${item.kind} عند 0x${item.offset.toString(16).toUpperCase()}`).join("؛ ") : "لم يُعثر على PGD أو BBSA أو @CTD"}${bbsInspection.truncated ? "؛ تظهر أول 6 مواقع من كل نوع فقط" : ""}`,
      `التوقيع عند 0x0: ${bbsInspection.startSignature}`,
      `التوقيع عند 0x90: ${bbsInspection.offset90Signature ?? "الملف أقصر من 0x94"}`,
      `HEX (${bbsInspection.bytesRead} بايت): ${bbsInspection.hex}`,
      `ASCII: ${bbsInspection.ascii}`,
    ].join("\n");
    try {
      await navigator.clipboard.writeText(text);
      toast.success("تم نسخ بيانات ترويسة BBS.");
    } catch {
      setError("تعذر النسخ تلقائياً. حدّد بيانات HEX وانسخها يدوياً.");
    }
  }, [bbsInspection]);

  const selectVisible = useCallback(() => setSelected(new Set(filteredEntries.filter((entry) => entry.downloadAvailable).map((entry) => entry.id))), [filteredEntries]);

  return (
    <main dir="rtl" className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border bg-card/70 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-4">
          <div className="flex min-w-0 items-center gap-3">
            <Link to="/kingdom-hearts-bbs" className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-border transition-colors hover:border-amber-500/60 hover:text-amber-500" aria-label="العودة إلى Kingdom Hearts">
              <ArrowLeft className="h-5 w-5" />
            </Link>
            <div className="min-w-0">
              <p className="font-mono text-xs text-amber-500">PSP · BBSA DATA ARCHIVES</p>
              <h1 className="truncate font-display text-xl font-black md:text-2xl">مدير ملفات Kingdom Hearts</h1>
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2">
            <Button onClick={() => inspectInputRef.current?.click()} disabled={loading || decryptingBbs || bbsInspecting} variant="outline" className="border-slate-500/50 text-slate-700 hover:bg-slate-500/10 dark:text-slate-300" title="يفحص الترويسة ويحدد موضع PGD أو BBSA أو CTD داخل الملف محلياً">
              {bbsInspecting ? <Loader2 className="ml-2 h-4 w-4 animate-spin" /> : <FileSearch className="ml-2 h-4 w-4" />}{bbsInspecting ? "جارٍ فحص BBS…" : "فحص BBS"}
            </Button>
            <Button onClick={() => decryptInputRef.current?.click()} disabled={loading || decryptingBbs} variant="outline" className="border-sky-500/50 text-sky-700 hover:bg-sky-500/10 dark:text-sky-300" title="ينزّل نسخة مفكوكة من BBS1 إلى BBS3؛ BBS0 يمر كما هو">
              {decryptingBbs ? <Loader2 className="ml-2 h-4 w-4 animate-spin" /> : <Unlock className="ml-2 h-4 w-4" />}{decryptingBbs ? "جارٍ فك BBS…" : "فك BBS"}
            </Button>
            {writablePickerSupported && <Button onClick={() => void openWritableArchives()} disabled={loading} variant="outline" className="border-emerald-500/50 text-emerald-600 hover:bg-emerald-500/10 dark:text-emerald-400"><Image className="ml-2 h-4 w-4" />فتح قابل للكتابة</Button>}
            <Button onClick={() => inputRef.current?.click()} disabled={loading} className="bg-amber-500 font-bold text-black hover:bg-amber-400">
              {loading ? <Loader2 className="ml-2 h-4 w-4 animate-spin" /> : <Upload className="ml-2 h-4 w-4" />}رفع DAT
            </Button>
          </div>
        </div>
      </header>

      <section className="mx-auto max-w-6xl px-4 py-7 md:py-10">
        <input ref={inputRef} type="file" accept=".dat,application/octet-stream" multiple className="hidden" onChange={(event) => { const uploads = Array.from(event.target.files ?? []); event.target.value = ""; void openArchives(uploads); }} />
        <input ref={fontInputRef} type="file" accept=".arc,application/octet-stream" className="hidden" onChange={(event) => void selectArabicFont(event)} />
        <input ref={decryptInputRef} type="file" accept=".dat,application/octet-stream" multiple className="hidden" onChange={(event) => { const uploads = Array.from(event.target.files ?? []); event.target.value = ""; void decryptBbsFiles(uploads); }} />
        <input ref={inspectInputRef} type="file" accept=".dat,application/octet-stream" className="hidden" onChange={(event) => { const upload = event.target.files?.[0]; event.target.value = ""; void inspectBbsFile(upload); }} />

        {!archive && !loading && (
          <div className="rounded-3xl border-2 border-dashed border-amber-500/40 bg-card/50 p-7 text-center md:p-12">
            <Files className="mx-auto mb-5 h-12 w-12 text-amber-500" />
            <h2 className="font-display text-2xl font-black">افتح أرشيفات BBS0–BBS4.DAT</h2>
            <p className="mx-auto mt-3 max-w-2xl leading-relaxed text-muted-foreground">اختر ملفات <bdi>BBS0.DAT</bdi> إلى <bdi>BBS4.DAT</bdi> معاً من <bdi>PSP_GAME/USRDIR</bdi>. يقرأ المدير الفهرس من BBS0 ثم يعرض الموارد حسب المجلد والامتداد ويسمح بتنزيلها محلياً.</p>
            <div className="mt-6 flex flex-wrap justify-center gap-2"><Button onClick={() => inputRef.current?.click()} size="lg" className="bg-amber-500 font-bold text-black hover:bg-amber-400"><Upload className="ml-2 h-5 w-5" />اختر ملفات DAT</Button>{writablePickerSupported && <Button onClick={() => void openWritableArchives()} size="lg" variant="outline" className="border-emerald-500/50 font-bold text-emerald-700 hover:bg-emerald-500/10 dark:text-emerald-300"><Image className="ml-2 h-5 w-5" />فتح قابل للكتابة</Button>}</div>
            <p className="mt-5 text-xs text-muted-foreground">«رفع DAT» للتصفح والتنزيل فقط. «فتح قابل للكتابة» هو المسار الذي يجعل استبدال صور TIM2 يكتب مباشرة في المورد الأصلي داخل DAT، مع تأكيد وقراءة تحقق بعد كل كتابة.</p>
          </div>
        )}

        {loading && <div className="flex items-center justify-center gap-3 rounded-3xl border border-border bg-card/50 p-12 text-muted-foreground"><Loader2 className="h-6 w-6 animate-spin text-amber-500" />جارٍ قراءة فهرس BBS0.DAT…</div>}

        {error && <div className="mt-5 flex items-start gap-3 rounded-2xl border border-destructive/40 bg-destructive/10 p-4 text-sm"><AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" /><p>{error}</p></div>}

        {bbsInspection && <div className="mt-5 rounded-2xl border border-slate-500/35 bg-slate-500/10 p-4 text-sm">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div><p className="font-bold">فحص BBS محلي</p><p dir="ltr" className="mt-1 font-mono text-xs text-muted-foreground">{bbsInspection.filename} · {formatBbsBytes(bbsInspection.fileSize)}</p></div>
            <Button size="sm" variant="outline" onClick={() => void copyBbsInspection()}><ClipboardCopy className="ml-1.5 h-4 w-4" />نسخ البيانات</Button>
          </div>
          <p className="mt-3 leading-relaxed"><b>PGD/DNAS:</b> {bbsInspection.pgdOffset === null ? "غير موجود عند 0x0 أو 0x90؛ لا يعني ذلك وحده أن الملف مفكوك." : <bdi className="font-mono">موجود عند 0x{bbsInspection.pgdOffset.toString(16).toUpperCase()}</bdi>}</p>
          <p className="mt-2 leading-relaxed"><b>داخل الملف:</b> {bbsInspection.signatures.length ? bbsInspection.signatures.map((item) => <span key={`${item.kind}-${item.offset}`} className="ml-2 inline-flex rounded-md border border-border bg-background/60 px-2 py-0.5 font-mono text-xs"><bdi>{item.kind} · 0x{item.offset.toString(16).toUpperCase()}</bdi></span>) : "لم يُعثر على PGD أو BBSA أو @CTD داخل الملف."}{bbsInspection.truncated ? " تظهر أول 6 مواقع من كل نوع فقط." : ""}</p>
          <p dir="ltr" className="mt-2 font-mono text-xs text-muted-foreground">0x00: {bbsInspection.startSignature} · 0x90: {bbsInspection.offset90Signature ?? "—"}</p>
          <pre dir="ltr" className="mt-3 max-h-36 overflow-auto rounded-xl border border-border bg-background/80 p-3 text-left font-mono text-[10px] leading-5 text-muted-foreground whitespace-pre-wrap break-all">{bbsInspection.hex}</pre>
        </div>}

        {bbsInspecting && bbsScanProgress && <div className="mt-5 rounded-2xl border border-slate-500/35 bg-slate-500/10 p-4 text-sm"><div className="flex items-center gap-3"><Loader2 className="h-5 w-5 animate-spin text-slate-500" /><p>جارٍ مسح المحتوى محلياً: {formatBbsBytes(bbsScanProgress.completed)} / {formatBbsBytes(bbsScanProgress.total)}. لا يتم فك أو تغيير الملف.</p></div></div>}

        {archive && (
          <div className="space-y-5">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div className="rounded-2xl border border-amber-500/30 bg-amber-500/5 p-4"><p className="text-xs text-muted-foreground">إصدار BBSA</p><p className="mt-1 font-mono text-2xl font-black text-amber-500">v{archive.version}</p></div>
              <div className="rounded-2xl border border-border bg-card/60 p-4"><p className="text-xs text-muted-foreground">الموارد المفهرسة</p><p className="mt-1 text-2xl font-black">{archive.entries.length.toLocaleString("ar")}</p></div>
              <div className="rounded-2xl border border-border bg-card/60 p-4"><p className="text-xs text-muted-foreground">ملفات DAT المرفوعة</p><p className="mt-1 text-2xl font-black">{archive.archives.size} / 5</p></div>
              <div className="rounded-2xl border border-border bg-card/60 p-4"><p className="text-xs text-muted-foreground">المحدد للتنزيل</p><p className="mt-1 text-2xl font-black">{selectedEntries.length} <span className="text-sm font-normal text-muted-foreground">· {formatBbsBytes(selectedBytes)}</span></p></div>
            </div>

            {archive.warnings.map((warning) => <div key={warning} className="flex items-start gap-3 rounded-2xl border border-amber-500/35 bg-amber-500/10 p-4 text-sm"><AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-500" /><p>{warning}</p></div>)}

            <div className="flex flex-col gap-3 rounded-2xl border border-amber-500/35 bg-amber-500/10 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex min-w-0 items-start gap-3">
                <Type className="mt-0.5 h-5 w-5 shrink-0 text-amber-500" />
                <p className="text-sm leading-relaxed">
                  {fontSelection
                    ? <><b>الخط العربي جاهز للبناء:</b> <bdi className="font-mono">{fontSelection.filename}</bdi> ← مورد الخط المؤكد داخل {fontSelection.archiveIndexes.map((index) => <bdi key={index} className="font-mono">BBS{index}.DAT </bdi>)}</>
                    : <>اختر <bdi className="font-mono font-bold">Font.arabic.arc</bdi> مرة واحدة؛ الأداة تتحقق من أرشيف الخط الحقيقي ثم تدخله عند البناء فقط.</>}
                </p>
              </div>
              <Button size="sm" disabled={selectingFont} onClick={() => fontInputRef.current?.click()} className="shrink-0 bg-amber-500 font-bold text-black hover:bg-amber-400">
                {selectingFont ? <Loader2 className="ml-1.5 h-4 w-4 animate-spin" /> : <Type className="ml-1.5 h-4 w-4" />}{selectingFont ? "جارٍ فحص الخط…" : fontSelection ? "تغيير الخط" : "اختيار الخط العربي"}
              </Button>
            </div>

            {writableWorkspace ? <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-emerald-500/35 bg-emerald-500/10 p-4 text-sm"><p className="leading-relaxed"><b>الكتابة المباشرة مفعلة.</b> افتح محرر الصور؛ أي «استبدال» أو «تركيب» يكتب TIM2 المعدل في إزاحته الأصلية داخل DAT ويتحقق من البايتات قبل اعتماد النتيجة.</p><Button asChild size="sm" className="bg-emerald-600 text-white hover:bg-emerald-500"><Link to="/kingdom-hearts-images"><Image className="ml-1.5 h-4 w-4" />تحرير صور TIM2 الأصلية</Link></Button></div> : <p className="rounded-xl border border-border bg-card/40 px-4 py-3 text-xs leading-relaxed text-muted-foreground">لفتح الصور مع الكتابة المباشرة في الأصل، أعد فتح BBS0–BBS4 من زر «فتح قابل للكتابة» أعلى الصفحة، ثم انتقل إلى محرر الصور. الرفع العادي يبقى آمناً للعرض والتنزيل فقط.</p>}

            <div className="rounded-2xl border border-border bg-card/60 p-3 md:p-4">
              <div className="flex flex-col gap-3 md:flex-row">
                <label className="flex min-w-0 flex-1 items-center gap-2 rounded-xl border border-border bg-background px-3"><Search className="h-4 w-4 shrink-0 text-muted-foreground" /><input value={query} onChange={(event) => setQuery(event.target.value)} className="h-10 min-w-0 flex-1 bg-transparent text-sm outline-none" placeholder="ابحث في المسار أو الامتداد أو رقم التجزئة مثل 0x…" /></label>
                <select value={extension} disabled={ctdChecking} onChange={(event) => setExtension(event.target.value)} className="h-12 rounded-xl border border-border bg-background px-3 text-sm disabled:cursor-wait disabled:opacity-60"><option value="all">كل الامتدادات</option><option value="ctd">ملفات CTD (.ctd)</option>{extensions.map((item) => <option key={item} value={item}>.{item}</option>)}</select>
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <Button variant="outline" size="sm" title="يفحص BBS0 على حدود القطاعات فقط ويعرض ترويسات @CTD المطابقة للفهرس" disabled={ctdChecking || !archive.archives.has(0)} onClick={() => void discoverCtd()}><Search className="ml-1.5 h-4 w-4" />{ctdChecking ? `اكتشاف CTD… ${formatBbsBytes(ctdProgress?.completed ?? 0)}/${formatBbsBytes(ctdProgress?.total ?? 0)}` : "اكتشاف CTD في BBS0"}</Button>
                <Button variant="outline" size="sm" onClick={selectVisible}><CheckSquare className="ml-1.5 h-4 w-4" />تحديد النتائج المتاحة</Button>
                <Button variant="outline" size="sm" onClick={() => setSelected(new Set())}><Square className="ml-1.5 h-4 w-4" />إلغاء التحديد</Button>
                <label className="flex h-9 cursor-pointer items-center gap-2 rounded-lg border border-border bg-background px-3 text-xs font-semibold">
                  <input type="checkbox" checked={flatZip} onChange={(event) => setFlatZip(event.target.checked)} className="h-4 w-4 accent-amber-500" />
                  مجلد واحد فقط
                </label>
                <Button size="sm" disabled={zipping || selectedEntries.length === 0} onClick={() => void downloadSelectedZip()} className="bg-amber-500 text-black hover:bg-amber-400"><Download className="ml-1.5 h-4 w-4" />{zipping ? "جارٍ بناء ZIP…" : flatZip ? "تنزيل في مجلد واحد" : "تنزيل المحدد ZIP"}</Button>
                {selectedCtdEntries.length > 0 && <Button size="sm" disabled={openingCtd} onClick={() => void openSelectedCtdInEditor()} className="bg-emerald-600 text-white hover:bg-emerald-500"><FileArchive className="ml-1.5 h-4 w-4" />{openingCtd ? "جارٍ فتح CTD…" : `فتح CTD في المحرر (${selectedCtdEntries.length})`}</Button>}
                <span className="mr-auto text-xs text-muted-foreground">{filteredEntries.length.toLocaleString("ar")} نتيجة ضمن {groups.length.toLocaleString("ar")} مجلد</span>
              </div>
              <p className="mt-2 text-xs text-muted-foreground">لا تعتمد «ملفات CTD (.ctd)» على امتداد BBSA. اضغط «اكتشاف CTD في BBS0» مرة واحدة: تقرأ الأداة BBS0 بكتل صغيرة وعلى حدود القطاعات فقط، وتعرض كل مورد يبدأ فعلياً بالترويسة <bdi>@CTD</bdi> إذا طابق فهرس BBS وحجمه المحجوز. لا تفحص 17 ألف ملف منفصلاً، وتحافظ على استجابة الهاتف. عند تفعيل «مجلد واحد فقط» تحفظ الأداة جميع الملفات داخل مجلد <bdi>khbbs-files</bdi> واحد، وتضيف رقماً تلقائياً إن تكرر الاسم.</p>
            </div>

            <div className="space-y-3">{groups.map(([directory, entries]) => <FolderGroup key={directory} directory={directory} entries={entries} selected={selected} toggleSelected={toggleSelected} onDownload={(entry) => void downloadEntry(entry)} downloadingId={downloadingId} fontCandidateIds={fontCandidateIds} />)}</div>
          </div>
        )}
      </section>
    </main>
  );
}
