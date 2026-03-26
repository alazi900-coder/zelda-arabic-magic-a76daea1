import { useState, useCallback, useRef } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Upload, FileText, ArrowRight, Download, Loader2, ArrowLeft, BookOpen, FileJson, Eye } from "lucide-react";
import { parseDatFile, parseTblFile, applyLabels, exportAsJson, type GfmsgFile, type AhtbEntry } from "@/lib/gfmsg-parser";

interface LoadedFile {
  name: string;
  type: "dat" | "tbl" | "json";
  datFile?: GfmsgFile;
  tblEntries?: AhtbEntry[];
  jsonData?: Record<string, string>;
}

interface ParsedEntry {
  key: string;
  original: string;
  translation: string;
  sourceFile: string;
}

export default function PokemonProcess() {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const glossaryInputRef = useRef<HTMLInputElement>(null);

  const [entries, setEntries] = useState<ParsedEntry[]>([]);
  const [glossary, setGlossary] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [loadedFiles, setLoadedFiles] = useState<LoadedFile[]>([]);
  const [rawGfmsg, setRawGfmsg] = useState<Map<string, { dat: GfmsgFile; tbl?: AhtbEntry[] }>>(new Map());

  // Handle file upload (.dat, .tbl, .json)
  const handleFileUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files?.length) return;
    setLoading(true);

    const newLoaded: LoadedFile[] = [...loadedFiles];
    const newRaw = new Map(rawGfmsg);
    const newEntries: ParsedEntry[] = [...entries];

    // Group .dat and .tbl by name
    const fileMap = new Map<string, { dat?: File; tbl?: File }>();
    const jsonFiles: File[] = [];

    for (const file of Array.from(files)) {
      const ext = file.name.split('.').pop()?.toLowerCase();
      const baseName = file.name.replace(/\.(dat|tbl|json)$/i, '');

      if (ext === 'dat') {
        const group = fileMap.get(baseName) || {};
        group.dat = file;
        fileMap.set(baseName, group);
      } else if (ext === 'tbl') {
        const group = fileMap.get(baseName) || {};
        group.tbl = file;
        fileMap.set(baseName, group);
      } else if (ext === 'json') {
        jsonFiles.push(file);
      }
    }

    // Process .dat/.tbl pairs
    for (const [baseName, group] of fileMap) {
      try {
        if (group.dat) {
          const datBuffer = await group.dat.arrayBuffer();
          const datFile = parseDatFile(datBuffer, baseName);

          let tblEntries: AhtbEntry[] | undefined;
          if (group.tbl) {
            const tblBuffer = await group.tbl.arrayBuffer();
            tblEntries = parseTblFile(tblBuffer);
            applyLabels(datFile, tblEntries);
          }

          newRaw.set(baseName, { dat: datFile, tbl: tblEntries });
          newLoaded.push({ name: group.dat.name, type: "dat", datFile });
          if (group.tbl) {
            newLoaded.push({ name: group.tbl.name, type: "tbl", tblEntries });
          }

          // Extract entries from language 0
          const lang0 = datFile.entries[0] || [];
          for (const entry of lang0) {
            if (entry.text.trim()) {
              newEntries.push({
                key: `${baseName}.${entry.label}`,
                original: entry.text,
                translation: "",
                sourceFile: baseName,
              });
            }
          }

          toast({
            title: `✅ ${baseName}`,
            description: `${lang0.filter(e => e.text.trim()).length} نص — ${datFile.languageCount} لغة`,
          });
        }
      } catch (err) {
        toast({ title: `❌ خطأ في ${baseName}`, description: String(err), variant: "destructive" });
      }
    }

    // Process JSON files
    for (const file of jsonFiles) {
      try {
        const text = await file.text();
        const data = JSON.parse(text);
        const prefix = file.name.replace(/\.json$/i, "");
        let count = 0;

        if (Array.isArray(data)) {
          data.forEach((item, i) => {
            const txt = typeof item === "string" ? item : (item?.text ?? item?.Text ?? item?.value ?? "");
            const lbl = typeof item === "object" ? (item?.label ?? item?.hash ?? String(i)) : String(i);
            if (typeof txt === "string" && txt.trim()) {
              newEntries.push({ key: `${prefix}.${lbl}`, original: txt, translation: "", sourceFile: prefix });
              count++;
            }
          });
        } else if (data && typeof data === "object") {
          for (const [k, v] of Object.entries(data)) {
            if (typeof v === "string" && v.trim()) {
              newEntries.push({ key: `${prefix}.${k}`, original: v, translation: "", sourceFile: prefix });
              count++;
            }
          }
        }

        newLoaded.push({ name: file.name, type: "json" });
        toast({ title: `✅ ${file.name}`, description: `${count} نص` });
      } catch (err) {
        toast({ title: `❌ خطأ في ${file.name}`, description: String(err), variant: "destructive" });
      }
    }

    setLoadedFiles(newLoaded);
    setRawGfmsg(newRaw);
    setEntries(newEntries);
    setLoading(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }, [entries, loadedFiles, rawGfmsg, toast]);

  // Handle glossary
  const handleGlossaryUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    setGlossary(text);
    toast({ title: "تم تحميل القاموس", description: file.name });
  }, [toast]);

  // Export as JSON
  const handleExportJson = useCallback(() => {
    const output: Record<string, Record<string, string>> = {};
    for (const entry of entries) {
      if (entry.translation.trim()) {
        if (!output[entry.sourceFile]) output[entry.sourceFile] = {};
        const label = entry.key.replace(`${entry.sourceFile}.`, '');
        output[entry.sourceFile][label] = entry.translation;
      }
    }
    const blob = new Blob([JSON.stringify(output, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "pokemon-translations-ar.json";
    a.click();
    URL.revokeObjectURL(url);
  }, [entries]);

  // Open in editor
  const handleOpenEditor = useCallback(() => {
    const editorData = {
      entries: entries.map((e, i) => ({
        msbtFile: e.sourceFile,
        index: i,
        label: e.key,
        original: e.original,
        maxBytes: 9999,
      })),
      translations: Object.fromEntries(entries.filter(e => e.translation).map(e => [e.key, e.translation])),
      glossary,
      game: "pokemon",
    };
    sessionStorage.setItem("pokemon-editor-data", JSON.stringify(editorData));
    window.location.href = "/editor?source=pokemon";
  }, [entries, glossary]);

  const translatedCount = entries.filter(e => e.translation.trim()).length;
  const datFilesCount = loadedFiles.filter(f => f.type === "dat").length;
  const tblFilesCount = loadedFiles.filter(f => f.type === "tbl").length;

  // Group entries by source file for stats
  const fileStats = new Map<string, number>();
  for (const e of entries) {
    fileStats.set(e.sourceFile, (fileStats.get(e.sourceFile) || 0) + 1);
  }

  return (
    <div className="min-h-screen bg-background" dir="rtl">
      {/* Header */}
      <header className="border-b border-border px-4 py-4">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link to="/pokemon">
              <Button variant="ghost" size="sm">
                <ArrowLeft className="w-4 h-4 ml-1" />
                الرجوع
              </Button>
            </Link>
            <h1 className="text-xl font-display font-bold">
              معالجة ملفات <span className="text-[hsl(0,80%,55%)]">Pokémon Scarlet</span>
            </h1>
          </div>
          {entries.length > 0 && (
            <div className="text-sm text-muted-foreground">
              {translatedCount}/{entries.length} مترجم
            </div>
          )}
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-8 space-y-6">
        {/* Upload Cards */}
        <div className="grid md:grid-cols-2 gap-6">
          {/* Game Files */}
          <Card className="border-border">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg font-display">
                <FileText className="w-5 h-5 text-[hsl(0,80%,55%)]" />
                ملفات اللعبة (.dat / .tbl / .json)
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground mb-4">
                ارفع أزواج ملفات <code className="text-xs bg-muted px-1.5 py-0.5 rounded">.dat</code> و <code className="text-xs bg-muted px-1.5 py-0.5 rounded">.tbl</code> من مجلد <code className="text-xs bg-muted px-1.5 py-0.5 rounded">message/dat/English/</code>
              </p>
              <input
                ref={fileInputRef}
                type="file"
                accept=".dat,.tbl,.json"
                multiple
                className="hidden"
                onChange={handleFileUpload}
              />
              <Button
                onClick={() => fileInputRef.current?.click()}
                variant="outline"
                className="w-full border-dashed border-2 py-8 hover:border-[hsl(0,80%,55%)]/50"
                disabled={loading}
              >
                {loading ? (
                  <Loader2 className="w-5 h-5 animate-spin ml-2" />
                ) : (
                  <Upload className="w-5 h-5 ml-2" />
                )}
                {loading ? "جارٍ التحليل..." : "اختر ملفات dat / tbl"}
              </Button>

              {loadedFiles.length > 0 && (
                <div className="mt-3 space-y-1 max-h-40 overflow-y-auto">
                  {loadedFiles.map((f, i) => (
                    <div key={i} className="text-xs text-muted-foreground bg-muted/50 rounded px-2 py-1 flex items-center gap-2">
                      {f.type === "dat" ? "📦" : f.type === "tbl" ? "🏷️" : "📄"} {f.name}
                      {f.type === "dat" && f.datFile && (
                        <span className="text-[hsl(0,80%,55%)] mr-auto">{f.datFile.stringCount} نص</span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Glossary */}
          <Card className="border-border">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg font-display">
                <BookOpen className="w-5 h-5 text-[hsl(280,70%,55%)]" />
                القاموس (اختياري)
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground mb-4">
                ارفع قاموس المصطلحات (English=Arabic) لأسماء البوكيمون والهجمات والقدرات.
              </p>
              <input
                ref={glossaryInputRef}
                type="file"
                accept=".txt,.csv,.tsv"
                className="hidden"
                onChange={handleGlossaryUpload}
              />
              <Button
                onClick={() => glossaryInputRef.current?.click()}
                variant="outline"
                className="w-full border-dashed border-2 py-8 hover:border-[hsl(280,70%,55%)]/50"
              >
                <Upload className="w-5 h-5 ml-2" />
                اختر ملف القاموس
              </Button>
              {glossary && (
                <div className="mt-3 text-xs text-muted-foreground bg-muted/50 rounded px-2 py-1">
                  ✅ تم تحميل القاموس ({glossary.split("\n").filter(l => l.includes("=")).length} مصطلح)
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Stats & Actions */}
        {entries.length > 0 && (
          <Card className="border-[hsl(0,80%,55%)]/30">
            <CardContent className="py-6">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
                <div className="text-center">
                  <div className="text-2xl font-display font-bold text-[hsl(0,80%,55%)]">{entries.length}</div>
                  <div className="text-xs text-muted-foreground">نص مستخرج</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-display font-bold">{datFilesCount}</div>
                  <div className="text-xs text-muted-foreground">ملف .dat</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-display font-bold">{tblFilesCount}</div>
                  <div className="text-xs text-muted-foreground">ملف .tbl (تسميات)</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-display font-bold">{fileStats.size}</div>
                  <div className="text-xs text-muted-foreground">مجموعة ملفات</div>
                </div>
              </div>

              <div className="flex flex-col sm:flex-row gap-3 justify-center">
                <Button
                  onClick={handleOpenEditor}
                  className="bg-[hsl(0,80%,50%)] hover:bg-[hsl(0,80%,45%)] text-white font-display font-bold px-6"
                >
                  افتح في المحرر
                  <ArrowRight className="w-4 h-4 mr-2" />
                </Button>
                <Button onClick={handleExportJson} variant="outline" disabled={translatedCount === 0}>
                  <Download className="w-4 h-4 ml-2" />
                  تصدير JSON
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* File breakdown */}
        {fileStats.size > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg font-display flex items-center gap-2">
                <Eye className="w-5 h-5" />
                الملفات المحمّلة ({fileStats.size})
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
                {Array.from(fileStats).map(([file, count]) => (
                  <div key={file} className="flex items-center justify-between p-2 rounded-lg bg-muted/30 border border-border text-sm">
                    <span className="font-mono text-xs truncate">{file}</span>
                    <span className="text-xs text-muted-foreground mr-2">{count}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Preview */}
        {entries.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg font-display">معاينة (أول 30 نص)</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2 max-h-[500px] overflow-y-auto">
                {entries.slice(0, 30).map((entry, i) => (
                  <div key={i} className="flex items-start gap-3 p-3 rounded-lg bg-muted/30 border border-border">
                    <code className="text-xs text-muted-foreground shrink-0 mt-1 font-mono bg-muted px-1.5 py-0.5 rounded max-w-[150px] truncate">
                      {entry.key.split('.').pop()}
                    </code>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm" dir="ltr">{entry.original}</div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Empty State */}
        {entries.length === 0 && !loading && (
          <div className="text-center py-20 text-muted-foreground">
            <FileJson className="w-16 h-16 mx-auto mb-4 opacity-30" />
            <p className="text-lg font-display">ارفع ملفات .dat و .tbl لبدء التعريب</p>
            <p className="text-sm mt-2">
              الملفات موجودة في مسار: <code className="bg-muted px-2 py-0.5 rounded text-xs" dir="ltr">romfs/message/dat/English/common/</code>
            </p>
          </div>
        )}
      </main>
    </div>
  );
}
