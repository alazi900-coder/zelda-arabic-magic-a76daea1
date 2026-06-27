import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, RefreshCw, Trash2, Activity, AlertTriangle, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { APP_VERSION } from "@/lib/version";
import heroBg from "@/assets/xc3-hero-bg.jpg";

interface SwInfo {
  scriptURL: string;
  scope: string;
  state: string;
  fileName: string;
  lastModified: string | null;
  fetchError: string | null;
}

interface DiagState {
  supported: boolean;
  controllerActive: boolean;
  registrations: SwInfo[];
  cacheNames: string[];
  blockReason: string | null;
  loadedAt: string;
}

async function inspect(): Promise<DiagState> {
  const now = new Date().toISOString();
  if (!("serviceWorker" in navigator)) {
    return {
      supported: false,
      controllerActive: false,
      registrations: [],
      cacheNames: [],
      blockReason: "المتصفح لا يدعم Service Workers",
      loadedAt: now,
    };
  }

  const reasons: string[] = [];
  if (!window.isSecureContext) reasons.push("السياق غير آمن (HTTP)");
  if (window.top !== window.self) reasons.push("التطبيق يعمل داخل iframe (معاينة Lovable)");
  if (location.hostname.includes("lovableproject.com") || location.hostname.startsWith("preview--") || location.hostname.startsWith("id-preview--")) {
    reasons.push("بيئة معاينة Lovable — التسجيل معطّل عمداً");
  }

  const regs = await navigator.serviceWorker.getRegistrations().catch(() => []);
  const infos: SwInfo[] = [];

  for (const reg of regs) {
    const worker = reg.active ?? reg.waiting ?? reg.installing;
    if (!worker) continue;
    const scriptURL = worker.scriptURL;
    const fileName = scriptURL.split("/").pop() ?? scriptURL;
    let lastModified: string | null = null;
    let fetchError: string | null = null;
    try {
      const r = await fetch(scriptURL, { cache: "no-store" });
      lastModified = r.headers.get("last-modified") ?? r.headers.get("date");
      if (!r.ok) fetchError = `HTTP ${r.status}`;
    } catch (e) {
      fetchError = e instanceof Error ? e.message : String(e);
    }
    infos.push({
      scriptURL,
      scope: reg.scope,
      state: worker.state,
      fileName,
      lastModified,
      fetchError,
    });
  }

  const cacheNames = "caches" in window ? await caches.keys().catch(() => []) : [];

  // eslint-disable-next-line no-console
  console.group("%c[PWA Status]", "color:#fbbf24;font-weight:bold");
  console.log("App version:", APP_VERSION);
  console.log("Loaded at:", now);
  console.log("Controller active:", !!navigator.serviceWorker.controller);
  console.log("Registrations:", infos);
  console.log("Cache names:", cacheNames);
  if (reasons.length) console.warn("Block reasons:", reasons);
  console.groupEnd();

  return {
    supported: true,
    controllerActive: !!navigator.serviceWorker.controller,
    registrations: infos,
    cacheNames,
    blockReason: reasons.length ? reasons.join(" • ") : null,
    loadedAt: now,
  };
}

