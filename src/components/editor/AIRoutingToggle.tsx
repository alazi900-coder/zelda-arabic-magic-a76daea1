import React from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
  DropdownMenuLabel, DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { Zap, DollarSign, Sparkles, ChevronDown } from "lucide-react";

export type AIRoutingMode = "free" | "paid" | "auto";

interface Props {
  mode: AIRoutingMode;
  onChange: (mode: AIRoutingMode) => void;
}

const MODE_META: Record<AIRoutingMode, { label: string; emoji: string; color: string; desc: string }> = {
  free: {
    label: "مجاني",
    emoji: "🆓",
    color: "border-green-500/50 text-green-500 hover:text-green-400 bg-green-500/5",
    desc: "Gemini Free فقط — يفشل عند تجاوز الحد اليومي",
  },
  paid: {
    label: "مدفوع",
    emoji: "💰",
    color: "border-amber-500/50 text-amber-500 hover:text-amber-400 bg-amber-500/5",
    desc: "Lovable Gateway فقط — يستهلك رصيد الاشتراك",
  },
  auto: {
    label: "تلقائي",
    emoji: "⚡",
    color: "border-primary/50 text-primary hover:text-primary bg-primary/5",
    desc: "يبدأ بالمجاني، ينتقل تلقائياً للمدفوع عند 429 (الأرخص)",
  },
};

const AIRoutingToggle: React.FC<Props> = ({ mode, onChange }) => {
  const meta = MODE_META[mode];
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className={`font-body text-xs gap-1.5 transition-all ${meta.color}`}
          title={meta.desc}
        >
          <span>{meta.emoji}</span>
          <span>AI: {meta.label}</span>
          <ChevronDown className="w-3 h-3 opacity-60" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="bg-card border-border z-[100] w-[280px]">
        <DropdownMenuLabel className="text-xs">وضع توجيه الذكاء الاصطناعي</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {(Object.keys(MODE_META) as AIRoutingMode[]).map((m) => {
          const info = MODE_META[m];
          const Icon = m === "free" ? Zap : m === "paid" ? DollarSign : Sparkles;
          return (
            <DropdownMenuItem
              key={m}
              onClick={() => onChange(m)}
              className={`flex flex-col items-start gap-0.5 py-2 cursor-pointer ${mode === m ? "bg-primary/10" : ""}`}
            >
              <div className="flex items-center gap-2 w-full">
                <Icon className="w-3.5 h-3.5" />
                <span className="font-bold text-xs">
                  {info.emoji} {info.label}
                </span>
                {mode === m && <span className="ml-auto text-[10px] text-primary">✓ مفعّل</span>}
              </div>
              <span className="text-[10px] text-muted-foreground leading-tight pr-5">{info.desc}</span>
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

export default AIRoutingToggle;
