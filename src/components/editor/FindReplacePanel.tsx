import React, { useState, useMemo, useCallback, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Search, Replace, CheckCircle2, AlertTriangle, ChevronDown, ChevronUp, Undo2, ShieldAlert } from "lucide-react";
import { ExtractedEntry } from "./types";

interface FindReplaceMatch {
  key: string;
  entry: ExtractedEntry;
  original: string;
  preview: string;
  matchCount: number;
  breaksTag: boolean;
}

interface FindReplacePanelProps {
  entries: ExtractedEntry[];
  filteredEntries?: ExtractedEntry[];
  translations: Record<string, string>;
  onReplace: (replacements: Record<string, string>) => void;
  onClose: () => void;
}

// Escape regex metacharacters
function escapeReg(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Highlight all regex matches in plain text by splitting into segments.
function highlightSegments(text: string, regex: RegExp | null): React.ReactNode {
  if (!regex || !text) return text;
  try {
    const parts: React.ReactNode[] = [];
    let lastIndex = 0;
    const re = new RegExp(regex.source, regex.flags.includes("g") ? regex.flags : regex.flags + "g");
    let m: RegExpExecArray | null;
    let i = 0;
    while ((m = re.exec(text)) !== null) {
      if (m.index > lastIndex) parts.push(text.slice(lastIndex, m.index));
      parts.push(
        <mark key={i++} className="bg-yellow-400/40 text-foreground rounded px-0.5 font-bold">
          {m[0]}
        </mark>,
      );
      lastIndex = m.index + m[0].length;
      if (m[0].length === 0) re.lastIndex++; // avoid infinite loop on empty match
    }
    if (lastIndex < text.length) parts.push(text.slice(lastIndex));
    return parts;
  } catch {
    return text;
  }
}

// Detect if a replacement would break a technical tag (bracket/PUA/brace)
function wouldBreakTag(original: string, preview: string): boolean {
  const tagRe = /\[[^\]]+\]|\{[^}]+\}|[\uE000-\uE0FF]/g;
  const a = original.match(tagRe) || [];
  const b = preview.match(tagRe) || [];
  if (a.length !== b.length) return true;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return true;
  return false;
}

