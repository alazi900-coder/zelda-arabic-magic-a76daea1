import { useState, useCallback, useMemo } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Upload, Download, Loader2, ArrowRight, Search } from "lucide-react";
import { toast } from "sonner";
import {
  parseBankTable,
  parseBankRegion,
  rebuildBank,
  applyRebuild,
  type M3Bank,
  type BankRegion,
} from "@/lib/mother3/m3-script";

/**
 * Mother 3 (English Fan Translation v1.1) script browser + editor.
 * Opens a .gba ROM entirely in the browser, decodes the obfuscated main script
 * into editable lines, and rebuilds a patched ROM to download. Read/decode is
 * fully verified; write-back repacks each bank within its own ROM region and
 * refuses (rather than corrupts) if an edited bank overflows that region.
 */
export default function Mother3() {
  const [rom, setRom] = useState<Uint8Array | null>(null);
  const [romName, setRomName] = useState("");
  const [regions, setRegions] = useState<BankRegion[]>([]);
  const [bank, setBank] = useState<M3Bank | null>(null);
  const [edits, setEdits] = useState<Map<number, string>>(new Map());
  const [busy, setBusy] = useState(false);
  const [query, setQuery] = useState("");
  const [dragOver, setDragOver] = useState(false);

  const loadRom = useCallback(async (file: File) => {
    setBusy(true);
    try {
      const buf = new Uint8Array(await file.arrayBuffer());
      const regs = parseBankTable(buf).filter((r) => r.end - r.start > 2);
      if (regs.length === 0) throw new Error("لم يُعثر على جدول نصوص Mother 3 — تأكد أنها النسخة الإنجليزية 1.1");
      setRom(buf);
      setRomName(file.name);
      setRegions(regs);
      setBank(null);
      setEdits(new Map());
      toast.success(`تم فتح الـ ROM — ${regs.length} بنك نصوص`);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }, []);

  const openBank = useCallback(
    (region: BankRegion) => {
      if (!rom) return;
      const parsed = parseBankRegion(rom, region);
      if (!parsed || parsed.lines.length === 0) {
        toast.error(`البنك ${region.index} فارغ أو غير قابل للقراءة`);
        return;
      }
      setBank(parsed);
      setEdits(new Map());
    },
    [rom]
  );

  const setLineEdit = useCallback((lineIndex: number, value: string) => {
    setEdits((prev) => {
      const next = new Map(prev);
      next.set(lineIndex, value);
      return next;
    });
  }, []);

  const download = useCallback(() => {
    if (!rom || !bank) return;
    const res = rebuildBank(rom, bank, edits);
    if ("error" in res) {
      toast.error(
        res.overflowBy
          ? `${res.error} — يتجاوز بـ ${res.overflowBy} بايت. قصّر النص أو وزّعه على أسطر أقصر.`
          : res.error
      );
      return;
    }
    const newRom = applyRebuild(rom, res);
    const blob = new Blob([newRom], { type: "application/octet-stream" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = romName.replace(/\.gba$/i, "") + "_ar.gba";
    a.click();
    URL.revokeObjectURL(url);
    toast.success("تم بناء الـ ROM المعرّب");
  }, [rom, bank, edits, romName]);

  const editedCount = edits.size;
  const filteredRegions = useMemo(() => {
    if (!query.trim()) return regions;
    const n = parseInt(query, 10);
    return Number.isNaN(n) ? regions : regions.filter((r) => r.index === n);
  }, [regions, query]);

  return (
    <div className="min-h-screen bg-background text-foreground" dir="rtl">
      <div className="mx-auto max-w-5xl px-4 py-8">
        <div className="mb-6 flex items-center justify-between">
          <h1 className="text-2xl font-bold">تعريب Mother 3 (نصوص السكربت)</h1>
          <Link to="/" className="text-sm text-muted-foreground hover:underline">
            الرئيسية <ArrowRight className="inline h-4 w-4" />
          </Link>
        </div>

        {!rom ? (
          <label
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(false);
              const f = e.dataTransfer.files[0];
              if (f) void loadRom(f);
            }}
            className={`flex cursor-pointer flex-col items-center gap-3 rounded-xl border-2 border-dashed p-12 transition ${
              dragOver ? "border-primary bg-primary/5" : "border-muted"
            }`}
          >
            {busy ? <Loader2 className="h-10 w-10 animate-spin" /> : <Upload className="h-10 w-10 text-muted-foreground" />}
            <span className="text-lg font-medium">افتح ملف Mother 3 (.gba)</span>
            <span className="text-sm text-muted-foreground">النسخة الإنجليزية 1.1 — كل المعالجة تحدث في متصفحك</span>
            <input
              type="file"
              accept=".gba"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void loadRom(f);
              }}
            />
          </label>
        ) : (
          <>
            <div className="mb-4 flex flex-wrap items-center gap-3">
              <span className="text-sm text-muted-foreground">{romName}</span>
              <span className="rounded bg-muted px-2 py-0.5 text-xs">{regions.length} بنك</span>
              {editedCount > 0 && (
                <span className="rounded bg-primary/10 px-2 py-0.5 text-xs text-primary">{editedCount} سطر معدّل</span>
              )}
              <div className="ms-auto flex gap-2">
                <Button size="sm" variant="outline" onClick={() => { setRom(null); setBank(null); }}>
                  فتح آخر
                </Button>
                <Button size="sm" onClick={download} disabled={!bank}>
                  <Download className="me-1 h-4 w-4" /> بناء ROM معرّب
                </Button>
              </div>
            </div>

            {!bank ? (
              <div>
                <div className="relative mb-3">
                  <Search className="pointer-events-none absolute end-3 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="ابحث برقم البنك…"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    className="pe-9"
                  />
                </div>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 md:grid-cols-6">
                  {filteredRegions.map((r) => (
                    <button
                      key={r.index}
                      onClick={() => openBank(r)}
                      className="rounded-lg border p-2 text-sm hover:border-primary hover:bg-primary/5"
                    >
                      بنك {r.index}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div>
                <div className="mb-3 flex items-center gap-2">
                  <Button size="sm" variant="ghost" onClick={() => setBank(null)}>
                    ← البنوك
                  </Button>
                  <span className="text-sm font-medium">
                    بنك {bank.index} — {bank.lines.length} سطر
                  </span>
                </div>
                <div className="space-y-2">
                  {bank.lines.map((line) => {
                    const val = edits.has(line.index) ? edits.get(line.index)! : line.text;
                    const changed = edits.has(line.index) && edits.get(line.index) !== line.text;
                    return (
                      <div key={line.index} className="rounded-lg border p-2">
                        <div className="mb-1 flex items-center gap-2 text-xs text-muted-foreground">
                          <span>سطر {line.index}</span>
                          {changed && <span className="text-primary">معدّل</span>}
                          <span className="ms-auto ltr font-mono opacity-60" dir="ltr">
                            {line.text}
                          </span>
                        </div>
                        <Textarea
                          dir="rtl"
                          value={val}
                          onChange={(e) => setLineEdit(line.index, e.target.value)}
                          rows={1}
                          className="min-h-9 resize-y font-mono text-sm"
                        />
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </>
        )}

        <p className="mt-8 text-xs text-muted-foreground">
          ملاحظة: أكواد التحكم تظهر بين قوسين مثل <code className="rounded bg-muted px-1">[F103]</code> والبايتات غير المعروفة مثل{" "}
          <code className="rounded bg-muted px-1">{"{9B}"}</code> — اتركها كما هي داخل النص. النص المعرّب يجب أن يبقى ضمن
          مساحة البنك؛ لو تجاوزها ستُنبّهك الأداة بعدد البايتات الزائدة.
        </p>
      </div>
    </div>
  );
}
