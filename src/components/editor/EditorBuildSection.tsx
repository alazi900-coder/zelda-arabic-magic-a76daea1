import React, { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Eye, EyeOff, AlertTriangle, Loader2, Sparkles, RotateCcw, BarChart3, ShieldCheck, FileDown, Download, ListChecks } from "lucide-react";
import { processArabicText, hasArabicChars, hasArabicPresentationForms } from "@/lib/arabic-processing";
import { buildRisenOutputFromState } from "@/lib/risen-extractor";
import { buildMother3Rom, MOTHER3_BUFFER_KEY, type M3SkippedItem } from "@/lib/mother3/m3-editor-bridge";
import { buildMetroidPrimePak, METROID_PRIME_BUFFER_KEY } from "@/lib/metroid-prime/mp-editor-bridge";
import { idbGet } from "@/lib/idb-storage";
import type { useEditorState } from "@/hooks/useEditorState";

type EditorSubset = Pick<
  ReturnType<typeof useEditorState>,
  | "state"
  | "arabicNumerals" | "setArabicNumerals"
  | "mirrorPunctuation" | "setMirrorPunctuation"
  | "handleApplyArabicProcessing" | "applyingArabic"
  | "handleUndoArabicProcessing"
  | "building" | "handleCheckIntegrity" | "handlePreBuild"
>;

interface EditorBuildSectionProps {
  editor: EditorSubset;
  isRisen?: boolean;
  isMother3?: boolean;
  isMetroidPrime?: boolean;
  unprocessedArabicCount: number;
  showBuildSection: boolean;
  setShowBuildSection: (v: boolean) => void;
  setShowArabicProcessConfirm: (v: boolean) => void;
  setShowDiagnostic: (v: boolean) => void;
}

