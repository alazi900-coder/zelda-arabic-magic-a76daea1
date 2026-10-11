import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, ArrowRight, BookOpen, CheckCircle2, FileText, FolderOpen, Gamepad2, Loader2, LockKeyhole, NotebookPen, ShieldCheck, Wrench } from "lucide-react";
import { AI_PROFILE_NAMES } from "@/lib/ai-game-profiles";
import { findLibraryGame } from "@/lib/game-library";
import { activateGameWorkspace, getWorkspaceProgress, readWorkspaceNotes, saveWorkspaceNotes, type WorkspaceProgress } from "@/lib/game-workspace";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/hooks/use-toast";

const format = (count: number) => count.toLocaleString("ar");

export default function GameWorkspace() {
  const { gameId } = useParams<{ gameId: string }>();
  const game = findLibraryGame(gameId);
  const navigate = useNavigate();
  const [progress, setProgress] = useState<WorkspaceProgress | null>(null);
  const [notes, setNotes] = useState("");
  const [opening, setOpening] = useState(false);
  useEffect(() => {
    setNotes(game ? readWorkspaceNotes(game.id) : "");
    setProgress(null);
    if (!game) return;
    let active = true;
    void getWorkspaceProgress(game)
      .then(result => { if (active) setProgress(result); })
      .catch(() => { if (active) setProgress({ ready: false, total: 0, translated: 0 }); });
    return () => { active = false; };
  }, [game]);

  if (!game) return <main dir="rtl" className="flex min-h-screen flex-col items-center justify-center gap-5 bg-background p-6 text-center">
    <h1 className="text-2xl font-bold">هذه اللعبة غير موجودة في المكتبة</h1>
    <Link className="text-primary hover:underline" to="/">العودة إلى مكتبة الألعاب</Link>
  </main>;

  const percent = progress?.total ? Math.round(100 * progress.translated / progress.total) : 0;
  const openEditor = async () => {
    if (opening) return;
    setOpening(true);
    try {
      if (await activateGameWorkspace(game)) navigate("/editor");
      else toast({ title: "لا توجد جلسة محفوظة", description: "افتح أداة اللعبة واستورد الملفات أولًا. لم نغيّر جلسات الألعاب الأخرى." });
    } catch (error) {
      toast({ title: "تعذّر فتح المشروع", description: error instanceof Error ? error.message : "تعذّر قراءة الحفظ المحلي", variant: "destructive" });
    } finally {
      setOpening(false);
    }
  };

  return (
    <main dir="rtl" className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-6xl px-4 pb-16 pt-6 sm:px-6">
        <nav className="mb-6 flex flex-wrap items-center gap-2 text-sm text-muted-foreground" aria-label="التنقل">
          <Link to="/" className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 hover:bg-muted hover:text-foreground"><ArrowRight className="h-4 w-4" /> مكتبة الألعاب</Link>
          <span>/</span>
          <span className="font-semibold text-foreground">{game.title}</span>
        </nav>
        <header className="relative mb-6 overflow-hidden rounded-3xl border border-border p-7 sm:p-10" style={{ backgroundImage: `linear-gradient(110deg, ${game.colors[0]}ee, ${game.colors[1]}aa)` }}>
          <div className="absolute -left-12 -top-20 h-56 w-56 rounded-full border-[35px] border-white/5" aria-hidden />
          <div className="relative max-w-2xl text-white">
            <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-white/20 bg-black/20 px-3 py-1.5 text-xs"><Gamepad2 className="h-4 w-4" /> {game.platform} · {game.subtitle}</div>
            <h1 className="text-3xl font-black leading-tight sm:text-4xl" dir="auto">{game.title}</h1>
            <p className="mt-3 max-w-xl text-sm leading-7 text-white/85">{game.description}</p>
            <div className="mt-7 flex flex-wrap gap-3">
              <Link to={game.toolPath} className="inline-flex items-center gap-2 rounded-xl bg-white px-5 py-3 text-sm font-bold text-slate-900 transition-colors hover:bg-white/90"><Wrench className="h-4 w-4" /> {game.toolLabel}</Link>
              <Button type="button" onClick={() => void openEditor()} disabled={!progress?.ready || opening} className="h-11 rounded-xl border border-white/35 bg-black/30 px-5 text-sm font-bold text-white hover:bg-black/45 disabled:opacity-60">
                {opening ? <Loader2 className="h-4 w-4 animate-spin" /> : <BookOpen className="h-4 w-4" />}
                متابعة الترجمة <ArrowLeft className="h-4 w-4" />
              </Button>
            </div>
            {!progress?.ready && <p className="mt-3 text-xs text-white/80">لا توجد جلسة محرر محفوظة لهذه اللعبة. ابدأ بفتح أداتها واستيراد ملفاتها أولًا.</p>}
          </div>
        </header>

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="space-y-6">
            <section className="rounded-2xl border border-border bg-card p-5 sm:p-6" aria-label="تقدم الترجمة">
              <div className="flex items-center justify-between gap-3">
                <h2 className="flex items-center gap-2 text-lg font-black"><FileText className="h-5 w-5 text-primary" /> تقدم الترجمة</h2>
                <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-bold text-primary">{progress?.ready ? `${percent}%` : "لم يبدأ"}</span>
              </div>
              <p className="mt-3 text-sm leading-7 text-muted-foreground">{progress?.ready ? `تمت ترجمة ${format(progress.translated)} نص من أصل ${format(progress.total)} نص محفوظ.` : "لم يتم استيراد النصوص بعد، وستظهر إحصاءات التقدم هنا عند الحفظ."}</p>
              <div role="progressbar" aria-label="تقدم ترجمة اللعبة" aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100} className="mt-4 h-2.5 overflow-hidden rounded-full bg-muted">
                <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${percent}%` }} />
              </div>
              <p className="mt-4 flex items-center gap-2 text-xs text-muted-foreground"><ShieldCheck className="h-4 w-4 text-primary" /> التقدم مأخوذ من حفظ هذه اللعبة، وليس من آخر لعبة فُتحت.</p>
            </section>

            <section className="rounded-2xl border border-border bg-card p-5 sm:p-6" aria-label="أدوات اللعبة">
              <h2 className="flex items-center gap-2 text-lg font-black"><FolderOpen className="h-5 w-5 text-primary" /> أدوات اللعبة</h2>
              <p className="mt-2 text-sm text-muted-foreground">الأدوات الأصلية ما زالت متاحة دون تغيير في طريقة استخراج الملفات أو بنائها.</p>
              <div className="mt-4 grid gap-2 sm:grid-cols-2">
                {[{ label: game.toolLabel, path: game.toolPath }, ...(game.extraTools ?? [])].map(tool => (
                  <Link key={tool.path} to={tool.path} className="flex items-center justify-between gap-2 rounded-xl border border-border bg-background px-4 py-3 text-sm font-semibold transition-colors hover:border-primary/40 hover:bg-primary/5">
                    <span>{tool.label}</span><ArrowLeft className="h-4 w-4 text-primary" />
                  </Link>
                ))}
              </div>
            </section>

            <section className="rounded-2xl border border-border bg-card p-5 sm:p-6" aria-label="ملاحظات المشروع">
              <h2 className="flex items-center gap-2 text-lg font-black"><NotebookPen className="h-5 w-5 text-primary" /> ملاحظات هذا المشروع</h2>
              <p className="mt-2 text-xs text-muted-foreground">ملاحظات خاصة بهذه اللعبة فقط، تُحفظ تلقائيًا على هذا الجهاز.</p>
              <Textarea aria-label="ملاحظات المشروع" placeholder="مثال: أسماء الشخصيات، الملفات المتبقية، المشاكل المطلوب إصلاحها..." value={notes}
                onChange={event => { setNotes(event.target.value); saveWorkspaceNotes(game.id, event.target.value); }}
                className="mt-4 min-h-36 resize-y rounded-xl bg-background leading-7" />
            </section>
          </div>

          <aside className="space-y-5">
            <section className="rounded-2xl border border-border bg-card p-5">
              <h2 className="flex items-center gap-2 font-black"><LockKeyhole className="h-5 w-5 text-primary" /> خصوصية مساحة اللعبة</h2>
              <div className="mt-5 space-y-4">
                {[
                  ["الترجمات والحفظ", "جلسة مستقلة عند وجود ملف محفوظ."],
                  ["البرومبتات والقواعد", game.aiProfile ? "إعدادات AI معزولة لهذه اللعبة." : "لا يوجد ملف تعريف AI مخصص بعد."],
                  ["محرر الترجمة", "نفس المحرر والأدوات العامة لكل الألعاب."],
                ].map(([title, detail]) => (
                  <div key={title} className="flex items-start gap-2.5">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                    <div><p className="text-sm font-bold">{title}</p><p className="mt-1 text-xs leading-5 text-muted-foreground">{detail}</p></div>
                  </div>
                ))}
              </div>
              {game.aiProfile && <p className="mt-5 rounded-xl bg-muted/60 p-3 text-xs leading-6 text-muted-foreground">الملف النشط: <span className="font-semibold text-foreground">{AI_PROFILE_NAMES[game.aiProfile]}</span>. يمكنك تحرير تعليماته من لوحة الذكاء الاصطناعي داخل المحرر.</p>}
            </section>
            <Link to="/" className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-border bg-card px-4 py-3 text-sm font-bold hover:bg-muted">
              <ArrowRight className="h-4 w-4" /> العودة إلى المكتبة
            </Link>
          </aside>
        </div>
      </div>
    </main>
  );
}
