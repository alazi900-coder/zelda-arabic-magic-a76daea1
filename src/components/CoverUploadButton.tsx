import { useRef } from "react";
import { ImagePlus, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { fileToCoverDataUrl, setCover, clearCover } from "@/lib/game-covers";

interface Props {
  coverKey: string;
  hasCustom: boolean;
}

const CoverUploadButton = ({ coverKey, hasCustom }: Props) => {
  const inputRef = useRef<HTMLInputElement>(null);

  const stop = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const onPick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    try {
      const dataUrl = await fileToCoverDataUrl(file);
      setCover(coverKey, dataUrl);
      toast.success("تم تحديث غلاف اللعبة");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "فشل رفع الصورة");
    }
  };

  return (
    <div className="absolute top-3 left-3 z-20 flex gap-2">
      {hasCustom && (
        <button
          type="button"
          aria-label="استعادة الغلاف الأصلي"
          onClick={(e) => {
            stop(e);
            clearCover(coverKey);
            toast.success("تمت استعادة الغلاف الأصلي");
          }}
          className="p-2 rounded-lg bg-background/70 backdrop-blur border border-border text-foreground hover:bg-background transition-colors"
        >
          <RotateCcw className="w-4 h-4" />
        </button>
      )}
      <button
        type="button"
        aria-label="رفع غلاف مخصص"
        onClick={(e) => {
          stop(e);
          inputRef.current?.click();
        }}
        className="p-2 rounded-lg bg-background/70 backdrop-blur border border-border text-foreground hover:bg-background transition-colors"
      >
        <ImagePlus className="w-4 h-4" />
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="*/*"
        className="hidden"
        onChange={onPick}
        onClick={(e) => e.stopPropagation()}
      />
    </div>
  );
};

export default CoverUploadButton;
