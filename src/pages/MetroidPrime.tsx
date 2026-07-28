import { forwardRef } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Sparkles, ArrowRight } from "lucide-react";

const ACCENT = "hsl(270,50%,55%)";
const SECONDARY = "hsl(270,70%,70%)";

/**
 * Metroid Prime Remastered hub page — mirrors Risen.tsx's pattern (one home
 * card -> one hub page -> a big section per tool) since the game has two
 * separate tools (font, text) that don't share a single upload flow.
 */
const MetroidPrime = forwardRef<HTMLDivElement>((_, ref) => {
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
              أداة تعريب Metroid Prime Remastered
            </span>
          </div>
          <h1 className="text-4xl md:text-6xl font-display font-black mb-6 leading-tight drop-shadow-lg">
            عرّب{" "}
            <span className="text-transparent bg-clip-text" style={{ backgroundImage: `linear-gradient(to left, ${ACCENT}, ${SECONDARY})` }}>
              Metroid Prime
            </span>
          </h1>
          <p className="text-lg md:text-xl text-muted-foreground mb-6 max-w-lg mx-auto font-body">
            أداتان منفصلتان: أداة الخط لإضافة دعم الحروف العربية، وأداة النصوص لترجمة نصوص اللعبة (MSBT)
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
            <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-6" style={{ backgroundColor: `${ACCENT}1a` }}>
              <span className="text-3xl">🔤</span>
            </div>
            <h2 className="text-2xl md:text-3xl font-display font-bold mb-4">أداة خطوط Metroid Prime</h2>
            <p className="text-muted-foreground mb-8 max-w-lg mx-auto">
              استخراج وعرض خطوط ملفات .pak (RFRM/TXTR/FONT) ورسم حروف عربية حقيقية بواسطة Canvas 2D وإدراجها في أطلس الخط
            </p>
            <Link to="/metroid-prime/font">
              <Button size="lg" className="font-display font-bold text-xl px-12 py-7 shadow-xl" style={{ backgroundColor: ACCENT, color: "white" }}>
                🔤 افتح أداة الخط
              </Button>
            </Link>
          </div>
        </div>
      </section>

      <section className="py-10 px-4">
        <div className="max-w-3xl mx-auto text-center">
          <div className="rounded-2xl border p-8 md:p-12 shadow-lg" style={{ borderColor: `${ACCENT}4d` }}>
            <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-6" style={{ backgroundColor: `${ACCENT}1a` }}>
              <span className="text-3xl">📝</span>
            </div>
            <h2 className="text-2xl md:text-3xl font-display font-bold mb-4">أداة نصوص Metroid Prime</h2>
            <p className="text-muted-foreground mb-8 max-w-lg mx-auto">
              استخراج نصوص كل ملفات MSBT من ملف .pak (استعراضات، رسائل التقاط، تعليمات، أسماء مناطق...) وترجمتها في المحرر الرئيسي
            </p>
            <Link to="/metroid-prime/text">
              <Button size="lg" className="font-display font-bold text-xl px-12 py-7 shadow-xl" style={{ backgroundColor: ACCENT, color: "white" }}>
                📝 افتح أداة النصوص
              </Button>
            </Link>
          </div>
        </div>
      </section>

      <section className="py-10 px-4">
        <div className="max-w-3xl mx-auto text-center">
          <div className="rounded-2xl border p-8 md:p-12 shadow-lg" style={{ borderColor: `${ACCENT}4d` }}>
            <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-6" style={{ backgroundColor: `${ACCENT}1a` }}>
              <span className="text-3xl">🖼️</span>
            </div>
            <h2 className="text-2xl md:text-3xl font-display font-bold mb-4">أداة صور Metroid Prime</h2>
            <p className="text-muted-foreground mb-8 max-w-lg mx-auto">
              استعراض كل صور ملف .pak (شعار اللعبة، صور القوائم، الأيقونات) وتصديرها PNG واستبدالها بصور معرَّبة، مع إعادة ترميزها بصيغة اللعبة نفسها
            </p>
            <Link to="/metroid-prime/images">
              <Button size="lg" className="font-display font-bold text-xl px-12 py-7 shadow-xl" style={{ backgroundColor: ACCENT, color: "white" }}>
                🖼️ افتح أداة الصور
              </Button>
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
});

MetroidPrime.displayName = "MetroidPrime";
export default MetroidPrime;
