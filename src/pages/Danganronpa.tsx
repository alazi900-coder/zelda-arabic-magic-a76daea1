import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Sparkles, ArrowLeft } from "lucide-react";
import heroBg from "@/assets/danganronpa-hero-bg.jpg";
import { APP_VERSION } from "@/lib/version";

const games = [
  {
    title: "Danganronpa V3",
    subtitle: "Killing Harmony",
    desc: "ملفات SPC و STX — نظام نصوص V3",
    link: "/danganronpa/v3",
    formats: ["SPC", "STX"],
    color: "hsl(330,80%,55%)",
  },
  {
    title: "Danganronpa 1",
    subtitle: "Trigger Happy Havoc",
    desc: "ملفات PAK و LIN — نظام السكربت الكلاسيكي",
    link: "/danganronpa/classic",
    formats: ["PAK", "LIN"],
    color: "hsl(0,70%,55%)",
  },
  {
    title: "Danganronpa 2",
    subtitle: "Goodbye Despair",
    desc: "ملفات PAK و LIN — نظام السكربت الكلاسيكي",
    link: "/danganronpa/classic?dr2=1",
    formats: ["PAK", "LIN"],
    color: "hsl(200,70%,55%)",
  },
];

export default function Danganronpa() {
  return (
    <div className="min-h-screen flex flex-col">
      {/* Hero */}
      <header className="relative flex flex-col items-center justify-center min-h-[60vh] px-4 text-center overflow-hidden">
        <div className="absolute inset-0">
          <img src={heroBg} alt="Danganronpa" className="w-full h-full object-cover" decoding="sync" loading="eager" width={1920} height={1080} />
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
              Danganronpa
            </span>
          </h1>
          <p className="text-lg text-muted-foreground mb-8 bg-background/40 backdrop-blur-sm rounded-lg px-4 py-2">
            اختر اللعبة التي تريد تعريبها
          </p>
          <Link to="/">
            <Button variant="ghost" size="sm" className="text-muted-foreground">
              <ArrowLeft className="w-4 h-4 ml-1" />
              العودة للرئيسية
            </Button>
          </Link>
        </div>
      </header>

      {/* Game Cards */}
      <section className="py-12 px-4 -mt-12 relative z-10">
        <div className="max-w-4xl mx-auto grid gap-6 md:grid-cols-3">
          {games.map((game) => (
            <Link key={game.link} to={game.link}>
              <Card className="group hover:shadow-xl transition-all duration-300 hover:-translate-y-1 border-2 hover:border-[var(--game-color)] cursor-pointer h-full" style={{ "--game-color": game.color } as React.CSSProperties}>
                <CardContent className="p-6 flex flex-col items-center text-center gap-3">
                  <h3 className="font-display font-bold text-xl" style={{ color: game.color }}>{game.title}</h3>
                  <p className="text-sm font-medium text-foreground">{game.subtitle}</p>
                  <p className="text-xs text-muted-foreground">{game.desc}</p>
                  <div className="flex gap-2 mt-2">
                    {game.formats.map((f) => (
                      <span key={f} className="text-[10px] px-2 py-0.5 rounded-full font-mono" style={{ backgroundColor: `${game.color}20`, color: game.color }}>
                        {f}
                      </span>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      </section>

      <footer className="mt-auto py-6 text-center text-xs text-muted-foreground border-t border-border">
        الإصدار {APP_VERSION}
      </footer>
    </div>
  );
}