export default function PwaStatus() {
  const [state, setState] = useState<DiagState | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = async () => {
    setBusy(true);
    setState(await inspect());
    setBusy(false);
  };

  useEffect(() => {
    refresh();
  }, []);

  const unregisterAll = async () => {
    setBusy(true);
    const regs = await navigator.serviceWorker.getRegistrations();
    await Promise.allSettled(regs.map((r) => r.unregister()));
    console.warn("[PWA Status] Unregistered all service workers");
    await refresh();
  };

  const clearCaches = async () => {
    setBusy(true);
    const names = await caches.keys();
    await Promise.allSettled(names.map((n) => caches.delete(n)));
    console.warn("[PWA Status] Cleared all caches:", names);
    await refresh();
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="relative py-8 px-4 text-center overflow-hidden">
        <div className="absolute inset-0">
          <img src={heroBg} alt="" className="w-full h-full object-cover" />
          <div className="absolute inset-0 bg-gradient-to-b from-background/70 via-background/80 to-background" />
        </div>
        <div className="relative z-10 max-w-3xl mx-auto">
          <div className="flex items-center justify-between mb-4">
            <Link to="/" className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground text-sm">
              <ArrowRight className="w-4 h-4" /> الرئيسية
            </Link>
            <span className="inline-flex items-center gap-1.5 text-xs font-mono px-2 py-1 rounded-full bg-primary/15 text-primary border border-primary/30">
              <Activity className="w-3 h-3" /> حالة التطبيق
            </span>
          </div>
          <h1 className="text-2xl md:text-3xl font-display font-black mb-1">
            حالة <span className="text-transparent bg-clip-text bg-gradient-to-l from-primary to-accent">Service Worker</span>
          </h1>
          <p className="text-sm text-muted-foreground">معلومات التحديث والتثبيت والذاكرة المؤقتة</p>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 pb-12 space-y-4">
        <Card className="p-4 border-primary/30">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-display font-bold text-lg">إصدار التطبيق</h2>
            <span className="font-mono text-xl text-primary font-black">{APP_VERSION}</span>
          </div>
          {state && (
            <div className="text-xs text-muted-foreground font-mono">
              فُحص في: {new Date(state.loadedAt).toLocaleString("ar")}
            </div>
          )}
        </Card>

        {state?.blockReason && (
          <Card className="p-4 border-destructive/40 bg-destructive/5">
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-destructive shrink-0 mt-0.5" />
              <div>
                <h3 className="font-display font-bold text-destructive mb-1">سبب منع التفعيل</h3>
                <p className="text-sm text-foreground/90">{state.blockReason}</p>
              </div>
            </div>
          </Card>
        )}

        <Card className="p-4">
          <h2 className="font-display font-bold text-lg mb-3 flex items-center gap-2">
            {state?.controllerActive ? (
              <CheckCircle2 className="w-5 h-5 text-primary" />
            ) : (
              <AlertTriangle className="w-5 h-5 text-accent" />
            )}
            Service Workers المسجَّلة
          </h2>
          {!state ? (
            <div className="text-sm text-muted-foreground">جارٍ الفحص...</div>
          ) : state.registrations.length === 0 ? (
            <div className="text-sm text-muted-foreground">لا يوجد أي Service Worker مسجَّل حالياً.</div>
          ) : (
            <div className="space-y-3">
              {state.registrations.map((r, i) => (
                <div key={i} className="rounded-lg border border-border/60 bg-muted/30 p-3 text-sm space-y-1">
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <span className="font-mono font-bold text-primary">{r.fileName}</span>
                    <span className={`text-xs font-mono px-2 py-0.5 rounded border ${
                      r.state === "activated"
                        ? "bg-primary/15 text-primary border-primary/30"
                        : "bg-accent/15 text-accent border-accent/30"
                    }`}>{r.state}</span>
                  </div>
                  <div className="text-xs text-muted-foreground font-mono break-all">المسار: {r.scriptURL}</div>
                  <div className="text-xs text-muted-foreground font-mono break-all">النطاق: {r.scope}</div>
                  <div className="text-xs text-muted-foreground font-mono">
                    آخر تعديل: {r.lastModified ?? "—"}
                  </div>
                  {r.fetchError && (
                    <div className="text-xs text-destructive font-mono">خطأ جلب: {r.fetchError}</div>
                  )}
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card className="p-4">
          <h2 className="font-display font-bold text-lg mb-3">الذاكرة المؤقتة (Caches)</h2>
          {!state || state.cacheNames.length === 0 ? (
            <div className="text-sm text-muted-foreground">لا توجد أي caches.</div>
          ) : (
            <ul className="text-sm font-mono space-y-1">
              {state.cacheNames.map((n) => (
                <li key={n} className="px-2 py-1 rounded bg-muted/40 break-all">{n}</li>
              ))}
            </ul>
          )}
        </Card>

        <div className="flex flex-wrap gap-2">
          <Button onClick={refresh} disabled={busy} className="gap-2">
            <RefreshCw className={`w-4 h-4 ${busy ? "animate-spin" : ""}`} /> إعادة الفحص
          </Button>
          <Button onClick={unregisterAll} disabled={busy} variant="destructive" className="gap-2">
            <Trash2 className="w-4 h-4" /> إلغاء تسجيل الكل
          </Button>
          <Button onClick={clearCaches} disabled={busy} variant="outline" className="gap-2">
            <Trash2 className="w-4 h-4" /> مسح Caches
          </Button>
        </div>

        <p className="text-xs text-muted-foreground text-center pt-2">
          افتح Console المتصفح (F12) لرؤية التفاصيل الكاملة تحت وسم <span className="font-mono text-primary">[PWA Status]</span>
        </p>
      </main>
    </div>
  );
}
