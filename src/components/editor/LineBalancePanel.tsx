import React, { useState, useCallback, useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ChevronDown, ChevronUp, Scale, CheckCircle2, X, Sparkles, Check, XCircle, Filter, Pencil, Wand2 } from "lucide-react";
import { EditorState, categorizeFile, categorizeBdatTable, categorizeDanganronpaFile } from "@/components/editor/types";
import { balanceLines, hasOrphanLines, splitEvenlyByLines } from "@/lib/balance-lines";
import { countEffectiveLines } from "@/lib/text-tokens";
import { runRebalanceBatch, type RebalanceItem } from "@/lib/diagnostic-runner";
import { toast } from "sonner";

interface BalanceResult {
  key: string;
  label: string;
  file: string;
  category: string;
  before: string;
  after: string;
}

interface LineBalancePanelProps {
  state: EditorState;
  onApplyFix: (key: string, fixedText: string) => void;
  onApplyAll: (fixes: { key: string; value: string }[]) => void;
}

/** Render text with visible line breaks */
function LinesPreview({ text, variant }: { text: string; variant: 'before' | 'after' }) {
  const lines = text.split('\n');
  const bgClass = variant === 'before' ? 'bg-destructive/10' : 'bg-primary/10';
  
  return (
    <div className={`${bgClass} rounded p-2 font-body text-xs`} dir="rtl">
      <span className="text-[10px] text-muted-foreground block mb-1">
        {variant === 'before' ? '⚠️ قبل (كلمات يتيمة):' : '✅ بعد (متوازن):'}
      </span>
      {lines.map((line, i) => {
        const isOrphan = variant === 'before' && line.trim().split(/\s+/).length <= 1 && lines.length > 1;
        return (
          <div key={i} className="flex items-start gap-1.5">
            <span className="text-[10px] text-muted-foreground/50 select-none min-w-[14px] text-left font-mono">{i + 1}</span>
            <span className={isOrphan ? 'text-destructive font-bold bg-destructive/15 px-1 rounded' : ''}>
              {line || '\u00A0'}
            </span>
          </div>
        );
      })}
    </div>
  );
}

