import { forwardRef } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { FileText, Download, Sparkles, Cpu } from "lucide-react";
import GameInfoSection from "@/components/GameInfoSection";
import heroBg from "@/assets/danganronpa-hero-bg.jpg";
import { APP_VERSION } from "@/lib/version";

const steps = [
  { icon: FileText, title: "ارفع الملفات", desc: "ارفع ملفات SPC أو STX المستخرجة من اللعبة" },
  { icon: Cpu, title: "استخراج ومعالجة", desc: "استخراج النصوص تلقائياً وتجهيزها للترجمة" },
  { icon: Download, title: "حمّل النتيجة", desc: "حمّل الملفات المعرّبة جاهزة للعبة" },
];

const Danganronpa = forwardRef<HTMLDivElement>((_, ref) => {
  return (
    <div ref={ref} className="min-h-screen flex flex-col">
      {/* Hero */}
      <header className="relative flex flex-col items-center justify-center min-h-[80vh] px-4 text-center overflow-hidden">
        <div className="absolute inset-0">
          <img
            src={heroBg}
            alt="Danganronpa"
            className="w-full h-full object-cover"
            decoding="sync"
            loading="eager"
            width={1920}
            height={1080}
          />
          <div className="absolute inset-0 bg-gradient-to-b from-background/70 via-background/50 to-background" />
        </div>

        <div className="relative z-10 max-w-2xl mx-auto">
          <div className="inline-flex items-center gap-2 mb-6 px-4 py-2 rounded-full bg-background/60 backdrop-blur-md border border-[hsl(330,80%,55%)]/30">
            <Sparkles className="w-4 h-4 text-[hsl(330,80%,55%)]" />
            <span className="text-sm text-[hsl(330,80%,55%)] font-display font-semibold">أداة تعريب تلقائية</span>
          </div>
          <h1 className="text-4xl md:text-6xl font-display font-black mb-6 leading-tight drop-shadow-lg">
            عرّب{" "}
            <span className="text-transparent bg-clip-text bg-gradient-to-l from-[hsl(330,80%,55%)] to-[hsl(280,70%,55%)]">
              Danganronpa V3
            </span>
          </h1>
          <p className="text-lg md:text-xl text-muted-foreground mb-10 max-w-lg mx-auto font-body bg-background/40 backdrop-blur-sm rounded-lg px-4 py-2">
            ارفع ملفات SPC أو STX المستخرجة من اللعبة واحصل على نسخة معرّبة بالكامل
          </p>
          <div className="flex flex-col sm:flex-row gap-4 items-center justify-center">
            <Link to="/danganronpa/process">
              <Button size="lg" className="font-display font-bold text-lg px-10 py-6 bg-[hsl(330,80%,50%)] hover:bg-[hsl(330,80%,45%)] text-white shadow-xl shadow-[hsl(330,80%,50%)]/30">
                ابدأ التعريب 🔪
              </Button>
            </Link>
            <Link to="/">
              <Button size="lg" variant="outline" className="font-display font-bold text-lg px-10 py-6 border-[hsl(330,80%,50%)]/40 hover:bg-[hsl(330,80%,50%)]/10">
                العودة للرئيسية
              </Button>
            </Link>
          </div>
        </div>
      </header>

      {/* Steps */}
      <section className="py-20 px-4">
        <div className="max-w-4xl mx-auto grid gap-8 md:grid-cols-3">
          {steps.map((s, i) => (
            <div key={i} className="flex flex-col items-center text-center gap-3 p-6 rounded-2xl bg-card/50 backdrop-blur border border-border">
              <div className="w-14 h-14 rounded-xl flex items-center justify-center bg-[hsl(330,80%,50%)]/10">
                <s.icon className="w-7 h-7 text-[hsl(330,80%,55%)]" />
              </div>
              <h3 className="font-display font-bold text-lg">{s.title}</h3>
              <p className="text-muted-foreground text-sm">{s.desc}</p>
            </div>
          ))}
        </div>
      </section>

      <GameInfoSection
        gameName="Danganronpa V3"
        fileFormats={["SPC (أرشيف اللعبة)", "STX (ملفات النصوص)"]}
        description="يدعم استخراج وترجمة النصوص من ملفات Danganronpa V3: Killing Harmony. يمكنك رفع ملفات SPC مباشرة أو ملفات STX المستخرجة."
      />

      <footer className="py-6 text-center text-xs text-muted-foreground border-t border-border">
        الإصدار {APP_VERSION}
      </footer>
    </div>
  );
});

Danganronpa.displayName = "Danganronpa";
export default Danganronpa;
