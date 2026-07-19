import React, { useState, useCallback, useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  ChevronDown,
  ChevronUp,
  X,
  Sparkles,
  FileDown,
  Tags,
  Copy,
  Check,
  Search,
} from "lucide-react";
import { EditorState } from "@/components/editor/types";
import {
  extractTags,
  downloadReport,
  formatReport,
  categoryMatches,
  type TagReport,
  type Category,
} from "@/lib/tag-extractor";
import { Filter } from "lucide-react";

interface CleanupToolsPanelProps {
  state: EditorState;
  // kept for back-compat with the mounting component; unused here.
  onApplyFix?: (key: string, fixedText: string) => void;
  onApplyAll?: (fixes: { key: string; value: string }[]) => void;
  /** Pins the matching entries in the editor's real entry list — same
   * mechanism DeepDiagnosticPanel/QualityChecksPanel use to "عرض في المحرر". */
  onFilterByKeys?: (keys: Set<string>) => void;
}

const CATEGORY_META: Record<
  string,
  { label: string; emoji: string; tone: string }
> = {
  bracket_tags: { label: "وسوم مربعة [Tag:Value]", emoji: "🏷️", tone: "text-sky-400" },
  paired_tags: { label: "وسوم مزدوجة [Tag]...[/Tag]", emoji: "🧩", tone: "text-indigo-400" },
  curly_vars: { label: "متغيرات {var}", emoji: "✨", tone: "text-violet-400" },
  html_like: { label: "وسوم HTML <tag>", emoji: "🌐", tone: "text-cyan-400" },
  escape_seq: { label: "تسلسلات هروب \\xNN", emoji: "🪄", tone: "text-pink-400" },
  pua_chars: { label: "أحرف PUA (أيقونات)", emoji: "🎴", tone: "text-amber-400" },
  control_chars: { label: "أحرف تحكم / BiDi", emoji: "🧭", tone: "text-orange-400" },
  uppercase_tokens: { label: "كلمات بأحرف كبيرة", emoji: "🔠", tone: "text-yellow-400" },
  dollar_vars: { label: "متغيرات $N / $name", emoji: "💲", tone: "text-emerald-400" },
  percent_vars: { label: "محددات تنسيق %s %d", emoji: "📐", tone: "text-teal-400" },
};

const ALL_CATEGORIES = Object.keys(CATEGORY_META) as Category[];

