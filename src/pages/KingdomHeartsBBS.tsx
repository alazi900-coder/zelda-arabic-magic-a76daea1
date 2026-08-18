/**
 * STYLE: أداة تحرير محلية عملية بهيكل "مجلد ثم نصوص"؛ اللون الكهرماني يميز
 * ملفات Kingdom Hearts، بينما تبقى القائمة الجانبية ثابتة وسهلة اللمس على الهاتف.
 * لا توجد صور أو زخرفة تغطي النصوص: المعلومة والتحرير هما الواجهة الأساسية.
 */

import { useCallback, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  AlertTriangle,
  ArrowLeft,
  Download,
  FileText,
  Files,
  FolderArchive,
  Loader2,
  PackageCheck,
  Search,
  Upload,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  buildCTD,
  editableEntryCount,
  parseCTD,
  type CTDDocument,
} from "@/lib/khbbs-ctd";

interface LoadedCTDFile {
  id: string;
  path: string;
  document: CTDDocument;
}

interface CandidateCTD {
  path: string;
  bytes: ArrayBuffer;
}

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function changesInFile(file: LoadedCTDFile): number {
  return file.document.entries.filter((entry) => entry.translation !== entry.text).length;
}

function shortPath(path: string): string {
  const segments = path.split("/");
  return segments[segments.length - 1] || path;
}

