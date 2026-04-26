import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import heroBg from "@/assets/xc3-hero-bg.jpg";

interface EditorEmptyStateProps {
  processPath: string;
  onLoadDemo: () => void;
}

/** Placeholder shown when no extracted data exists in the editor */
const EditorEmptyState = ({ processPath, onLoadDemo }: EditorEmptyStateProps) => {
  return (
    <div className="min-h-screen flex flex-col">
      <div className="relative flex flex-col items-center justify-center py-20 px-4 text-center overflow-hidden">
        <div className="absolute inset-0">
          <img src={heroBg} alt="" className="w-full h-full object-cover" fetchPriority="high" />
          <div className="absolute inset-0 bg-gradient-to-b from-background/80 via-background/60 to-background" />
        </div>
        <div className="relative z-10">
          <p className="text-muted-foreground mb-4 bg-background/40 backdrop-blur-sm rounded-lg px-4 py-2 inline-block">
            لا توجد بيانات للتحرير. يرجى استخراج النصوص أولاً.
          </p>
          <br />
          <div className="flex flex-wrap items-center gap-3 mt-4 justify-center">
            <Link to={processPath}><Button className="font-display">اذهب لصفحة المعالجة</Button></Link>
            <Button variant="outline" className="font-display" onClick={onLoadDemo}>
              تحميل بيانات BDAT تجريبية
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default EditorEmptyState;
