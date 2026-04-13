import React from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { BarChart3, Filter, Wrench } from "lucide-react";

interface QualityStatsPanelProps {
  qualityStats: { tooLong: number; nearLimit: number; missingTags: number; placeholderMismatch: number; total: number; problemKeys: Set<string>; damagedTags: number; damagedTagKeys: Set<string> };
  needsImproveCount: { total: number; tooShort: number; tooLong: number; stuck: number; mixed: number };
  translatedCount: number;
  setFilterStatus: (status: any) => void;
  setShowQualityStats: (show: boolean) => void;
  onFixDamagedTags?: () => void;
  onFilterMissingTags?: () => void;
}

const QualityStatsPanel: React.FC<QualityStatsPanelProps> = ({ qualityStats, needsImproveCount, translatedCount, setFilterStatus, setShowQualityStats, onFixDamagedTags, onFilterMissingTags }) => {
  const totalProblems = qualityStats.total + needsImproveCount.total;

  return (
    <Card className="mb-6 border-border">
      <CardContent className="p-4">
        <h3 className="font-display font-bold mb-3 flex items-center gap-2">
          <BarChart3 className="w-5 h-5 text-primary" />
          إحصائيات الجودة
        </h3>
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
          <div className="p-3 rounded border border-destructive/30 bg-destructive/5 text-center">
            <p className="text-2xl font-display font-bold text-destructive">{qualityStats.tooLong}</p>
            <p className="text-xs text-muted-foreground">تجاوز حد البايت</p>
          </div>
          <div className="p-3 rounded border border-amber-500/30 bg-amber-500/5 text-center">
            <p className="text-2xl font-display font-bold text-amber-500">{qualityStats.nearLimit}</p>
            <p className="text-xs text-muted-foreground">قريب من الحد (&gt;80%)</p>
          </div>
          <div className="p-3 rounded border border-destructive/30 bg-destructive/5 text-center">
            <p className="text-2xl font-display font-bold text-destructive">{qualityStats.missingTags}</p>
            <p className="text-xs text-muted-foreground">Tags مفقودة</p>
            {qualityStats.missingTags > 0 && onFilterMissingTags && (
              <Button size="sm" variant="outline" onClick={onFilterMissingTags} className="mt-1 text-[10px] h-6 px-2">
                <Filter className="w-3 h-3" /> عرض
              </Button>
            )}
          </div>
          <div className="p-3 rounded border border-destructive/30 bg-destructive/5 text-center">
            <p className="text-2xl font-display font-bold text-destructive">{qualityStats.placeholderMismatch}</p>
            <p className="text-xs text-muted-foreground">عناصر نائبة مختلفة</p>
          </div>
          <div className="p-3 rounded border border-amber-500/30 bg-amber-500/5 text-center">
            <p className="text-2xl font-display font-bold text-amber-500">{needsImproveCount.tooShort}</p>
            <p className="text-xs text-muted-foreground">ترجمة قصيرة جداً</p>
          </div>
          <div className="p-3 rounded border border-yellow-500/30 bg-yellow-500/5 text-center">
            <p className="text-2xl font-display font-bold text-yellow-500">{needsImproveCount.mixed}</p>
            <p className="text-xs text-muted-foreground">لغة مختلطة</p>
          </div>
          <div className="p-3 rounded border border-destructive/30 bg-destructive/5 text-center">
            <p className="text-2xl font-display font-bold text-destructive">{qualityStats.damagedTags}</p>
            <p className="text-xs text-muted-foreground">رموز تالفة</p>
            {qualityStats.damagedTags > 0 && onFixDamagedTags && (
              <Button size="sm" variant="outline" onClick={onFixDamagedTags} className="mt-1 text-[10px] h-6 px-2">
                <Wrench className="w-3 h-3" /> إصلاح
              </Button>
            )}
          </div>
        </div>
        <div className="mt-3 flex items-center gap-2">
          <Progress value={totalProblems > 0 ? Math.max(0, 100 - (totalProblems / Math.max(translatedCount, 1)) * 100) : 100} className="h-2 flex-1" />
          <span className="text-xs font-display text-muted-foreground">
            {totalProblems > 0 ? `${totalProblems} نص بمشاكل` : '✅ لا مشاكل'}
          </span>
        </div>
        {totalProblems > 0 && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => { setFilterStatus("problems"); setShowQualityStats(false); }}
            className="mt-3 text-xs"
          >
            <Filter className="w-3 h-3" /> عرض النصوص بها مشاكل فقط
          </Button>
        )}
      </CardContent>
    </Card>
  );
};

export default QualityStatsPanel;