export default function CleanupToolsPanel({ state, onFilterByKeys }: CleanupToolsPanelProps) {
  const [open, setOpen] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [report, setReport] = useState<TagReport | null>(null);
  const [query, setQuery] = useState("");
  const [activeCat, setActiveCat] = useState<string>("all");
  const [copiedToken, setCopiedToken] = useState<string | null>(null);
  const [openCats, setOpenCats] = useState<Record<string, boolean>>({});

  const handleExtract = useCallback(async () => {
    if (extracting) return;
    setExtracting(true);
    setProgress(0);
    setReport(null);
    try {
      const entries = state.entries.map((e) => ({
        msbtFile: e.msbtFile,
        original: e.original || "",
      }));
      const r = await extractTags(entries, (done, total) => {
        setProgress(total > 0 ? Math.round((done / total) * 100) : 0);
      });
      setReport(r);
      // open first non-empty category by default
      const firstNonEmpty = ALL_CATEGORIES.find(
        (c) => (r.categories[c]?.size || 0) > 0,
      );
      if (firstNonEmpty) setOpenCats({ [firstNonEmpty]: true });
      setOpen(true);
    } catch (err) {
      console.error("Tag extraction failed:", err);
    } finally {
      setExtracting(false);
      setProgress(0);
    }
  }, [state.entries, extracting]);

  const handleDownloadTxt = useCallback(() => {
    if (!report) return;
    downloadReport(report);
  }, [report]);

  const handleDownloadJson = useCallback(() => {
    if (!report) return;
    const payload = {
      generatedAt: new Date().toISOString(),
      totalEntries: report.totalEntries,
      scannedEntries: report.scannedEntries,
      categories: Object.fromEntries(
        Object.entries(report.categories).map(([cat, map]) => [
          cat,
          [...map.entries()]
            .sort((a, b) => b[1].count - a[1].count)
            .map(([token, occ]) => ({
              token,
              count: occ.count,
              files: [...occ.files],
              example: occ.example,
            })),
        ]),
      ),
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: "application/json;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `xc-tags-report-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }, [report]);

  const handleCopy = useCallback((token: string) => {
    navigator.clipboard.writeText(token).then(() => {
      setCopiedToken(token);
      setTimeout(() => setCopiedToken((t) => (t === token ? null : t)), 1200);
    });
  }, []);

  const handleCopyAll = useCallback(() => {
    if (!report) return;
    const text = formatReport(report);
    navigator.clipboard.writeText(text);
    setCopiedToken("__all__");
    setTimeout(() => setCopiedToken(null), 1200);
  }, [report]);

  const handleFilterByCategory = useCallback(
    (cat: Category) => {
      if (!onFilterByKeys) return;
      const keys = new Set<string>();
      for (const e of state.entries) {
        if (e.original && categoryMatches(cat, e.original)) {
          keys.add(`${e.msbtFile}:${e.index}`);
        }
      }
      onFilterByKeys(keys);
    },
    [state.entries, onFilterByKeys],
  );

  const totals = useMemo(() => {
    if (!report) return { unique: 0, occurrences: 0, nonEmpty: 0 };
    let unique = 0,
      occurrences = 0,
      nonEmpty = 0;
    for (const cat of ALL_CATEGORIES) {
      const m = report.categories[cat];
      if (!m || m.size === 0) continue;
      nonEmpty++;
      unique += m.size;
      for (const [, occ] of m) occurrences += occ.count;
    }
    return { unique, occurrences, nonEmpty };
  }, [report]);

  const visibleCategories = useMemo(() => {
    if (!report) return [];
    const q = query.trim().toLowerCase();
    return ALL_CATEGORIES.filter((cat) => {
      if (activeCat !== "all" && activeCat !== cat) return false;
      const m = report.categories[cat];
      if (!m || m.size === 0) return false;
      if (!q) return true;
      // keep cat if any token matches query
      for (const [token] of m) {
        if (token.toLowerCase().includes(q)) return true;
      }
      return false;
    });
  }, [report, query, activeCat]);

  if (dismissed) return null;

  return (
    <Card className="mb-4 border-purple-500/30 bg-purple-500/5">
      <Collapsible open={open} onOpenChange={setOpen}>
        <CardContent className="p-3">
          <CollapsibleTrigger className="flex items-center justify-between w-full text-right">
            <div className="flex items-center gap-2">
              <Tags className="w-4 h-4 text-purple-400" />
              <span className="font-display font-bold text-sm">
                فاحص الوسوم التقنية
              </span>
              {report && (
                <Badge variant="secondary" className="text-xs">
                  {totals.unique} وسم · {totals.occurrences} ظهور
                </Badge>
              )}
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                className="text-xs h-7 text-muted-foreground"
                onClick={(e) => {
                  e.stopPropagation();
                  setDismissed(true);
                }}
              >
                <X className="w-3 h-3" />
              </Button>
              {open ? (
                <ChevronUp className="w-4 h-4" />
              ) : (
                <ChevronDown className="w-4 h-4" />
              )}
            </div>
          </CollapsibleTrigger>

          <CollapsibleContent className="mt-3 space-y-3">
            {/* Run / Re-run */}
            <Button
              variant="default"
              size="sm"
              className="w-full text-xs h-9 gap-1.5"
              onClick={(e) => {
                e.stopPropagation();
                handleExtract();
              }}
              disabled={extracting || state.entries.length === 0}
            >
              {extracting ? (
                <>
                  <Sparkles className="w-3 h-3 animate-spin" />
                  جاري الفحص... {progress}%
                </>
              ) : (
                <>
                  <Search className="w-3 h-3" />
                  {report ? "إعادة الفحص" : "فحص واستخراج الوسوم"}
                </>
              )}
            </Button>

            {!report && !extracting && (
              <p className="text-[11px] text-muted-foreground text-center">
                يمسح هذا الفاحص النصوص الإنجليزية الأصلية ويستخرج كل الوسوم
                التقنية مصنّفة (مربعة، مزدوجة، متغيرات، PUA…).
              </p>
            )}

            {report && (
              <>
                {/* Summary + export buttons */}
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="outline" className="text-[10px]">
                    إدخالات: {report.scannedEntries}/{report.totalEntries}
                  </Badge>
                  <Badge variant="outline" className="text-[10px]">
                    أقسام نشطة: {totals.nonEmpty}/{ALL_CATEGORIES.length}
                  </Badge>
                  <div className="flex-1" />
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-[11px] h-7 gap-1"
                    onClick={handleCopyAll}
                  >
                    {copiedToken === "__all__" ? (
                      <Check className="w-3 h-3 text-green-500" />
                    ) : (
                      <Copy className="w-3 h-3" />
                    )}
                    نسخ التقرير
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-[11px] h-7 gap-1"
                    onClick={handleDownloadTxt}
                  >
                    <FileDown className="w-3 h-3" /> TXT
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-[11px] h-7 gap-1"
                    onClick={handleDownloadJson}
                  >
                    <FileDown className="w-3 h-3" /> JSON
                  </Button>
                </div>

                {/* Search */}
                <div className="relative">
                  <Search className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                  <Input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="ابحث عن وسم..."
                    className="h-8 text-xs pr-7"
                  />
                </div>

                {/* Category filter chips */}
                <div className="flex flex-wrap gap-1.5">
                  <Badge
                    variant={activeCat === "all" ? "default" : "outline"}
                    className="text-[10px] cursor-pointer"
                    onClick={() => setActiveCat("all")}
                  >
                    الكل
                  </Badge>
                  {ALL_CATEGORIES.filter(
                    (c) => (report.categories[c]?.size || 0) > 0,
                  ).map((cat) => (
                    <Badge
                      key={cat}
                      variant={activeCat === cat ? "default" : "outline"}
                      className="text-[10px] cursor-pointer gap-1"
                      onClick={() => setActiveCat(cat)}
                    >
                      {CATEGORY_META[cat].emoji}
                      {report.categories[cat].size}
                    </Badge>
                  ))}
                </div>

                {/* Categorized results */}
                <div className="max-h-[480px] overflow-y-auto space-y-2 pr-1">
                  {visibleCategories.length === 0 && (
                    <p className="text-xs text-muted-foreground text-center py-4">
                      لا توجد نتائج مطابقة.
                    </p>
                  )}
                  {visibleCategories.map((cat) => {
                    const meta = CATEGORY_META[cat];
                    const map = report.categories[cat];
                    const q = query.trim().toLowerCase();
                    const sorted = [...map.entries()]
                      .filter(([token]) =>
                        q ? token.toLowerCase().includes(q) : true,
                      )
                      .sort((a, b) => b[1].count - a[1].count);
                    const totalCount = sorted.reduce(
                      (s, [, v]) => s + v.count,
                      0,
                    );
                    const isOpen = openCats[cat] ?? false;

                    return (
                      <div
                        key={cat}
                        className="rounded-lg border border-border/50 bg-background/40 overflow-hidden"
                      >
                        <div className="w-full flex items-center justify-between p-2 hover:bg-background/60">
                          <button
                            type="button"
                            onClick={() =>
                              setOpenCats((prev) => ({
                                ...prev,
                                [cat]: !isOpen,
                              }))
                            }
                            className="flex items-center gap-2 flex-1 text-right"
                          >
                            <span className={`text-sm ${meta.tone}`}>
                              {meta.emoji}
                            </span>
                            <span className="text-xs font-bold">
                              {meta.label}
                            </span>
                            <Badge variant="secondary" className="text-[10px]">
                              {sorted.length} وسم · {totalCount} ظهور
                            </Badge>
                          </button>
                          <div className="flex items-center gap-1">
                            {onFilterByKeys && (
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                title="عرض هذه النصوص في المحرر"
                                className="h-6 gap-1 text-[10px] px-1.5"
                                onClick={() => handleFilterByCategory(cat)}
                              >
                                <Filter className="w-3 h-3" /> عرض في المحرر
                              </Button>
                            )}
                            <button
                              type="button"
                              onClick={() =>
                                setOpenCats((prev) => ({
                                  ...prev,
                                  [cat]: !isOpen,
                                }))
                              }
                            >
                              {isOpen ? (
                                <ChevronUp className="w-3.5 h-3.5" />
                              ) : (
                                <ChevronDown className="w-3.5 h-3.5" />
                              )}
                            </button>
                          </div>
                        </div>

                        {isOpen && (
                          <div className="border-t border-border/40 divide-y divide-border/30">
                            {sorted.slice(0, 300).map(([token, occ]) => (
                              <div
                                key={token}
                                className="p-2 space-y-1 hover:bg-background/40"
                              >
                                <div className="flex items-center justify-between gap-2">
                                  <code
                                    className="text-[11px] bg-background/70 rounded px-1.5 py-0.5 font-mono break-all"
                                    dir="ltr"
                                  >
                                    {token}
                                  </code>
                                  <div className="flex items-center gap-1 shrink-0">
                                    <Badge
                                      variant="outline"
                                      className="text-[10px]"
                                    >
                                      ×{occ.count}
                                    </Badge>
                                    <Badge
                                      variant="outline"
                                      className="text-[10px]"
                                    >
                                      {occ.files.size} ملف
                                    </Badge>
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      className="h-6 w-6 p-0"
                                      onClick={() => handleCopy(token)}
                                    >
                                      {copiedToken === token ? (
                                        <Check className="w-3 h-3 text-green-500" />
                                      ) : (
                                        <Copy className="w-3 h-3" />
                                      )}
                                    </Button>
                                  </div>
                                </div>
                                <div
                                  className="text-[10px] text-muted-foreground line-clamp-2"
                                  dir="ltr"
                                >
                                  {occ.example}
                                </div>
                              </div>
                            ))}
                            {sorted.length > 300 && (
                              <div className="p-2 text-[10px] text-muted-foreground text-center">
                                ...و {sorted.length - 300} وسم إضافي (استخدم
                                التصدير لعرض الكل)
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* Empty-categories footer */}
                {totals.nonEmpty < ALL_CATEGORIES.length && (
                  <div className="text-[10px] text-muted-foreground border-t border-border/40 pt-2">
                    أقسام فارغة (لم يُعثر فيها على شيء):{" "}
                    {ALL_CATEGORIES.filter(
                      (c) => (report.categories[c]?.size || 0) === 0,
                    )
                      .map((c) => CATEGORY_META[c].label)
                      .join(" · ")}
                  </div>
                )}
              </>
            )}
          </CollapsibleContent>
        </CardContent>
      </Collapsible>
    </Card>
  );
}
