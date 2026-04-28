/**
 * Standalone LAGP Unpack/Repack page.
 *
 * Fully isolated from the wilay texture viewer. Removing this feature is:
 *   1. Delete src/pages/LagpPacker.tsx
 *   2. Delete src/components/lagp/ (folder)
 *   3. Delete src/lib/lagp-packer.ts + its tests
 *   4. Remove the route + Home link entries.
 */

import { Link } from "react-router-dom";
import { ArrowLeft, PackageOpen, Package, FileJson, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { LagpPackerButtons } from "@/components/lagp/LagpPackerButtons";

export default function LagpPacker() {
  return (
    <div className="min-h-screen flex flex-col bg-background" dir="rtl">
      <header className="h-14 border-b border-border flex items-center px-4 gap-3 shrink-0">
        <Link to="/">
          <Button variant="ghost" size="icon" className="h-8 w-8">
            <ArrowLeft className="w-4 h-4" />
          </Button>
        </Link>
        <h1 className="text-base font-semibold">أداة فك/تجميع LAGP</h1>
        <span className="text-xs text-muted-foreground hidden sm:inline">
          (مستقلة عن عارض صور Wilay)
        </span>
      </header>

      <main className="flex-1 overflow-auto">
        <div className="max-w-3xl mx-auto p-4 sm:p-8 space-y-6">
          {/* Intro */}
          <section className="space-y-2">
            <h2 className="text-xl font-bold">ما هذه الأداة؟</h2>
            <p className="text-sm text-muted-foreground leading-relaxed">
              تتعامل مع ملفات <code className="text-xs bg-muted px-1.5 py-0.5 rounded">.wilay</code>{" "}
              من نوع <strong>LAGP</strong> (ملفات تخطيط واجهة Monolith). تستخرج
              البنية الداخلية كملفات منفصلة لتعديلها يدوياً، ثم تعيد تجميعها بنفس
              التشفير الأصلي بايت-ببايت.
            </p>
            <div className="bg-muted/40 border border-border rounded-md p-3 flex gap-2 text-xs">
              <Info className="w-4 h-4 shrink-0 mt-0.5 text-primary" />
              <div className="space-y-1">
                <p>
                  <strong>round-trip بايت-ببايت:</strong> فك ثم إعادة تجميع بدون تعديل
                  ينتج نفس الملف الأصلي تماماً (نفس SHA-256).
                </p>
                <p className="text-muted-foreground">
                  هذه الأداة منفصلة كلياً عن{" "}
                  <Link to="/wilay" className="text-primary hover:underline">
                    عارض صور Wilay
                  </Link>{" "}
                  — لا تشاركان حالة ولا واجهة.
                </p>
              </div>
            </div>
          </section>

          {/* Actions */}
          <section className="space-y-3">
            <h3 className="text-sm font-semibold text-muted-foreground">العمليات</h3>
            <div className="flex flex-wrap gap-2 p-3 bg-card border border-border rounded-md">
              <LagpPackerButtons />
            </div>
          </section>

          {/* How-to */}
          <section className="space-y-3">
            <h3 className="text-sm font-semibold text-muted-foreground">الاستخدام</h3>
            <ol className="space-y-3 text-sm">
              <li className="flex gap-3">
                <span className="shrink-0 w-6 h-6 rounded-full bg-primary/15 text-primary flex items-center justify-center text-xs font-bold">
                  1
                </span>
                <div>
                  <div className="font-medium flex items-center gap-1.5">
                    <PackageOpen className="w-4 h-4" /> فك LAGP
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    اختر ملف <code className="bg-muted px-1 rounded">.wilay</code>{" "}
                    → تحصل على ZIP يحتوي{" "}
                    <code className="bg-muted px-1 rounded">manifest.json</code> و
                    مجلد <code className="bg-muted px-1 rounded">chunks/</code>.
                  </p>
                </div>
              </li>
              <li className="flex gap-3">
                <span className="shrink-0 w-6 h-6 rounded-full bg-primary/15 text-primary flex items-center justify-center text-xs font-bold">
                  2
                </span>
                <div>
                  <div className="font-medium flex items-center gap-1.5">
                    <Package className="w-4 h-4" /> تجميع LAGP
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    عدّل ملفات الـ chunks كما تريد، أعد ضغط الـ ZIP، ثم اختره هنا
                    → تحصل على <code className="bg-muted px-1 rounded">.wilay</code>{" "}
                    جاهز.
                  </p>
                </div>
              </li>
              <li className="flex gap-3">
                <span className="shrink-0 w-6 h-6 rounded-full bg-primary/15 text-primary flex items-center justify-center text-xs font-bold">
                  3
                </span>
                <div>
                  <div className="font-medium flex items-center gap-1.5">
                    <FileJson className="w-4 h-4" /> تجميع + manifest
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    إذا كان لديك ZIP بالـ chunks وملف{" "}
                    <code className="bg-muted px-1 rounded">manifest.json</code>{" "}
                    منفصل (مثلاً عدّلته بمحرر نصوص خارجي)، اختر الاثنين معاً.
                  </p>
                </div>
              </li>
            </ol>
          </section>
        </div>
      </main>
    </div>
  );
}
