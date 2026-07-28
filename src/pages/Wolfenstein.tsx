import { forwardRef } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Sparkles, ArrowRight } from "lucide-react";

const ACCENT = "hsl(0,60%,45%)";
const SECONDARY = "hsl(20,70%,55%)";

/**
 * Wolfenstein RPG hub page — mirrors MetroidPrime.tsx: one home card, one hub,
 * a section per tool, because the font and the text have separate flows.
 *
 * The order of the two tools is not cosmetic. The game's font holds 144 cells
 * and Arabic needs 129 of them, so the Latin letters lose their glyphs: any
 * line left untranslated is drawn as Arabic gibberish. The font has to be
 * built and the text translated in full for the game to be readable at all.
 */
const Wolfenstein = forwardRef<HTMLDivElement>((_, ref) => {
  return (
    <div ref={ref} className="min-h-screen flex flex-col" dir="rtl">
      <header className="relative flex flex-col items-center justify-center min-h-[50vh] px-4 text-center overflow-hidden">
        <div className="relative z-10 max-w-2xl mx-auto">
          <div
            className="inline-flex items-center gap-2 mb-6 px-4 py-2 rounded-full bg-background/60 backdrop-blur-md border"
            style={{ borderColor: `${ACCENT}66` }}
          >
            <Sparkles className="w-4 h-4" style={{ color: ACCENT }} />
            <span className="text-sm font-display font-semibold" style={{ color: ACCENT }}>
              أداة تعريب Wolfenstein RPG
            </span>
          </div>
          <h1 className="text-4xl md:text-6xl font-display font-black mb-6 leading-tight drop-shadow-lg">
            عرّب{" "}
            <span
              className="text-transparent bg-clip-text"
              style={{ backgroundImage: `linear-gradient(to left, ${ACCENT}, ${SECONDARY})` }}
            >
              Wolfenstein RPG
            </span>
          </h1>
          <p className="text-lg md:text-xl text-muted-foreground mb-6 max-w-lg mx-auto font-body">
            تفتح ملف <code className="rounded bg-muted px-1">.ipa</code> مرة واحدة: أداة الخط ترسم الحروف العربية داخل خطوط
            اللعبة، وأداة النصوص تفتح نصوصها في المحرر الرئيسي
          </p>
          <Link to="/">
            <Button size="lg" variant="ghost" className="font-display font-bold text-lg px-10 py-6">
              <ArrowRight className="w-5 h-5 ml-2" />
              الرجوع
            </Button>
          </Link>
        </div>
      </header>

      <section className="py-10 px-4">
        <div className="max-w-3xl mx-auto text-center">
          <div className="rounded-2xl border p-8 md:p-12 shadow-lg" style={{ borderColor: `${ACCENT}4d` }}>
            <div
              className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-6"
              style={{ backgroundColor: `${ACCENT}1a` }}
            >
              <span className="text-3xl">🔤</span>
            </div>
            <h2 className="text-2xl md:text-3xl font-display font-bold mb-4">١ · أداة الخط</h2>
            <p className="text-muted-foreground mb-8 max-w-lg mx-auto">
              ترفع ملف <code className="rounded bg-muted px-1">.ttf</code> عربياً فترسم أشكاله الـ١٢٩ داخل خطوط اللعبة
              الخمسة بنسبها الصحيحة، مع مدّ وصلة كل حرف إلى حافّة خليّته لتلتحم الكلمات
            </p>
            <Link to="/wolfenstein/font">
              <Button
                size="lg"
                className="font-display font-bold text-xl px-12 py-7 shadow-xl"
                style={{ backgroundColor: ACCENT, color: "white" }}
              >
                🔤 افتح أداة الخط
              </Button>
            </Link>
          </div>
        </div>
      </section>

      <section className="py-10 px-4">
        <div className="max-w-3xl mx-auto text-center">
          <div className="rounded-2xl border p-8 md:p-12 shadow-lg" style={{ borderColor: `${ACCENT}4d` }}>
            <div
              className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-6"
              style={{ backgroundColor: `${ACCENT}1a` }}
            >
              <span className="text-3xl">📝</span>
            </div>
            <h2 className="text-2xl md:text-3xl font-display font-bold mb-4">٢ · أداة النصوص</h2>
            <p className="text-muted-foreground mb-8 max-w-lg mx-auto">
              تستخرج كل نصوص اللعبة من <code className="rounded bg-muted px-1">strings.idx</code> وبنوكها وتفتحها في المحرر
              الرئيسي، ثم تبني ملف <code className="rounded bg-muted px-1">.ipa</code> معرَّباً جاهزاً للتشغيل
            </p>
            <Link to="/wolfenstein/text">
              <Button
                size="lg"
                className="font-display font-bold text-xl px-12 py-7 shadow-xl"
                style={{ backgroundColor: ACCENT, color: "white" }}
              >
                📝 افتح أداة النصوص
              </Button>
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
});

Wolfenstein.displayName = "Wolfenstein";
export default Wolfenstein;
