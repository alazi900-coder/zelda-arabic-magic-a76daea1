import React from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { ArrowRight, RotateCcw, CheckCircle2, XCircle } from "lucide-react";
import { useFeatureFlags, FEATURE_GROUPS, ALL_FEATURES, type FeatureGroup } from "@/lib/feature-flags";

const GROUP_ORDER: FeatureGroup[] = ["quality", "cleanup", "ui", "translation"];

const GROUP_BORDER_COLORS: Record<FeatureGroup, string> = {
  quality: "border-emerald-500/30",
  cleanup: "border-sky-500/30",
  ui: "border-violet-500/30",
  translation: "border-amber-500/30",
};

const GROUP_BG_COLORS: Record<FeatureGroup, string> = {
  quality: "bg-emerald-500/5",
  cleanup: "bg-sky-500/5",
  ui: "bg-violet-500/5",
  translation: "bg-amber-500/5",
};

const GROUP_SWITCH_COLORS: Record<FeatureGroup, string> = {
  quality: "data-[state=checked]:bg-emerald-500",
  cleanup: "data-[state=checked]:bg-sky-500",
  ui: "data-[state=checked]:bg-violet-500",
  translation: "data-[state=checked]:bg-amber-500",
};

const Settings = () => {
  const flags = useFeatureFlags();

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link to="/editor" className="text-muted-foreground hover:text-foreground transition-colors">
              <ArrowRight className="w-5 h-5" />
            </Link>
            <h1 className="text-xl font-display font-black">⚙️ إعدادات المميزات</h1>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground font-body">
              {ALL_FEATURES.filter((f) => flags.isEnabled(f.id)).length} / {ALL_FEATURES.length} مفعّل
            </span>
            <Button variant="outline" size="sm" onClick={() => flags.resetAll()} className="font-display text-xs">
              <RotateCcw className="w-3 h-3" /> إعادة تعيين الكل
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-6 space-y-6">
        {GROUP_ORDER.map((group) => {
          const info = FEATURE_GROUPS[group];
          const features = flags.getGroupFeatures(group);
          const enabledCount = flags.getEnabledCount(group);

          return (
            <Card key={group} className={`${GROUP_BORDER_COLORS[group]} ${GROUP_BG_COLORS[group]}`}>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className={`text-lg font-display font-bold flex items-center gap-2 ${info.color}`}>
                    <span>{info.emoji}</span>
                    <span>{info.name}</span>
                    <span className="text-xs font-body text-muted-foreground font-normal">
                      ({enabledCount}/{features.length})
                    </span>
                  </CardTitle>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => flags.enableAll(group)}
                      className="text-xs font-body h-7 px-2"
                    >
                      <CheckCircle2 className="w-3 h-3" /> تفعيل الكل
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => flags.disableAll(group)}
                      className="text-xs font-body h-7 px-2"
                    >
                      <XCircle className="w-3 h-3" /> تعطيل الكل
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => flags.resetAll(group)}
                      className="text-xs font-body h-7 px-2"
                    >
                      <RotateCcw className="w-3 h-3" /> افتراضي
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="grid gap-1">
                  {features.map((feature) => {
                    const enabled = flags.isEnabled(feature.id);
                    return (
                      <div
                        key={feature.id}
                        className="flex items-center justify-between py-2.5 px-3 rounded-lg hover:bg-background/50 transition-colors group"
                      >
                        <div className="flex-1 min-w-0 ml-3">
                          <div className="flex items-center gap-2">
                            <span className={`text-sm font-display font-bold transition-colors ${enabled ? "text-foreground" : "text-muted-foreground"}`}>
                              {feature.name}
                            </span>
                            {!feature.defaultEnabled && feature.id in flags.overrides && flags.overrides[feature.id] && (
                              <span className="text-[10px] bg-primary/20 text-primary px-1.5 py-0.5 rounded font-body">مخصص</span>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground font-body mt-0.5 leading-relaxed">
                            {feature.description}
                          </p>
                        </div>
                        <Switch
                          checked={enabled}
                          onCheckedChange={(checked) => flags.setEnabled(feature.id, checked)}
                          className={GROUP_SWITCH_COLORS[group]}
                        />
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </main>
    </div>
  );
};

export default Settings;
