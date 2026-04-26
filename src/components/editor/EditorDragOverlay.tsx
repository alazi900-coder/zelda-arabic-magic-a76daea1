import { Upload } from "lucide-react";

interface EditorDragOverlayProps {
  visible: boolean;
}

/** Full-screen overlay shown while a file is being dragged over the editor */
const EditorDragOverlay = ({ visible }: EditorDragOverlayProps) => {
  if (!visible) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm border-4 border-dashed border-primary/50 pointer-events-none">
      <div className="text-center space-y-3">
        <Upload className="w-16 h-16 text-primary mx-auto animate-bounce" />
        <p className="text-2xl font-display font-bold text-primary">أفلت ملف JSON هنا</p>
        <p className="text-sm text-muted-foreground font-body">سيتم استيراد الترجمات تلقائياً</p>
      </div>
    </div>
  );
};

export default EditorDragOverlay;