const FindReplacePanel: React.FC<FindReplacePanelProps> = ({
  entries, filteredEntries, translations, onReplace, onClose,
}) => {
  const [findText, setFindText] = useState("");
  const [replaceText, setReplaceText] = useState("");
  const [useRegex, setUseRegex] = useState(false);
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [searchInOriginal, setSearchInOriginal] = useState(false);
  const [wholeWord, setWholeWord] = useState(false);
  const [scopeFiltered, setScopeFiltered] = useState(false);
  const [protectTags, setProtectTags] = useState(true);
  const [showPreview, setShowPreview] = useState(true);
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const [applied, setApplied] = useState(false);
  const [lastBackup, setLastBackup] = useState<Record<string, string> | null>(null);

  const scopeEntries = useMemo(
    () => (scopeFiltered && filteredEntries?.length ? filteredEntries : entries),
    [scopeFiltered, filteredEntries, entries],
  );

  const regex = useMemo<RegExp | null>(() => {
    if (!findText.trim()) return null;
    try {
      const flags = caseSensitive ? "g" : "gi";
      if (useRegex) return new RegExp(findText, flags);
      const escaped = escapeReg(findText);
      const pattern = wholeWord ? `(?<![\\p{L}\\p{N}])${escaped}(?![\\p{L}\\p{N}])` : escaped;
      return new RegExp(pattern, flags + "u");
    } catch {
      return null;
    }
  }, [findText, useRegex, caseSensitive, wholeWord]);

  const matches = useMemo<FindReplaceMatch[]>(() => {
    if (!regex) return [];
    const results: FindReplaceMatch[] = [];
    for (const entry of scopeEntries) {
      const key = `${entry.msbtFile}:${entry.index}`;
      const text = searchInOriginal ? entry.original : (translations[key] || "");
      if (!text) continue;
      const matchArr = text.match(regex);
      if (matchArr && matchArr.length > 0) {
        const preview = text.replace(regex, replaceText || "");
        results.push({
          key, entry,
          original: text,
          preview,
          matchCount: matchArr.length,
          breaksTag: wouldBreakTag(text, preview),
        });
      }
    }
    return results;
  }, [regex, replaceText, searchInOriginal, scopeEntries, translations]);

  useEffect(() => { setApplied(false); }, [findText, replaceText, useRegex, caseSensitive, searchInOriginal, wholeWord, scopeFiltered]);

  useEffect(() => {
    // Auto-select all safe matches
    const safe = matches.filter(m => !protectTags || !m.breaksTag).map(m => m.key);
    setSelectedKeys(new Set(safe));
  }, [matches, protectTags]);

  const totalMatches = useMemo(() => matches.reduce((sum, m) => sum + m.matchCount, 0), [matches]);
  const dangerCount = useMemo(() => matches.filter(m => m.breaksTag).length, [matches]);

  const handleReplaceSelected = useCallback(() => {
    if (matches.length === 0) return;
    const replacements: Record<string, string> = {};
    const backup: Record<string, string> = {};
    for (const match of matches) {
      if (!selectedKeys.has(match.key)) continue;
      if (protectTags && match.breaksTag) continue;
      replacements[match.key] = match.preview;
      backup[match.key] = match.original;
    }
    if (Object.keys(replacements).length > 0) {
      setLastBackup(backup);
      onReplace(replacements);
      setApplied(true);
    }
  }, [matches, selectedKeys, onReplace, protectTags]);

  const handleUndo = useCallback(() => {
    if (!lastBackup) return;
    onReplace(lastBackup);
    setLastBackup(null);
    setApplied(false);
  }, [lastBackup, onReplace]);

  const toggleKey = (key: string) => {
    setSelectedKeys(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  const isRegexError = useMemo(() => {
    if (!useRegex || !findText.trim()) return false;
    try { new RegExp(findText); return false; } catch { return true; }
  }, [findText, useRegex]);

  return (
    <Dialog open={true} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto" dir="rtl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 font-display">
            <Search className="w-4 h-4" /> بحث واستبدال شامل
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Inputs */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs font-body">بحث عن</Label>
              <Input
                value={findText}
                onChange={e => setFindText(e.target.value)}
                placeholder={useRegex ? "تعبير نمطي (Regex)..." : "نص البحث..."}
                className="font-body text-sm"
                dir="auto"
                autoFocus
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
          <div className="flex flex-wrap gap-3 items-center text-xs">
            <div className="flex items-center gap-2">
              <Switch id="fr-regex" checked={useRegex} onCheckedChange={setUseRegex} />
              <Label htmlFor="fr-regex" className="font-body cursor-pointer">Regex</Label>
            </div>
            <div className="flex items-center gap-2">
              <Switch id="fr-case" checked={caseSensitive} onCheckedChange={setCaseSensitive} />
              <Label htmlFor="fr-case" className="font-body cursor-pointer">حساس لحالة الأحرف</Label>
            </div>
            <div className="flex items-center gap-2">
              <Switch id="fr-original" checked={searchInOriginal} onCheckedChange={setSearchInOriginal} />
              <Label htmlFor="fr-original" className="font-body cursor-pointer">في النص الأصلي</Label>
            </div>
            <div className="flex items-center gap-2">
              <Switch id="fr-whole" checked={wholeWord} onCheckedChange={setWholeWord} disabled={useRegex} />
              <Label htmlFor="fr-whole" className="font-body cursor-pointer">كلمة كاملة</Label>
            </div>
            {filteredEntries && filteredEntries.length !== entries.length && (
              <div className="flex items-center gap-2">
                <Switch id="fr-scope" checked={scopeFiltered} onCheckedChange={setScopeFiltered} />
                <Label htmlFor="fr-scope" className="font-body cursor-pointer">
                  ضمن الفلتر فقط ({filteredEntries.length})
                </Label>
              </div>
            )}
            <div className="flex items-center gap-2">
              <Switch id="fr-tags" checked={protectTags} onCheckedChange={setProtectTags} />
              <Label htmlFor="fr-tags" className="font-body cursor-pointer flex items-center gap-1">
                <ShieldAlert className="w-3 h-3 text-amber-500" />
                حماية الوسوم التقنية
              </Label>
            </div>
          </div>

          {/* Stats */}
          {findText.trim() && !isRegexError && (
            <div className="flex items-center gap-2 flex-wrap">
              <Badge variant="secondary" className="font-body">{totalMatches} تطابق في {matches.length} نص</Badge>
              <Badge variant="outline" className="font-body">محدد: {selectedKeys.size}</Badge>
              {dangerCount > 0 && (
                <Badge variant="destructive" className="font-body gap-1">
                  <ShieldAlert className="w-3 h-3" /> {dangerCount} قد يكسر وسماً
                </Badge>
              )}
              <div className="flex gap-2 ms-auto">
                <Button size="sm" variant="outline" onClick={() => setSelectedKeys(new Set(matches.map(m => m.key)))} className="text-xs h-7">تحديد الكل</Button>
                <Button size="sm" variant="outline" onClick={() => setSelectedKeys(new Set())} className="text-xs h-7">إلغاء التحديد</Button>
              </div>
            </div>
          )}

          {/* Preview toggle */}
          {matches.length > 0 && (
            <Button variant="ghost" size="sm" onClick={() => setShowPreview(!showPreview)} className="text-xs w-full justify-center gap-1">
              {showPreview ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
              {showPreview ? "إخفاء المعاينة" : `عرض المعاينة (${matches.length})`}
            </Button>
          )}

          {/* Preview list */}
          {showPreview && matches.length > 0 && (
            <div className="max-h-72 overflow-y-auto space-y-2 border border-border rounded p-2 bg-background">
              {matches.slice(0, 100).map(match => {
                const isDanger = match.breaksTag;
                const isSelected = selectedKeys.has(match.key);
                return (
                  <label
                    key={match.key}
                    className={`flex items-start gap-2 p-2 rounded text-xs cursor-pointer transition-colors ${
                      isSelected ? "bg-primary/10" : "bg-muted/30 opacity-60"
                    } ${isDanger ? "border border-destructive/40" : ""}`}
                  >
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggleKey(match.key)}
                      disabled={protectTags && isDanger}
                      className="mt-1 rounded border-border"
                    />
                    <div className="flex-1 min-w-0 space-y-1">
                      <p className="text-muted-foreground truncate font-mono text-[10px]">
                        {match.entry.msbtFile}:{match.entry.index}
                        <Badge variant="outline" className="ms-2 text-[10px] h-4">{match.matchCount}×</Badge>
                        {isDanger && (
                          <Badge variant="destructive" className="ms-1 text-[10px] h-4 gap-1">
                            <ShieldAlert className="w-2.5 h-2.5" /> وسم
                          </Badge>
                        )}
                      </p>
                      <p className="font-body whitespace-pre-wrap break-words" dir="auto">
                        <span className="text-destructive/70 line-through">{highlightSegments(match.original, regex)}</span>
                      </p>
                      <p className="font-body whitespace-pre-wrap break-words text-secondary" dir="auto">
                        {highlightSegments(match.preview, regex ? new RegExp(escapeReg(replaceText || ""), caseSensitive ? "g" : "gi") : null)}
                      </p>
                    </div>
                  </label>
                );
              })}
              {matches.length > 100 && (
                <p className="text-center text-xs text-muted-foreground py-2">... و {matches.length - 100} نتيجة أخرى</p>
              )}
            </div>
          )}

          {/* Apply */}
          <div className="flex gap-2">
            {matches.length > 0 && (
              <Button
                onClick={handleReplaceSelected}
                disabled={selectedKeys.size === 0 || applied}
                className="flex-1 font-display font-bold"
              >
                {applied ? (<><CheckCircle2 className="w-4 h-4" /> تم التطبيق ✅</>)
                  : (<><Replace className="w-4 h-4" /> استبدال {selectedKeys.size} نص</>)}
              </Button>
            )}
            {lastBackup && (
              <Button variant="outline" onClick={handleUndo} className="font-display gap-1">
                <Undo2 className="w-4 h-4" /> تراجع ({Object.keys(lastBackup).length})
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default FindReplacePanel;
