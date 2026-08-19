/**
 * Kingdom Hearts editor design note: compact RTL diagnostic card placed beside
 * CTD build controls. It distinguishes automatic, lossless ASCII fallbacks
 * from symbols the user must explicitly edit, and keeps every action reachable
 * on a narrow phone screen.
 */
import * as React from "react";
import { AlertTriangle, BadgeCheck, ChevronLeft, ListFilter, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type { EditorState } from "@/components/editor/types";
import { analyzeKHBBSCTDText, type KHBBSCharacterAnalysis } from "@/lib/khbbs-ctd";

interface KHBBSCharacterSupportPanelProps {
  state: EditorState;
  onNavigateToEntry: (key: string) => void;
  onFilterByKeys: (keys: Set<string>) => void;
}

interface EntryAnalysis {
  key: string;
  file: string;
  row: number;
  analysis: KHBBSCharacterAnalysis;
}

const displayCharacter = (character: string) => character === " " ? "مسافة" : character;

const KHBBSCharacterSupportPanel: React.FC<KHBBSCharacterSupportPanelProps> = ({ state, onNavigateToEntry, onFilterByKeys }) => {
  const result = React.useMemo(() => {
    const affected: EntryAnalysis[] = [];
    const automatic = new Map<string, { character: string; unicode: string; replacement: string; count: number }>();
    const unsupported = new Map<string, { character: string; unicode: string; count: number; keys: Set<string> }>();
    let validationErrors = 0;

    for (const entry of state.entries) {
      const key = `${entry.msbtFile}:${entry.index}`;
      const text = state.translations[key] ?? entry.translation;
      const analysis = analyzeKHBBSCTDText(text || "");
      if (analysis.validationError) validationErrors += 1;
      if (analysis.replacements.length === 0 && analysis.unsupported.length === 0 && !analysis.validationError) continue;
      affected.push({ key, file: entry.msbtFile.replace(/^khbbs:/, ""), row: entry.index + 1, analysis });
      for (const item of analysis.replacements) {
        const previous = automatic.get(item.character);
        automatic.set(item.character, previous
          ? { ...previous, count: previous.count + item.count }
          : { ...item });
      }
      for (const item of analysis.unsupported) {
        const previous = unsupported.get(item.character);
        unsupported.set(item.character, previous
          ? { ...previous, count: previous.count + item.count, keys: new Set([...previous.keys, key]) }
          : { ...item, keys: new Set([key]) });
      }
    }

    return {
      affected,
      automatic: [...automatic.values()].sort((a, b) => a.unicode.localeCompare(b.unicode)),
      unsupported: [...unsupported.values()].sort((a, b) => a.unicode.localeCompare(b.unicode)),
      validationErrors,
    };
  }, [state.entries, state.translations]);

  const unsupportedKeys = new Set(result.unsupported.flatMap((item) => [...item.keys]));
  const autoCount = result.automatic.reduce((sum, item) => sum + item.count, 0);
  const unsupportedCount = result.unsupported.reduce((sum, item) => sum + item.count, 0);

  return (
    <Card className={`mb-4 border-2 ${unsupportedCount > 0 || result.validationErrors > 0 ? "border-destructive/50 bg-destructive/5" : "border-emerald-500/35 bg-emerald-500/5"}`} dir="rtl">
      <CardContent className="p-4 space-y-3">
        <div className="flex items-start gap-3">
          {unsupportedCount > 0 || result.validationErrors > 0 ? <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" /> : <BadgeCheck className="mt-0.5 h-5 w-5 shrink-0 text-emerald-500" />}
          <div className="min-w-0 flex-1">
            <h2 className="font-display text-base font-bold">فحص رموز CTD — Kingdom Hearts</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">الحروف العربية تذهب إلى Font.arabic.arc، وعلامات الهاتف التي لها مقابل إنجليزي تُستبدل تلقائياً عند البناء.</p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 text-center text-xs sm:grid-cols-3">
          <div className="rounded-lg border border-emerald-500/30 bg-background/50 px-2 py-2"><strong className="block text-base text-emerald-600">{autoCount}</strong>استبدال تلقائي</div>
          <div className={`rounded-lg border px-2 py-2 ${unsupportedCount ? "border-destructive/40 bg-destructive/10" : "border-emerald-500/30 bg-background/50"}`}><strong className={`block text-base ${unsupportedCount ? "text-destructive" : "text-emerald-600"}`}>{unsupportedCount}</strong>رمز يحتاج تعديل</div>
          <div className="col-span-2 rounded-lg border border-border bg-background/50 px-2 py-2 sm:col-span-1"><strong className="block text-base">{result.affected.length}</strong>نص متأثر</div>
        </div>

        {result.automatic.length > 0 && (
          <div className="rounded-lg border border-emerald-500/25 bg-emerald-500/5 p-3 text-xs">
            <p className="mb-2 flex items-center gap-1 font-bold text-emerald-700 dark:text-emerald-400"><Sparkles className="h-3.5 w-3.5" /> سيُستبدل تلقائياً عند البناء</p>
            <div className="flex flex-wrap gap-1.5">{result.automatic.map((item) => <span key={item.unicode} className="rounded border border-emerald-500/25 bg-background px-2 py-1 font-mono">{displayCharacter(item.character)} → {item.replacement} <small className="text-muted-foreground">×{item.count}</small></span>)}</div>
          </div>
        )}

        {result.unsupported.length > 0 && (
          <div className="rounded-lg border border-destructive/35 bg-destructive/5 p-3 text-xs">
            <p className="mb-2 font-bold text-destructive">هذه الرموز لا تملك مقابلاً آمناً ولن يُبنى CTD قبل تعديلها</p>
            <div className="space-y-2">{result.unsupported.map((item) => (
              <div key={item.unicode} className="flex flex-wrap items-center gap-2 rounded border border-destructive/20 bg-background/60 p-2">
                <code className="rounded bg-muted px-1.5 py-0.5 text-sm">{displayCharacter(item.character)}</code><span className="font-mono text-muted-foreground">{item.unicode}</span><span>ظهر {item.count} مرة</span>
                <Button size="sm" variant="outline" className="mr-auto h-7 text-xs" onClick={() => onFilterByKeys(item.keys)}><ListFilter className="h-3.5 w-3.5" /> عرض النصوص</Button>
              </div>
            ))}</div>
          </div>
        )}

        {result.validationErrors > 0 && <p className="rounded border border-amber-500/35 bg-amber-500/5 p-2 text-xs text-amber-700 dark:text-amber-300">يوجد {result.validationErrors} نصاً فيه وسم CTD غير صالح؛ أصلح الوسم التقني قبل البناء.</p>}

        {result.affected.length > 0 && (
          <div className="max-h-40 space-y-1 overflow-auto rounded-lg border border-border p-2 text-xs">
            {result.affected.slice(0, 20).map((item) => <button key={item.key} type="button" onClick={() => onNavigateToEntry(item.key)} className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-right hover:bg-muted"><ChevronLeft className="h-3.5 w-3.5 shrink-0" /><span className="truncate">{item.file} · النص {item.row}</span></button>)}
            {result.affected.length > 20 && <p className="px-2 py-1 text-muted-foreground">و{result.affected.length - 20} نصاً آخر — استخدم «عرض النصوص» لعرضها.</p>}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default KHBBSCharacterSupportPanel;
