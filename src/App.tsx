import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import ErrorBoundary from "@/components/ErrorBoundary";
import UpdateBanner from "@/components/UpdateBanner";

import Xenoblade from "./pages/Xenoblade";
import XenobladeProcess from "./pages/XenobladeProcess";
import Editor from "./pages/Editor";
import Auth from "./pages/Auth";
import NotFound from "./pages/NotFound";
import Install from "./pages/Install";
import ModPackager from "./pages/ModPackager";


const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <AuthProvider>
        <Toaster />
        <Sonner />
        <UpdateBanner />
        
        <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
          <ErrorBoundary fallbackTitle="حدث خطأ في التطبيق">
            <Routes>
              <Route path="/" element={<Xenoblade />} />
              <Route path="/process" element={<ErrorBoundary fallbackTitle="خطأ في المعالجة"><XenobladeProcess /></ErrorBoundary>} />
              <Route path="/editor" element={<ErrorBoundary fallbackTitle="خطأ في المحرر"><Editor /></ErrorBoundary>} />
              
              <Route path="/auth" element={<Auth />} />
              <Route path="/install" element={<Install />} />
              <Route path="/mod-packager" element={<ModPackager />} />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </ErrorBoundary>
        </BrowserRouter>
      </AuthProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
