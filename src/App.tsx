import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import ErrorBoundary from "@/components/ErrorBoundary";
import UpdateBanner from "@/components/UpdateBanner";

import { lazy, Suspense, forwardRef, type ComponentType } from "react";
import { Loader2 } from "lucide-react";

type LazyProps = Record<string, unknown>;
const lazyWithIgnoredRef = (
  importer: () => Promise<{ default: ComponentType<LazyProps> }>,
) =>
  lazy(async () => {
    const mod = await importer();
    const Component = mod.default;
    const Wrapped = forwardRef<unknown, LazyProps>((props, _ref) => <Component {...props} />);
    Wrapped.displayName = `LazyWithIgnoredRef(${Component.displayName || Component.name || "Component"})`;
    return { default: Wrapped };
  });

const Home = lazyWithIgnoredRef(() => import("./pages/Home"));
const Xenoblade = lazyWithIgnoredRef(() => import("./pages/Xenoblade"));
const XenobladeProcess = lazyWithIgnoredRef(() => import("./pages/XenobladeProcess"));
const WilayViewer = lazyWithIgnoredRef(() => import("./pages/WilayViewer"));
const LagpPacker = lazyWithIgnoredRef(() => import("./pages/LagpPacker"));
const Editor = lazyWithIgnoredRef(() => import("./pages/Editor"));
const Auth = lazyWithIgnoredRef(() => import("./pages/Auth"));
const NotFound = lazyWithIgnoredRef(() => import("./pages/NotFound"));
const Install = lazyWithIgnoredRef(() => import("./pages/Install"));
const ModPackager = lazyWithIgnoredRef(() => import("./pages/ModPackager"));
const PwaStatus = lazyWithIgnoredRef(() => import("./pages/PwaStatus"));
const Risen = lazyWithIgnoredRef(() => import("./pages/Risen"));
const RisenProcess = lazyWithIgnoredRef(() => import("./pages/RisenProcess"));
const RisenImages = lazyWithIgnoredRef(() => import("./pages/RisenImages"));

const PageLoader = forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>((props, ref) => (
  <div ref={ref} className="min-h-screen flex items-center justify-center bg-background" {...props}>
    <Loader2 className="w-8 h-8 animate-spin text-primary" />
  </div>
));

PageLoader.displayName = "PageLoader";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <AuthProvider>
        <Toaster />
        <Sonner />
        <UpdateBanner />

        <BrowserRouter>
          <ErrorBoundary fallbackTitle="حدث خطأ في التطبيق">
            <Suspense fallback={<PageLoader />}>
              <Routes>
                <Route path="/" element={<Home />} />
                <Route path="/xenoblade" element={<Xenoblade />} />
                <Route path="/process" element={<ErrorBoundary fallbackTitle="خطأ في المعالجة"><XenobladeProcess /></ErrorBoundary>} />
                <Route path="/editor" element={<ErrorBoundary fallbackTitle="خطأ في المحرر"><Editor /></ErrorBoundary>} />
                <Route path="/auth" element={<Auth />} />
                <Route path="/install" element={<Install />} />
                <Route path="/mod-packager" element={<ModPackager />} />
                <Route path="/wilay" element={<WilayViewer />} />
                <Route path="/lagp-packer" element={<ErrorBoundary fallbackTitle="خطأ في أداة LAGP"><LagpPacker /></ErrorBoundary>} />
                <Route path="/pwa-status" element={<PwaStatus />} />
                <Route path="/risen" element={<Risen />} />
                <Route path="/risen/process" element={<ErrorBoundary fallbackTitle="خطأ في معالجة Risen"><RisenProcess /></ErrorBoundary>} />
                <Route path="/risen/images" element={<ErrorBoundary fallbackTitle="خطأ في أداة صور Risen"><RisenImages /></ErrorBoundary>} />
                <Route path="*" element={<NotFound />} />
              </Routes>
            </Suspense>
          </ErrorBoundary>
        </BrowserRouter>
      </AuthProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
