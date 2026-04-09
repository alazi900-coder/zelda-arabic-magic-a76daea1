import { Link } from "react-router-dom";
import { Sparkles } from "lucide-react";
import { APP_VERSION } from "@/lib/version";
import xc3Bg from "@/assets/xc3-hero-bg.jpg";
import pokemonBg from "@/assets/pokemon-sv-hero-bg.jpg";
import danganronpaBg from "@/assets/danganronpa-hero-bg.jpg";

const games = [
  {
    title: "Xenoblade Chronicles 3",
    subtitle: "عرّب زينوبليد كرونيكلز 3",
    desc: "استخراج النصوص من ملفات BDAT و MSBT ومعالجتها وربط الحروف العربية وعكس الاتجاه تلقائياً",
    link: "/xenoblade",
    image: xc3Bg,
    formats: ["BDAT", "MSBT"],
    gradient: "from-[hsl(180,80%,30%)] to-[hsl(200,90%,40%)]",
    accentBorder: "border-[hsl(180,60%,50%)]",
    accentText: "text-[hsl(180,80%,60%)]",
    accentBg: "bg-[hsl(180,60%,50%)]",
  },
  {
    title: "Pokémon Scarlet & Violet",
    subtitle: "عرّب بوكيمون سكارلت وفايوليت",
    desc: "ترجمة نصوص بوكيمون المستخرجة بصيغة JSON مع معالجة الحروف العربية تلقائياً",
    link: "/pokemon",
    image: pokemonBg,
    formats: ["JSON", "FlatBuffers"],
    gradient: "from-[hsl(0,70%,40%)] to-[hsl(30,80%,50%)]",
    accentBorder: "border-[hsl(0,70%,55%)]",
    accentText: "text-[hsl(0,80%,60%)]",
    accentBg: "bg-[hsl(0,70%,55%)]",
  },
  {
    title: "Danganronpa",
    subtitle: "عرّب دانجانرونبا",
    desc: "استخراج النصوص من ملفات PAK و LIN و SPC و STX — يدعم جميع أجزاء السلسلة",
    link: "/danganronpa",
    image: danganronpaBg,
    formats: ["PAK", "LIN", "SPC", "STX"],
    gradient: "from-[hsl(330,70%,40%)] to-[hsl(350,80%,50%)]",
    accentBorder: "border-[hsl(330,70%,55%)]",
    accentText: "text-[hsl(330,80%,60%)]",
    accentBg: "bg-[hsl(330,70%,55%)]",
  },
];

const Home = () => {
  return (
    <div className="min-h-screen flex flex-col bg-background">
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
        <div className="max-w-4xl mx-auto grid gap-5 md:grid-cols-1">
          {games.map((game) => (
            <Link key={game.title} to={game.link} className="block group">
              <div className={`relative rounded-2xl overflow-hidden border ${game.accentBorder}/30 hover:${game.accentBorder}/60 transition-all duration-300 shadow-lg hover:shadow-2xl`}>
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
                        className={`text-xs font-mono px-2 py-0.5 rounded ${game.accentBg}/20 ${game.accentText} border ${game.accentBorder}/30`}
                      >
                        {f}
                      </span>
                    ))}
                  </div>

                  <h2 className="text-2xl md:text-3xl font-display font-black text-white mb-1 drop-shadow-lg">
                    {game.title}
                  </h2>
                  <p className={`text-lg font-display font-bold ${game.accentText} mb-2`}>
                    {game.subtitle}
                  </p>
                  <p className="text-sm text-white/70 max-w-lg leading-relaxed">
                    {game.desc}
                  </p>

                  {/* Arrow indicator */}
                  <div className={`mt-4 inline-flex items-center gap-2 ${game.accentText} text-sm font-bold`}>
                    <span>ابدأ التعريب</span>
                    <span className="transition-transform group-hover:-translate-x-1">←</span>
                  </div>
                </div>
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* Footer */}
      <footer className="py-6 text-center text-sm text-muted-foreground border-t border-border">
        <div>أداة تعريب الألعاب — مشروع مفتوح المصدر 🇸🇦</div>
        <div className="mt-1 text-xs opacity-60">الإصدار {APP_VERSION}</div>
      </footer>
    </div>
  );
};

export default Home;
