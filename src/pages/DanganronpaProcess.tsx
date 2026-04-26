import { useState, useCallback, useRef } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Upload, FileText, ArrowRight, Download, Loader2, ArrowLeft, BookOpen, Eye, Archive } from "lucide-react";
import { parseStx } from "@/lib/danganronpa-stx-parser";
import { parseSpc, type SpcEntry } from "@/lib/danganronpa-spc-parser";
import { idbSet } from "@/lib/idb-storage";

interface ParsedEntry {
  key: string;
  original: string;
  translation: string;
  sourceFile: string;
}

interface FileInfo {
  name: string;
  type: "spc" | "stx" | "json";
  stxCount?: number;
  stringCount?: number;
}

export default function DanganronpaProcess() {
  const { toast } = useToast();
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const glossaryInputRef = useRef<HTMLInputElement>(null);

  const [entries, setEntries] = useState<ParsedEntry[]>([]);
  const [glossary, setGlossary] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadedFiles, setLoadedFiles] = useState<FileInfo[]>([]);
  const [stxDataMap, setStxDataMap] = useState<Map<string, string[]>>(new Map());

  const processStx = useCallback((name: string, buffer: ArrayBuffer): ParsedEntry[] => {
    const stx = parseStx(buffer);
    const newEntries: ParsedEntry[] = [];
    stx.strings.forEach((str, i) => {
      if (str.trim()) {
        newEntries.push({
          key: `${name}:${i}`,
          original: str,
          translation: "",
          sourceFile: name,
        });
      }
    });
    return newEntries;
  }, []);

  const handleFileUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files?.length) return;
    setLoading(true);

    const newLoaded: FileInfo[] = [...loadedFiles];
    const newEntries: ParsedEntry[] = [...entries];
    const newStxMap = new Map(stxDataMap);

    try {
      for (const file of Array.from(files)) {
        const ext = file.name.split(".").pop()?.toLowerCase();
        const buffer = await file.arrayBuffer();

        if (ext === "spc") {
          // Parse SPC archive and extract STX files
          const spcEntries: SpcEntry[] = parseSpc(buffer);
          const stxFiles = spcEntries.filter(e => e.name.toLowerCase().endsWith(".stx"));
          let totalStrings = 0;

          for (const spcEntry of stxFiles) {
            try {
              const parsed = processStx(spcEntry.name, spcEntry.data);
              // Remove old entries for this file
              const filtered = newEntries.filter(e => e.sourceFile !== spcEntry.name);
              filtered.push(...parsed);
              newEntries.length = 0;
              newEntries.push(...filtered);

              const stx = parseStx(spcEntry.data);
              newStxMap.set(spcEntry.name, stx.strings);
              totalStrings += stx.strings.length;
            } catch (err) {
              console.warn(`تخطي ${spcEntry.name}:`, err);
            }
          }

          newLoaded.push({
            name: file.name,
            type: "spc",
            stxCount: stxFiles.length,
            stringCount: totalStrings,
          });

          toast({
            title: `تم تحميل ${file.name}`,
            description: `${stxFiles.length} ملف STX — ${totalStrings} نص`,
          });

        } else if (ext === "stx") {
          try {
            const parsed = processStx(file.name, buffer);
            const filtered = newEntries.filter(e => e.sourceFile !== file.name);
            filtered.push(...parsed);
            newEntries.length = 0;
            newEntries.push(...filtered);

            const stx = parseStx(buffer);
            newStxMap.set(file.name, stx.strings);

            newLoaded.push({
              name: file.name,
              type: "stx",
              stringCount: stx.strings.length,
            });

            toast({
              title: `تم تحميل ${file.name}`,
              description: `${stx.strings.length} نص`,
            });
          } catch (err) {
            toast({
              title: `خطأ في ${file.name}`,
              description: String(err),
              variant: "destructive",
            });
          }
        } else if (ext === "json") {
          // Import previously exported translations
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
      setStxDataMap(newStxMap);
    } catch (err) {
      toast({
        title: "خطأ في القراءة",
        description: String(err),
        variant: "destructive",
      });
    } finally {
      setLoading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }, [entries, loadedFiles, stxDataMap, processStx, toast]);

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
    await idbSet("editorState", {
      entries: editorEntries,
      translations: editorTranslations,
      freshExtraction: true,
    });
    if (glossary) await idbSet("editor-glossary", glossary);
    await idbSet("editor-source-game", "danganronpa");
    navigate("/editor");
  }, [entries, glossary, navigate]);

  const exportJson = useCallback(() => {
    const blob = new Blob([JSON.stringify(entries, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "danganronpa-translations.json";
    a.click();
    URL.revokeObjectURL(url);
  }, [entries]);

  const translatedCount = entries.filter(e => e.translation.trim()).length;

  return (
    <div className="min-h-screen bg-background" dir="rtl">
      {/* Header */}
      <header className="border-b border-border bg-card/50 backdrop-blur sticky top-0 z-20">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link to="/danganronpa">
              <Button variant="ghost" size="sm"><ArrowLeft className="w-4 h-4 ml-1" />الرجوع</Button>
            </Link>
            <h1 className="font-display font-bold text-lg">معالجة Danganronpa V3</h1>
          </div>
          <div className="flex items-center gap-2">
            {entries.length > 0 && (
              <span className="text-xs text-muted-foreground">
                {translatedCount}/{entries.length} مترجم
              </span>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-8 space-y-6">
        {/* Upload Section */}
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
                ارفع ملفات <strong>.spc</strong> (أرشيف) أو <strong>.stx</strong> (نصوص) أو <strong>.json</strong> (ترجمات سابقة)
              </p>
              <input
                ref={fileInputRef}
                type="file"
                className="sr-only"
                accept=".spc,.stx,.json"
                multiple
                onChange={handleFileUpload}
              />
              <Button
                onClick={() => fileInputRef.current?.click()}
                disabled={loading}
                className="w-full"
              >
                {loading ? <Loader2 className="w-4 h-4 animate-spin ml-2" /> : <Archive className="w-4 h-4 ml-2" />}
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
              <input
                ref={glossaryInputRef}
                type="file"
                className="sr-only"
                accept=".txt"
                onChange={handleGlossaryUpload}
              />
              <Button
                variant="outline"
                onClick={() => glossaryInputRef.current?.click()}
                className="w-full"
              >
                <FileText className="w-4 h-4 ml-2" />
                {glossary ? "✓ تم التحميل" : "رفع قاموس"}
              </Button>
            </CardContent>
          </Card>
        </div>

        {/* Loaded Files */}
        {loadedFiles.length > 0 && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">الملفات المحمّلة</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {loadedFiles.map((f, i) => (
                  <div key={i} className="flex items-center justify-between text-sm p-2 rounded bg-muted/50">
                    <span className="font-mono text-xs">{f.name}</span>
                    <div className="flex items-center gap-2">
                      <span className="text-xs px-2 py-0.5 rounded bg-[hsl(330,80%,50%)]/10 text-[hsl(330,80%,55%)]">
                        {f.type.toUpperCase()}
                      </span>
                      {f.stxCount != null && (
                        <span className="text-xs text-muted-foreground">{f.stxCount} STX</span>
                      )}
                      {f.stringCount != null && (
                        <span className="text-xs text-muted-foreground">{f.stringCount} نص</span>
                      )}
                    </div>
                  </div>
                ))}
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
                    {e.translation && (
                      <span className="flex-1 text-[hsl(330,80%,55%)]">{e.translation}</span>
                    )}
                  </div>
                ))}
                {entries.length > 50 && (
                  <p className="text-xs text-muted-foreground text-center py-2">
                    ... و{entries.length - 50} نص آخر
                  </p>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Actions */}
        {entries.length > 0 && (
          <div className="flex flex-wrap gap-3 justify-center">
            <Button onClick={openInEditor} size="lg" className="bg-[hsl(330,80%,50%)] hover:bg-[hsl(330,80%,45%)] text-white">
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
