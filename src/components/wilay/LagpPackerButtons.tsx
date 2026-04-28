/**
 * LAGP Unpack/Repack toolbar buttons (advanced).
 *
 * Fully isolated from the texture-extraction flow. To remove this feature:
 *   1. Delete this file.
 *   2. Remove the <LagpPackerButtons /> usage in WilayViewer.tsx.
 *   3. Delete src/lib/lagp-packer.ts and its tests.
 */

import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Package, PackageOpen, FileJson, Loader2 } from "lucide-react";
import {
  unpackLagp,
  repackLagp,
  repackLagpWithExternalManifest,
} from "@/lib/lagp-packer";
import { toast } from "sonner";

function downloadBlob(data: ArrayBuffer, filename: string, mime: string) {
  const blob = new Blob([data], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function LagpPackerButtons() {
  const unpackRef = useRef<HTMLInputElement>(null);
  const repackRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<"unpack" | "repack" | null>(null);

  const handleUnpack = async (file: File) => {
    setBusy("unpack");
    try {
      const buf = await file.arrayBuffer();
      const { zip } = await unpackLagp(buf, file.name);
      const outName = file.name.replace(/\.wilay$/i, "") + ".lagp.zip";
      downloadBlob(zip, outName, "application/zip");
      toast.success("تم الفك", { description: `${outName} جاهز` });
    } catch (err) {
      toast.error("فشل الفك", {
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setBusy(null);
    }
  };

  const handleRepack = async (file: File) => {
    setBusy("repack");
    try {
      const buf = await file.arrayBuffer();
      const wilay = await repackLagp(buf);
      const outName = file.name.replace(/\.lagp\.zip$/i, "").replace(/\.zip$/i, "") + ".wilay";
      downloadBlob(wilay, outName, "application/octet-stream");
      toast.success("تم التجميع", { description: `${outName} جاهز` });
    } catch (err) {
      toast.error("فشل التجميع", {
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setBusy(null);
    }
  };

  return (
    <>
      <input
        ref={unpackRef}
        type="file"
        accept="*/*"
        className="sr-only"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void handleUnpack(f);
          e.currentTarget.value = "";
        }}
      />
      <input
        ref={repackRef}
        type="file"
        accept="*/*"
        className="sr-only"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void handleRepack(f);
          e.currentTarget.value = "";
        }}
      />
      <Button
        variant="ghost"
        size="sm"
        className="h-8 text-xs"
        onClick={() => unpackRef.current?.click()}
        disabled={busy !== null}
        title="فك ملف LAGP إلى ZIP لتعديل بنيته يدوياً"
      >
        {busy === "unpack" ? (
          <Loader2 className="w-3.5 h-3.5 ml-1 animate-spin" />
        ) : (
          <PackageOpen className="w-3.5 h-3.5 ml-1" />
        )}
        فك LAGP
      </Button>
      <Button
        variant="ghost"
        size="sm"
        className="h-8 text-xs"
        onClick={() => repackRef.current?.click()}
        disabled={busy !== null}
        title="إعادة تجميع ZIP معدّل إلى ملف .wilay بنفس التشفير"
      >
        {busy === "repack" ? (
          <Loader2 className="w-3.5 h-3.5 ml-1 animate-spin" />
        ) : (
          <Package className="w-3.5 h-3.5 ml-1" />
        )}
        تجميع LAGP
      </Button>
    </>
  );
}
