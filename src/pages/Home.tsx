import { Link } from "react-router-dom";
import { Sparkles, Activity } from "lucide-react";
import { APP_VERSION } from "@/lib/version";
import ChangelogCard from "@/components/ChangelogCard";
import xc3Bg from "@/assets/xc3-hero-bg.jpg";
import risenBg from "@/assets/risen-hero-bg.jpg";
import metroidPrimeBg from "@/assets/metroid-prime-hero-bg.jpg";

const games = [
  {
    title: "Xenoblade Chronicles 3",
    subtitle: "عرّب زينوبليد كرونيكلز 3",
    desc: "استخراج النصوص من ملفات BDAT و MSBT ومعالجتها وربط الحروف العربية وعكس الاتجاه تلقائياً",
    link: "/xenoblade",
    image: xc3Bg,
    formats: ["BDAT", "MSBT"],
    cardClass: "border-[hsl(180,60%,50%)]/30 hover:border-[hsl(180,60%,50%)]/60",
    formatClass: "bg-[hsl(180,60%,50%)]/20 text-[hsl(180,80%,60%)] border-[hsl(180,60%,50%)]/30",
    subtitleClass: "text-[hsl(180,80%,60%)]",
    arrowClass: "text-[hsl(180,80%,60%)]",
  },
  {
    title: "Risen 1",
    subtitle: "عرّب رايزن 1",
    desc: "استخراج نصوص محرك Genome من ملف strings.p00 (المهام، الحوارات، الوثائق) وإعادة بناء الملف تلقائياً — دعم أولي",
    link: "/risen",
    image: risenBg,
    formats: ["strings.p00", "TAB0"],
    cardClass: "border-[hsl(100,35%,40%)]/30 hover:border-[hsl(100,35%,40%)]/60",
    formatClass: "bg-[hsl(100,35%,40%)]/20 text-[hsl(90,50%,60%)] border-[hsl(100,35%,40%)]/30",
    subtitleClass: "text-[hsl(90,50%,60%)]",
    arrowClass: "text-[hsl(90,50%,60%)]",
  },
  {
    title: "Mother 3",
    subtitle: "عرّب مذر 3",
    desc: "فكّ تشفير سكربت النسخة الإنجليزية 1.1 (GBA) مباشرة في المتصفح، تحرير الأسطر وإعادة بناء ROM معرّب — مع رقعة عكس اتجاه النص RTL",
    link: "/mother3",
    image: risenBg,
    formats: ["GBA", "Script"],
    cardClass: "border-[hsl(0,60%,45%)]/30 hover:border-[hsl(0,60%,45%)]/60",
    formatClass: "bg-[hsl(0,60%,45%)]/20 text-[hsl(0,70%,62%)] border-[hsl(0,60%,45%)]/30",
    subtitleClass: "text-[hsl(0,70%,62%)]",
    arrowClass: "text-[hsl(0,70%,62%)]",
  },
  {
    title: "Metroid Prime Remastered",
    subtitle: "أداة خطوط ميترويد برايم ريماسترد",
    desc: "استخراج وعرض خطوط ملفات .pak (RFRM/TXTR/FONT) ورسم حروف عربية حقيقية بواسطة Canvas 2D وإدراجها في أطلس الخط — دعم أولي",
    link: "/metroid-prime/font",
    image: metroidPrimeBg,
    formats: [".pak", "FONT/TXTR"],
    cardClass: "border-[hsl(270,50%,55%)]/30 hover:border-[hsl(270,50%,55%)]/60",
    formatClass: "bg-[hsl(270,50%,55%)]/20 text-[hsl(270,70%,70%)] border-[hsl(270,50%,55%)]/30",
    subtitleClass: "text-[hsl(270,70%,70%)]",
    arrowClass: "text-[hsl(270,70%,70%)]",
  },
];

const Home = () => {
  return (
    <div className="min-h-screen flex flex-col bg-background overflow-x-hidden max-w-[100vw]">
      {/* Header */}
      <header className="py-8 px-4 text-center">
        <div className="inline-flex items-center gap-2 mb-4 px-4 py-2 rounded-full bg-card border border-primary/30">
          <Sparkles className="w-4 h-4 text-primary" />
          <span className="text-sm text-primary font-display font-semibold">أداة تعريب الألعاب</span>
        </div>
        <h1 className="text-3xl md:text-5xl font-display font-black mb-3 leading-tight">
          عرّب{" "}
          <span className="text-transparent bg-clip-text bg-gradient-to-l from-primary to-[hsl(180,80%,60%)]">
            ألعابك المفضلة
          </span>
        </h1>
        <p className="text-muted-foreground max-w-md mx-auto">
          اختر اللعبة التي تريد تعريبها وابدأ فوراً
        </p>
      </header>

      {/* Game Cards */}
      <section className="flex-1 px-4 pb-8">
        <div className="max-w-4xl mx-auto grid gap-5">
          {games.map((game) => (
            <Link key={game.title} to={game.link} className="block group">
              <div className={`relative rounded-2xl overflow-hidden border transition-all duration-300 shadow-lg hover:shadow-2xl ${game.cardClass}`}>
                {/* Background Image */}
                <div className="absolute inset-0">
                  <img
                    src={game.image}
                    alt={game.title}
                    className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                    loading="lazy"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/60 to-black/30" />
                </div>

                {/* Content */}
                <div className="relative z-10 p-5 md:p-8 min-h-[200px] md:min-h-[240px] flex flex-col justify-end">
                  {/* Formats */}
                  <div className="flex gap-2 mb-3 flex-wrap">
                    {game.formats.map((f) => (
                      <span
                        key={f}
                        className={`text-xs font-mono px-2 py-0.5 rounded border ${game.formatClass}`}
                      >
                        {f}
                      </span>
                    ))}
                  </div>

                  <h2 className="text-2xl md:text-3xl font-display font-black text-white mb-1 drop-shadow-lg">
                    {game.title}
                  </h2>
                  <p className={`text-lg font-display font-bold mb-2 ${game.subtitleClass}`}>
                    {game.subtitle}
                  </p>
                  <p className="text-sm text-white/70 max-w-lg leading-relaxed">
                    {game.desc}
                  </p>

                  {/* Arrow indicator */}
                  <div className={`mt-4 inline-flex items-center gap-2 text-sm font-bold ${game.arrowClass}`}>
                    <span>ابدأ التعريب</span>
                    <span className="transition-transform group-hover:-translate-x-1">←</span>
                  </div>
                </div>
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* آخر التحديثات */}
      <section className="max-w-3xl mx-auto px-4 pb-8">
        <ChangelogCard initialCount={1} />
      </section>


      {/* Footer */}
      <footer className="py-6 text-center text-sm text-muted-foreground border-t border-border">
        <div>أداة تعريب الألعاب — مشروع مفتوح المصدر 🇸🇦</div>
        <div className="mt-1 text-xs opacity-60">الإصدار {APP_VERSION}</div>
        <Link to="/pwa-status" className="inline-flex items-center gap-1.5 mt-2 text-xs text-primary hover:underline">
          <Activity className="w-3.5 h-3.5" /> حالة التطبيق والتحديثات
        </Link>
      </footer>
    </div>
  );
};

export default Home;
