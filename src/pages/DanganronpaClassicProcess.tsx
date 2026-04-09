import { useState, useCallback, useRef } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Upload, FileText, ArrowRight, Download, Loader2, ArrowLeft, BookOpen, Eye, FolderOpen } from "lucide-react";
import { parseLin } from "@/lib/danganronpa-lin-parser";
import { parsePak, parseLin0Container, type PakEntry } from "@/lib/danganronpa-pak-parser";
import { parsePo } from "@/lib/danganronpa-po-parser";
import { idbSet } from "@/lib/idb-storage";

interface ParsedEntry {
  key: string;
  original: string;
  translation: string;
  sourceFile: string;
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

  const processLin = useCallback((name: string, buffer: ArrayBuffer): ParsedEntry[] => {
    const lin = parseLin(buffer, isDr2);
    return lin.strings
      .filter(s => s.trim())
      .map((str, i) => ({
        key: `${name}:${i}`,
        original: str,
        translation: "",
        sourceFile: name,
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
      }));
  }, []);

  /**
   * Recursively extract text entries from a buffer that could be:
   * PAK → contains LIN0 containers or LIN/PO files
   * LIN0 → contains .po and .bytecode files
   * PO → text entries directly
   * LIN → classic script text
   */
  const extractFromBuffer = useCallback((name: string, buffer: ArrayBuffer, results: { entries: ParsedEntry[]; linCount: number; poCount: number }) => {
    // 1) Try as PO first (cheapest check)
    const poEntries = processPo(name, buffer);
    if (poEntries.length > 0) {
      results.poCount++;
      results.entries.push(...poEntries);
      return;
    }

    // 2) Try as LIN0 container
    const lin0Entries = parseLin0Container(buffer);
    if (lin0Entries) {
      for (const entry of lin0Entries) {
        const childName = entry.name || `${name}:${entry.index}`;
        extractFromBuffer(childName, entry.data, results);
      }
      return;
    }

    // 3) Try as PAK container (recursive)
    try {
      const pakEntries = parsePak(buffer);
      if (pakEntries.length > 0) {
        for (const entry of pakEntries) {
          const childName = entry.name || `${name}:${entry.index}`;
          extractFromBuffer(childName, entry.data, results);
        }
        return;
      }
    } catch { /* not a PAK */ }

    // 4) Try as classic LIN script
    try {
      const parsed = processLin(name, buffer);
      if (parsed.length > 0) {
        results.linCount++;
        results.entries.push(...parsed);
        return;
      }
    } catch { /* not a LIN */ }

    // 5) Last resort: scan raw bytes for PO markers
    const text = new TextDecoder("utf-8", { fatal: false }).decode(new Uint8Array(buffer));
    if (text.includes('msgid "') || text.includes('msgctxt "')) {
      const fallbackPo = processPo(name, buffer);
      if (fallbackPo.length > 0) {
        results.poCount++;
        results.entries.push(...fallbackPo);
      }
    }
  }, [processLin, processPo]);

  const handleFileUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files?.length) return;
    setLoading(true);

    const newLoaded: FileInfo[] = [...loadedFiles];
    const newEntries: ParsedEntry[] = [...entries];

    try {
      for (const file of Array.from(files)) {
        const ext = file.name.split(".").pop()?.toLowerCase();
        const buffer = await file.arrayBuffer();

        if (ext === "pak" || ext === "lin") {
          const results = { entries: [] as ParsedEntry[], linCount: 0, poCount: 0 };
          extractFromBuffer(file.name, buffer, results);

          // Merge results
          for (const entry of results.entries) {
            const idx = newEntries.findIndex(e => e.key === entry.key);
            if (idx >= 0) {
              newEntries[idx] = entry;
            } else {
              newEntries.push(entry);
            }
          }

          newLoaded.push({
            name: file.name,
            type: ext as "pak" | "lin",
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
            const filtered = newEntries.filter(e => e.sourceFile !== file.name);
            filtered.push(...parsed);
            newEntries.length = 0;
            newEntries.push(...filtered);

            newLoaded.push({
              name: file.name,
              type: "po",
              stringCount: parsed.length,
            });

            toast({
              title: `تم تحميل ${file.name}`,
              description: `${parsed.length} نص من PO`,
            });
          } catch (err) {
            toast({
              title: `خطأ في ${file.name}`,
              description: String(err),
              variant: "destructive",
            });
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
                      key: item.key,
                      original: item.original,
                      translation: item.translation || "",
                      sourceFile: item.sourceFile || file.name,
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
    } catch (err) {
      toast({ title: "خطأ في القراءة", description: String(err), variant: "destructive" });
    } finally {
      setLoading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }, [entries, loadedFiles, processLin, processPo, isDr2, toast]);

  const handleGlossaryUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    setGlossary(text);
    toast({ title: "تم تحميل القاموس" });
  }, [toast]);

  const openInEditor = useCallback(async () => {
    if (!entries.length) return;
    const translations: Record<string, { original: string; translation: string }> = {};
    for (const e of entries) {
      translations[e.key] = { original: e.original, translation: e.translation };
    }
    await idbSet("editor-translations", translations);
    if (glossary) await idbSet("editor-glossary", glossary);
    await idbSet("editor-source-game", isDr2 ? "danganronpa2" : "danganronpa1");
    navigate("/editor");
  }, [entries, glossary, isDr2, navigate]);

  const exportJson = useCallback(() => {
    const blob = new Blob([JSON.stringify(entries, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `danganronpa${isDr2 ? "2" : "1"}-translations.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [entries, isDr2]);

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
              <input ref={fileInputRef} type="file" className="sr-only" accept=".pak,.lin,.po,.json" multiple onChange={handleFileUpload} />
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

        {loadedFiles.length > 0 && (
          <Card>
            <CardHeader className="pb-3"><CardTitle className="text-base">الملفات المحمّلة</CardTitle></CardHeader>
            <CardContent>
              <div className="space-y-2">
                {loadedFiles.map((f, i) => (
                  <div key={i} className="flex items-center justify-between text-sm p-2 rounded bg-muted/50">
                    <span className="font-mono text-xs">{f.name}</span>
                    <div className="flex items-center gap-2">
                      <span className="text-xs px-2 py-0.5 rounded" style={{ backgroundColor: `${accentColor}20`, color: accentColor }}>
                        {f.type.toUpperCase()}
                      </span>
                      {f.linCount != null && <span className="text-xs text-muted-foreground">{f.linCount} LIN</span>}
                      {f.poCount != null && <span className="text-xs text-muted-foreground">{f.poCount} PO</span>}
                      {f.stringCount != null && <span className="text-xs text-muted-foreground">{f.stringCount} نص</span>}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

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
          </div>
        )}
      </main>
    </div>
  );
}
