import React from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ArrowRight, Cloud, Loader2, Package, Sparkles } from "lucide-react";
import type { useEditorState } from "@/hooks/useEditorState";

type EditorSubset = Pick<
  ReturnType<typeof useEditorState>,
  | "user"
  | "cloudSyncing"
  | "translating"
  | "building"
  | "handleCloudSave"
  | "handleAutoTranslate"
  | "handleStopTranslate"
  | "handlePreBuild"
>;

interface EditorMobileStickyBarProps {
  editor: EditorSubset;
  processPath: string;
  pageLocked: boolean;
  setShowBuildSection: (v: boolean) => void;
}

const EditorMobileStickyBar: React.FC<EditorMobileStickyBarProps> = ({
  editor,
  processPath,
  pageLocked,
  setShowBuildSection,
}) => {
  const handleBuildClick = React.useCallback(() => {
    setShowBuildSection(true);
    requestAnimationFrame(() => {
      document.getElementById("editor-build-section")?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }, [setShowBuildSection]);

  return (
    <div className="md:hidden sticky top-0 z-40 -mx-3 px-3 py-2 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 border-b border-border/60 mb-3 flex items-center gap-1.5">
      {pageLocked ? (
        <Button variant="ghost" size="sm" disabled className="h-9 px-2 text-xs">
          <ArrowRight className="w-4 h-4" />
        </Button>
      ) : (
        <Link to={processPath}>
          <Button variant="ghost" size="sm" className="h-9 px-2 text-xs">
            <ArrowRight className="w-4 h-4" />
          </Button>
        </Link>
      )}

      {editor.translating ? (
        <Button
          variant="destructive"
          size="sm"
          onClick={editor.handleStopTranslate}
          className="h-9 flex-1 text-xs font-display font-bold gap-1"
        >
          <Loader2 className="w-3.5 h-3.5 animate-spin" /> إيقاف
        </Button>
      ) : (
        <Button
          size="sm"
          onClick={editor.handleAutoTranslate}
          className="h-9 flex-1 text-xs font-display font-bold gap-1"
        >
          <Sparkles className="w-3.5 h-3.5" /> ترجمة
        </Button>
      )}

      <Button
        variant="outline"
        size="sm"
        onClick={editor.handleCloudSave}
        disabled={!editor.user || editor.cloudSyncing}
        className="h-9 px-2 text-xs gap-1"
        title="حفظ سحابي"
      >
        {editor.cloudSyncing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Cloud className="w-3.5 h-3.5" />}
      </Button>

      <Button
        variant="outline"
        size="sm"
        onClick={handleBuildClick}
        disabled={editor.building}
        className="h-9 px-2 text-xs gap-1"
        title="بناء الملف النهائي"
      >
        {editor.building ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Package className="w-3.5 h-3.5" />}
      </Button>
    </div>
  );
};

export default EditorMobileStickyBar;
