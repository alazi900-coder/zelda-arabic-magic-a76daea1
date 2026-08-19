/**
 * STYLE: مدير موارد Kingdom Hearts عملي كهرماني، مهيأ للهاتف، يقرأ DAT محلياً
 * ويعطي المستخدم فهرساً واضحاً وتنزيلاً مباشراً من دون أي تعديل على ملفات اللعبة.
 */

import { useCallback, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, ArrowLeft, CheckSquare, ChevronDown, Download, FileArchive, FileDown, Files, FolderOpen, Loader2, Search, Square, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { indexKHBbsDatFiles, formatBbsBytes, formatBbsHash, getBbsEntryFilename, isKHBbsFontArchive, readBbsArchiveEntry, type BbsArchiveEntry, type BbsArchiveIndex } from "@/lib/khbbs-bbsa";

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
                    {isFontCandidate ? "تم التعرّف عليه من mesfont وcmdfont · " : ""}{entry.isVerifiedCtd ? "CTD مؤكّد بالترويسة · " : entry.ctdVerification === "mismatch" ? "ليست CTD؛ تم تصحيح الامتداد · " : entry.ctdVerification === "unavailable" ? "تعذر فحص CTD لعدم توفر DAT · " : ""}{formatBbsHash(entry.fileHash)} · BBS{entry.archiveIndex}.DAT · {formatBbsBytes(entry.allocatedBytes)} · {entry.isStreamed ? "تدفق غير قابل للتنزيل" : entry.downloadAvailable ? "جاهز" : "DAT المصدر غير مرفوع"}
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

  const openArchives = useCallback(async (uploads: File[]) => {
    setLoading(true);
    setError(null);
    setSelected(new Set());
    setFontCandidateIds(new Set());
    try {
      const indexed = await indexKHBbsDatFiles(uploads);
      setArchive(indexed);
      const systemArcs = indexed.entries.filter((entry) => entry.directory === "arc/system" && entry.extension === "arc" && entry.downloadAvailable);
      const checks = await Promise.all(systemArcs.map(async (entry) => ({ id: entry.id, isFont: await isKHBbsFontArchive(entry, indexed.archives) })));
      setFontCandidateIds(new Set(checks.filter((item) => item.isFont).map((item) => item.id)));
    } catch (caught) {
      setArchive(null);
      setError(caught instanceof Error ? caught.message : "تعذر قراءة فهرس ملفات DAT.");
    } finally {
      setLoading(false);
    }
  }, []);

  const filteredEntries = useMemo(() => {
    if (!archive) return [];
    const normalizedQuery = query.trim().toLowerCase();
    return archive.entries.filter((entry) => {
      const matchesExtension = extension === "all" || (extension === "confirmed-ctd" ? entry.isVerifiedCtd : entry.extension === extension);
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

  const extensions = useMemo(() => [...new Set(archive?.entries.map((entry) => entry.extension) ?? [])].sort(), [archive]);
  const selectedEntries = useMemo(() => filteredEntries.filter((entry) => selected.has(entry.id) && entry.downloadAvailable), [filteredEntries, selected]);
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
          <Button onClick={() => inputRef.current?.click()} disabled={loading} className="bg-amber-500 font-bold text-black hover:bg-amber-400">
            {loading ? <Loader2 className="ml-2 h-4 w-4 animate-spin" /> : <Upload className="ml-2 h-4 w-4" />}رفع DAT
          </Button>
        </div>
      </header>

      <section className="mx-auto max-w-6xl px-4 py-7 md:py-10">
        <input ref={inputRef} type="file" accept=".dat,application/octet-stream" multiple className="hidden" onChange={(event) => { const uploads = Array.from(event.target.files ?? []); event.target.value = ""; void openArchives(uploads); }} />

        {!archive && !loading && (
          <div className="rounded-3xl border-2 border-dashed border-amber-500/40 bg-card/50 p-7 text-center md:p-12">
            <Files className="mx-auto mb-5 h-12 w-12 text-amber-500" />
            <h2 className="font-display text-2xl font-black">افتح أرشيفات BBS0–BBS4.DAT</h2>
            <p className="mx-auto mt-3 max-w-2xl leading-relaxed text-muted-foreground">اختر ملفات <bdi>BBS0.DAT</bdi> إلى <bdi>BBS4.DAT</bdi> معاً من <bdi>PSP_GAME/USRDIR</bdi>. يقرأ المدير الفهرس من BBS0 ثم يعرض الموارد حسب المجلد والامتداد ويسمح بتنزيلها محلياً.</p>
            <Button onClick={() => inputRef.current?.click()} size="lg" className="mt-6 bg-amber-500 font-bold text-black hover:bg-amber-400"><Upload className="ml-2 h-5 w-5" />اختر ملفات DAT</Button>
            <p className="mt-5 text-xs text-muted-foreground">هذه الأداة لا تفك تشفير DAT ولا تعيد بناءه ولا تغيّر أي بايت؛ التنزيل يسحب نطاقات القطاعات الأصلية فقط.</p>
          </div>
        )}

        {loading && <div className="flex items-center justify-center gap-3 rounded-3xl border border-border bg-card/50 p-12 text-muted-foreground"><Loader2 className="h-6 w-6 animate-spin text-amber-500" />جارٍ قراءة فهرس BBS0.DAT…</div>}

        {error && <div className="mt-5 flex items-start gap-3 rounded-2xl border border-destructive/40 bg-destructive/10 p-4 text-sm"><AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" /><p>{error}</p></div>}

        {archive && (
          <div className="space-y-5">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div className="rounded-2xl border border-amber-500/30 bg-amber-500/5 p-4"><p className="text-xs text-muted-foreground">إصدار BBSA</p><p className="mt-1 font-mono text-2xl font-black text-amber-500">v{archive.version}</p></div>
              <div className="rounded-2xl border border-border bg-card/60 p-4"><p className="text-xs text-muted-foreground">الموارد المفهرسة</p><p className="mt-1 text-2xl font-black">{archive.entries.length.toLocaleString("ar")}</p></div>
              <div className="rounded-2xl border border-border bg-card/60 p-4"><p className="text-xs text-muted-foreground">ملفات DAT المرفوعة</p><p className="mt-1 text-2xl font-black">{archive.archives.size} / 5</p></div>
              <div className="rounded-2xl border border-border bg-card/60 p-4"><p className="text-xs text-muted-foreground">المحدد للتنزيل</p><p className="mt-1 text-2xl font-black">{selectedEntries.length} <span className="text-sm font-normal text-muted-foreground">· {formatBbsBytes(selectedBytes)}</span></p></div>
            </div>

            {archive.warnings.map((warning) => <div key={warning} className="flex items-start gap-3 rounded-2xl border border-amber-500/35 bg-amber-500/10 p-4 text-sm"><AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-500" /><p>{warning}</p></div>)}

            <div className="rounded-2xl border border-border bg-card/60 p-3 md:p-4">
              <div className="flex flex-col gap-3 md:flex-row">
                <label className="flex min-w-0 flex-1 items-center gap-2 rounded-xl border border-border bg-background px-3"><Search className="h-4 w-4 shrink-0 text-muted-foreground" /><input value={query} onChange={(event) => setQuery(event.target.value)} className="h-10 min-w-0 flex-1 bg-transparent text-sm outline-none" placeholder="ابحث في المسار أو الامتداد أو رقم التجزئة مثل 0x…" /></label>
                <select value={extension} onChange={(event) => setExtension(event.target.value)} className="h-12 rounded-xl border border-border bg-background px-3 text-sm"><option value="all">كل الامتدادات</option><option value="confirmed-ctd">CTD مؤكّد بالترويسة</option>{extensions.map((item) => <option key={item} value={item}>.{item}</option>)}</select>
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <Button variant="outline" size="sm" onClick={selectVisible}><CheckSquare className="ml-1.5 h-4 w-4" />تحديد النتائج المتاحة</Button>
                <Button variant="outline" size="sm" onClick={() => setSelected(new Set())}><Square className="ml-1.5 h-4 w-4" />إلغاء التحديد</Button>
                <label className="flex h-9 cursor-pointer items-center gap-2 rounded-lg border border-border bg-background px-3 text-xs font-semibold">
                  <input type="checkbox" checked={flatZip} onChange={(event) => setFlatZip(event.target.checked)} className="h-4 w-4 accent-amber-500" />
                  مجلد واحد فقط
                </label>
                <Button size="sm" disabled={zipping || selectedEntries.length === 0} onClick={() => void downloadSelectedZip()} className="bg-amber-500 text-black hover:bg-amber-400"><Download className="ml-1.5 h-4 w-4" />{zipping ? "جارٍ بناء ZIP…" : flatZip ? "تنزيل في مجلد واحد" : "تنزيل المحدد ZIP"}</Button>
                <span className="mr-auto text-xs text-muted-foreground">{filteredEntries.length.toLocaleString("ar")} نتيجة ضمن {groups.length.toLocaleString("ar")} مجلد</span>
              </div>
              <p className="mt-2 text-xs text-muted-foreground">ملفات <bdi>CTD</bdi> لا تظهر بهذا الامتداد إلا بعد مطابقة ترويسة <bdi>@CTD</bdi> الفعلية. عند تفعيل «مجلد واحد فقط» تحفظ الأداة جميع الملفات داخل مجلد <bdi>khbbs-files</bdi> واحد، وتضيف رقماً تلقائياً إن تكرر الاسم.</p>
            </div>

            <div className="space-y-3">{groups.map(([directory, entries]) => <FolderGroup key={directory} directory={directory} entries={entries} selected={selected} toggleSelected={toggleSelected} onDownload={(entry) => void downloadEntry(entry)} downloadingId={downloadingId} fontCandidateIds={fontCandidateIds} />)}</div>
          </div>
        )}
      </section>
    </main>
  );
}
