import React from "react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Bot, StopCircle, ChevronDown, ChevronUp, Zap, Cpu } from "lucide-react";
import type { AutoPilotLog, AutoPilotReport, AutoPilotMode } from "@/hooks/useAutoPilot";

interface AutoPilotPanelProps {
  running: boolean;
  phase: string;
  phaseIndex: number;
  progress: { current: number; total: number } | null;
  logs: AutoPilotLog[];
  report: AutoPilotReport | null;
  mode: AutoPilotMode;
  setMode: (m: AutoPilotMode) => void;
  freeProviderLabel: string;
  onRun: (m: AutoPilotMode) => void;
  onStop: () => void;
}

const PHASES = ["تحليل", "ذاكرة", "AI", "رموز", "جودة"];

const logColor = (type: AutoPilotLog['type']) => {
  if (type === 'success') return 'text-green-600 dark:text-green-400';
  if (type === 'error')   return 'text-red-500';
  if (type === 'warning') return 'text-yellow-600 dark:text-yellow-400';
  if (type === 'phase')   return 'text-primary font-semibold';
  return 'text-muted-foreground';
};

export function AutoPilotPanel({
  running, phase, phaseIndex, progress, logs, report,
  mode, setMode, freeProviderLabel, onRun, onStop,
}: AutoPilotPanelProps) {
  const [logsOpen, setLogsOpen] = React.useState(true);
  const logsRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (logsRef.current) logsRef.current.scrollTop = logsRef.current.scrollHeight;
  }, [logs]);

  return (
    <Card className="border-primary/30 bg-primary/5">
      <CardHeader className="pb-2 pt-3 px-4">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <CardTitle className="text-sm font-display flex items-center gap-2">
            <Bot className="w-4 h-4 text-primary" />
            الوكيل التلقائي
            {running && <span className="text-xs text-muted-foreground animate-pulse">{phase}</span>}
          </CardTitle>

          <div className="flex gap-1.5 items-center flex-wrap">
            {running ? (
              <Button size="sm" variant="destructive" onClick={onStop} className="h-7 text-xs gap-1">
                <StopCircle className="w-3 h-3" /> إيقاف
              </Button>
            ) : (
              <>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => { setMode('free'); onRun('free'); }}
                  className="h-7 text-xs gap-1 font-display border-green-500 text-green-700 hover:bg-green-50 dark:text-green-400 dark:hover:bg-green-950"
                  title={freeProviderLabel}
                >
                  <Zap className="w-3 h-3" /> مجاني 🆓
                </Button>
                <Button
                  size="sm"
                  variant="default"
                  onClick={() => { setMode('smart'); onRun('smart'); }}
                  className="h-7 text-xs gap-1 font-display"
                >
                  <Cpu className="w-3 h-3" /> ذكي 🤖
                </Button>
              </>
            )}
          </div>
        </div>

        {!running && (
          <p className="text-xs text-muted-foreground mt-1">
            🆓 مجاني يستخدم: <span className="font-medium text-green-700 dark:text-green-400">{freeProviderLabel}</span>
          </p>
        )}
      </CardHeader>

      <CardContent className="px-4 pb-3 space-y-2">
        {/* Phase step indicator */}
        {(running || phaseIndex > 0) && (
          <div className="flex items-center gap-1 justify-between">
            {PHASES.map((p, i) => {
              const stepNum = i + 1;
              const isActive = phaseIndex === stepNum;
              const isDone = phaseIndex > stepNum;
              return (
                <div key={p} className="flex-1 flex flex-col items-center gap-0.5">
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold transition-all ${
                    isDone   ? 'bg-green-500 text-white' :
                    isActive ? 'bg-primary text-primary-foreground ring-2 ring-primary/30 animate-pulse' :
                               'bg-muted text-muted-foreground'
                  }`}>
                    {isDone ? '✓' : stepNum}
                  </div>
                  <span className="text-[10px] text-muted-foreground leading-tight text-center">{p}</span>
                </div>
              );
            })}
          </div>
        )}

        {/* Progress bar */}
        {running && progress && (
          <div className="space-y-1">
            <Progress value={(progress.current / progress.total) * 100} className="h-1.5" />
            <p className="text-xs text-muted-foreground text-center">
              {progress.current} / {progress.total}
            </p>
          </div>
        )}

        {/* Final report */}
        {report && !running && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 text-center text-xs">
            {[
              { label: "من الذاكرة",        value: report.fromMemory,   color: "text-blue-500" },
              { label: "من القاموس",         value: report.fromGlossary, color: "text-purple-500" },
              { label: "بالذكاء الاصطناعي",  value: report.fromAI,       color: "text-green-500" },
              { label: "رموز أُصلحت",        value: report.tagsFixed,    color: "text-orange-500" },
              { label: "ضعيفة أُصلحت",       value: report.weakFixed,    color: "text-yellow-600" },
              { label: "فشل",               value: report.failed,       color: report.failed > 0 ? "text-red-500" : "text-muted-foreground" },
              { label: "الوقت",             value: `${report.duration}ث`, color: "text-muted-foreground" },
              { label: "المجموع",           value: report.fromMemory + report.fromGlossary + report.fromAI, color: "text-primary font-bold" },
            ].map(item => (
              <div key={item.label} className="bg-background rounded p-1.5 border border-border/50">
                <div className={`font-bold text-base ${item.color}`}>{item.value}</div>
                <div className="text-muted-foreground leading-tight">{item.label}</div>
              </div>
            ))}
          </div>
        )}

        {/* Logs */}
        {logs.length > 0 && (
          <div>
            <button
              onClick={() => setLogsOpen(v => !v)}
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors mb-1"
            >
              {logsOpen ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
              سجل العمليات ({logs.length})
            </button>
            {logsOpen && (
              <div
                ref={logsRef}
                className="max-h-40 overflow-y-auto rounded bg-background border border-border/50 p-2 space-y-0.5 font-mono text-xs"
                dir="rtl"
              >
                {logs.map(l => (
                  <div key={l.id} className={`leading-5 ${logColor(l.type)}`}>
                    {l.phase && <span className="opacity-50 ml-1">[{l.phase}]</span>}
                    {l.message}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Description when idle */}
        {!running && logs.length === 0 && (
          <p className="text-xs text-muted-foreground text-center py-1">
            يقوم الوكيل تلقائياً بـ: ترجمة ذاكرة + قاموس → ذكاء اصطناعي → إصلاح رموز → فحص جودة
          </p>
        )}
      </CardContent>
    </Card>
  );
}
