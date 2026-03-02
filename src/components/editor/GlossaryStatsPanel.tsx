import React from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { BookOpen, ChevronDown, ChevronUp, Users, MapPin, Swords, Gamepad2, MessageSquare, Layers } from "lucide-react";

interface GlossaryStatsProps {
  glossaryText: string;
}

interface CategoryStats {
  label: string;
  icon: React.ReactNode;
  count: number;
  color: string;
}

function analyzeGlossary(text: string) {
  if (!text?.trim()) return null;

  const lines = text.split('\n');
  let totalTerms = 0;
  let comments = 0;
  let sections: string[] = [];
  const categoryMap: Record<string, number> = {};
  let currentSection = "عام";

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    // Section headers (comments starting with # or //)
    if (trimmed.startsWith('#') || trimmed.startsWith('//')) {
      comments++;
      // Extract section name from comment
      const sectionName = trimmed.replace(/^[#/]+\s*/, '').replace(/[-=]+/g, '').trim();
      if (sectionName.length > 2 && sectionName.length < 80) {
        currentSection = sectionName;
        if (!sections.includes(sectionName)) sections.push(sectionName);
      }
      continue;
    }

    const eqIdx = trimmed.indexOf('=');
    if (eqIdx < 1) continue;

    totalTerms++;
    categoryMap[currentSection] = (categoryMap[currentSection] || 0) + 1;
  }

  // Categorize by content patterns
  let characters = 0, locations = 0, items = 0, ui = 0, dialogue = 0, combat = 0, classes = 0;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('//')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx < 1) continue;

    const eng = trimmed.slice(0, eqIdx).trim().toLowerCase();
    const arb = trimmed.slice(eqIdx + 1).trim();

    if (/^(mr\.|ms\.|dr\.|captain|king|queen|lord|lady|chief|elder|colonel|general)\s/i.test(eng) ||
        /^[A-Z][a-z]+$/.test(trimmed.slice(0, eqIdx).trim()) && arb.length < 20) {
      characters++;
    } else if (/\b(cave|lake|mountain|village|city|tower|bridge|camp|colony|region|area|cliff|forest|sea|ocean|island|plain|valley|ruins|temple|shrine|road|path|gate|port|hill|spring|falls|cemetery|grave)\b/i.test(eng)) {
      locations++;
    } else if (/\b(sword|blade|shield|armor|weapon|gem|accessory|ring|core|crystal|chip|pouch|item|material|ingredient|collectible|cylinder|recipe|dish|food)\b/i.test(eng)) {
      items++;
    } else if (/\b(menu|button|option|setting|save|load|screen|tab|select|confirm|cancel|back|next|yes|no|ok|tutorial|hint|tip|guide|help|display|toggle|mode|auto|manual)\b/i.test(eng)) {
      ui++;
    } else if (/\b(war medic|soulhacker|flash fencer|zephyr|stalker|strategos|signifer|medic gunner|incursor|full metal jaguar|machine assassin|royal summoner|yumsmith|guardian commander|lone exile|lost vanguard|lifesage|noblesse|troubadour|seraph|martial artist|thaumaturge|swordfighter|ogre|tactician|heavy guard|healer|attacker|defender|tank|class|role)\b/i.test(eng)) {
      classes++;
    } else if (/\b(attack|strike|slash|smash|hit|punch|blow|cut|crush|thrust|swing|shot|barrage|assault|charge|launch|burst|combo|chain attack|critical|lethal|finishing|power|buff|debuff|heal|regenerat|cure|protect|barrier|boost|enhance|strengthen|weaken|poison|burn|bleed|stun|sleep|paralyze|slow|haste|regen|resist|immun|aura|blessing|curse|boon|skill|art|talent|level|exp|hp|mp|ap|sp|aggro|break|topple|dodge|counter|block|interlink|ouroboros|damage|evasion|accuracy|defense|arts cancel|fusion arts|daze|lucky seven|elemental|ether|physical|cancel|auto-attack|master art|master skill|monster|crit|agility|strength|dexterity|luck|ether power|block rate|physical defense|ether defense|attack speed|recharge)\b/i.test(eng)) {
      combat++;
    } else if (eng.includes('...') || eng.includes('!') || eng.includes('?') || eng.length > 40) {
      dialogue++;
    }
  }

  const categories: CategoryStats[] = [
    { label: "شخصيات", icon: <Users className="w-3.5 h-3.5" />, count: characters, color: "text-blue-500" },
    { label: "مواقع", icon: <MapPin className="w-3.5 h-3.5" />, count: locations, color: "text-green-500" },
    { label: "عناصر ومعدات", icon: <Swords className="w-3.5 h-3.5" />, count: items, color: "text-amber-500" },
    { label: "كلاسات وأدوار", icon: <Gamepad2 className="w-3.5 h-3.5" />, count: classes, color: "text-orange-500" },
    { label: "قتال وهجمات وبوفات", icon: <Swords className="w-3.5 h-3.5" />, count: combat, color: "text-red-500" },
    { label: "واجهة وقوائم", icon: <Layers className="w-3.5 h-3.5" />, count: ui, color: "text-purple-500" },
    { label: "حوارات", icon: <MessageSquare className="w-3.5 h-3.5" />, count: dialogue, color: "text-cyan-500" },
  ].filter(c => c.count > 0);

  const categorized = characters + locations + items + ui + dialogue + combat + classes;
  const other = totalTerms - categorized;

  return {
    totalTerms,
    comments,
    sections: sections.length,
    categories,
    other,
    topSections: Object.entries(categoryMap)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8),
  };
}

