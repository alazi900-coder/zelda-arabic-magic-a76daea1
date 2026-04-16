import { useState, useEffect, useCallback } from "react";
import { RefreshCw, Download, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { exportEditorStateBackup } from "@/lib/idb-storage";

/**
 * Global update UI:
 *   1. Top banner — auto-shows when a new SW is waiting.
 *   2. Floating "جلب التحديث" button — bottom-left, always visible. Clears
 *      every cache layer (SW + Cache Storage + sessionStorage) and hard-reloads.
 *      IndexedDB is preserved on purpose so translations survive.
 *   3. Floating "نسخة احتياطية" button — bottom-left (above the update FAB).
 *      Triggers a JSON download of the current `editorState` so the user
 *      always has a safety net before applying updates.
 */
export default function UpdateBanner() {
  const [showUpdate, setShowUpdate] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [forceUpdating, setForceUpdating] = useState(false);
  const [backingUp, setBackingUp] = useState(false);

  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    const checkForUpdate = () => {
      navigator.serviceWorker.getRegistration().then((reg) => reg?.update()).catch(() => {});
    };

    navigator.serviceWorker.getRegistration().then((reg) => {
      if (reg?.waiting) {
        setShowUpdate(true);
      }
      reg?.addEventListener("updatefound", () => {
        const newSW = reg.installing;
        newSW?.addEventListener("statechange", () => {
          if (newSW.state === "installed" && navigator.serviceWorker.controller) {
            setShowUpdate(true);
          }
        });
      });
    }).catch(() => {});

    let refreshing = false;
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (!refreshing) {
        refreshing = true;
        window.location.reload();
      }
    });

    checkForUpdate();

    const handleVisibility = () => {
      if (document.visibilityState === "visible") checkForUpdate();
    };
    document.addEventListener("visibilitychange", handleVisibility);

    const interval = setInterval(checkForUpdate, 2 * 60 * 1000);
    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, []);

  const handleUpdate = () => {
    setUpdating(true);
    navigator.serviceWorker?.getRegistration().then((reg) => {
      if (reg?.waiting) {
        reg.waiting.postMessage({ type: "SKIP_WAITING" });
      } else {
        window.location.reload();
      }
    });
  };

  const handleBackup = useCallback(async () => {
    if (backingUp) return;
    setBackingUp(true);
    try {
      const ok = await exportEditorStateBackup("manual");
      if (ok) {
        toast.success("✅ تم تنزيل نسخة احتياطية", {
          description: "ملف JSON يحتوي كل الترجمات والنصوص الأصلية",
        });
      } else {
        toast.info("لا توجد بيانات للنسخ الاحتياطي بعد");
      }
    } catch (err) {
      console.error(err);
      toast.error("فشل النسخ الاحتياطي");
    } finally {
      setBackingUp(false);
    }
  }, [backingUp]);

  /**
   * FORCE-UPDATE: clears every layer of caching (Service Worker, Cache Storage,
   * sessionStorage) and triggers a hard reload — IndexedDB editor state is
   * preserved on purpose so the user does not lose their translation work.
   */
  const handleForceUpdate = useCallback(async () => {
    if (forceUpdating) return;
    setForceUpdating(true);
    toast.info("⏳ جلب آخر تحديث...", { description: "يتم مسح الذاكرة المؤقتة وإعادة التحميل" });

    try {
      const reg = await navigator.serviceWorker?.getRegistration();
      if (reg?.waiting) reg.waiting.postMessage({ type: "SKIP_WAITING" });
      await reg?.update().catch(() => {});

      if ("caches" in window) {
        const keys = await caches.keys();
        await Promise.all(keys.map((k) => caches.delete(k)));
      }
      sessionStorage.clear();
    } catch {
      // Ignore — we still hard-reload below.
    }

    const url = new URL(window.location.href);
    url.searchParams.set("_v", Date.now().toString());
    window.location.replace(url.toString());
  }, [forceUpdating]);

  return (
    <>
      {showUpdate && (
        <div className="fixed top-0 inset-x-0 z-[100] bg-gradient-to-l from-primary to-accent text-primary-foreground py-2.5 px-4 flex items-center justify-center gap-4 shadow-xl animate-in slide-in-from-top duration-300">
          <div className="flex items-center gap-2">
            <span className="text-sm font-bold">🎉 تحديث جديد!</span>
            <span className="text-xs opacity-90 hidden sm:inline">تحسينات في الأداء وإصلاح أخطاء</span>
          </div>
          <Button
            size="sm"
            onClick={handleUpdate}
            disabled={updating}
            className="gap-1.5 h-7 text-xs bg-background/20 hover:bg-background/30 text-primary-foreground border-border/30 border"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${updating ? "animate-spin" : ""}`} />
            {updating ? "جارٍ التحديث..." : "تحديث الآن"}
          </Button>
        </div>
      )}

      {/* Backup FAB — sits above the update FAB so the user can always export
          a JSON safety-net before pulling a new build. */}
      <Button
        onClick={handleBackup}
        disabled={backingUp}
        aria-label="نسخة احتياطية للترجمات"
        variant="outline"
        className="fixed bottom-20 left-4 z-[99] h-10 px-3 gap-2 rounded-full shadow-lg bg-background/90 backdrop-blur border-2 border-primary/40 hover:bg-background hover:scale-105 transition-all font-bold text-xs"
      >
        <Save className={`h-4 w-4 ${backingUp ? "animate-pulse" : ""}`} />
        <span className="hidden xs:inline sm:inline">{backingUp ? "جارٍ التنزيل..." : "نسخة احتياطية"}</span>
      </Button>

      {/* Force-update FAB */}
      <Button
        onClick={handleForceUpdate}
        disabled={forceUpdating}
        aria-label="جلب آخر تحديث للتطبيق"
        className="fixed bottom-4 left-4 z-[99] h-12 px-4 gap-2 rounded-full shadow-xl bg-gradient-to-l from-primary to-accent text-primary-foreground hover:opacity-90 hover:scale-105 transition-all border-2 border-background/30 font-bold text-sm"
      >
        <Download className={`h-5 w-5 ${forceUpdating ? "animate-bounce" : ""}`} />
        <span className="hidden xs:inline sm:inline">{forceUpdating ? "جاري التحديث..." : "جلب التحديث"}</span>
      </Button>
    </>
  );
}
