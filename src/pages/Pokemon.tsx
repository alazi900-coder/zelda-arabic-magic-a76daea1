import { forwardRef } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { FileText, Download, Sparkles, Cpu } from "lucide-react";
import GameInfoSection from "@/components/GameInfoSection";
import heroBg from "@/assets/pokemon-sv-hero-bg.jpg";
import { APP_VERSION } from "@/lib/version";

const steps = [
  { icon: FileText, title: "ارفع الملفات", desc: "ارفع ملفات النصوص المستخرجة (JSON) وملف القاموس" },
  { icon: Cpu, title: "معالجة تلقائية", desc: "ترجمة النصوص ومعالجة الحروف العربية وربطها تلقائياً" },
  { icon: Download, title: "حمّل النتيجة", desc: "حمّل الملفات المعرّبة جاهزة للعبة" },
];

const Pokemon = forwardRef<HTMLDivElement>((_, ref) => {
  return (
    <div ref={ref} className="min-h-screen flex flex-col">
      {/* Hero */}
      <header className="relative flex flex-col items-center justify-center min-h-[80vh] px-4 text-center overflow-hidden">
        <div className="absolute inset-0">
          <img
            src={heroBg}
            alt="Pokémon Scarlet & Violet Paldea"
            className="w-full h-full object-cover"
            decoding="sync"
            loading="eager"
          />
          <div className="absolute inset-0 bg-gradient-to-b from-background/70 via-background/50 to-background" />
        </div>

        <div className="relative z-10 max-w-2xl mx-auto">
          <div className="inline-flex items-center gap-2 mb-6 px-4 py-2 rounded-full bg-background/60 backdrop-blur-md border border-[hsl(0,80%,50%)]/30">
            <Sparkles className="w-4 h-4 text-[hsl(0,80%,55%)]" />
            <span className="text-sm text-[hsl(0,80%,55%)] font-display font-semibold">أداة تعريب تلقائية</span>
          </div>
          <h1 className="text-4xl md:text-6xl font-display font-black mb-6 leading-tight drop-shadow-lg">
            عرّب{" "}
            <span className="text-transparent bg-clip-text bg-gradient-to-l from-[hsl(0,80%,55%)] to-[hsl(280,70%,55%)]">
              Pokémon Scarlet
            </span>
          </h1>
          <p className="text-lg md:text-xl text-muted-foreground mb-10 max-w-lg mx-auto font-body bg-background/40 backdrop-blur-sm rounded-lg px-4 py-2">
            ارفع ملفات النصوص المستخرجة واحصل على نسخة معرّبة بالكامل مع ربط الحروف وعكس الاتجاه تلقائياً
          </p>
          <div className="flex flex-col sm:flex-row gap-4 items-center justify-center">
            <Link to="/pokemon/process">
              <Button size="lg" className="font-display font-bold text-lg px-10 py-6 bg-[hsl(0,80%,50%)] hover:bg-[hsl(0,80%,45%)] text-white shadow-xl shadow-[hsl(0,80%,50%)]/30">
                ابدأ التعريب 🔮
              </Button>
            </Link>
            <Link to="/">
              <Button size="lg" variant="outline" className="font-display font-bold text-lg px-10 py-6 border-[hsl(0,80%,50%)]/40 hover:bg-[hsl(0,80%,50%)]/10">
                العودة لـ Xenoblade
              </Button>
            </Link>
          </div>
        </div>
      </header>

      {/* Steps */}
      <section className="py-20 px-4">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-2xl md:text-3xl font-display font-bold text-center mb-12">كيف تعمل الأداة؟</h2>
          <div className="grid md:grid-cols-3 gap-8">
            {steps.map((step, i) => (
              <div key={i} className="flex flex-col items-center text-center p-6 rounded-xl bg-card border border-border hover:border-[hsl(0,80%,50%)]/40 transition-colors">
                <div className="w-14 h-14 rounded-full bg-[hsl(0,80%,50%)]/10 flex items-center justify-center mb-4">
                  <step.icon className="w-7 h-7 text-[hsl(0,80%,55%)]" />
                </div>
                <div className="text-sm text-secondary font-display font-bold mb-1">الخطوة {i + 1}</div>
                <h3 className="text-xl font-display font-bold mb-2">{step.title}</h3>
                <p className="text-muted-foreground text-sm">{step.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Game Info */}
      <GameInfoSection
        accentColor="hsl(0, 80%, 50%)"
        secondaryColor="hsl(280, 70%, 55%)"
        fileFormat=".dat (FlatBuffers) / JSON"
        fileFormatDesc="Pokémon Scarlet تستخدم ملفات FlatBuffers داخل حاويات TRPAK لتخزين النصوص. يتم استخراجها كملفات JSON بأدوات مثل GFMSG أو pkNX."
        requiredFiles={[
          { name: "ملفات JSON", desc: "ملفات النصوص المستخرجة من common/ و script/ باستخدام GFMSG أو pkNX" },
          { name: "ملف القاموس", desc: "قاموس المصطلحات العربية لأسماء البوكيمون والهجمات والقدرات" },
        ]}
        tools={[
          { name: "gftool / Trinity Mod Loader", desc: "لاستخراج وإعادة حزم ملفات TRPFS/TRPFD من romFS" },
          { name: "pkNX", desc: "محرر شامل لملفات بوكيمون — يدعم استخراج النصوص وتعديلها" },
          { name: "GFMSG", desc: "أداة متخصصة لقراءة وتصدير ملفات النصوص بصيغة JSON" },
          { name: "FlatCrawler", desc: "لتحليل بنية ملفات FlatBuffers واستخراج البيانات" },
        ]}
        method="يتم رفع ملفات JSON المستخرجة من اللعبة بأدوات مثل GFMSG أو pkNX. تُترجم النصوص تلقائياً مع تطبيق ربط الحروف العربية وعكس الاتجاه، ثم تُصدّر كملفات JSON جاهزة لإعادة الحزم."
        notes="Pokémon Scarlet تحتوي على آلاف النصوص (أسماء بوكيمون، هجمات، قدرات، حوارات). يُنصح بالبدء بملفات الواجهة والقوائم أولاً."
      />

      {/* Footer */}
      <footer className="mt-auto py-6 text-center text-sm text-muted-foreground border-t border-border">
        <div>أداة تعريب Pokémon Scarlet — مشروع مفتوح المصدر 🇸🇦</div>
        <div className="mt-1 text-xs opacity-60">الإصدار {APP_VERSION}</div>
      </footer>
    </div>
  );
});

Pokemon.displayName = "Pokemon";

export default Pokemon;