const EditorBuildSection: React.FC<EditorBuildSectionProps> = ({
  editor,
  isRisen = false,
  isMother3 = false,
  isMetroidPrime = false,
  unprocessedArabicCount,
  showBuildSection,
  setShowBuildSection,
  setShowArabicProcessConfirm,
  setShowDiagnostic,
}) => {
  const [risenBuilding, setRisenBuilding] = useState(false);
  const [m3Building, setM3Building] = useState(false);
  const [mpBuilding, setMpBuilding] = useState(false);
  const [shapeArabic, setShapeArabic] = useState(true);
  const [m3ForceBuild, setM3ForceBuild] = useState(false);
  const [m3SkippedItems, setM3SkippedItems] = useState<M3SkippedItem[] | null>(null);
  const [showSkippedDialog, setShowSkippedDialog] = useState(false);

  const handleMother3Build = async () => {
    setM3Building(true);
    try {
      const buf = await idbGet<ArrayBuffer>(MOTHER3_BUFFER_KEY);
      if (!buf) throw new Error("لم يُعثر على ملف الـ ROM — أعد فتحه من صفحة Mother 3");
      const result = buildMother3Rom(new Uint8Array(buf), editor.state?.translations || {}, { force: m3ForceBuild });
      const { toast } = await import("@/hooks/use-toast");
      if ("error" in result) {
        const list = result.overflows
          .slice(0, 6)
          .map((o) => `${o.bank === -1 ? "جدول نصوص" : `بنك ${o.bank}`}${o.overflowBy ? ` (+${o.overflowBy}ب)` : ""}`)
          .join("، ");
        toast({ title: "تجاوز مساحة البنك", description: `${result.error}: ${list}`, variant: "destructive" });
        return;
      }
      const blob = new Blob([result.rom as unknown as ArrayBuffer], { type: "application/octet-stream" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "Mother3_ar.gba";
      a.click();
      URL.revokeObjectURL(url);
      const skipNote = result.skippedForOverflow ? ` | ⚠️ ${result.skippedForOverflow} بنك/جدول تم تخطيه لتجاوزه المساحة (تم الإبقاء على الأصل)` : "";
      const encNote = result.skippedForEncoding ? ` | ℹ️ ${result.skippedForEncoding} سطر/عنصر تم الإبقاء على نصه الأصلي بسبب حرف غير مدعوم (لم يُحذف أي حرف من الترجمة)` : "";
      const details = result.skippedDetails ?? [];
      setM3SkippedItems(details.length > 0 ? details : null);
      if (details.length > 0) setShowSkippedDialog(true);
      toast({
        title: m3ForceBuild ? "✅ تم بناء ROM معرّب (وضع البناء القسري)" : "✅ تم بناء ROM معرّب",
        description: `${result.translatedLines} سطر مترجم | ${result.changedBanks} بنك معدّل${skipNote}${encNote}`,
      });
    } catch (err) {
      const { toast } = await import("@/hooks/use-toast");
      toast({ title: "خطأ في البناء", description: (err as Error).message, variant: "destructive" });
    } finally {
      setM3Building(false);
    }
  };

  const handleMetroidPrimeBuild = async () => {
    setMpBuilding(true);
    try {
      const buf = await idbGet<ArrayBuffer>(METROID_PRIME_BUFFER_KEY);
      if (!buf) throw new Error("لم يُعثر على ملف .pak — أعد فتحه من صفحة نصوص Metroid Prime");
      const result = await buildMetroidPrimePak(new Uint8Array(buf), editor.state?.translations || {});
      const { toast } = await import("@/hooks/use-toast");
      if ("error" in result) {
        toast({ title: "خطأ في البناء", description: result.error, variant: "destructive" });
        return;
      }
      const blob = new Blob([result.pak as unknown as ArrayBuffer], { type: "application/octet-stream" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "MetroidPrime_ar.pak";
      a.click();
      URL.revokeObjectURL(url);
      toast({
        title: "✅ تم بناء ملف .pak معرّب",
        description: `${result.translatedLines} نص مترجم | ${result.changedAssets} ملف نصوص معدّل`,
      });
    } catch (err) {
      const { toast } = await import("@/hooks/use-toast");
      toast({ title: "خطأ في البناء", description: (err as Error).message, variant: "destructive" });
    } finally {
      setMpBuilding(false);
    }
  };

  const handleRisenBuild = async () => {
    setRisenBuilding(true);
    try {
      const result = await buildRisenOutputFromState(editor.state?.translations || {}, editor.state?.entries, { shapeArabic });
      const blob = new Blob([result.buffer], { type: "application/octet-stream" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = result.filename;
      a.click();
      URL.revokeObjectURL(url);
      const { toast } = await import("@/hooks/use-toast");
      toast({
        title: "✅ تم البناء",
        description: `${result.translatedCount} ترجمة | ${result.buffer.byteLength.toLocaleString()} بايت${result.tagRepairCount > 0 ? ` | ⚠️ ${result.tagRepairCount} وسم Risen أُلحق تلقائياً — راجعها` : ""}`,
      });
    } catch (err) {
      const { toast } = await import("@/hooks/use-toast");
      toast({ title: "خطأ في البناء", description: (err as Error).message, variant: "destructive" });
    } finally {
      setRisenBuilding(false);
    }
  };

  return (
  <Collapsible open={showBuildSection} onOpenChange={setShowBuildSection}>
    <div className="flex items-center justify-between mb-3">
      <CollapsibleTrigger asChild>
        <Button variant="ghost" size="sm" className="gap-2 font-display font-bold text-sm">
          {showBuildSection ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          ⚙️ المعالجة والبناء
          {!showBuildSection && <span className="text-xs text-muted-foreground font-body">(اضغط لإظهار)</span>}
        </Button>
      </CollapsibleTrigger>
    </div>
    <CollapsibleContent>
      <Card className="mb-4 border-border">
        <CardContent className="p-4">
          <h3 className="font-display font-bold mb-3 text-sm">⚙️ خيارات البناء</h3>
          <div className="flex flex-wrap gap-4">
            <label className="flex items-center gap-2 cursor-pointer text-sm font-body">
              <input type="checkbox" checked={editor.arabicNumerals} onChange={(e) => editor.setArabicNumerals(e.target.checked)} className="rounded border-border" />
              تحويل الأرقام إلى هندية (٠١٢٣٤٥٦٧٨٩)
            </label>
            <label className="flex items-center gap-2 cursor-pointer text-sm font-body">
              <input type="checkbox" checked={editor.mirrorPunctuation} onChange={(e) => editor.setMirrorPunctuation(e.target.checked)} className="rounded border-border" />
              عكس علامات الترقيم (؟ ، ؛)
            </label>
            {isRisen && (
              <label className="flex items-center gap-2 cursor-pointer text-sm font-body">
                <input type="checkbox" checked={shapeArabic} onChange={(e) => setShapeArabic(e.target.checked)} disabled={risenBuilding} className="rounded border-border" />
                تحويل النص العربي لأشكال العرض (مطلوب للعبة)
              </label>
            )}
            {isMother3 && (
              <label className="flex items-center gap-2 cursor-pointer text-sm font-body" title="يتجاهل الأحرف غير المدعومة (يحذفها بدل الفشل) ويحتفظ بالإنجليزية للبنوك التي تجاوزت مساحتها بدلاً من إيقاف البناء">
                <input type="checkbox" checked={m3ForceBuild} onChange={(e) => setM3ForceBuild(e.target.checked)} disabled={m3Building} className="rounded border-border" />
                🛠️ البناء القسري (تجاهل تحذيرات الأحرف والبنوك الممتلئة)
              </label>
            )}
            {isMother3 && m3SkippedItems && m3SkippedItems.length > 0 && (
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => setShowSkippedDialog(true)}
                className="font-body gap-1 shrink-0"
                title="عرض قائمة العناصر التي تم الإبقاء عليها في آخر بناء قسري"
              >
                <ListChecks className="w-4 h-4" />
                ملخص الإبقاء ({m3SkippedItems.length})
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Force-build summary dialog — lists every line/entry whose translation
          was kept as ORIGINAL, with its file, index and reason. */}
      <Dialog open={showSkippedDialog} onOpenChange={setShowSkippedDialog}>
        <DialogContent className="max-w-2xl" dir="rtl">
          <DialogHeader>
            <DialogTitle className="font-display">
              🛠️ ملخص البناء القسري — العناصر المُبقاة على الأصل
            </DialogTitle>
            <DialogDescription className="font-body">
              {m3SkippedItems && m3SkippedItems.length > 0
                ? `${m3SkippedItems.length} عنصر لم تُطبَّق ترجمته وأُبقي النص الأصلي بدلاً منها. لم يُحذف أي حرف من الترجمة — يمكنك تعديل النصوص أدناه وإعادة البناء.`
                : "لا توجد عناصر مُبقاة في آخر بناء."}
            </DialogDescription>
          </DialogHeader>
          {m3SkippedItems && m3SkippedItems.length > 0 && (
            <div className="max-h-[55vh] overflow-y-auto rounded-md border border-border">
              <table className="w-full text-xs font-body">
                <thead className="sticky top-0 bg-muted/80 backdrop-blur">
                  <tr className="text-right">
                    <th className="px-3 py-2 font-display font-bold">النوع</th>
                    <th className="px-3 py-2 font-display font-bold">الملف</th>
                    <th className="px-3 py-2 font-display font-bold">الفهرس</th>
                    <th className="px-3 py-2 font-display font-bold">السبب</th>
                  </tr>
                </thead>
                <tbody>
                  {m3SkippedItems.map((it, i) => {
                    const kindLabel = it.kind === "encoding"
                      ? "حرف غير مدعوم"
                      : it.kind === "length"
                      ? "أطول من الحد"
                      : "تجاوز المساحة";
                    const kindColor = it.kind === "encoding"
                      ? "text-amber-500"
                      : it.kind === "length"
                      ? "text-orange-500"
                      : "text-destructive";
                    return (
                      <tr key={i} className="border-t border-border/60 align-top">
                        <td className={`px-3 py-2 font-bold whitespace-nowrap ${kindColor}`}>{kindLabel}</td>
                        <td className="px-3 py-2 font-mono text-[11px]">{it.file}</td>
                        <td className="px-3 py-2 font-mono text-[11px]">{it.index >= 0 ? it.index : "—"}</td>
                        <td className="px-3 py-2 text-muted-foreground">{it.reason}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          <DialogFooter className="gap-2">
            {m3SkippedItems && m3SkippedItems.length > 0 && (
              <Button
                variant="outline"
                size="sm"
                className="font-body"
                onClick={() => {
                  const lines = ["kind\tfile\tindex\treason"];
                  for (const it of m3SkippedItems) {
                    lines.push(`${it.kind}\t${it.file}\t${it.index}\t${it.reason.replace(/\s+/g, " ")}`);
                  }
                  const blob = new Blob([lines.join("\n")], { type: "text/tab-separated-values" });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement("a");
                  a.href = url;
                  a.download = `mother3-force-build-skipped-${Date.now()}.tsv`;
                  a.click();
                  URL.revokeObjectURL(url);
                }}
              >
                <Download className="w-4 h-4 ml-1" /> تصدير TSV
              </Button>
            )}
            <Button size="sm" onClick={() => setShowSkippedDialog(false)} className="font-body">إغلاق</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>


      {/* Arabic Unprocessed Warning Banner — meaningless for Risen: its Arabic
          is expected to stay unshaped in the editor by design (shapeArabicForRisen
          runs only at build time), so the warning itself would be wrong, not
          just its "معالجة الآن" button (which is the same Xenoblade-only
          processing already disabled above). */}
      {!isRisen && !isMother3 && unprocessedArabicCount > 0 && (
        <div className="mb-4 flex items-start gap-3 p-3 rounded-lg border border-secondary/40 bg-secondary/8">
          <AlertTriangle className="w-5 h-5 text-secondary shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-display font-bold text-secondary">
              ⚠️ {unprocessedArabicCount} نص عربي لم يُعالَج بعد
            </p>
            <p className="text-xs text-muted-foreground font-body mt-0.5">
              هذه النصوص تحتوي عربية غير مُشكَّلة (بدون Reshaping). سيتم معالجتها تلقائياً عند البناء، أو اضغط الزر أدناه للمعاينة أولاً.
            </p>
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={editor.handleApplyArabicProcessing}
            disabled={editor.applyingArabic}
            className="shrink-0 text-xs font-body border-secondary/40 text-secondary hover:border-secondary/60"
          >
            {editor.applyingArabic ? <Loader2 className="w-3 h-3 animate-spin ml-1" /> : <Sparkles className="w-3 h-3 ml-1" />}
            معالجة الآن
          </Button>
        </div>
      )}

      {/* Arabic Processing + Build Buttons */}
      <div className="flex flex-wrap gap-2 sm:gap-3 mb-6">
        <Button
          size="lg"
          variant="secondary"
          onClick={() => setShowArabicProcessConfirm(true)}
          disabled={editor.applyingArabic || isRisen || isMother3}
          className="flex-1 min-w-[200px] font-display font-bold"
          title={isRisen ? "نصوص Risen تُشكَّل تلقائياً عند البناء — هذه المعالجة خاصة بـ Xenoblade وستُفسد النص" : undefined}
        >
          {editor.applyingArabic ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Sparkles className="w-4 h-4 mr-2" />} تطبيق المعالجة العربية ✨
        </Button>
        <Button size="sm" variant="outline" onClick={editor.handleUndoArabicProcessing} disabled={editor.applyingArabic} className="font-body gap-1 shrink-0" title="التراجع عن المعالجة العربية">
          <RotateCcw className="w-4 h-4" />
          <span className="hidden sm:inline">تراجع</span>
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => {
            const st = editor.state;
            if (!st) return;
            const processed: Record<string, string> = {};
            for (const [key, value] of Object.entries(st.translations || {})) {
              if (!value?.trim()) continue;
              processed[key] = hasArabicPresentationForms(value) || !hasArabicChars(value)
                ? value
                : processArabicText(value, { arabicNumerals: editor.arabicNumerals, mirrorPunct: editor.mirrorPunctuation });
            }
            const blob = new Blob([JSON.stringify(processed, null, 2)], { type: "application/json" });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = `translations-processed-${Date.now()}.json`;
            a.click();
            URL.revokeObjectURL(url);
            import("@/hooks/use-toast").then(({ toast }) =>
              toast({ title: "✅ تم التصدير", description: `${Object.keys(processed).length} ترجمة بعد المعالجة العربية` })
            );
          }}
          disabled={editor.applyingArabic}
          className="font-body gap-1 shrink-0"
          title="تصدير الترجمات بعد تطبيق المعالجة العربية"
        >
          <Download className="w-4 h-4" />
          <span className="hidden sm:inline">تصدير معالج</span>
        </Button>
        <Button size="sm" variant="outline" onClick={() => setShowDiagnostic(true)} disabled={editor.building} className="font-body gap-1 shrink-0" title="تشخيص ما قبل البناء">
          <BarChart3 className="w-4 h-4" />
          <span className="hidden sm:inline">تشخيص</span>
        </Button>
        <Button size="sm" variant="outline" onClick={editor.handleCheckIntegrity} disabled={editor.building} className="font-body gap-1 shrink-0" title="التحقق من سلامة الترجمة">
          <ShieldCheck className="w-4 h-4" />
          <span className="hidden sm:inline">سلامة</span>
        </Button>
        {isMother3 ? (
          <Button size="lg" onClick={handleMother3Build} disabled={m3Building} className="flex-1 min-w-[200px] font-display font-bold">
            {m3Building ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <FileDown className="w-4 h-4 mr-2" />} بناء ROM معرّب وتنزيله
          </Button>
        ) : isMetroidPrime ? (
          <Button size="lg" onClick={handleMetroidPrimeBuild} disabled={mpBuilding} className="flex-1 min-w-[200px] font-display font-bold">
            {mpBuilding ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <FileDown className="w-4 h-4 mr-2" />} بناء ملف .pak معرّب وتنزيله
          </Button>
        ) : isRisen ? (
          <Button size="lg" onClick={handleRisenBuild} disabled={risenBuilding} className="flex-1 min-w-[200px] font-display font-bold">
            {risenBuilding ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <FileDown className="w-4 h-4 mr-2" />} بناء ملف Risen وتنزيله
          </Button>
        ) : (
          <Button size="lg" onClick={editor.handlePreBuild} disabled={editor.building} className="flex-1 min-w-[200px] font-display font-bold">
            {editor.building ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <FileDown className="w-4 h-4 mr-2" />} بناء الملف النهائي
          </Button>
        )}
      </div>
    </CollapsibleContent>
  </Collapsible>
  );
};

export default EditorBuildSection;
