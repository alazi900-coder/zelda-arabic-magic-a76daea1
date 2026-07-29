import { forwardRef } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Sparkles, ArrowRight } from "lucide-react";

const ACCENT = "hsl(0,72%,50%)";
const SECONDARY = "hsl(210,70%,55%)";

/**
 * Pokémon Ruby Destiny hub page — mirrors Wolfenstein.tsx: one home card, one
 * hub, a section per tool.
 *
 * Unlike Wolfenstein, the two tools here are independent. Arabic lives in the
 * kana codes the English build never prints, so the Latin letters keep their
 * glyphs and a half-finished translation still reads: untranslated lines stay
 * in English instead of turning into gibberish.
 */
const Pokemon = forwardRef<HTMLDivElement>((_, ref) => {
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
              أداة تعريب Pokémon Ruby Destiny
            </span>
          </div>
          <h1 className="text-4xl md:text-6xl font-display font-black mb-6 leading-tight drop-shadow-lg">
            عرّب{" "}
            <span
              className="text-transparent bg-clip-text"
              style={{ backgroundImage: `linear-gradient(to left, ${ACCENT}, ${SECONDARY})` }}
            >
              Ruby Destiny
            </span>
          </h1>
          <p className="text-lg md:text-xl text-muted-foreground mb-6 max-w-lg mx-auto font-body">
            تفتح ملف <code className="rounded bg-muted px-1">.gba</code> مرة واحدة: أداة الخط تكتب الحروف العربية داخل خط
            اللعبة، وأداة النصوص تفتح أسطرها في المحرر الرئيسي
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
              تكتب ١٢٩ شكلاً عربياً في خانات الكانا التي لا تستعملها اللعبة، فتبقى الحروف اللاتينية والأرقام سليمة. الحروف
              مرسومة يدوياً على شبكة البكسل لا مولَّدة من خط ‎TTF‎
            </p>
            <Link to="/pokemon/font">
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
              تتعرّف على كل سطر نصّ داخل الروم وتفتحه في المحرر الرئيسي، ثم تبني روماً معرَّباً — وكل سطر يُكتب في مكانه
              نفسه، فما زاد عن حدّه يُرفض ويُسمّى لك بدل أن يُقصّ
            </p>
            <Link to="/pokemon/text">
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

Pokemon.displayName = "Pokemon";
export default Pokemon;
