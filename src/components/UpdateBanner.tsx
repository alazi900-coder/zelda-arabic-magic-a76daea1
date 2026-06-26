import { useState, useEffect } from "react";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Legacy update banner.
 * New builds no longer register an app-shell service worker, but this component
 * helps returning users activate the one-time cleanup worker without touching
 * IndexedDB/localStorage where translations are stored.
 */
export default function UpdateBanner() {
  const [showUpdate, setShowUpdate] = useState(false);
  const [updating, setUpdating] = useState(false);

  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    let refreshing = false;
    const reloadOnce = () => {
      if (refreshing) return;
      refreshing = true;
      window.location.reload();
    };

    navigator.serviceWorker.addEventListener("controllerchange", reloadOnce);

    const watchRegistration = (reg: ServiceWorkerRegistration) => {
      if (reg.waiting) setShowUpdate(true);
      reg.addEventListener("updatefound", () => {
        const worker = reg.installing;
        worker?.addEventListener("statechange", () => {
          if (worker.state === "installed") setShowUpdate(true);
        });
      });
    };

    const checkForUpdate = async () => {
      try {
        const registrations = await navigator.serviceWorker.getRegistrations();
        registrations.forEach(watchRegistration);
        await Promise.allSettled(registrations.map((reg) => reg.update()));
      } catch {
        // ignore service-worker cleanup failures
      }
    };

    checkForUpdate();

    const handleVisibility = () => {
      if (document.visibilityState === "visible") checkForUpdate();
    };
    document.addEventListener("visibilitychange", handleVisibility);

    const interval = setInterval(checkForUpdate, 2 * 60 * 1000);
    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", handleVisibility);
      navigator.serviceWorker.removeEventListener("controllerchange", reloadOnce);
    };
  }, []);

  const handleUpdate = async () => {
    setUpdating(true);
    try {
      const registrations = await navigator.serviceWorker.getRegistrations();
      for (const reg of registrations) {
        await reg.update().catch(() => undefined);
        reg.waiting?.postMessage({ type: "SKIP_WAITING" });
      }
    } catch {
      // ignore — reload fallback below still gets a fresh network shell
    }
    setTimeout(() => window.location.reload(), 800);
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
