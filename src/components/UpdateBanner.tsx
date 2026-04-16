import { useState, useEffect, useCallback } from "react";
import { RefreshCw, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

/**
 * Global update UI:
 *   1. A LARGE always-visible floating button (bottom-left) so the user can
 *      manually pull the latest version from any page at any time. This is
 *      critical because the PWA cache + IndexedDB can otherwise hide updates.
 *   2. A top banner that appears automatically when a new Service Worker is
 *      ready and applies it on click (existing behavior).
 */
export default function UpdateBanner() {
  const [showUpdate, setShowUpdate] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [forceUpdating, setForceUpdating] = useState(false);

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
      // 1. Tell the active SW to skip waiting if any update is queued.
      const reg = await navigator.serviceWorker?.getRegistration();
      if (reg?.waiting) reg.waiting.postMessage({ type: "SKIP_WAITING" });

      // 2. Force the SW to check the network for a new version.
      await reg?.update().catch(() => {});

      // 3. Wipe Cache Storage so the next load fetches fresh assets.
      if ("caches" in window) {
        const keys = await caches.keys();
        await Promise.all(keys.map((k) => caches.delete(k)));
      }

      // 4. Clear sessionStorage (transient UI state) but keep IndexedDB
      //    (where the editor saves its translations).
      sessionStorage.clear();
    } catch {
      // Ignore — we still hard-reload below.
    }

    // 5. Cache-busting hard reload.
    const url = new URL(window.location.href);
    url.searchParams.set("_v", Date.now().toString());
    window.location.replace(url.toString());
  }, [forceUpdating]);

  return (
    <>
      {/* Auto banner — shown when a new SW is waiting */}
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

      {/* Persistent floating force-update button — visible on every page,
          large and unmistakable so the user can always pull the latest build. */}
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