export default function LineBalancePanel({ state, onApplyFix, onApplyAll }: LineBalancePanelProps) {
  const [open, setOpen] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [results, setResults] = useState<BalanceResult[] | null>(null);
  const [filterMode, setFilterMode] = useState<'all' | 'file' | 'category'>('all');
  const [selectedFilter, setSelectedFilter] = useState<string | null>(null);
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editText, setEditText] = useState('');
  const [rebalancing, setRebalancing] = useState(false);
  const [rebalanceProgress, setRebalanceProgress] = useState({ current: 0, total: 0, fixed: 0 });

  /**
   * Re-balance ALL translations using the Web Worker pipeline (zero-copy).
   * Pre-filters entries on the main thread (cheap regex/length checks) so we
   * only ship candidates needing re-balance to the worker. The worker handles
   * the heavy DP `splitEvenlyByLines` / `balanceLines` calls off-thread,
   * keeping the UI responsive on mobile even with 50k+ entries.
   */
  const handleRebalanceAll = useCallback(() => {
    if (rebalancing) return;
    const entries = state.entries;

    // ───── Pre-filter on main thread (cheap, no DP) ─────
    const candidates: RebalanceItem[] = [];
    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i];
      const key = `${entry.msbtFile}:${entry.index}`;
      const translation = state.translations[key]?.trim();
      if (!translation) continue;

      const englishLineCount = countEffectiveLines(entry.original);
      const hasXenoN = /\[\s*XENO\s*:\s*n\s*\]/.test(entry.original) || /\[\s*XENO\s*:\s*n\s*\]/.test(translation);
      const arabicLineCount = countEffectiveLines(translation);
      const hasOrphan = hasOrphanLines(translation);
      const lineMismatch = englishLineCount !== arabicLineCount;
      if (!hasXenoN && !hasOrphan && !lineMismatch) continue;

      candidates.push({ key, original: entry.original, translation, englishLineCount });
    }

    if (candidates.length === 0) {
      toast.info('لا توجد نصوص بحاجة لإعادة موازنة', {
        description: `جميع الـ ${entries.length.toLocaleString()} نص متوازنة بالفعل ✨`,
      });
      return;
    }

    setRebalancing(true);
    setRebalanceProgress({ current: 0, total: candidates.length, fixed: 0 });
    toast.info('⚖️ بدء إعادة الموازنة', {
      description: `جاري معالجة ${candidates.length.toLocaleString()} نص في الخلفية (Web Worker)...`,
    });

    runRebalanceBatch(candidates, (p) => {
      setRebalanceProgress({ current: p.done, total: p.total, fixed: 0 });
    })
      .then((results) => {
        const fixes = results.map((r) => ({ key: r.key, value: r.fixed }));
        setRebalanceProgress({ current: candidates.length, total: candidates.length, fixed: fixes.length });

        if (fixes.length > 0) {
          onApplyAll(fixes);
          // ✅ Confirmation that the update reached the editor state
          toast.success(`✨ تمت إعادة موازنة ${fixes.length.toLocaleString()} نص بنجاح`, {
            description: `فُحص ${entries.length.toLocaleString()} نص — ${candidates.length.toLocaleString()} مرشّح — ${fixes.length.toLocaleString()} تغيير مُطبَّق على المحرر.`,
            duration: 6000,
          });
        } else {
          toast.info('لا توجد نصوص بحاجة لإعادة موازنة', {
            description: `فُحص ${candidates.length.toLocaleString()} مرشّح — لا تغييرات مطلوبة ✨`,
          });
        }
      })
      .catch((err) => {
        console.error('[rebalance] worker error:', err);
        toast.error('فشل إعادة الموازنة', { description: String(err?.message ?? err) });
      })
      .finally(() => {
        setRebalancing(false);
      });
  }, [state.entries, state.translations, onApplyAll, rebalancing]);

  const handleScan = useCallback(() => {
    setScanning(true);
    setSelectedFilter(null);
    setFilterMode('all');
    setTimeout(() => {
      const found: BalanceResult[] = [];

      for (const entry of state.entries) {
        const key = `${entry.msbtFile}:${entry.index}`;
        const translation = state.translations[key]?.trim();
        if (!translation) continue;

        if (hasOrphanLines(translation)) {
          const englishLineCount = countEffectiveLines(entry.original);
          const balanced = englishLineCount > 1
            ? splitEvenlyByLines(translation, englishLineCount)
            : translation;
          if (balanced !== translation) {
            const isBdat = /^.+?\[\d+\]\./.test(entry.label);
            const sourceFile = entry.msbtFile.startsWith('bdat-bin:')
              ? entry.msbtFile.split(':')[1]
              : entry.msbtFile.startsWith('bdat:')
              ? entry.msbtFile.slice(5)
              : undefined;
            const isDr = !isBdat && entry.msbtFile.includes(':') && !entry.msbtFile.startsWith('bdat');
            const category = isBdat
              ? categorizeBdatTable(entry.label, sourceFile)
              : isDr ? categorizeDanganronpaFile(entry.msbtFile) : categorizeFile(entry.msbtFile);

            found.push({
              key,
              label: entry.label,
              file: entry.msbtFile,
              category,
              before: translation,
              after: balanced,
            });
          }
        }
      }

      setResults(found);
      setScanning(false);
      setOpen(true);
    }, 50);
  }, [state.entries, state.translations]);

  // Compute unique files and categories from results
  const { fileGroups, categoryGroups } = useMemo(() => {
    if (!results) return { fileGroups: new Map<string, number>(), categoryGroups: new Map<string, number>() };
    const files = new Map<string, number>();
    const cats = new Map<string, number>();
    for (const r of results) {
      files.set(r.file, (files.get(r.file) || 0) + 1);
      cats.set(r.category, (cats.get(r.category) || 0) + 1);
    }
    return { fileGroups: files, categoryGroups: cats };
  }, [results]);

  // Filtered results
  const filteredResults = useMemo(() => {
    if (!results) return null;
    if (filterMode === 'all' || !selectedFilter) return results;
    if (filterMode === 'file') return results.filter(r => r.file === selectedFilter);
    return results.filter(r => r.category === selectedFilter);
  }, [results, filterMode, selectedFilter]);

  const handleAccept = useCallback((result: BalanceResult) => {
    onApplyFix(result.key, result.after);
    setResults(prev => prev?.filter(r => r.key !== result.key) || null);
  }, [onApplyFix]);

  const handleReject = useCallback((key: string) => {
    setResults(prev => prev?.filter(r => r.key !== key) || null);
  }, []);

  const handleAcceptAll = useCallback(() => {
    if (!filteredResults) return;
    onApplyAll(filteredResults.map(r => ({ key: r.key, value: r.after })));
    // Remove accepted from results
    const acceptedKeys = new Set(filteredResults.map(r => r.key));
    setResults(prev => prev?.filter(r => !acceptedKeys.has(r.key)) || null);
  }, [filteredResults, onApplyAll]);

  const handleRejectAll = useCallback(() => {
    if (!filteredResults) return;
    const rejectedKeys = new Set(filteredResults.map(r => r.key));
    setResults(prev => prev?.filter(r => !rejectedKeys.has(r.key)) || null);
  }, [filteredResults]);

  if (dismissed) return null;

  const displayResults = filteredResults || [];
  const showingFiltered = filterMode !== 'all' && selectedFilter;

  return (
    <Card className="mb-4 border-accent/30 bg-accent/5">
      <Collapsible open={open} onOpenChange={setOpen}>
        <CardContent className="p-3">
          <CollapsibleTrigger className="flex items-center justify-between w-full text-right">
            <div className="flex items-center gap-2">
              <Scale className="w-4 h-4 text-accent" />
              <span className="font-display font-bold text-sm">⚖️ إعادة توازن الأسطر</span>
              {results && results.length > 0 && (
                <Badge variant="secondary" className="text-xs">{results.length} نص</Badge>
              )}
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <Button
                variant="default"
                size="sm"
                className="text-xs h-7 gap-1"
                onClick={(e) => { e.stopPropagation(); handleRebalanceAll(); }}
                disabled={rebalancing || scanning}
                title="يمر على كل الترجمات ويعيد موازنتها مع احترام [XENO:n ] كحد إلزامي"
              >
                {rebalancing ? (
                  <><Wand2 className="w-3 h-3 animate-pulse" /> {rebalanceProgress.current}/{rebalanceProgress.total}</>
                ) : (
                  <><Wand2 className="w-3 h-3" /> إعادة موازنة الكل (XENO:n)</>
                )}
              </Button>
              <Button
                variant="secondary"
                size="sm"
                className="text-xs h-7"
                onClick={(e) => { e.stopPropagation(); handleScan(); }}
                disabled={scanning || rebalancing}
              >
                {scanning ? (
                  <><Sparkles className="w-3 h-3 animate-spin" /> جاري الفحص...</>
                ) : (
                  <><Sparkles className="w-3 h-3" /> فحص الكلمات اليتيمة</>
                )}
              </Button>
              <Button variant="ghost" size="sm" className="text-xs h-7 text-muted-foreground" onClick={(e) => { e.stopPropagation(); setDismissed(true); }}>
                <X className="w-3 h-3" />
              </Button>
              {open ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </div>
          </CollapsibleTrigger>

          {/* Live progress bar for global re-balance */}
          {rebalancing && (
            <div className="mt-3 space-y-1.5 bg-background/40 rounded-lg p-2 border border-accent/20">
              <div className="flex items-center justify-between text-[11px] text-muted-foreground font-mono">
                <span>إعادة موازنة شاملة...</span>
                <span>{rebalanceProgress.current.toLocaleString()} / {rebalanceProgress.total.toLocaleString()} • مُصلَح: {rebalanceProgress.fixed}</span>
              </div>
              <Progress
                value={rebalanceProgress.total > 0 ? (rebalanceProgress.current / rebalanceProgress.total) * 100 : 0}
                className="h-1.5"
              />
            </div>
          )}

          <CollapsibleContent className="mt-3 space-y-3">
            {/* No results yet */}
            {!results && !scanning && (
              <p className="text-xs text-muted-foreground text-center py-2">
                يكتشف النصوص التي تحتوي أسطراً بكلمة يتيمة واحدة ويعيد توازنها تلقائياً
              </p>
            )}

            {/* Clean */}
            {results && results.length === 0 && (
              <div className="flex items-center gap-2 justify-center py-3">
                <CheckCircle2 className="w-4 h-4 text-primary" />
                <span className="text-sm font-display">لا توجد كلمات يتيمة ✨</span>
              </div>
            )}

            {/* Results with comparison */}
            {results && results.length > 0 && (
              <>
                {/* Filter controls */}
                <div className="flex items-center gap-2 flex-wrap bg-background/30 rounded-lg p-2">
                  <Filter className="w-3.5 h-3.5 text-muted-foreground" />
                  <span className="text-xs text-muted-foreground">فلترة:</span>
                  <Button
                    size="sm"
                    variant={filterMode === 'all' ? 'default' : 'outline'}
                    className="text-[11px] h-6 px-2"
                    onClick={() => { setFilterMode('all'); setSelectedFilter(null); }}
                  >
                    الكل ({results.length})
                  </Button>
                  <Button
                    size="sm"
                    variant={filterMode === 'category' ? 'default' : 'outline'}
                    className="text-[11px] h-6 px-2"
                    onClick={() => { setFilterMode('category'); setSelectedFilter(null); }}
                  >
                    حسب الفئة ({categoryGroups.size})
                  </Button>
                  <Button
                    size="sm"
                    variant={filterMode === 'file' ? 'default' : 'outline'}
                    className="text-[11px] h-6 px-2"
                    onClick={() => { setFilterMode('file'); setSelectedFilter(null); }}
                  >
                    حسب الملف ({fileGroups.size})
                  </Button>
                </div>

                {/* Filter chips */}
                {filterMode === 'category' && (
                  <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto">
                    {[...categoryGroups.entries()]
                      .sort((a, b) => b[1] - a[1])
                      .map(([cat, count]) => (
                        <Badge
                          key={cat}
                          variant={selectedFilter === cat ? 'default' : 'outline'}
                          className="text-[11px] cursor-pointer hover:bg-accent/20 transition-colors"
                          onClick={() => setSelectedFilter(selectedFilter === cat ? null : cat)}
                        >
                          {cat} ({count})
                        </Badge>
                      ))}
                  </div>
                )}

                {filterMode === 'file' && (
                  <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto">
                    {[...fileGroups.entries()]
                      .sort((a, b) => b[1] - a[1])
                      .map(([file, count]) => {
                        const shortName = file.split('/').pop() || file;
                        return (
                          <Badge
                            key={file}
                            variant={selectedFilter === file ? 'default' : 'outline'}
                            className="text-[11px] cursor-pointer hover:bg-accent/20 transition-colors font-mono"
                            onClick={() => setSelectedFilter(selectedFilter === file ? null : file)}
                            title={file}
                          >
                            {shortName.length > 25 ? shortName.slice(0, 22) + '...' : shortName} ({count})
                          </Badge>
                        );
                      })}
                  </div>
                )}

                {/* Bulk actions */}
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <span className="text-xs font-body text-muted-foreground">
                    {showingFiltered
                      ? `${displayResults.length} من ${results.length} نص`
                      : `${displayResults.length} نص يحتوي كلمات يتيمة`}
                  </span>
                  <div className="flex gap-2">
                    <Button size="sm" variant="default" className="text-xs h-7" onClick={handleAcceptAll}>
                      <Check className="w-3 h-3 ml-1" /> موافقة{showingFiltered ? ' المفلتر' : ' للكل'} ({displayResults.length})
                    </Button>
                    <Button size="sm" variant="outline" className="text-xs h-7 text-destructive border-destructive/30" onClick={handleRejectAll}>
                      <XCircle className="w-3 h-3 ml-1" /> رفض{showingFiltered ? ' المفلتر' : ' الكل'}
                    </Button>
                  </div>
                </div>

                {/* Individual results */}
                <div className="max-h-[500px] overflow-y-auto space-y-2 pr-1">
                  {displayResults.slice(0, 100).map((result) => (
                    <div key={result.key} className="bg-background/60 rounded-lg border border-border/50 overflow-hidden">
                      {/* Label row */}
                      <div className="flex items-center gap-2 px-3 pt-2 pb-1">
                        <span className="text-[11px] font-mono text-muted-foreground truncate max-w-[250px]" dir="ltr">
                          {result.label}
                        </span>
                        <Badge variant="outline" className="text-[10px] shrink-0">{result.category}</Badge>
                      </div>

                      {/* Main row: Before → After + Actions */}
                      <div className="flex items-stretch gap-0">
                        {/* Before */}
                        <div className="flex-1 px-3 py-2 bg-destructive/5 border-l border-border/30">
                          <span className="text-[10px] text-destructive/70 font-semibold block mb-1">قبل ⚠️</span>
                          <div className="font-body text-xs leading-relaxed" dir="rtl">
                            {result.before.split('\n').map((line, i) => {
                              const isOrphan = line.trim().split(/\s+/).length <= 1 && result.before.split('\n').length > 1;
                              return (
                                <div key={i} className={isOrphan ? 'text-destructive font-bold bg-destructive/10 px-1 rounded inline-block' : ''}>
                                  {line || '\u00A0'}
                                </div>
                              );
                            })}
                          </div>
                        </div>

                        {/* Arrow separator */}
                        <div className="flex items-center px-1 text-muted-foreground/40 text-lg select-none">→</div>

                        {/* After */}
                        <div className="flex-1 px-3 py-2 bg-primary/5 border-r border-border/30">
                          <span className="text-[10px] text-primary/70 font-semibold block mb-1">بعد ✅</span>
                          {editingKey === result.key ? (
                            <Textarea
                              value={editText}
                              onChange={(e) => setEditText(e.target.value)}
                              className="text-xs font-body min-h-[60px] bg-background/80"
                              dir="rtl"
                              autoFocus
                            />
                          ) : (
                            <div className="font-body text-xs leading-relaxed" dir="rtl">
                              {result.after.split('\n').map((line, i) => (
                                <div key={i}>{line || '\u00A0'}</div>
                              ))}
                            </div>
                          )}
                        </div>

                        {/* Action buttons - prominent */}
                        <div className="flex flex-col justify-center gap-1.5 px-2 py-2 bg-muted/30 border-r border-border/30">
                          {editingKey === result.key ? (
                            <>
                              <Button
                                size="sm"
                                variant="default"
                                className="h-8 px-3 text-xs font-bold gap-1"
                                onClick={() => {
                                  onApplyFix(result.key, editText.trim());
                                  setResults(prev => prev?.filter(r => r.key !== result.key) || null);
                                  setEditingKey(null);
                                }}
                              >
                                <Check className="w-4 h-4" />
                                حفظ
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-8 px-3 text-xs font-bold gap-1"
                                onClick={() => setEditingKey(null)}
                              >
                                <X className="w-4 h-4" />
                                إلغاء
                              </Button>
                            </>
                          ) : (
                            <>
                              <Button
                                size="sm"
                                variant="default"
                                className="h-8 px-3 text-xs font-bold gap-1"
                                onClick={() => handleAccept(result)}
                              >
                                <Check className="w-4 h-4" />
                                موافقة
                              </Button>
                              <Button
                                size="sm"
                                variant="secondary"
                                className="h-8 px-3 text-xs font-bold gap-1"
                                onClick={() => { setEditingKey(result.key); setEditText(result.after); }}
                              >
                                <Pencil className="w-4 h-4" />
                                تعديل
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-8 px-3 text-xs font-bold gap-1 text-destructive border-destructive/40 hover:bg-destructive/10"
                                onClick={() => handleReject(result.key)}
                              >
                                <X className="w-4 h-4" />
                                رفض
                              </Button>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                  {displayResults.length > 100 && (
                    <p className="text-xs text-muted-foreground text-center py-2">
                      و {displayResults.length - 100} نص آخر...
                    </p>
                  )}
                </div>
              </>
            )}
          </CollapsibleContent>
        </CardContent>
      </Collapsible>
    </Card>
  );
}
