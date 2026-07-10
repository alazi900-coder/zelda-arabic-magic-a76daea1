import { forwardRef } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Sparkles, ArrowRight, AlertTriangle } from "lucide-react";
import GameInfoSection from "@/components/GameInfoSection";
import risenBg from "@/assets/risen-hero-bg.jpg";

const ACCENT = "#4a7c3f";
const SECONDARY = "#c9a24d";

const Risen = forwardRef<HTMLDivElement>((_, ref) => {
  return (
    <div ref={ref} className="min-h-screen flex flex-col">
      {/* Hero */}
      <header
        className="relative flex flex-col items-center justify-center min-h-[70vh] px-4 text-center overflow-hidden"
      >
        <div
          className="absolute inset-0 z-0"
          style={{
            backgroundImage: `url(${risenBg})`,
            backgroundSize: "cover",
            backgroundPosition: "center",
          }}
          aria-hidden
        />
        <div
          className="absolute inset-0 z-0"
          style={{
            background:
              "linear-gradient(to bottom, hsl(var(--background)/0.55), hsl(var(--background)/0.85) 70%, hsl(var(--background)))",
          }}
          aria-hidden
        />
        <div className="relative z-10 max-w-2xl mx-auto">
          <div
            className="inline-flex items-center gap-2 mb-6 px-4 py-2 rounded-full bg-background/60 backdrop-blur-md border"
            style={{ borderColor: `${ACCENT}66` }}
          >
            <Sparkles className="w-4 h-4" style={{ color: ACCENT }} />
            <span className="text-sm font-display font-semibold" style={{ color: ACCENT }}>
              أداة تعريب Risen 1
            </span>
          </div>
          <h1 className="text-4xl md:text-6xl font-display font-black mb-6 leading-tight drop-shadow-lg">
            عرّب{" "}
            <span
              className="text-transparent bg-clip-text"
              style={{ backgroundImage: `linear-gradient(to left, ${ACCENT}, ${SECONDARY})` }}
            >
              Risen 1
            </span>
          </h1>
          <p className="text-lg md:text-xl text-muted-foreground mb-10 max-w-lg mx-auto font-body">
            استخراج نصوص لعبة Risen 1 من ملف <code className="font-mono text-sm px-1.5 py-0.5 rounded bg-muted">strings.p00</code> أو <code className="font-mono text-sm px-1.5 py-0.5 rounded bg-muted">strings.pak</code> وترجمتها إلى العربية، ثم إعادة بناء الملف جاهزاً للعبة.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 items-center justify-center">
            <Link to="/risen/process">
              <Button
                size="lg"
                className="font-display font-bold text-lg px-10 py-6 shadow-xl"
                style={{ backgroundColor: ACCENT, color: "white" }}
              >
                ابدأ التعريب 🏝️
              </Button>
            </Link>
            <Link to="/">
              <Button size="lg" variant="ghost" className="font-display font-bold text-lg px-10 py-6">
                <ArrowRight className="w-5 h-5 ml-2" />
                الرجوع
              </Button>
            </Link>
          </div>
        </div>
      </header>

      {/* Warning */}
      <section className="px-4 pt-8" dir="rtl">
        <div className="max-w-4xl mx-auto">
          <div
            className="rounded-xl border p-5 flex gap-3 items-start"
            style={{ backgroundColor: "hsl(45 100% 50% / 0.08)", borderColor: "hsl(45 100% 50% / 0.35)" }}
          >
            <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" style={{ color: "hsl(45 100% 55%)" }} />
            <div className="text-sm leading-relaxed">
              <strong className="font-display block mb-1">قيود مهمة قبل البدء</strong>
              <ul className="list-disc pr-5 space-y-1 text-muted-foreground">
                <li>محرك اللعبة (Genome Engine) يستخدم <strong>خطوط نقطية (Bitmap)</strong> بترميز CP1252 ولا يدعم Unicode أصلاً. النص العربي سيُكتب صحيحاً في الملف، لكن اللعبة لن تعرضه ما لم يُستبدل الخط لاحقاً — استبدال الخط خارج نطاق هذه المرحلة.</li>
                <li>يعرض المحرر النص الإنجليزي فقط كمصدر للترجمة (مع رجوع تلقائي للألماني لو صف معيّن نصه الإنجليزي فاضٍ). باقي اللغات لا تظهر بالمحرر، ونستبدل <code className="font-mono text-xs">English_Text</code> بالعربي عند البناء.</li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* Images Tool Section */}
      <section className="py-16 px-4">
        <div className="max-w-3xl mx-auto text-center">
          <div className="rounded-2xl border p-8 md:p-12 shadow-lg" style={{ borderColor: `${ACCENT}4d` }}>
            <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-6" style={{ backgroundColor: `${ACCENT}1a` }}>
              <span className="text-3xl">🖼️</span>
            </div>
            <h2 className="text-2xl md:text-3xl font-display font-bold mb-4">أداة صور Risen 1</h2>
            <p className="text-muted-foreground mb-8 max-w-lg mx-auto">
              عرض واستخراج وتعديل صور اللعبة بصيغة .ximg من ملف images.pak — شاشات التحميل وصور الواجهة وأيقونات الإنجازات
            </p>
            <Link to="/risen/images">
              <Button size="lg" className="font-display font-bold text-xl px-12 py-7 shadow-xl" style={{ backgroundColor: ACCENT, color: "white" }}>
                🖼️ افتح أداة الصور
              </Button>
            </Link>
          </div>
        </div>
      </section>

      <GameInfoSection
        accentColor={ACCENT}
        secondaryColor={SECONDARY}
        fileFormat="strings.p00 / strings.pak"
        fileFormatDesc="ملف واحد يحتوي كل نصوص اللعبة القابلة للترجمة (المهام، الحوارات، الوثائق، وغيرها) بصيغة TAB0 داخلية وبترميز UTF-16LE. النسخة الأحدث من اللعبة تستخدم امتداد .pak بنفس البنية الداخلية بالضبط."
        requiredFiles={[
          { name: "strings.p00", desc: "يوجد في مسار _work/Data/Strings داخل مجلد اللعبة (النسخة الأصلية)" },
          { name: "strings.pak", desc: "نفس المسار، بنفس البنية الداخلية (النسخة الأحدث من اللعبة)" },
        ]}
        tools={[
          { name: "أداتنا", desc: "استخراج كل الجداول الداخلية (المهام، الحوارات، الوثائق، وغيرها) وترجمتها ثم إعادة بناء الملف تلقائياً" },
        ]}
        method="ارفع ملف strings.p00 أو strings.pak. الأداة تفكّ كل الجداول الداخلية، وتعرض النص الإنجليزي فقط بالمحرر لتترجمه إلى العربية باستخدام كامل ميزات المحرر (AI، القاموس، ذاكرة الترجمة، إلخ). عند الانتهاء، ارجع إلى صفحة Risen واضغط 'بناء الملف' لتحميل الملف المُعرَّب."
        notes="لعمل الترجمة ظاهرة داخل اللعبة، يلزم لاحقاً استبدال ملف الخط (bitmap font) بخط يدعم Unicode/العربية — هذه المرحلة تنتج الملف النصي الصحيح فقط."
      />
    </div>
  );
});

Risen.displayName = "Risen";
export default Risen;
