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
const Mother3 = lazyWithIgnoredRef(() => import("./pages/Mother3"));
const DragonSword = lazyWithIgnoredRef(() => import("./pages/DragonSword"));
const RisenFileManager = lazyWithIgnoredRef(() => import("./pages/RisenFileManager"));
const RisenFonts = lazyWithIgnoredRef(() => import("./pages/RisenFonts"));
const Risen3Fonts = lazyWithIgnoredRef(() => import("./pages/Risen3Fonts"));
const GbaFontFinder = lazyWithIgnoredRef(() => import("./pages/GbaFontFinder"));
const EmeraldArabic = lazyWithIgnoredRef(() => import("./pages/EmeraldArabic"));
const MetroidPrime = lazyWithIgnoredRef(() => import("./pages/MetroidPrime"));
const MetroidPrimeFont = lazyWithIgnoredRef(() => import("./pages/MetroidPrimeFont"));
const MetroidPrimeText = lazyWithIgnoredRef(() => import("./pages/MetroidPrimeText"));
const MetroidPrimeImages = lazyWithIgnoredRef(() => import("./pages/MetroidPrimeImages"));
const Wolfenstein = lazyWithIgnoredRef(() => import("./pages/Wolfenstein"));
const WolfensteinFont = lazyWithIgnoredRef(() => import("./pages/WolfensteinFont"));
const WolfensteinText = lazyWithIgnoredRef(() => import("./pages/WolfensteinText"));
const Pokemon = lazyWithIgnoredRef(() => import("./pages/Pokemon"));
const PokemonFont = lazyWithIgnoredRef(() => import("./pages/PokemonFont"));
const PokemonText = lazyWithIgnoredRef(() => import("./pages/PokemonText"));
const YuGiOh = lazyWithIgnoredRef(() => import("./pages/YuGiOh"));
const YuGiOhImages = lazyWithIgnoredRef(() => import("./pages/YuGiOhImages"));
const FireEmblem12 = lazyWithIgnoredRef(() => import("./pages/FireEmblem12"));
const GameMaker = lazyWithIgnoredRef(() => import("./pages/GameMakerProcess"));
const OAuthConsent = lazyWithIgnoredRef(() => import("./pages/OAuthConsent"));

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
                <Route path="/risen/files" element={<ErrorBoundary fallbackTitle="خطأ في مدير ملفات Risen"><RisenFileManager /></ErrorBoundary>} />
                <Route path="/risen2/fonts" element={<ErrorBoundary fallbackTitle="خطأ في أداة خطوط Risen 2"><RisenFonts /></ErrorBoundary>} />
                <Route path="/gba/font" element={<ErrorBoundary fallbackTitle="خطأ في أداة إيجاد خطوط GBA"><GbaFontFinder /></ErrorBoundary>} />
                <Route path="/emerald/arabic" element={<ErrorBoundary fallbackTitle="خطأ في أداة خطّ Emerald"><EmeraldArabic /></ErrorBoundary>} />
                <Route path="/risen3/fonts" element={<ErrorBoundary fallbackTitle="خطأ في أداة خطوط Risen 3"><Risen3Fonts /></ErrorBoundary>} />
                <Route path="/metroid-prime" element={<ErrorBoundary fallbackTitle="خطأ في صفحة Metroid Prime"><MetroidPrime /></ErrorBoundary>} />
                <Route path="/metroid-prime/font" element={<ErrorBoundary fallbackTitle="خطأ في عارض خطوط Metroid Prime"><MetroidPrimeFont /></ErrorBoundary>} />
                <Route path="/metroid-prime/text" element={<ErrorBoundary fallbackTitle="خطأ في أداة نصوص Metroid Prime"><MetroidPrimeText /></ErrorBoundary>} />
                <Route path="/metroid-prime/images" element={<ErrorBoundary fallbackTitle="خطأ في أداة صور Metroid Prime"><MetroidPrimeImages /></ErrorBoundary>} />
                <Route path="/wolfenstein" element={<ErrorBoundary fallbackTitle="خطأ في صفحة Wolfenstein RPG"><Wolfenstein /></ErrorBoundary>} />
                <Route path="/wolfenstein/font" element={<ErrorBoundary fallbackTitle="خطأ في أداة خط Wolfenstein RPG"><WolfensteinFont /></ErrorBoundary>} />
                <Route path="/wolfenstein/text" element={<ErrorBoundary fallbackTitle="خطأ في أداة نصوص Wolfenstein RPG"><WolfensteinText /></ErrorBoundary>} />
                <Route path="/pokemon" element={<ErrorBoundary fallbackTitle="خطأ في صفحة Pokémon Ruby Destiny"><Pokemon /></ErrorBoundary>} />
                <Route path="/pokemon/font" element={<ErrorBoundary fallbackTitle="خطأ في أداة خط Pokémon Ruby Destiny"><PokemonFont /></ErrorBoundary>} />
                <Route path="/pokemon/text" element={<ErrorBoundary fallbackTitle="خطأ في أداة نصوص Pokémon Ruby Destiny"><PokemonText /></ErrorBoundary>} />
                <Route path="/yugioh" element={<ErrorBoundary fallbackTitle="خطأ في أداة Yu-Gi-Oh!"><YuGiOh /></ErrorBoundary>} />
                <Route path="/yugioh/images" element={<ErrorBoundary fallbackTitle="خطأ في محرر صور Yu-Gi-Oh!"><YuGiOhImages /></ErrorBoundary>} />
                <Route path="/fire-emblem-12" element={<ErrorBoundary fallbackTitle="خطأ في أداة Fire Emblem"><FireEmblem12 /></ErrorBoundary>} />
                <Route path="/mother3" element={<ErrorBoundary fallbackTitle="خطأ في أداة Mother 3"><Mother3 /></ErrorBoundary>} />
                <Route path="/dragonsword" element={<ErrorBoundary fallbackTitle="خطأ في أداة DragonSword Awakening"><DragonSword /></ErrorBoundary>} />
                <Route path="/gamemaker" element={<ErrorBoundary fallbackTitle="خطأ في صفحة GameMaker"><GameMaker /></ErrorBoundary>} />
                <Route path="/.lovable/oauth/consent" element={<OAuthConsent />} />
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
