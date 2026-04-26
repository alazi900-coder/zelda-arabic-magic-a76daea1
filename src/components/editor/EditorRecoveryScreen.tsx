import { Button } from "@/components/ui/button";
import { Save, RotateCcw } from "lucide-react";
import heroBg from "@/assets/xc3-hero-bg.jpg";

interface EditorRecoveryScreenProps {
  translationCount: number;
  entryCount: number;
  onRecover: () => void;
  onStartFresh: () => void;
}

/** Recovery prompt shown when a previous editor session is detected */
const EditorRecoveryScreen = ({
  translationCount,
  entryCount,
  onRecover,
  onStartFresh,
}: EditorRecoveryScreenProps) => {
  return (
    <div className="min-h-screen flex flex-col">
      <div className="relative flex flex-col items-center justify-center py-20 px-4 text-center overflow-hidden">
        <div className="absolute inset-0">
          <img src={heroBg} alt="" className="w-full h-full object-cover" fetchPriority="high" />
          <div className="absolute inset-0 bg-gradient-to-b from-background/80 via-background/60 to-background" />
        </div>
        <div className="relative z-10 space-y-6">
          <h2 className="text-2xl md:text-3xl font-display font-black drop-shadow-lg">🔄 جلسة سابقة موجودة</h2>
          <p className="text-muted-foreground font-body bg-background/40 backdrop-blur-sm rounded-lg px-4 py-2 inline-block">
            لديك <span className="font-bold text-primary">{translationCount}</span> ترجمة محفوظة
            لـ <span className="font-bold text-primary">{entryCount}</span> نص
          </p>
          <div className="flex flex-wrap items-center gap-4 justify-center">
            <Button size="lg" className="font-display font-bold px-8" onClick={onRecover}>
              <Save className="w-5 h-5" /> استمر مع الترجمات السابقة ✅
            </Button>
            <Button size="lg" variant="destructive" className="font-display font-bold px-8" onClick={onStartFresh}>
              <RotateCcw className="w-5 h-5" /> ابدأ من جديد 🆕
            </Button>
          </div>
          <p className="text-xs text-muted-foreground font-body">اختيار "ابدأ من جديد" سيحذف جميع الترجمات المحفوظة نهائياً</p>
        </div>
      </div>
    </div>
  );
};

export default EditorRecoveryScreen;