const GlossaryStatsPanel: React.FC<GlossaryStatsProps> = ({ glossaryText }) => {
  const [expanded, setExpanded] = React.useState(false);
  const stats = React.useMemo(() => analyzeGlossary(glossaryText), [glossaryText]);

  if (!stats || stats.totalTerms === 0) return null;

  return (
    <Card className="mb-4 border-primary/15 bg-primary/5">
      <CardContent className="p-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <BookOpen className="w-4 h-4 text-primary" />
            <span className="text-sm font-display font-bold">📊 تقرير القاموس</span>
          </div>
          <Button variant="ghost" size="sm" onClick={() => setExpanded(!expanded)} className="h-6 px-2">
            {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </Button>
        </div>

        {/* Summary row - always visible */}
        <div className="flex flex-wrap gap-3 mt-2 text-xs text-muted-foreground font-body">
          <span>📖 <strong className="text-foreground">{stats.totalTerms.toLocaleString('ar-EG')}</strong> مصطلح</span>
          <span>📑 <strong className="text-foreground">{stats.sections}</strong> قسم</span>
          <span>💬 <strong className="text-foreground">{stats.comments}</strong> تعليق</span>
        </div>

        {expanded && (
          <div className="mt-3 space-y-3">
            {/* Category breakdown */}
            {stats.categories.length > 0 && (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {stats.categories.map(cat => (
                  <div key={cat.label} className="flex items-center gap-1.5 rounded-md border border-border bg-background/50 px-2.5 py-1.5">
                    <span className={cat.color}>{cat.icon}</span>
                    <span className="text-xs font-body">{cat.label}</span>
                    <span className="mr-auto text-xs font-display font-bold">{cat.count.toLocaleString('ar-EG')}</span>
                  </div>
                ))}
                {stats.other > 0 && (
                  <div className="flex items-center gap-1.5 rounded-md border border-border bg-background/50 px-2.5 py-1.5">
                    <span className="text-muted-foreground">📝</span>
                    <span className="text-xs font-body">أخرى</span>
                    <span className="mr-auto text-xs font-display font-bold">{stats.other.toLocaleString('ar-EG')}</span>
                  </div>
                )}
              </div>
            )}

            {/* Top sections */}
            {stats.topSections.length > 0 && (
              <div>
                <p className="text-xs font-display font-bold mb-1.5">أكبر الأقسام:</p>
                <div className="space-y-1">
                  {stats.topSections.map(([name, count]) => (
                    <div key={name} className="flex items-center justify-between text-xs font-body">
                      <span className="truncate max-w-[70%]">{name}</span>
                      <span className="font-mono text-muted-foreground shrink-0">{count.toLocaleString('ar-EG')}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default GlossaryStatsPanel;
