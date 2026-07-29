import { useState, useEffect } from "react";
import { measureEntryBytes } from "@/lib/entry-bytes";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { CheckCircle2, AlertTriangle, XCircle, Loader2, Stethoscope } from "lucide-react";
import { idbGet } from "@/lib/idb-storage";
import type { EditorState } from "@/components/editor/types";

interface DiagnosticCheck {
  label: string;
  status: "pass" | "warn" | "fail" | "checking";
  detail?: string;
}

interface PreBuildDiagnosticProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  state: EditorState | null;
  onProceedToBuild: () => void;
}

const StatusIcon = ({ status }: { status: DiagnosticCheck["status"] }) => {
  switch (status) {
    case "pass": return <CheckCircle2 className="w-4 h-4 text-secondary shrink-0" />;
    case "warn": return <AlertTriangle className="w-4 h-4 text-yellow-500 shrink-0" />;
    case "fail": return <XCircle className="w-4 h-4 text-destructive shrink-0" />;
    case "checking": return <Loader2 className="w-4 h-4 text-muted-foreground animate-spin shrink-0" />;
  }
};

const PreBuildDiagnostic = ({ open, onOpenChange, state, onProceedToBuild }: PreBuildDiagnosticProps) => {
  const [checks, setChecks] = useState<DiagnosticCheck[]>([]);
  const [running, setRunning] = useState(false);

  useEffect(() => {
    if (!open || !state) return;
    runDiagnostics();
  }, [open, state]);

  const runDiagnostics = async () => {
    if (!state) return;
    setRunning(true);

    const results: DiagnosticCheck[] = [
      { label: "مصدر البيانات", status: "checking" },
      { label: "عدد الترجمات", status: "checking" },
      { label: "النصوص العربية غير المعالجة", status: "checking" },
      { label: "تجاوز حد البايت", status: "checking" },
      { label: "الرموز التقنية", status: "checking" },
      { label: "ملفات BDAT", status: "checking" },
    ];
    setChecks([...results]);

    // 1. Data source check
    const isDemo = state.isDemo === true;
    results[0] = isDemo
      ? { label: "مصدر البيانات", status: "fail", detail: "بيانات تجريبية — ارفع ملفات حقيقية" }
      : { label: "مصدر البيانات", status: "pass", detail: "ملفات حقيقية" };
    setChecks([...results]);

    // 2. Translation count
    const nonEmpty = Object.entries(state.translations).filter(([, v]) => v?.trim());
    const translatedCount = nonEmpty.length;
    const totalEntries = state.entries.length;
    const pct = totalEntries > 0 ? Math.round((translatedCount / totalEntries) * 100) : 0;
    results[1] = translatedCount === 0
      ? { label: "عدد الترجمات", status: "fail", detail: "لا توجد ترجمات!" }
      : pct < 10
        ? { label: "عدد الترجمات", status: "warn", detail: `${translatedCount} / ${totalEntries} (${pct}%) — قليلة جداً` }
        : { label: "عدد الترجمات", status: "pass", detail: `${translatedCount} / ${totalEntries} (${pct}%)` };
    setChecks([...results]);

    // 3. Unprocessed Arabic
    const arabicRegex = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF]/;
    const formsRegex = /[\uFB50-\uFDFF\uFE70-\uFEFF]/;
    let unprocessedCount = 0;
    for (const [, value] of nonEmpty) {
      if (arabicRegex.test(value) && !formsRegex.test(value)) unprocessedCount++;
    }
    results[2] = unprocessedCount === 0
      ? { label: "النصوص العربية غير المعالجة", status: "pass", detail: "كل النصوص معالجة ✨" }
      : { label: "النصوص العربية غير المعالجة", status: "warn", detail: `${unprocessedCount} نص — سيتم معالجتها تلقائياً عند البناء` };
    setChecks([...results]);

    // 4. Byte overflow
    let overflowCount = 0;
    for (const entry of state.entries) {
      if (entry.maxBytes <= 0) continue;
      const key = `${entry.msbtFile}:${entry.index}`;
      const trans = state.translations[key];
      if (!trans?.trim()) continue;
      const byteLen = measureEntryBytes(entry.msbtFile, trans);
      if (byteLen > entry.maxBytes) overflowCount++;
    }
    results[3] = overflowCount === 0
      ? { label: "تجاوز حد البايت", status: "pass", detail: "لا يوجد تجاوز" }
      : { label: "تجاوز حد البايت", status: "fail", detail: `⛔ ${overflowCount} ترجمة تتجاوز الحد — ستُتخطى عند البناء` };
    setChecks([...results]);

    // 5. Technical tags
    const tagRegex = /[\uFFF9-\uFFFC\uE000-\uE0FF]/;
    let missingTagCount = 0;
    for (const entry of state.entries) {
      if (!tagRegex.test(entry.original)) continue;
      const key = `${entry.msbtFile}:${entry.index}`;
      const trans = state.translations[key];
      if (!trans?.trim()) continue;
      const origTags = (entry.original.match(/[\uFFF9-\uFFFC\uE000-\uE0FF]/g) || []).length;
      const transTags = (trans.match(/[\uFFF9-\uFFFC\uE000-\uE0FF]/g) || []).length;
      if (transTags < origTags) missingTagCount++;
    }
    results[4] = missingTagCount === 0
      ? { label: "الرموز التقنية", status: "pass", detail: "كل الرموز موجودة" }
      : { label: "الرموز التقنية", status: "warn", detail: `${missingTagCount} ترجمة تنقصها رموز — ستُصلح تلقائياً` };
    setChecks([...results]);

    // 6. BDAT files
    const bdatBinaryFileNames = await idbGet<string[]>("editorBdatBinaryFileNames");
    const hasBdat = !!(bdatBinaryFileNames && bdatBinaryFileNames.length > 0);
    results[5] = hasBdat
      ? { label: "ملفات BDAT", status: "pass", detail: `${bdatBinaryFileNames!.length} ملف مرفوع` }
      : { label: "ملفات BDAT", status: isDemo ? "fail" : "warn", detail: "لا توجد ملفات BDAT مرفوعة" };
    setChecks([...results]);

    setRunning(false);
  };

  const failCount = checks.filter(c => c.status === "fail").length;
  const warnCount = checks.filter(c => c.status === "warn").length;
  const allPass = failCount === 0 && warnCount === 0 && checks.length > 0 && !running;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm" dir="rtl">
        <DialogHeader>
          <DialogTitle className="font-display text-lg flex items-center gap-2">
            <Stethoscope className="w-5 h-5" /> تشخيص ما قبل البناء
          </DialogTitle>
          <DialogDescription className="font-body text-sm">
            فحص شامل لحالة البيانات قبل البناء
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          {checks.map((check, i) => (
            <div key={i} className="flex items-start gap-2 p-2 rounded bg-muted/30 border border-border/50">
              <StatusIcon status={check.status} />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-display font-bold">{check.label}</p>
                {check.detail && (
                  <p className="text-xs text-muted-foreground font-body mt-0.5">{check.detail}</p>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Overall status */}
        {!running && checks.length > 0 && (
          <div className={`text-center p-3 rounded-lg border ${
            allPass ? 'bg-secondary/10 border-secondary/30' : 
            failCount > 0 ? 'bg-destructive/10 border-destructive/30' : 
            'bg-yellow-500/10 border-yellow-500/30'
          }`}>
            <p className="text-sm font-display font-bold">
              {allPass ? '✅ جاهز للبناء' : 
               failCount > 0 ? `⛔ ${failCount} مشكلة حرجة` : 
               `⚠️ ${warnCount} تحذير — يمكن المتابعة`}
            </p>
          </div>
        )}

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => onOpenChange(false)} className="font-body">
            إغلاق
          </Button>
          <Button variant="outline" onClick={runDiagnostics} disabled={running} className="font-body">
            {running ? <Loader2 className="w-4 h-4 animate-spin ml-1" /> : <Stethoscope className="w-4 h-4 ml-1" />}
            إعادة الفحص
          </Button>
          <Button onClick={onProceedToBuild} disabled={running} className="font-display font-bold">
            متابعة للبناء →
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default PreBuildDiagnostic;
