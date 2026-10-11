import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, ArrowUpLeft, BookOpen, FolderOpen, Gamepad2, Search, ShieldCheck, Sparkles, X } from "lucide-react";
import { LIBRARY_CATEGORIES, LIBRARY_GAMES, type LibraryCategory } from "@/lib/game-library";
import { getWorkspaceProgress, type WorkspaceProgress } from "@/lib/game-workspace";
import { Input } from "@/components/ui/input";
import xc3Cover from "@/assets/covers/xc3-cover.jpg";
import metroidCover from "@/assets/covers/metroid-cover.jpg";
import motherCover from "@/assets/covers/mother3-cover.jpg";
import pokemonCover from "@/assets/covers/pokemon-cover.jpg";
import risenCover from "@/assets/covers/risen-cover.jpg";

const covers: Record<string, string> = {
  xenoblade: xc3Cover, metroidprime: metroidCover, mother3: motherCover,
  pokemon: pokemonCover, risen1: risenCover,
};
const number = (n: number) => n.toLocaleString("ar");

export default function GameLibrary() {
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<LibraryCategory | "الكل">("الكل");
  const [sessionsOnly, setSessionsOnly] = useState(false);
  const [progress, setProgress] = useState<Record<string, WorkspaceProgress>>({});
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let mounted = true;
    void Promise.all(LIBRARY_GAMES.map(async game => {
      try { return [game.id, await getWorkspaceProgress(game)] as const; }
      catch { return [game.id, { total: 0, translated: 0, ready: false }] as const; }
    })).then(results => {
      if (mounted) { setProgress(Object.fromEntries(results)); setLoaded(true); }
    });
    return () => { mounted = false; };
  }, []);

  const filtered = useMemo(() => LIBRARY_GAMES.filter(game => {
    const matchesText = `${game.title} ${game.subtitle} ${game.description} ${game.platform}`
      .toLocaleLowerCase().includes(search.trim().toLocaleLowerCase());
    return matchesText && (category === "الكل" || category === game.category) &&
      (!sessionsOnly || !!progress[game.id]?.ready);
  }), [search, category, sessionsOnly, progress]);
  const savedCount = LIBRARY_GAMES.filter(game => progress[game.id]?.ready).length;

  return (
    <main dir="rtl" className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-7xl px-4 pb-20 pt-7 sm:px-6 lg:px-8">
        <header className="mb-9 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-primary/30 bg-primary/10">
              <Gamepad2 className="h-6 w-6 text-primary" />
            </div>
            <div>
              <p className="text-lg font-black tracking-tight">مختبر تعريب الألعاب</p>
              <p className="text-xs text-muted-foreground">مكتبتك ومشاريعك في مكان واحد</p>
            </div>
          </div>
          <Link to="/classic" className="inline-flex items-center gap-2 rounded-xl border border-border px-4 py-2 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
            الواجهة السابقة <ArrowUpLeft className="h-4 w-4" />
          </Link>
        </header>

        <section className="relative mb-9 overflow-hidden rounded-3xl border border-primary/20 bg-card p-6 sm:p-9">
          <div aria-hidden className="pointer-events-none absolute -left-20 -top-36 h-96 w-96 rounded-full bg-primary/10 blur-3xl" />
          <div className="relative z-10 grid items-end gap-7 md:grid-cols-[1fr_auto]">
            <div>
              <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-primary/25 bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
                <Sparkles className="h-3.5 w-3.5" /> مساحة العمل الجديدة
              </div>
              <h1 className="max-w-xl text-3xl font-black leading-tight sm:text-4xl">كل لعبة لها عالمها الخاص.</h1>
              <p className="mt-3 max-w-xl text-sm leading-7 text-muted-foreground">
                اختر لعبة للوصول إلى نصوصها وأدواتها وقواعد الذكاء الاصطناعي الخاصة بها.
                محرر الترجمة واحد، لكن ملفات الحفظ لا تختلط بين الألعاب.
              </p>
            </div>
            <div className="grid min-w-48 grid-cols-2 gap-3">
              <div className="rounded-2xl border border-border bg-background/65 p-4 text-center">
                <p className="text-3xl font-black">{number(LIBRARY_GAMES.length)}</p>
                <p className="mt-1 text-xs text-muted-foreground">لعبة وأداة</p>
              </div>
              <div className="rounded-2xl border border-border bg-background/65 p-4 text-center">
                <p className="text-3xl font-black">{loaded ? number(savedCount) : "—"}</p>
                <p className="mt-1 text-xs text-muted-foreground">مشروع محفوظ</p>
              </div>
            </div>
          </div>
        </section>

        <section aria-label="بحث وتصفية المكتبة" className="mb-7 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-xl font-black">مكتبة الألعاب</h2>
              <p className="mt-1 text-xs text-muted-foreground">افتح مساحة أي لعبة دون تغيير بيانات غيرها</p>
            </div>
            <span className="rounded-full border border-border bg-card px-3 py-1.5 text-xs text-muted-foreground">{number(filtered.length)} نتيجة</span>
          </div>
          <div className="relative">
            <Search className="absolute right-4 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
            <Input value={search} onChange={event => setSearch(event.target.value)} placeholder="ابحث عن لعبة أو منصة..." aria-label="البحث عن لعبة" className="h-12 rounded-2xl bg-card pr-12 text-base" />
            {search && <button type="button" aria-label="مسح البحث" onClick={() => setSearch("")} className="absolute left-3 top-1/2 -translate-y-1/2 rounded-lg p-1.5 hover:bg-muted"><X className="h-4 w-4" /></button>}
          </div>
          <div className="flex flex-wrap gap-2">
            {(["الكل", ...LIBRARY_CATEGORIES] as const).map(group => (
              <button key={group} type="button" onClick={() => setCategory(group)}
                aria-pressed={category === group}
                className={`rounded-full border px-4 py-2 text-xs font-semibold transition-colors ${category === group ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card text-muted-foreground hover:bg-muted hover:text-foreground"}`}>
                {group}
              </button>
            ))}
            <button type="button" onClick={() => setSessionsOnly(value => !value)} aria-pressed={sessionsOnly}
              className={`inline-flex items-center gap-1.5 rounded-full border px-4 py-2 text-xs font-semibold transition-colors ${sessionsOnly ? "border-primary bg-primary/15 text-primary" : "border-border bg-card text-muted-foreground hover:text-foreground"}`}>
              <FolderOpen className="h-3.5 w-3.5" /> مشاريعي المحفوظة
            </button>
          </div>
        </section>

        {filtered.length ? (
          <section aria-label="ألعاب المكتبة" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {filtered.map(game => {
              const state = progress[game.id];
              const percent = state?.total ? Math.min(100, state.translated / state.total * 100) : 0;
              return (
                <Link to={`/games/${game.id}`} key={game.id} className="group min-w-0 overflow-hidden rounded-2xl border border-border bg-card transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/45 hover:shadow-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
                  <div className="relative h-36 overflow-hidden" style={{ backgroundImage: `linear-gradient(120deg,${game.colors[0]},${game.colors[1]})` }}>
                    {covers[game.id] && <img src={covers[game.id]} loading="lazy" alt="" className="absolute inset-0 h-full w-full object-cover opacity-65 transition-transform duration-500 group-hover:scale-105" />}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/10 to-transparent" />
                    <div className="absolute right-4 top-4 rounded-lg border border-white/20 bg-black/40 px-2.5 py-1 text-xs text-white backdrop-blur-sm" dir="ltr">{game.platform}</div>
                    <div className="absolute bottom-4 right-4 left-4 flex items-end justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-white/75">{game.subtitle}</p>
                        <h3 className="mt-1 line-clamp-2 text-xl font-black text-white" dir="auto">{game.title}</h3>
                      </div>
                      <ArrowUpLeft className="h-5 w-5 shrink-0 text-white/80 transition-transform group-hover:-translate-x-1 group-hover:-translate-y-1" />
                    </div>
                  </div>
                  <div className="space-y-4 p-4">
                    <p className="line-clamp-2 min-h-10 text-sm leading-5 text-muted-foreground">{game.description}</p>
                    <div className="flex items-center justify-between gap-3 border-t border-border pt-3">
                      {state?.ready ? (
                        <div className="min-w-0 flex-1">
                          <p className="mb-1.5 text-xs font-semibold text-foreground">{number(state.translated)} / {number(state.total)} نص مترجم</p>
                          <div role="progressbar" aria-label="تقدم الترجمة" aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100} className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                            <div className="h-full rounded-full bg-primary" style={{ width: `${percent}%` }} />
                          </div>
                        </div>
                      ) : <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground"><BookOpen className="h-3.5 w-3.5" /> {loaded ? "ابدأ مشروعًا" : "جاري قراءة المشاريع..."}</span>}
                      <span className="shrink-0 text-xs font-bold text-primary">فتح المساحة <ArrowLeft className="mr-1 inline h-3.5 w-3.5" /></span>
                    </div>
                  </div>
                </Link>
              );
            })}
          </section>
        ) : <div className="rounded-2xl border border-dashed border-border bg-card p-12 text-center">
          <Search className="mx-auto mb-3 h-9 w-9 text-muted-foreground" />
          <h3 className="font-bold">لم نجد ألعابًا بهذه المواصفات</h3>
          <button type="button" className="mt-4 rounded-lg border border-border px-4 py-2 text-sm hover:bg-muted" onClick={() => { setSearch(""); setCategory("الكل"); setSessionsOnly(false); }}>عرض جميع الألعاب</button>
        </div>}

        <footer className="mt-10 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-6 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1.5"><ShieldCheck className="h-4 w-4" /> المشاريع المحفوظة تبقى محلياً على جهازك. لا تُمسح عند التنقل.</span>
          <Link to="/editor" className="text-primary hover:underline">محرر الترجمة المشترك (الجلسة الحالية)</Link>
        </footer>
      </div>
    </main>
  );
}
