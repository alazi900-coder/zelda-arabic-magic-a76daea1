// الدفعة 5: حد تحميل محلي يحافظ على موضع الأداة ورسالة مفهومة أثناء جلب الوحدات المؤجلة.
import { Suspense, type ReactNode } from "react";
import { Loader2 } from "lucide-react";
import ErrorBoundary from "@/components/ErrorBoundary";

interface EditorAsyncBoundaryProps {
  children: ReactNode;
  label: string;
}

const EditorAsyncBoundary: React.FC<EditorAsyncBoundaryProps> = ({ children, label }) => (
  <ErrorBoundary fallbackTitle={`تعذر تحميل ${label}`}>
    <Suspense
      fallback={(
        <div
          role="status"
          aria-live="polite"
          aria-label={`جارٍ تحميل ${label}`}
          className="flex min-h-12 items-center justify-center gap-2 rounded-md border border-border/60 bg-muted/30 px-3 py-2 text-xs text-muted-foreground"
        >
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          <span>جارٍ تحميل {label}…</span>
        </div>
      )}
    >
      {children}
    </Suspense>
  </ErrorBoundary>
);

export default EditorAsyncBoundary;
