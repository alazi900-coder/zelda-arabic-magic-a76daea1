import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Loader2 } from "lucide-react";

// Narrow local wrapper for the beta supabase.auth.oauth namespace so TS is happy.
type OAuthApi = {
  getAuthorizationDetails: (id: string) => Promise<{ data: any; error: any }>;
  approveAuthorization: (id: string) => Promise<{ data: any; error: any }>;
  denyAuthorization: (id: string) => Promise<{ data: any; error: any }>;
};
const oauth = (supabase.auth as unknown as { oauth: OAuthApi }).oauth;

function isSafeRelative(path: string | null): path is string {
  return !!path && path.startsWith("/") && !path.startsWith("//");
}

export default function OAuthConsent() {
  const [params] = useSearchParams();
  const authorizationId = params.get("authorization_id") ?? "";
  const [details, setDetails] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      if (!authorizationId) return setError("رابط الموافقة غير صالح (authorization_id مفقود)");
      const { data: sess } = await supabase.auth.getSession();
      if (!sess.session) {
        const next = window.location.pathname + window.location.search;
        window.location.href = "/auth?next=" + encodeURIComponent(next);
        return;
      }
      try {
        const { data, error } = await oauth.getAuthorizationDetails(authorizationId);
        if (!active) return;
        if (error) return setError(error.message || String(error));
        const immediate = data?.redirect_url ?? data?.redirect_to;
        if (immediate && !data?.client) {
          window.location.href = immediate;
          return;
        }
        setDetails(data);
      } catch (e) {
        if (active) setError(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => {
      active = false;
    };
  }, [authorizationId]);

  async function decide(approve: boolean) {
    setBusy(true);
    setError(null);
    try {
      const { data, error } = approve
        ? await oauth.approveAuthorization(authorizationId)
        : await oauth.denyAuthorization(authorizationId);
      if (error) {
        setBusy(false);
        return setError(error.message || String(error));
      }
      const target = data?.redirect_url ?? data?.redirect_to;
      if (!target) {
        setBusy(false);
        return setError("لم يُرجع خادم التفويض أي رابط توجيه.");
      }
      window.location.href = target;
    } catch (e) {
      setBusy(false);
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4" dir="rtl">
        <Card className="w-full max-w-md">
          <CardContent className="p-8 text-center space-y-3">
            <h1 className="text-xl font-display font-bold">تعذّر تحميل طلب التفويض</h1>
            <p className="text-sm text-muted-foreground font-body break-all">{error}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!details) {
    return (
      <div className="min-h-screen flex items-center justify-center" dir="rtl">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  const clientName = details.client?.name ?? "تطبيق خارجي";
  const redirectUri: string | undefined = details.client?.redirect_uris?.[0] ?? details.redirect_uri;
  const scopes: string[] = Array.isArray(details.scopes)
    ? details.scopes
    : typeof details.scope === "string"
      ? details.scope.split(/\s+/).filter(Boolean)
      : [];

  return (
    <div className="min-h-screen flex items-center justify-center px-4" dir="rtl">
      <Card className="w-full max-w-lg">
        <CardContent className="p-8 space-y-5">
          <div className="text-center">
            <h1 className="text-2xl font-display font-bold">
              ربط {clientName} بحسابك
            </h1>
            <p className="text-sm text-muted-foreground font-body mt-2">
              سيتمكّن {clientName} من استخدام أدوات هذا التطبيق نيابة عنك أثناء تسجيل دخولك.
            </p>
          </div>

          <div className="rounded-md border border-border p-4 space-y-2 text-sm font-body">
            <div className="flex justify-between">
              <span className="text-muted-foreground">التطبيق الطالب</span>
              <span className="font-bold">{clientName}</span>
            </div>
            {redirectUri && (
              <div className="flex justify-between gap-3">
                <span className="text-muted-foreground shrink-0">عنوان العودة</span>
                <span dir="ltr" className="text-xs break-all text-left">{redirectUri}</span>
              </div>
            )}
            {scopes.length > 0 && (
              <div>
                <div className="text-muted-foreground mb-1">الأذونات المطلوبة</div>
                <ul className="list-disc pr-5 space-y-0.5">
                  {scopes.map((s) => (
                    <li key={s} dir="ltr" className="text-xs">{s}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          <p className="text-xs text-muted-foreground font-body text-center">
            هذا لا يتجاوز صلاحيات التطبيق أو سياسات قاعدة البيانات — الأدوات تعمل بحدود حسابك فقط.
          </p>

          <div className="flex gap-3">
            <Button
              className="flex-1 font-display"
              disabled={busy}
              onClick={() => decide(true)}
            >
              {busy ? "..." : "موافقة"}
            </Button>
            <Button
              variant="outline"
              className="flex-1 font-display"
              disabled={busy}
              onClick={() => decide(false)}
            >
              رفض
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
