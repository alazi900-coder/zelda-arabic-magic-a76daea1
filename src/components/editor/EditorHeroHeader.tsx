import React from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Lock, Unlock } from "lucide-react";
import { Button } from "@/components/ui/button";
import heroBg from "@/assets/xc3-hero-bg.jpg";

interface EditorHeroHeaderProps {
  processPath: string;
  pageLocked: boolean;
  setPageLocked: (v: boolean) => void;
}

const EditorHeroHeader: React.FC<EditorHeroHeaderProps> = ({
  processPath,
  pageLocked,
  setPageLocked,
}) => (
  <header className="relative flex flex-col items-center justify-center py-8 md:py-12 px-4 text-center overflow-hidden">
    <div className="absolute inset-0">
      <img src={heroBg} alt="" className="w-full h-full object-cover" fetchPriority="high" />
      <div className="absolute inset-0 bg-gradient-to-b from-background/80 via-background/70 to-background" />
    </div>
    <div className="relative z-10 w-full max-w-6xl mx-auto">
      <div className="flex items-center justify-between w-full mb-3">
        {pageLocked ? (
          <span className="inline-flex items-center gap-2 text-muted-foreground/50 font-body text-sm cursor-not-allowed">
            <ArrowRight className="w-4 h-4" /> العودة للمعالجة
          </span>
        ) : (
          <Link to={processPath} className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground font-body text-sm">
            <ArrowRight className="w-4 h-4" /> العودة للمعالجة
          </Link>
        )}
        <div className="flex items-center gap-2">
          <Button
            variant={pageLocked ? "destructive" : "outline"}
            size="sm"
            onClick={() => setPageLocked(!pageLocked)}
            className="gap-1.5 text-xs"
          >
            {pageLocked ? <Lock className="w-3.5 h-3.5" /> : <Unlock className="w-3.5 h-3.5" />}
            {pageLocked ? "الصفحة مقفلة" : "قفل الصفحة"}
          </Button>
        </div>
      </div>
      <h1 className="text-2xl md:text-3xl font-display font-black mb-1 drop-shadow-lg">محرر الترجمة ✍️</h1>
      <p className="text-sm text-muted-foreground font-body">عدّل النصوص العربية يدوياً أو استخدم الترجمة التلقائية</p>
    </div>
  </header>
);

export default EditorHeroHeader;