export default function KingdomHeartsBBS() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<LoadedCTDFile[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [building, setBuilding] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [filter, setFilter] = useState("");

  const selectedFile = useMemo(
    () => files.find((file) => file.id === selectedId) ?? null,
    [files, selectedId],
  );
  const totalStrings = useMemo(
    () => files.reduce((total, file) => total + editableEntryCount(file.document), 0),
    [files],
  );
  const totalChanges = useMemo(
    () => files.reduce((total, file) => total + changesInFile(file), 0),
    [files],
  );
  const displayedEntries = useMemo(() => {
    if (!selectedFile) return [];
    const normalized = filter.trim().toLowerCase();
    return selectedFile.document.entries.filter((entry) => {
      if (!entry.editable) return false;
      if (!normalized) return true;
      return (
        entry.index.toString().includes(normalized) ||
        entry.id.toString(16).includes(normalized) ||
        entry.text.toLowerCase().includes(normalized) ||
        entry.translation.toLowerCase().includes(normalized)
      );
    });
  }, [filter, selectedFile]);

  const clearFiles = useCallback(() => {
    setFiles([]);
    setSelectedId(null);
    setFilter("");
    setError(null);
    setNotice(null);
  }, []);

  const loadUploads = useCallback(async (uploads: File[]) => {
    if (!uploads.length) return;
    setLoading(true);
    setError(null);
    setNotice(null);

    try {
      const candidates: CandidateCTD[] = [];
      const rejected: string[] = [];
      const JSZip = (await import("jszip")).default;

      for (const upload of uploads) {
        const lowercaseName = upload.name.toLowerCase();
        if (lowercaseName.endsWith(".ctd")) {
          candidates.push({ path: upload.name, bytes: await upload.arrayBuffer() });
          continue;
        }

        if (lowercaseName.endsWith(".zip")) {
          try {
            const archive = await JSZip.loadAsync(upload);
            const members = Object.values(archive.files)
              .filter((member) => !member.dir && member.name.toLowerCase().endsWith(".ctd"))
              .sort((a, b) => a.name.localeCompare(b.name));
            if (!members.length) {
              rejected.push(`${upload.name}: لا يحتوي ملفات ‎.ctd‎`);
              continue;
            }
            for (const member of members) {
              candidates.push({ path: member.name, bytes: await member.async("arraybuffer") });
            }
            continue;
          } catch {
            rejected.push(`${upload.name}: ملف ZIP غير صالح أو غير قابل للقراءة`);
            continue;
          }
        }

        rejected.push(`${upload.name}: النوع غير مدعوم`);
      }

      const parsed: LoadedCTDFile[] = [];
      const usedPaths = new Set<string>();
      for (const candidate of candidates) {
        if (usedPaths.has(candidate.path)) {
          rejected.push(`${candidate.path}: اسم مكرر داخل الملفات المفتوحة`);
          continue;
        }
        try {
          const document = parseCTD(candidate.bytes);
          usedPaths.add(candidate.path);
          parsed.push({
            id: `${candidate.path}-${parsed.length}`,
            path: candidate.path,
            document,
          });
        } catch (parseError) {
          rejected.push(
            `${candidate.path}: ${parseError instanceof Error ? parseError.message : "تعذر تحليل ملف CTD"}`,
          );
        }
      }

      if (!parsed.length) {
        throw new Error(rejected.length ? rejected.join("\n") : "لم يتم العثور على أي ملف CTD صالح.");
      }

      setFiles(parsed);
      setSelectedId(parsed[0].id);
      setFilter("");
      setNotice(`تم فتح ${parsed.length} ملف CTD، وفيها ${parsed.reduce((total, file) => total + editableEntryCount(file.document), 0)} نص غير فارغ.`);
      if (rejected.length) setError(`تم فتح الملفات الصالحة، لكن تعذر فتح ${rejected.length} عنصر:\n${rejected.join("\n")}`);
    } catch (loadError) {
      setFiles([]);
      setSelectedId(null);
      setError(loadError instanceof Error ? loadError.message : "تعذر فتح الملفات.");
    } finally {
      setLoading(false);
    }
  }, []);

  const handleInput = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const uploads = Array.from(event.target.files ?? []);
    event.target.value = "";
    void loadUploads(uploads);
  }, [loadUploads]);

  const handleDrop = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragActive(false);
    if (loading) return;
    void loadUploads(Array.from(event.dataTransfer.files));
  }, [loadUploads, loading]);

  const updateTranslation = useCallback((entryIndex: number, translation: string) => {
    if (!selectedId) return;
    setFiles((previous) => previous.map((file) => {
      if (file.id !== selectedId) return file;
      return {
        ...file,
        document: {
          ...file.document,
          entries: file.document.entries.map((entry) => (
            entry.index === entryIndex ? { ...entry, translation } : entry
          )),
        },
      };
    }));
  }, [selectedId]);

  const buildArchive = useCallback(async () => {
    if (!files.length) return;
    setBuilding(true);
    setError(null);
    setNotice(null);
    try {
      const JSZip = (await import("jszip")).default;
      const archive = new JSZip();
      for (const file of files) {
        archive.file(file.path, buildCTD(file.document));
      }
      const blob = await archive.generateAsync({
        type: "blob",
        compression: "DEFLATE",
        compressionOptions: { level: 6 },
      });
      downloadBlob(blob, "kingdom-hearts-bbs-ctd-modified.zip");
      setNotice(`تم بناء أرشيف ZIP واحد يضم ${files.length} ملف CTD بأسمائها ومساراتها الأصلية.`);
    } catch (buildError) {
      setError(buildError instanceof Error ? buildError.message : "تعذر بناء أرشيف CTD.");
    } finally {
      setBuilding(false);
    }
  }, [files]);

  return (
    <main dir="rtl" className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border bg-card/70 backdrop-blur">
        <div className="max-w-7xl mx-auto px-4 py-4 flex flex-wrap items-center gap-3 justify-between">
          <div className="flex items-center gap-3 min-w-0">
            <Link to="/" className="shrink-0 inline-flex items-center justify-center w-10 h-10 rounded-xl border border-border hover:border-amber-500/60 hover:text-amber-500 transition-colors" aria-label="العودة للرئيسية">
              <ArrowLeft className="w-5 h-5" />
            </Link>
            <div className="min-w-0">
              <p className="text-xs font-mono text-amber-500">PSP · CTD TEXT CONTAINERS</p>
              <h1 className="font-display text-xl md:text-2xl font-black truncate">Kingdom Hearts: Birth by Sleep</h1>
            </div>
          </div>
          {files.length > 0 && (
            <Button onClick={() => void buildArchive()} disabled={building} className="bg-amber-500 hover:bg-amber-400 text-black font-bold shrink-0">
              {building ? <Loader2 className="w-4 h-4 ml-2 animate-spin" /> : <PackageCheck className="w-4 h-4 ml-2" />}
              {building ? "جارٍ بناء ZIP" : "بناء كل الملفات"}
            </Button>
          )}
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 py-6">
        {!files.length && (
          <section
            onDragOver={(event) => { event.preventDefault(); setDragActive(true); }}
            onDragLeave={() => setDragActive(false)}
            onDrop={handleDrop}
            className={`max-w-3xl mx-auto border-2 border-dashed rounded-3xl p-8 md:p-14 text-center transition-colors ${dragActive ? "border-amber-500 bg-amber-500/10" : "border-border bg-card/40"}`}
          >
            <div className="w-16 h-16 mx-auto mb-5 rounded-2xl bg-amber-500/15 text-amber-500 flex items-center justify-center">
              <FolderArchive className="w-8 h-8" />
            </div>
            <h2 className="font-display text-2xl font-black mb-3">افتح ملفات النصوص كلها دفعة واحدة</h2>
            <p className="max-w-xl mx-auto text-muted-foreground leading-relaxed mb-6">
              ارفع ملفات <bdi>.CTD</bdi> منفردة متعددة، أو أرشيف <bdi>ZIP</bdi> يحتويها. ستظهر كل الملفات باسمها، ويمكنك تحرير نصوص كل ملف ثم تنزيل أرشيف واحد للملفات المعدّلة.
            </p>
            <input ref={inputRef} type="file" accept=".ctd,.zip,application/zip" multiple className="hidden" onChange={handleInput} />
            <Button onClick={() => inputRef.current?.click()} disabled={loading} size="lg" className="bg-amber-500 hover:bg-amber-400 text-black font-bold">
              {loading ? <Loader2 className="w-5 h-5 ml-2 animate-spin" /> : <Upload className="w-5 h-5 ml-2" />}
              {loading ? "جارٍ فتح الملفات" : "اختر ملفات CTD أو ZIP"}
            </Button>
            <p className="text-xs text-muted-foreground mt-5">المعالجة محلية داخل المتصفح؛ لا يُرفع ملف اللعبة إلى خادم.</p>
          </section>
        )}

        {(error || notice) && (
          <div className="mt-4 space-y-3">
            {notice && <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-700 dark:text-emerald-300">{notice}</div>}
            {error && (
              <div className="rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm whitespace-pre-line flex gap-3 items-start">
                <AlertTriangle className="w-5 h-5 shrink-0 text-destructive mt-0.5" />
                <span>{error}</span>
              </div>
            )}
          </div>
        )}

        {files.length > 0 && (
          <section className="mt-2 space-y-4">
            <div className="grid grid-cols-3 gap-3">
              <div className="rounded-2xl border border-border bg-card p-3 md:p-4"><p className="text-xs text-muted-foreground">الملفات المفتوحة</p><p className="font-display text-xl md:text-2xl font-black text-amber-500">{files.length}</p></div>
              <div className="rounded-2xl border border-border bg-card p-3 md:p-4"><p className="text-xs text-muted-foreground">النصوص المعروضة</p><p className="font-display text-xl md:text-2xl font-black">{totalStrings}</p></div>
              <div className="rounded-2xl border border-border bg-card p-3 md:p-4"><p className="text-xs text-muted-foreground">ترجمات معدلة</p><p className="font-display text-xl md:text-2xl font-black text-emerald-500">{totalChanges}</p></div>
            </div>

            <div className="rounded-2xl border border-amber-500/25 bg-amber-500/5 p-4 text-sm leading-relaxed flex gap-3">
              <AlertTriangle className="w-5 h-5 shrink-0 text-amber-500 mt-0.5" />
              <p><b>وسوم التحكم محمية:</b> تظهر ضمن النص بالصيغة <code dir="ltr" className="px-1 py-0.5 rounded bg-background">[CTD:F9 59]</code>. لا تحذفها ولا تغيّر ترتيبها؛ الباني يوقف الملف إذا تغيّرت. تُطبّق معالجة العربية المعتمدة في الأداة عند البناء، لكن هذا القسم لا يحقن خط اللعبة أو جدول ترميزها.</p>
            </div>

            <div className="grid lg:grid-cols-[19rem_minmax(0,1fr)] gap-4 items-start">
              <aside className="lg:sticky lg:top-4 rounded-2xl border border-border bg-card overflow-hidden">
                <div className="p-3 border-b border-border flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 font-display font-bold"><Files className="w-4 h-4 text-amber-500" /> ملفات CTD</div>
                  <Button variant="ghost" size="icon" onClick={clearFiles} title="إغلاق جميع الملفات"><X className="w-4 h-4" /></Button>
                </div>
                <div className="max-h-[38vh] lg:max-h-[65vh] overflow-y-auto p-2">
                  {files.map((file) => {
                    const selected = file.id === selectedId;
                    const changes = changesInFile(file);
                    return (
                      <button
                        key={file.id}
                        onClick={() => { setSelectedId(file.id); setFilter(""); }}
                        className={`w-full text-right rounded-xl px-3 py-3 mb-1 transition-colors ${selected ? "bg-amber-500 text-black" : "hover:bg-muted"}`}
                      >
                        <div className="flex gap-2 items-start"><FileText className="w-4 h-4 shrink-0 mt-0.5" /><span className="font-mono text-xs leading-relaxed break-all">{shortPath(file.path)}</span></div>
                        <div className={`mt-1 pr-6 text-xs ${selected ? "text-black/70" : "text-muted-foreground"}`}>{editableEntryCount(file.document)} نص{changes ? ` · ${changes} معدّل` : ""}</div>
                      </button>
                    );
                  })}
                </div>
              </aside>

              <section className="rounded-2xl border border-border bg-card min-w-0 overflow-hidden">
                {selectedFile && (
                  <>
                    <div className="p-4 border-b border-border flex flex-col md:flex-row md:items-center gap-3 justify-between">
                      <div className="min-w-0"><p className="text-xs text-amber-500 font-mono">{selectedFile.path}</p><h2 className="font-display text-lg font-black">{editableEntryCount(selectedFile.document)} نص قابل للتحرير</h2></div>
                      <label className="relative block md:w-72"><Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" /><Input value={filter} onChange={(event) => setFilter(event.target.value)} placeholder="ابحث داخل النص الحالي" className="pr-9" /></label>
                    </div>

                    <div className="p-3 md:p-4 space-y-3">
                      {displayedEntries.map((entry) => (
                        <article key={entry.index} className="rounded-xl border border-border bg-background overflow-hidden">
                          <div className="px-3 py-2 border-b border-border bg-muted/35 flex flex-wrap gap-x-3 gap-y-1 items-center text-xs">
                            <span className="font-mono text-amber-600 dark:text-amber-400">#{entry.index + 1}</span>
                            <span className="font-mono text-muted-foreground">ID 0x{entry.id.toString(16).toUpperCase().padStart(8, "0")}</span>
                            {entry.rawControlBytes.length > 0 && <span className="rounded-full bg-amber-500/15 text-amber-700 dark:text-amber-300 px-2 py-0.5">وسوم تقنية محمية</span>}
                          </div>
                          <div className="grid xl:grid-cols-2 divide-y xl:divide-y-0 xl:divide-x divide-border" dir="ltr">
                            <div className="p-3"><p className="text-[11px] uppercase tracking-wider text-muted-foreground mb-1">ORIGINAL</p><p className="font-mono text-sm whitespace-pre-wrap break-words leading-6 min-h-12" dir="ltr">{entry.text}</p></div>
                            <div className="p-3" dir="rtl"><label className="text-[11px] uppercase tracking-wider text-muted-foreground mb-1 block">الترجمة</label><textarea value={entry.translation} onChange={(event) => updateTranslation(entry.index, event.target.value)} dir="auto" rows={Math.max(3, Math.min(7, entry.translation.split("\n").length + 1))} className="w-full resize-y rounded-lg border border-input bg-background px-3 py-2 font-sans text-sm leading-6 outline-none focus:ring-2 focus:ring-amber-500/50" /></div>
                          </div>
                        </article>
                      ))}
                      {!displayedEntries.length && <div className="py-12 text-center text-muted-foreground">لا توجد نصوص مطابقة للبحث الحالي.</div>}
                    </div>
                  </>
                )}
              </section>
            </div>

            <div className="flex flex-wrap justify-between items-center gap-3 rounded-2xl border border-border bg-card p-4">
              <p className="text-sm text-muted-foreground">سيحفظ ZIP الناتج كل الملفات المفتوحة بالمسار والاسم نفسيهما.</p>
              <Button onClick={() => void buildArchive()} disabled={building} className="bg-amber-500 hover:bg-amber-400 text-black font-bold">
                {building ? <Loader2 className="w-4 h-4 ml-2 animate-spin" /> : <Download className="w-4 h-4 ml-2" />}
                {building ? "جارٍ البناء" : "نزّل ZIP المعدّل"}
              </Button>
            </div>
          </section>
        )}
      </div>
    </main>
  );
}
