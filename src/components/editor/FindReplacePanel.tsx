import React, { useState, useMemo, useCallback, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { X, Search, Replace, CheckCircle2, AlertTriangle, ChevronDown, ChevronUp } from "lucide-react";
import { ExtractedEntry } from "./types";

interface FindReplaceMatch {
  key: string;
  entry: ExtractedEntry;
  original: string;
  preview: string;
  matchCount: number;
}

interface FindReplacePanelProps {
  entries: ExtractedEntry[];
  translations: Record<string, string>;
  onReplace: (replacements: Record<string, string>) => void;
  onClose: () => void;
}

const FindReplacePanel: React.FC<FindReplacePanelProps> = ({
  entries, translations, onReplace, onClose,
}) => {
  const [findText, setFindText] = useState("");
  const [replaceText, setReplaceText] = useState("");
  const [useRegex, setUseRegex] = useState(false);
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [searchInOriginal, setSearchInOriginal] = useState(false);
  const [wholeWord, setWholeWord] = useState(false);
  const [showPreview, setShowPreview] = useState(true);
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const [applied, setApplied] = useState(false);

  const matches = useMemo<FindReplaceMatch[]>(() => {
    if (!findText.trim()) return [];

    try {
      let regex: RegExp;
      if (useRegex) {
        regex = new RegExp(findText, caseSensitive ? "g" : "gi");
      } else {
        const escaped = findText.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        regex = new RegExp(escaped, caseSensitive ? "g" : "gi");
      }

      const results: FindReplaceMatch[] = [];
      for (const entry of entries) {
        const key = `${entry.msbtFile}:${entry.index}`;
        const text = searchInOriginal ? entry.original : (translations[key] || "");
        if (!text) continue;

        const matchArr = text.match(regex);
        if (matchArr && matchArr.length > 0) {
          const preview = text.replace(regex, replaceText || "");
          results.push({
            key,
            entry,
            original: text,
            preview,
            matchCount: matchArr.length,
          });
        }
      }
      return results;
    } catch {
      return [];
    }
  }, [findText, replaceText, useRegex, caseSensitive, searchInOriginal, entries, translations]);

  // Reset applied state when search changes
  useEffect(() => {
    setApplied(false);
  }, [findText, replaceText, useRegex, caseSensitive, searchInOriginal]);

  // Auto-select all matches
  useEffect(() => {
    setSelectedKeys(new Set(matches.map(m => m.key)));
  }, [matches]);

  const totalMatches = useMemo(() => matches.reduce((sum, m) => sum + m.matchCount, 0), [matches]);

  const handleReplaceSelected = useCallback(() => {
    if (matches.length === 0) return;

    const replacements: Record<string, string> = {};
    for (const match of matches) {
      if (!selectedKeys.has(match.key)) continue;
      replacements[match.key] = match.preview;
    }
    if (Object.keys(replacements).length > 0) {
      onReplace(replacements);
      setApplied(true);
    }
  }, [matches, selectedKeys, onReplace]);

  const toggleKey = (key: string) => {
    setSelectedKeys(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const isRegexError = useMemo(() => {
    if (!useRegex || !findText.trim()) return false;
    try { new RegExp(findText); return false; } catch { return true; }
  }, [findText, useRegex]);

  return (
    <Card className="mb-6 border-primary/30 bg-primary/5">
      <CardContent className="p-4 space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <h3 className="font-display font-bold text-sm flex items-center gap-2">
            <Search className="w-4 h-4" /> بحث واستبدال شامل
          </h3>
          <Button variant="ghost" size="sm" onClick={onClose}>
            <X className="w-4 h-4" />
          </Button>
        </div>

        {/* Search inputs */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label className="text-xs font-body">بحث عن</Label>
            <Input
              value={findText}
              onChange={e => setFindText(e.target.value)}
              placeholder={useRegex ? "تعبير نمطي (Regex)..." : "نص البحث..."}
              className="font-body text-sm"
              dir="auto"
            />
            {isRegexError && (
              <p className="text-xs text-destructive flex items-center gap-1">
                <AlertTriangle className="w-3 h-3" /> تعبير نمطي غير صالح
              </p>
            )}
          </div>
          <div className="space-y-1">
            <Label className="text-xs font-body">استبدال بـ</Label>
            <Input
              value={replaceText}
              onChange={e => setReplaceText(e.target.value)}
              placeholder="النص البديل..."
              className="font-body text-sm"
              dir="auto"
            />
          </div>
        </div>

        {/* Options */}
        <div className="flex flex-wrap gap-4 items-center">
          <div className="flex items-center gap-2">
            <Switch id="fr-regex" checked={useRegex} onCheckedChange={setUseRegex} />
            <Label htmlFor="fr-regex" className="text-xs font-body cursor-pointer">Regex</Label>
          </div>
          <div className="flex items-center gap-2">
            <Switch id="fr-case" checked={caseSensitive} onCheckedChange={setCaseSensitive} />
            <Label htmlFor="fr-case" className="text-xs font-body cursor-pointer">حساس لحالة الأحرف</Label>
          </div>
          <div className="flex items-center gap-2">
            <Switch id="fr-original" checked={searchInOriginal} onCheckedChange={setSearchInOriginal} />
            <Label htmlFor="fr-original" className="text-xs font-body cursor-pointer">بحث في النص الأصلي</Label>
          </div>
        </div>

        {/* Stats */}
        {findText.trim() && !isRegexError && (
          <div className="flex items-center gap-3 flex-wrap">
            <Badge variant="secondary" className="font-body">
              {totalMatches} تطابق في {matches.length} نص
            </Badge>
            <Badge variant="outline" className="font-body">
              محدد: {selectedKeys.size} / {matches.length}
            </Badge>
            <div className="flex gap-2 mr-auto">
              <Button size="sm" variant="outline" onClick={() => setSelectedKeys(new Set(matches.map(m => m.key)))} className="text-xs font-body h-7">
                تحديد الكل
              </Button>
              <Button size="sm" variant="outline" onClick={() => setSelectedKeys(new Set())} className="text-xs font-body h-7">
                إلغاء التحديد
              </Button>
            </div>
          </div>
        )}

        {/* Preview toggle */}
        {matches.length > 0 && (
          <Button variant="ghost" size="sm" onClick={() => setShowPreview(!showPreview)} className="text-xs font-body w-full justify-center gap-1">
            {showPreview ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            {showPreview ? "إخفاء المعاينة" : `عرض المعاينة (${matches.length} نتيجة)`}
          </Button>
        )}

        {/* Preview list */}
        {showPreview && matches.length > 0 && (
          <div className="max-h-64 overflow-y-auto space-y-2 border border-border rounded p-2 bg-background">
            {matches.slice(0, 100).map(match => (
              <label
                key={match.key}
                className={`flex items-start gap-2 p-2 rounded text-xs cursor-pointer transition-colors ${
                  selectedKeys.has(match.key) ? "bg-primary/10" : "bg-muted/30 opacity-60"
                }`}
              >
                <input
                  type="checkbox"
                  checked={selectedKeys.has(match.key)}
                  onChange={() => toggleKey(match.key)}
                  className="mt-1 rounded border-border"
                />
                <div className="flex-1 min-w-0 space-y-1">
                  <p className="text-muted-foreground truncate font-mono text-[10px]">
                    {match.entry.msbtFile}:{match.entry.index}
                    <Badge variant="outline" className="mr-2 text-[10px] h-4">{match.matchCount}×</Badge>
                  </p>
                  <p className="font-body text-destructive/80 line-through" dir="auto">{match.original}</p>
                  <p className="font-body text-secondary" dir="auto">{match.preview}</p>
                </div>
              </label>
            ))}
            {matches.length > 100 && (
              <p className="text-center text-xs text-muted-foreground py-2">
                ... و {matches.length - 100} نتيجة أخرى
              </p>
            )}
          </div>
        )}

        {/* Apply button */}
        {matches.length > 0 && (
          <div className="flex gap-3">
            <Button
              onClick={handleReplaceSelected}
              disabled={selectedKeys.size === 0 || applied}
              className="flex-1 font-display font-bold"
            >
              {applied ? (
                <><CheckCircle2 className="w-4 h-4" /> تم التطبيق ✅</>
              ) : (
                <><Replace className="w-4 h-4" /> استبدال {selectedKeys.size} نص</>
              )}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default FindReplacePanel;
