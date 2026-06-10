import { useState, useEffect } from "react";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Top update banner — shows automatically when a new SW build is waiting.
 * The previous floating buttons (force-update / backup / import) were removed
 * at the user's request to declutter the screen.
 */
export default function UpdateBanner() {
  const [showUpdate, setShowUpdate] = useState(false);
  const [updating, setUpdating] = useState(false);

  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    const checkForUpdate = () => {
      navigator.serviceWorker.getRegistration().then((reg) => reg?.update()).catch(() => {});
    };

    navigator.serviceWorker.getRegistration().then((reg) => {
      if (reg?.waiting) setShowUpdate(true);
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

  if (!showUpdate) return null;

  return (
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
  );
}
