import { useState } from "react";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useRegisterSW } from "virtual:pwa-register/react";

/**
 * Top update banner — shows automatically when a new SW build is waiting.
 */
export default function UpdateBanner() {
  const [updating, setUpdating] = useState(false);
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegistered(r) {
      // Check for updates periodically
      if (r) {
        setInterval(() => {
          r.update();
        }, 2 * 60 * 1000); // 2 minutes
      }
    },
    onRegisterError(error) {
      console.error('SW registration error', error);
    },
  });

  const handleUpdate = async () => {
    setUpdating(true);
    try {
      // Delete caches to ensure absolute freshness
      if ("caches" in window) {
        const keys = await caches.keys();
        await Promise.all(keys.map((k) => caches.delete(k)));
      }

      // Tell the service worker to skip waiting and reload the page
      updateServiceWorker(true);

      // Fallback reload just in case updateServiceWorker takes too long or fails
      setTimeout(() => {
        window.location.replace(window.location.pathname + "?_v=" + Date.now());
      }, 1500);
    } catch (e) {
      console.error('Failed to update service worker', e);
      window.location.replace(window.location.pathname + "?_v=" + Date.now());
    }
  };

  if (!needRefresh) return null;

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
