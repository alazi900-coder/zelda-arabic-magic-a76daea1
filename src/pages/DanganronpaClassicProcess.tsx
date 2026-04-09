import { useState, useCallback, useRef, useMemo } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import { Upload, FileText, ArrowRight, Download, Loader2, ArrowLeft, BookOpen, Eye, FolderOpen, Package } from "lucide-react";
import { parseLin } from "@/lib/danganronpa-lin-parser";
import { parsePak, parseLin0Container, type PakEntry } from "@/lib/danganronpa-pak-parser";
import { parsePo } from "@/lib/danganronpa-po-parser";
import { idbSet } from "@/lib/idb-storage";
import { type ArchiveNode, rebuildArchive, nodeHasTranslations } from "@/lib/danganronpa-rebuild";

interface ParsedEntry {
  key: string;
  original: string;
  translation: string;
  sourceFile: string;
  /** Top-level file this entry came from (the file user uploaded) */
  rootFile: string;
}

interface FileInfo {
  name: string;
  type: "pak" | "lin" | "po" | "json";
  linCount?: number;
  poCount?: number;
  stringCount?: number;
}

export default function DanganronpaClassicProcess() {
  const { toast } = useToast();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const isDr2 = searchParams.get("dr2") === "1";
  const fileInputRef = useRef<HTMLInputElement>(null);
  const glossaryInputRef = useRef<HTMLInputElement>(null);

  const [entries, setEntries] = useState<ParsedEntry[]>([]);
  const [glossary, setGlossary] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadedFiles, setLoadedFiles] = useState<FileInfo[]>([]);
  const [archiveTrees, setArchiveTrees] = useState<Map<string, ArchiveNode>>(new Map());

  // Per-file progress calculation
  const fileProgress = useMemo(() => {
    const map = new Map<string, { total: number; translated: number }>();
    for (const e of entries) {
      const root = e.rootFile;
      if (!map.has(root)) map.set(root, { total: 0, translated: 0 });
      const stats = map.get(root)!;
      stats.total++;
      if (e.translation.trim()) stats.translated++;
    }
    return map;
  }, [entries]);

  const processLin = useCallback((name: string, buffer: ArrayBuffer): ParsedEntry[] => {
    const lin = parseLin(buffer, isDr2);
    return lin.strings
      .filter(s => s.trim())
      .map((str, i) => ({
        key: `${name}:${i}`,
        original: str,
        translation: "",
        sourceFile: name,
        rootFile: "",
      }));
  }, [isDr2]);

  const processPo = useCallback((name: string, buffer: ArrayBuffer): ParsedEntry[] => {
    const poEntries = parsePo(buffer);
    return poEntries
      .filter(entry => entry.original.trim())
      .map((entry, i) => ({
        key: `${name}:${i}`,
        original: entry.original,
        translation: entry.translation || "",
        sourceFile: name,
        rootFile: "",
      }));
  }, []);

  const extractFromBuffer = useCallback((
    name: string,
    buffer: ArrayBuffer,
    results: { entries: ParsedEntry[]; linCount: number; poCount: number },
    depth = 0,
  ): ArchiveNode | null => {
    const pad = "  ".repeat(depth);
    const bytes = new Uint8Array(buffer);
    const magic = bytes.length >= 4 ? String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3]) : "(short)";
    console.log(`${pad}[extract] 📂 "${name}" — ${buffer.byteLength} bytes — magic: "${magic}"`);

    // 1) Try as PO
    const poEntries = processPo(name, buffer);
    if (poEntries.length > 0) {
      console.log(`${pad}  ✅ PO: ${poEntries.length} entries`);
      results.poCount++;
      results.entries.push(...poEntries);
      return { name, format: "po", originalBuffer: buffer, entryKeys: poEntries.map(e => e.key) };
    }

    // 2) Try as LIN0 container
    const lin0Entries = parseLin0Container(buffer);
    if (lin0Entries) {
      console.log(`${pad}  ✅ LIN0 container: ${lin0Entries.length} files`);
      const children: ArchiveNode[] = [];
      for (const entry of lin0Entries) {
        const childName = entry.name || `${name}:${entry.index}`;
        const childNode = extractFromBuffer(childName, entry.data, results, depth + 1);
        if (childNode) children.push(childNode);
        else children.push({ name: childName, format: "raw", originalBuffer: entry.data });
      }
      return { name, format: "lin0", originalBuffer: buffer, children };
    }

    // 3) Try as PAK container
    try {
      const pakEntries = parsePak(buffer);
      if (pakEntries.length > 0) {
        let fmt: ArchiveNode["format"] = "pak-offset";
        if (magic === "PAK0") fmt = "pak0";
        else {
          const view = new DataView(buffer);
          const fc = view.getUint32(0, true);
          if (fc > 0 && fc < 100000) {
            const headerOs = 4 + fc * 8;
            if (headerOs <= buffer.byteLength) {
              const firstOff = view.getUint32(4, true);
              if (firstOff >= headerOs) fmt = "pak-offset-size";
            }
          }
        }
        console.log(`${pad}  ✅ PAK (${fmt}): ${pakEntries.length} files`);
        const children: ArchiveNode[] = [];
        for (const entry of pakEntries) {
          const childName = entry.name || `${name}:${entry.index}`;
          const childNode = extractFromBuffer(childName, entry.data, results, depth + 1);
          if (childNode) children.push(childNode);
          else children.push({ name: childName, format: "raw", originalBuffer: entry.data });
        }
        return { name, format: fmt, originalBuffer: buffer, children };
      }
    } catch (err) {
      console.log(`${pad}  ❌ Not PAK: ${err}`);
    }

    // 4) Try as classic LIN script
    try {
      const parsed = processLin(name, buffer);
      if (parsed.length > 0) {
        console.log(`${pad}  ✅ Classic LIN: ${parsed.length} entries`);
        results.linCount++;
        results.entries.push(...parsed);
        return { name, format: "classic-lin", originalBuffer: buffer, entryKeys: parsed.map(e => e.key) };
      }
    } catch (err) {
      console.log(`${pad}  ❌ Not classic LIN: ${err}`);
    }

    // 5) Try as raw UTF-16LE text
    if (bytes.length >= 2) {
      const hasBom = bytes[0] === 0xFF && bytes[1] === 0xFE;
      if (hasBom || bytes.length >= 4) {
        try {
          const startOffset = hasBom ? 2 : 0;
          const textBytes = bytes.slice(startOffset);
          let isUtf16 = false;
          if (textBytes.length >= 2) {
            const view16 = new DataView(textBytes.buffer, textBytes.byteOffset, textBytes.byteLength);
            let printableCount = 0;
            for (let j = 0; j + 1 < textBytes.length; j += 2) {
              const ch = view16.getUint16(j, true);
              if (ch === 0) break;
              if ((ch >= 0x20 && ch < 0x7F) || (ch >= 0x0600 && ch <= 0x06FF) || ch === 0x0A || ch === 0x0D || ch === 0x1FFF) {
                printableCount++;
              }
            }
            isUtf16 = printableCount >= 1;
          }
          if (isUtf16) {
            let str = "";
            const view16 = new DataView(textBytes.buffer, textBytes.byteOffset, textBytes.byteLength);
            for (let j = 0; j + 1 < textBytes.length; j += 2) {
              const ch = view16.getUint16(j, true);
              if (ch === 0) break;
              if (ch === 0x1FFF) continue;
              str += String.fromCharCode(ch);
            }
            str = str.trim();
            if (str.length > 0) {
              console.log(`${pad}  ✅ UTF-16LE text: "${str.substring(0, 50)}..."`);
              const entryKey = `${name}`;
              results.entries.push({
                key: entryKey, original: str, translation: "",
                sourceFile: name.split(":")[0] || name, rootFile: "",
              });
              return { name, format: "utf16le", originalBuffer: buffer, entryKeys: [entryKey] };
            }
          }
        } catch { /* not UTF-16 */ }
      }
    }

    // 6) Raw PO markers fallback
    const text = new TextDecoder("utf-8", { fatal: false }).decode(bytes);
    if (text.includes('msgid "') || text.includes('msgctxt "')) {
      const fallbackPo = processPo(name, buffer);
      if (fallbackPo.length > 0) {
        console.log(`${pad}  ✅ Raw PO fallback: ${fallbackPo.length} entries`);
        results.poCount++;
        results.entries.push(...fallbackPo);
        return { name, format: "po", originalBuffer: buffer, entryKeys: fallbackPo.map(e => e.key) };
      }
    }

    // 7) Brute-force scan for LIN0/PAK0 signatures
    if (buffer.byteLength > 16) {
      const signatures = [
        { magic: [0x4C, 0x49, 0x4E, 0x30], label: "LIN0" },
        { magic: [0x50, 0x41, 0x4B, 0x30], label: "PAK0" },
      ];
      let foundAnything = false;
      const children: ArchiveNode[] = [];
      for (let offset = 0; offset <= bytes.length - 8; offset++) {
        for (const sig of signatures) {
          if (bytes[offset] === sig.magic[0] && bytes[offset+1] === sig.magic[1] &&
              bytes[offset+2] === sig.magic[2] && bytes[offset+3] === sig.magic[3]) {
            const subBuffer = buffer.slice(offset);
            try {
              const subResults = { entries: [] as ParsedEntry[], linCount: 0, poCount: 0 };
              const subNode = extractFromBuffer(`${name}@${offset}`, subBuffer, subResults, depth + 1);
              if (subResults.entries.length > 0) {
                results.entries.push(...subResults.entries);
                results.linCount += subResults.linCount;
                results.poCount += subResults.poCount;
                if (subNode) children.push(subNode);
                foundAnything = true;
              }
            } catch { /* ignore */ }
          }
        }
      }
      if (foundAnything) {
        return { name, format: "raw", originalBuffer: buffer, children };
      }
    }

    console.log(`${pad}  ⚠️ NO TEXT FOUND in "${name}"`);
    return null;
  }, [processLin, processPo]);

  const handleFileUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files?.length) return;
    setLoading(true);

    const newLoaded: FileInfo[] = [...loadedFiles];
    const newEntries: ParsedEntry[] = [...entries];
    const newTrees = new Map(archiveTrees);

    try {
      for (const file of Array.from(files)) {
        const ext = file.name.split(".").pop()?.toLowerCase();
        const buffer = await file.arrayBuffer();

        if (ext === "pak" || ext === "lin") {
          const results = { entries: [] as ParsedEntry[], linCount: 0, poCount: 0 };
          const tree = extractFromBuffer(file.name, buffer, results);

          // Tag all entries with rootFile
          for (const entry of results.entries) {
            entry.rootFile = file.name;
          }

          if (tree) newTrees.set(file.name, tree);

          for (const entry of results.entries) {
            const idx = newEntries.findIndex(e => e.key === entry.key);
            if (idx >= 0) newEntries[idx] = entry;
            else newEntries.push(entry);
          }

          newLoaded.push({
            name: file.name, type: ext as "pak" | "lin",
            linCount: results.linCount || undefined,
            poCount: results.poCount || undefined,
            stringCount: results.entries.length,
          });

          toast({
            title: `تم تحميل ${file.name}`,
            description: `${results.poCount} ملف PO — ${results.linCount} ملف LIN — ${results.entries.length} نص`,
          });
        } else if (ext === "po") {
          try {
            const parsed = processPo(file.name, buffer);
            for (const p of parsed) p.rootFile = file.name;
            const filtered = newEntries.filter(e => e.sourceFile !== file.name);
            filtered.push(...parsed);
            newEntries.length = 0;
            newEntries.push(...filtered);

            newTrees.set(file.name, {
              name: file.name, format: "po", originalBuffer: buffer,
              entryKeys: parsed.map(e => e.key),
            });

            newLoaded.push({ name: file.name, type: "po", stringCount: parsed.length });
            toast({ title: `تم تحميل ${file.name}`, description: `${parsed.length} نص من PO` });
          } catch (err) {
            toast({ title: `خطأ في ${file.name}`, description: String(err), variant: "destructive" });
          }
        } else if (ext === "json") {
          try {
            const text = await file.text();
            const json = JSON.parse(text);
            if (Array.isArray(json)) {
              for (const item of json) {
                if (item.key && item.original) {
                  const idx = newEntries.findIndex(e => e.key === item.key);
                  if (idx >= 0) {
                    newEntries[idx].translation = item.translation || "";
                  } else {
                    newEntries.push({
                      key: item.key, original: item.original,
                      translation: item.translation || "",
                      sourceFile: item.sourceFile || file.name,
                      rootFile: item.rootFile || file.name,
                    });
                  }
                }
              }
            }
            newLoaded.push({ name: file.name, type: "json" });
            toast({ title: `تم استيراد ${file.name}` });
          } catch {
            toast({ title: "خطأ في JSON", variant: "destructive" });
          }
        }
      }

      setEntries(newEntries);
      setLoadedFiles(newLoaded);
      setArchiveTrees(newTrees);
    } catch (err) {
      toast({ title: "خطأ في القراءة", description: String(err), variant: "destructive" });
    } finally {
      setLoading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }, [entries, loadedFiles, archiveTrees, processLin, processPo, isDr2, toast, extractFromBuffer]);

  const handleGlossaryUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    setGlossary(text);
    toast({ title: "تم تحميل القاموس" });
  }, [toast]);

  const openInEditor = useCallback(async () => {
    if (!entries.length) return;
    const editorEntries = entries.map((e, i) => ({
      msbtFile: e.key,
      index: i,
      label: e.key,
      original: e.original,
    }));
    const editorTranslations: Record<string, string> = {};
    for (const e of entries) {
      const editorKey = `${e.key}:${entries.indexOf(e)}`;
      if (e.translation) editorTranslations[editorKey] = e.translation;
    }

    // Save archive trees for rebuilding from the editor
    const treesObj: Record<string, ArchiveNode> = {};
    for (const [k, v] of archiveTrees) treesObj[k] = v;

    await idbSet("editorState", {
      entries: editorEntries,
      translations: editorTranslations,
      freshExtraction: true,
    });
    await idbSet("dr-archive-trees", treesObj);
    await idbSet("dr-entries-meta", entries.map(e => ({ key: e.key, rootFile: e.rootFile })));
    if (glossary) await idbSet("editor-glossary", glossary);
    await idbSet("editor-source-game", isDr2 ? "danganronpa2" : "danganronpa1");
    navigate("/editor");
  }, [entries, glossary, isDr2, navigate, archiveTrees]);

  const exportJson = useCallback(() => {
    const blob = new Blob([JSON.stringify(entries, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `danganronpa${isDr2 ? "2" : "1"}-translations.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [entries, isDr2]);

  const rebuildFiles = useCallback(() => {
    if (archiveTrees.size === 0) {
      toast({ title: "لا توجد ملفات لإعادة البناء", variant: "destructive" });
      return;
    }

    const translationsMap = new Map<string, string>();
    for (const entry of entries) {
      if (entry.translation.trim()) {
        translationsMap.set(entry.key, entry.translation);
      }
    }

    if (translationsMap.size === 0) {
      toast({ title: "لا توجد ترجمات لتطبيقها", variant: "destructive" });
      return;
    }

    let exportedCount = 0;
    let skippedCount = 0;
    for (const [fileName, tree] of archiveTrees) {
      // Skip files with no translations at all
      if (!nodeHasTranslations(tree, translationsMap)) {
        skippedCount++;
        console.log(`⏭️ تخطي ${fileName} — لا ترجمات`);
        continue;
      }

      try {
        const rebuilt = rebuildArchive(tree, translationsMap);
        const blob = new Blob([rebuilt], { type: "application/octet-stream" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = fileName;
        a.click();
        URL.revokeObjectURL(url);
        exportedCount++;
      } catch (err) {
        console.error(`Failed to rebuild ${fileName}:`, err);
        toast({ title: `خطأ في بناء ${fileName}`, description: String(err), variant: "destructive" });
      }
    }

    if (exportedCount > 0) {
      toast({
        title: `تم بناء ${exportedCount} ملف`,
        description: skippedCount > 0
          ? `${translationsMap.size} ترجمة — تم تخطي ${skippedCount} ملف بدون ترجمات`
          : `${translationsMap.size} ترجمة مطبّقة`,
      });
    }
  }, [archiveTrees, entries, toast]);

  const translatedCount = entries.filter(e => e.translation.trim()).length;
  const gameTitle = isDr2 ? "Danganronpa 2: Goodbye Despair" : "Danganronpa: Trigger Happy Havoc";
  const accentColor = isDr2 ? "hsl(200,70%,55%)" : "hsl(0,70%,55%)";

  return (
    <div className="min-h-screen bg-background" dir="rtl">
      <header className="border-b border-border bg-card/50 backdrop-blur sticky top-0 z-20">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link to="/danganronpa">
              <Button variant="ghost" size="sm"><ArrowLeft className="w-4 h-4 ml-1" />الرجوع</Button>
            </Link>
            <h1 className="font-display font-bold text-lg">{gameTitle}</h1>
          </div>
          {entries.length > 0 && (
            <span className="text-xs text-muted-foreground">{translatedCount}/{entries.length} مترجم</span>
          )}
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-8 space-y-6">
        <div className="grid gap-4 md:grid-cols-2">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Upload className="w-4 h-4" />
                رفع الملفات
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground mb-3">
                ارفع ملفات <strong>.pak</strong> (قد تحتوي <strong>.po</strong> و <strong>.bytecode</strong>) أو <strong>.lin</strong> أو <strong>.po</strong> أو <strong>.json</strong>
              </p>
              <input ref={fileInputRef} type="file" className="sr-only" accept=".pak,.lin,.po,.json,.bytecode" multiple onChange={handleFileUpload} />
              <Button onClick={() => fileInputRef.current?.click()} disabled={loading} className="w-full" style={{ backgroundColor: accentColor }}>
                {loading ? <Loader2 className="w-4 h-4 animate-spin ml-2" /> : <FolderOpen className="w-4 h-4 ml-2" />}
                اختر الملفات
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <BookOpen className="w-4 h-4" />
                قاموس المصطلحات
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground mb-3">
                قاموس بصيغة <code>English=عربي</code> لكل سطر (اختياري)
              </p>
              <input ref={glossaryInputRef} type="file" className="sr-only" accept=".txt" onChange={handleGlossaryUpload} />
              <Button variant="outline" onClick={() => glossaryInputRef.current?.click()} className="w-full">
                <FileText className="w-4 h-4 ml-2" />
                {glossary ? "✓ تم التحميل" : "رفع قاموس"}
              </Button>
            </CardContent>
          </Card>
        </div>

        {/* Loaded Files with Progress */}
        {loadedFiles.length > 0 && (
          <Card>
            <CardHeader className="pb-3"><CardTitle className="text-base">الملفات المحمّلة</CardTitle></CardHeader>
            <CardContent>
              <div className="space-y-3">
                {loadedFiles.map((f, i) => {
                  const stats = fileProgress.get(f.name);
                  const pct = stats && stats.total > 0 ? Math.round((stats.translated / stats.total) * 100) : 0;
                  return (
                    <div key={i} className="space-y-1.5">
                      <div className="flex items-center justify-between text-sm">
                        <span className="font-mono text-xs truncate max-w-[60%]">{f.name}</span>
                        <div className="flex items-center gap-2">
                          <span className="text-xs px-2 py-0.5 rounded" style={{ backgroundColor: `${accentColor}20`, color: accentColor }}>
                            {f.type.toUpperCase()}
                          </span>
                          {f.stringCount != null && (
                            <span className="text-xs text-muted-foreground">
                              {stats ? `${stats.translated}/${stats.total}` : `${f.stringCount}`} نص
                            </span>
                          )}
                        </div>
                      </div>
                      {stats && stats.total > 0 && (
                        <div className="flex items-center gap-2">
                          <Progress value={pct} className="h-2 flex-1" />
                          <span className="text-xs text-muted-foreground min-w-[3rem] text-left">{pct}%</span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Preview */}
        {entries.length > 0 && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Eye className="w-4 h-4" />
                معاينة النصوص ({entries.length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="max-h-64 overflow-y-auto space-y-1 text-sm">
                {entries.slice(0, 50).map((e, i) => (
                  <div key={i} className="flex gap-2 p-1.5 rounded hover:bg-muted/50">
                    <span className="text-muted-foreground text-xs min-w-[3rem]">{e.key.split(":")[1]}</span>
                    <span className="flex-1" dir="ltr">{e.original}</span>
                    {e.translation && <span className="flex-1" style={{ color: accentColor }}>{e.translation}</span>}
                  </div>
                ))}
                {entries.length > 50 && (
                  <p className="text-xs text-muted-foreground text-center py-2">... و{entries.length - 50} نص آخر</p>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Actions */}
        {entries.length > 0 && (
          <div className="flex flex-wrap gap-3 justify-center">
            <Button onClick={openInEditor} size="lg" style={{ backgroundColor: accentColor }} className="text-white">
              <ArrowRight className="w-4 h-4 ml-2" />
              فتح في المحرر
            </Button>
            <Button onClick={exportJson} variant="outline" size="lg">
              <Download className="w-4 h-4 ml-2" />
              تصدير JSON
            </Button>
            {archiveTrees.size > 0 && translatedCount > 0 && (
              <Button onClick={rebuildFiles} variant="outline" size="lg" className="border-green-500/50 text-green-600 hover:bg-green-500/10">
                <Package className="w-4 h-4 ml-2" />
                بناء الملفات المترجمة
              </Button>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
