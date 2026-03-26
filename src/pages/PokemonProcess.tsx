import { useState, useCallback, useRef } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Upload, FileJson, ArrowRight, Download, Loader2, ArrowLeft, BookOpen } from "lucide-react";

interface PokemonEntry {
  key: string;
  original: string;
  translation: string;
}

/**
 * Parses various JSON formats exported by GFMSG, pkNX, or custom tools.
 * Supports:
 *  - Array of { label, text } or { hash, text }
 *  - Object { "key": "value", ... }
 *  - Array of strings
 */
function parseTextJson(raw: string, filename: string): PokemonEntry[] {
  const data = JSON.parse(raw);
  const entries: PokemonEntry[] = [];
  const prefix = filename.replace(/\.json$/i, "");

  if (Array.isArray(data)) {
    data.forEach((item, i) => {
      if (typeof item === "string") {
        entries.push({ key: `${prefix}[${i}]`, original: item, translation: "" });
      } else if (item && typeof item === "object") {
        const text = item.text ?? item.Text ?? item.value ?? item.Value ?? "";
        const label = item.label ?? item.Label ?? item.hash ?? item.Hash ?? item.key ?? item.Key ?? String(i);
        if (typeof text === "string" && text.trim()) {
          entries.push({ key: `${prefix}.${label}`, original: text, translation: "" });
        }
      }
    });
  } else if (data && typeof data === "object") {
    // Check for nested structure like { "entries": [...] }
    const inner = data.entries ?? data.Entries ?? data.texts ?? data.Texts ?? data.messages ?? data.Messages ?? null;
    if (Array.isArray(inner)) {
      return parseTextJson(JSON.stringify(inner), filename);
    }
    // Flat key-value
    for (const [k, v] of Object.entries(data)) {
      if (typeof v === "string" && v.trim()) {
        entries.push({ key: `${prefix}.${k}`, original: v, translation: "" });
      }
    }
  }

  return entries;
}

export default function PokemonProcess() {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const glossaryInputRef = useRef<HTMLInputElement>(null);

  const [entries, setEntries] = useState<PokemonEntry[]>([]);
  const [glossary, setGlossary] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [filesLoaded, setFilesLoaded] = useState<string[]>([]);

  // Handle JSON file upload
  const handleFileUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files?.length) return;
    setLoading(true);
    const allEntries: PokemonEntry[] = [...entries];
    const newFiles: string[] = [...filesLoaded];

    for (const file of Array.from(files)) {
      try {
        const text = await file.text();
        const parsed = parseTextJson(text, file.name);
        allEntries.push(...parsed);
        newFiles.push(file.name);
      } catch (err) {
        toast({ title: `خطأ في قراءة ${file.name}`, description: String(err), variant: "destructive" });
      }
    }

    setEntries(allEntries);
    setFilesLoaded(newFiles);
    setLoading(false);
    toast({ title: "تم تحميل الملفات", description: `${allEntries.length} نص مستخرج من ${newFiles.length} ملف` });
    if (fileInputRef.current) fileInputRef.current.value = "";
  }, [entries, filesLoaded, toast]);

  // Handle glossary upload
  const handleGlossaryUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    setGlossary(text);
    toast({ title: "تم تحميل القاموس", description: file.name });
  }, [toast]);

  // Export translations as JSON
  const handleExport = useCallback(() => {
    const output: Record<string, string> = {};
    for (const entry of entries) {
      if (entry.translation.trim()) {
        output[entry.key] = entry.translation;
      }
    }
    const blob = new Blob([JSON.stringify(output, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "pokemon-translations-ar.json";
    a.click();
    URL.revokeObjectURL(url);
    toast({ title: "تم التصدير", description: `${Object.keys(output).length} ترجمة` });
  }, [entries, toast]);

  // Navigate to editor with data
  const handleOpenEditor = useCallback(() => {
    // Store entries in sessionStorage for the editor to pick up
    const editorData = {
      entries: entries.map((e, i) => ({
        msbtFile: e.key.split(".")[0] || "pokemon",
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
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <span>{translatedCount}/{entries.length} مترجم</span>
            </div>
          )}
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-8 space-y-6">
        {/* Upload Section */}
        <div className="grid md:grid-cols-2 gap-6">
          {/* JSON Files */}
          <Card className="border-border">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg font-display">
                <FileJson className="w-5 h-5 text-[hsl(0,80%,55%)]" />
                ملفات النصوص (JSON)
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground mb-4">
                ارفع ملفات JSON المستخرجة بأداة GFMSG أو pkNX. يدعم صيغ متعددة.
              </p>
              <input
                ref={fileInputRef}
                type="file"
                accept=".json"
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
                {loading ? "جارٍ التحميل..." : "اختر ملفات JSON"}
              </Button>
              {filesLoaded.length > 0 && (
                <div className="mt-3 space-y-1">
                  {filesLoaded.map((f, i) => (
                    <div key={i} className="text-xs text-muted-foreground bg-muted/50 rounded px-2 py-1">
                      📄 {f}
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
                ارفع قاموس المصطلحات (English=Arabic) لضمان اتساق ترجمة أسماء البوكيمون والهجمات.
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

        {/* Actions */}
        {entries.length > 0 && (
          <Card className="border-[hsl(0,80%,55%)]/30">
            <CardContent className="py-6">
              <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
                <div className="text-center sm:text-right">
                  <div className="text-2xl font-display font-bold">{entries.length}</div>
                  <div className="text-sm text-muted-foreground">نص مستخرج</div>
                </div>

                <div className="flex gap-3">
                  <Button
                    onClick={handleOpenEditor}
                    className="bg-[hsl(0,80%,50%)] hover:bg-[hsl(0,80%,45%)] text-white font-display font-bold px-6"
                  >
                    افتح في المحرر
                    <ArrowRight className="w-4 h-4 mr-2" />
                  </Button>
                  <Button
                    onClick={handleExport}
                    variant="outline"
                    disabled={translatedCount === 0}
                  >
                    <Download className="w-4 h-4 ml-2" />
                    تصدير JSON
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Quick Preview */}
        {entries.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg font-display">معاينة سريعة (أول 20 نص)</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2 max-h-[400px] overflow-y-auto">
                {entries.slice(0, 20).map((entry, i) => (
                  <div key={i} className="flex items-start gap-3 p-3 rounded-lg bg-muted/30 border border-border">
                    <code className="text-xs text-muted-foreground shrink-0 mt-1 font-mono bg-muted px-1.5 py-0.5 rounded">
                      {entry.key.length > 30 ? "..." + entry.key.slice(-27) : entry.key}
                    </code>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm" dir="ltr">{entry.original}</div>
                      {entry.translation && (
                        <div className="text-sm text-[hsl(0,80%,55%)] mt-1" dir="rtl">{entry.translation}</div>
                      )}
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
            <p className="text-lg font-display">ارفع ملفات JSON لبدء التعريب</p>
            <p className="text-sm mt-2">يدعم ملفات GFMSG و pkNX وصيغ JSON المتعددة</p>
          </div>
        )}
      </main>
    </div>
  );
}
