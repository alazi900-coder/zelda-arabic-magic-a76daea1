import { useState, useMemo, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { EditorState } from "@/components/editor/types";
import type { GlossaryMergeDiff } from "@/components/editor/GlossaryMergePreviewDialog";

interface UseEditorGlossaryProps {
  state: EditorState | null;
  setState: React.Dispatch<React.SetStateAction<EditorState | null>>;
  setLastSaved: (msg: string) => void;
  setCloudSyncing: (v: boolean) => void;
  setCloudStatus: (msg: string) => void;
  userId?: string;
}

export interface PendingGlossaryMerge {
  name: string;
  diffs: GlossaryMergeDiff[];
  rawText: string;
  replace: boolean;
}

export function useEditorGlossary({
  state, setState, setLastSaved, setCloudSyncing, setCloudStatus, userId,
}: UseEditorGlossaryProps) {
  const [glossaryEnabled, setGlossaryEnabled] = useState(true);
  const [pendingMerge, setPendingMerge] = useState<PendingGlossaryMerge | null>(null);

  // === Computed ===
  const glossaryTermCount = useMemo(() => {
    if (!state?.glossary?.trim()) return 0;
    return state.glossary.split('\n').filter(l => {
      const t = l.trim();
      return t && !t.startsWith('#') && !t.startsWith('//') && t.includes('=');
    }).length;
  }, [state?.glossary]);

  const activeGlossary = glossaryEnabled ? (state?.glossary || '') : '';

  // === Parse glossary into lookup map (with dedup, last-wins) ===
  const parseGlossaryMap = useCallback((glossaryText: string): Map<string, string> => {
    const map = new Map<string, string>();
    if (!glossaryText?.trim()) return map;
    for (const line of glossaryText.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('//')) continue;
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx < 1) continue;
      const eng = trimmed.slice(0, eqIdx).trim().toLowerCase();
      const arb = trimmed.slice(eqIdx + 1).trimEnd();
      // Skip invalid entries: empty values, single chars, pure symbols
      if (!eng || !arb) continue;
      if (/^[#%+=\-.\\/;:*&^$@!]+$/.test(eng)) continue;
      if (/^[#%+=\-.\\/;:*&^$@!]+$/.test(arb)) continue;
      map.set(eng, arb);
    }
    return map;
  }, []);

  // === Compute diffs between current glossary and incoming text ===
  const computeGlossaryDiffs = useCallback((incoming: string, currentGlossary: string): GlossaryMergeDiff[] => {
    const currentMap = parseGlossaryMap(currentGlossary);
    const incomingMap = parseGlossaryMap(incoming);
    const diffs: GlossaryMergeDiff[] = [];
    
    for (const [key, newVal] of incomingMap) {
      const oldVal = currentMap.get(key);
      if (!oldVal) {
        diffs.push({ key, newValue: newVal, type: 'new' });
      } else if (oldVal !== newVal) {
        diffs.push({ key, newValue: newVal, oldValue: oldVal, type: 'changed' });
      } else {
        diffs.push({ key, newValue: newVal, type: 'same' });
      }
    }
    return diffs;
  }, [parseGlossaryMap]);

  // === Merge helper (preserves section headers from both sources) ===
  const mergeGlossaryText = (prev: EditorState, newText: string): EditorState => {
    const existing = prev.glossary?.trim() || '';
    const merged = existing ? existing + '\n' + newText : newText;
    const seen = new Map<string, string>();
    const result: string[] = [];
    for (const line of merged.split('\n')) {
      const trimmed = line.trimEnd();
      if (!trimmed) continue;
      if (trimmed.startsWith('#') || trimmed.startsWith('//')) {
        result.push(trimmed);
        continue;
      }
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx < 1) continue;
      const key = trimmed.slice(0, eqIdx).trim().toLowerCase();
      if (seen.has(key)) {
        // Replace previous occurrence with new value
        const prevIdx = result.findIndex(l => {
          const eq = l.indexOf('=');
          return eq > 0 && l.slice(0, eq).trim().toLowerCase() === key;
        });
        if (prevIdx >= 0) result[prevIdx] = trimmed;
      } else {
        seen.set(key, trimmed);
        result.push(trimmed);
      }
    }
    return { ...prev, glossary: result.join('\n') };
  };

  // === Apply accepted diffs ===
  const applyMergeDiffs = useCallback((accepted: GlossaryMergeDiff[], replace: boolean) => {
    const acceptedText = accepted
      .filter(d => d.type !== 'same' || replace)
      .map(d => `${d.key}=${d.newValue}`)
      .join('\n');
    
    if (replace) {
      // For replace mode, build full text from accepted items
      const allAccepted = accepted.map(d => `${d.key}=${d.newValue}`).join('\n');
      setState(prev => prev ? { ...prev, glossary: allAccepted } : null);
    } else {
      setState(prev => prev ? mergeGlossaryText(prev, acceptedText) : null);
    }
    
    const count = accepted.filter(d => d.type !== 'same').length;
    setLastSaved(`📖 تم دمج ${count} مصطلح`);
    setTimeout(() => setLastSaved(""), 3000);
    setPendingMerge(null);
  }, [setState, setLastSaved]);

  // === Clean glossary text (comprehensive — preserves section structure) ===
  const cleanGlossaryText = (rawText: string): string => {
    const seen = new Map<string, string>(); // normKey -> true (for dedup tracking)
    const outputLines: string[] = [];
    const lines = rawText.split('\n');
    
    // First pass: find last occurrence of each key (last-wins dedup)
    const lastOccurrence = new Map<string, number>(); // normKey -> line index
    for (let i = 0; i < lines.length; i++) {
      const trimmed = lines[i].trim();
      if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('//')) continue;
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx < 1) continue;
      const eng = trimmed.slice(0, eqIdx).trim();
      const arb = trimmed.slice(eqIdx + 1).trimEnd();
      if (!eng || !arb) continue;
      if (/^[#%+=\-.\\/;:*&^$@!]+$/.test(eng) || /^[#%+=\-.\\/;:*&^$@!]+$/.test(arb)) continue;
      if (eng.length === 1 && !/^[A-Za-z\u0600-\u06FF]$/.test(eng)) continue;
      lastOccurrence.set(eng.toLowerCase(), i);
    }
    
    // Second pass: rebuild with section headers inline, keeping only last occurrence of each key
    for (let i = 0; i < lines.length; i++) {
      const trimmed = lines[i].trimEnd();
      if (!trimmed) continue;
      
      // Keep comment/section headers (filter technical noise)
      if (trimmed.startsWith('#') || trimmed.startsWith('//')) {
        if (/^#\[ML:/.test(trimmed) || /^\+\[ML:/.test(trimmed)) continue;
        outputLines.push(trimmed);
        continue;
      }
      
      // Filter out garbage lines
      if (/^[#%+=\-.\\/;:*&^$@!]+\s*=\s*[#%+=\-.\\/;:*&^$@!]+\s*$/.test(trimmed)) continue;
      
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx < 1) continue;
      
      const eng = trimmed.slice(0, eqIdx).trim();
      const arb = trimmed.slice(eqIdx + 1).trimEnd();
      if (!eng || !arb) continue;
      if (/^[#%+=\-.\\/;:*&^$@!]+$/.test(eng) || /^[#%+=\-.\\/;:*&^$@!]+$/.test(arb)) continue;
      if (eng.length === 1 && !/^[A-Za-z\u0600-\u06FF]$/.test(eng)) continue;
      
      const normKey = eng.toLowerCase();
      // Only emit if this is the last occurrence (dedup) and not already emitted
      if (lastOccurrence.get(normKey) === i && !seen.has(normKey)) {
        seen.set(normKey, 'true');
        outputLines.push(`${eng}=${arb}`);
      }
    }
    
    return outputLines.join('\n');
  };

  // === Import from file (with merge preview) ===
  const handleImportGlossary = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.txt,.csv,.json';
    input.multiple = true;
    input.onchange = async (e) => {
      const files = (e.target as HTMLInputElement).files;
      if (!files || files.length === 0) return;
      try {
        let newTerms = '';
        for (const file of Array.from(files)) {
          const rawText = await file.text();
          const cleaned = rawText.split('\n').map(l => l.trimEnd()).join('\n');
          newTerms += (newTerms ? '\n' : '') + cleaned;
        }
        const currentGlossary = state?.glossary || '';
        const diffs = computeGlossaryDiffs(newTerms, currentGlossary);
        const hasChanges = diffs.some(d => d.type !== 'same');
        
        if (hasChanges && currentGlossary.trim()) {
          const fileNames = Array.from(files).map(f => f.name).join('، ');
          setPendingMerge({ name: fileNames, diffs, rawText: newTerms, replace: false });
        } else {
          // No existing glossary or no conflicts — merge directly
          setState(prev => prev ? mergeGlossaryText(prev, newTerms) : null);
          const count = newTerms.split('\n').filter(l => {
            const t = l.trim();
            return t && !t.startsWith('#') && !t.startsWith('//') && t.includes('=');
          }).length;
          setLastSaved(`📖 تم دمج ${count} مصطلح`);
          setTimeout(() => setLastSaved(""), 4000);
        }
      } catch { alert('خطأ في قراءة الملف'); }
    };
    input.click();
  };

  // === Load from URL (with merge preview) ===
  const loadGlossary = useCallback(async (url: string, name: string, replace = false) => {
    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error('فشل تحميل القاموس');
      const rawText = await response.text();
      const cleanedText = cleanGlossaryText(rawText);
      const currentGlossary = state?.glossary || '';
      const diffs = computeGlossaryDiffs(cleanedText, currentGlossary);
      const hasChanges = diffs.some(d => d.type !== 'same');
      
      if (hasChanges && currentGlossary.trim()) {
        setPendingMerge({ name, diffs, rawText: cleanedText, replace });
      } else {
        // No existing glossary or identical content — apply directly
        const newCount = cleanedText.split('\n').filter(l => { const t = l.trim(); return t && !t.startsWith('#') && !t.startsWith('//') && t.includes('='); }).length;
        if (replace) {
          setState(prev => prev ? { ...prev, glossary: cleanedText } : null);
        } else {
          setState(prev => prev ? mergeGlossaryText(prev, cleanedText) : null);
        }
        setLastSaved(`📖 تم ${replace ? 'تحميل' : 'دمج'} ${name} (${newCount} مصطلح)`);
        setTimeout(() => setLastSaved(""), 3000);
      }
    } catch { alert(`خطأ في تحميل ${name}`); }
  }, [setState, setLastSaved, state?.glossary, computeGlossaryDiffs]);

  const handleLoadXC3Glossary = useCallback(() => loadGlossary('/xc3-glossary.txt', 'قاموس Xenoblade Chronicles 3', true), [loadGlossary]);
  const handleLoadUIMenusGlossary = useCallback(() => loadGlossary('/xc3-ui-menus-glossary.txt', 'قاموس القوائم والواجهة', false), [loadGlossary]);
  const handleLoadFullGlossary = useCallback(() => loadGlossary('/xc3-full-glossary.txt', 'القاموس الشامل', true), [loadGlossary]);
  const handleLoadCombatGlossary = useCallback(() => loadGlossary('/xc3-combat-glossary.txt', 'قاموس القتال والتأثيرات', false), [loadGlossary]);

  // === Cloud glossary ===
  const handleSaveGlossaryToCloud = async () => {
    if (!state || !userId || !state.glossary) { setCloudStatus('❌ لا يوجد قاموس لحفظه'); setTimeout(() => setCloudStatus(""), 3000); return; }
    setCloudSyncing(true); setCloudStatus('جاري حفظ القاموس...');
    try {
      const { error } = await supabase.from('glossaries').insert({ user_id: userId, name: 'قاموسي', content: state.glossary }).select().single();
      if (error) throw error;
      setCloudStatus(`✅ تم حفظ القاموس في السحابة (${state.glossary.split('\n').filter(l => l.includes('=') && l.trim()).length} مصطلح)`);
      setTimeout(() => setCloudStatus(""), 3000);
    } catch (error) { console.error('خطأ في حفظ القاموس:', error); setCloudStatus('❌ فشل حفظ القاموس في السحابة'); setTimeout(() => setCloudStatus(""), 3000); }
    finally { setCloudSyncing(false); }
  };

  const handleLoadGlossaryFromCloud = async () => {
    if (!userId) { setCloudStatus('❌ يجب تسجيل الدخول أولاً'); setTimeout(() => setCloudStatus(""), 3000); return; }
    setCloudSyncing(true); setCloudStatus('جاري تحميل القاموس من السحابة...');
    try {
      const { data, error } = await supabase.from('glossaries').select('content').eq('user_id', userId).order('updated_at', { ascending: false }).limit(1).maybeSingle();
      if (error) throw error;
      if (!data) { setCloudStatus('❌ لم يتم العثور على قاموس محفوظ'); setTimeout(() => setCloudStatus(""), 3000); return; }
      setState(prev => prev ? { ...prev, glossary: data.content } : null);
      setCloudStatus(`✅ تم تحميل القاموس من السحابة (${data.content.split('\n').filter(l => l.includes('=') && l.trim()).length} مصطلح)`);
      setTimeout(() => setCloudStatus(""), 3000);
    } catch (error) { console.error('خطأ في تحميل القاموس من السحابة:', error); setCloudStatus('❌ فشل تحميل القاموس من السحابة'); setTimeout(() => setCloudStatus(""), 3000); }
    finally { setCloudSyncing(false); }
  };

  // === Generate glossary from single-word/phrase completed translations ===
  const handleGenerateGlossaryFromTranslations = useCallback(() => {
    if (!state?.translations || !state?.entries) return;

    const existingMap = parseGlossaryMap(state.glossary || '');
    let newTerms = 0;
    const lines: string[] = [];

    for (const [key, translation] of Object.entries(state.translations)) {
      if (!translation?.trim()) continue;
      const entry = state.entries.find(e => `${e.msbtFile}:${e.index}` === key);
      if (!entry) continue;
      const original = entry.original.trim();
      if (!original) continue;

      if (original.includes('\n') || original.includes('[ML:') || original.includes('{')) continue;
      if (original.length > 60) continue;
      // Skip entries that are mostly numbers/symbols
      if (/^[\d\s\-+*/=<>.,;:!?%$#@&^()[\]{}|\\~`'"]+$/.test(original)) continue;

      const normKey = original.toLowerCase();
      if (existingMap.has(normKey)) continue;

      lines.push(`${original}=${translation.trim()}`);
      newTerms++;
    }

    if (newTerms === 0) {
      setLastSaved('📖 لا توجد ترجمات جديدة قصيرة لإضافتها للقاموس');
      setTimeout(() => setLastSaved(""), 3000);
      return;
    }

    const newText = lines.join('\n');
    setState(prev => {
      if (!prev) return null;
      const existing = prev.glossary?.trim() || '';
      const merged = existing ? existing + '\n' + newText : newText;
      const seen = new Map<string, string>();
      for (const line of merged.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('//')) continue;
        const eqIdx = trimmed.indexOf('=');
        if (eqIdx < 1) continue;
        const k = trimmed.slice(0, eqIdx).trim().toLowerCase();
        seen.set(k, trimmed);
      }
      return { ...prev, glossary: Array.from(seen.values()).join('\n') };
    });

    setLastSaved(`📖 تم إنشاء ${newTerms} مصطلح جديد من الترجمات المكتملة`);
    setTimeout(() => setLastSaved(""), 4000);
  }, [state, parseGlossaryMap, setState, setLastSaved]);

  // === Glossary health check — detect issues ===
  const getGlossaryHealth = useCallback((): { duplicates: number; emptyValues: number; reversedEntries: number; singleCharKeys: number; totalIssues: number } => {
    if (!state?.glossary?.trim()) return { duplicates: 0, emptyValues: 0, reversedEntries: 0, singleCharKeys: 0, totalIssues: 0 };
    
    const keyCount = new Map<string, number>();
    let emptyValues = 0, reversedEntries = 0, singleCharKeys = 0;
    
    for (const line of state.glossary.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('//')) continue;
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx < 1) continue;
      
      const eng = trimmed.slice(0, eqIdx).trim();
      const arb = trimmed.slice(eqIdx + 1).trim();
      const normKey = eng.toLowerCase();
      
      keyCount.set(normKey, (keyCount.get(normKey) || 0) + 1);
      
      if (!arb) emptyValues++;
      // Check if English/Arabic might be reversed (Arabic on left side)
      if (/[\u0600-\u06FF]/.test(eng) && /^[a-zA-Z\s]+$/.test(arb)) reversedEntries++;
      if (eng.length === 1 && !/^[A-Za-z]$/.test(eng)) singleCharKeys++;
    }
    
    const duplicates = Array.from(keyCount.values()).filter(c => c > 1).reduce((sum, c) => sum + (c - 1), 0);
    return { duplicates, emptyValues, reversedEntries, singleCharKeys, totalIssues: duplicates + emptyValues + reversedEntries + singleCharKeys };
  }, [state?.glossary]);

  // === Auto-fix glossary issues (preserves section structure) ===
  const handleFixGlossaryIssues = useCallback(() => {
    if (!state?.glossary?.trim()) return;
    
    const lines = state.glossary.split('\n');
    const seen = new Map<string, number>(); // normKey -> index in result
    const result: string[] = [];
    let fixed = 0;
    
    for (const line of lines) {
      const trimmed = line.trimEnd();
      if (!trimmed) continue;
      if (trimmed.startsWith('#') || trimmed.startsWith('//')) { result.push(trimmed); continue; }
      
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx < 1) { fixed++; continue; }
      
      let eng = trimmed.slice(0, eqIdx).trim();
      let arb = trimmed.slice(eqIdx + 1).trimEnd();
      
      // Skip empty
      if (!eng || !arb) { fixed++; continue; }
      // Fix reversed entries (Arabic=English → English=Arabic)
      if (/[\u0600-\u06FF]/.test(eng) && /^[a-zA-Z\s]+$/.test(arb)) {
        [eng, arb] = [arb, eng];
        fixed++;
      }
      // Skip pure symbols
      if (/^[#%+=\-.\\/;:*&^$@!]+$/.test(eng) || /^[#%+=\-.\\/;:*&^$@!]+$/.test(arb)) { fixed++; continue; }
      
      const normKey = eng.toLowerCase();
      if (seen.has(normKey)) {
        // Replace previous occurrence in-place (last wins)
        result[seen.get(normKey)!] = `${eng}=${arb}`;
        fixed++;
      } else {
        seen.set(normKey, result.length);
        result.push(`${eng}=${arb}`);
      }
    }
    
    // Remove any empty slots from in-place replacements
    const finalResult = result.filter(l => l !== '');
    setState(prev => prev ? { ...prev, glossary: finalResult.join('\n') } : null);
    setLastSaved(`🔧 تم إصلاح ${fixed} مشكلة في القاموس (${seen.size} مصطلح نظيف)`);
    setTimeout(() => setLastSaved(""), 4000);
  }, [state?.glossary, setState, setLastSaved]);

  // === Export Skills & Arts sections from glossary as a standalone file ===
  const handleExportSkillsGlossary = useCallback(() => {
    const glossaryText = state?.glossary?.trim();
    if (!glossaryText) {
      setLastSaved('⚠️ لا يوجد قاموس محمّل');
      setTimeout(() => setLastSaved(""), 3000);
      return;
    }

    const skillsSectionPatterns = [
      /skill/i, /art\b/i, /arts/i, /فنون/i, /مهارات/i, /talent/i, /master art/i,
      /fusion/i, /combo/i, /battle/i, /combat/i, /قتال/i, /موهبة/i, /إتقان/i,
    ];

    const lines = glossaryText.split('\n');
    const outputLines: string[] = ['# ═══════════════════════════════════════════════════', '# قاموس المهارات والفنون المُستخرج (Skills & Arts Mini-Glossary)', '# ═══════════════════════════════════════════════════', ''];
    let inSkillsSection = false;
    let extractedCount = 0;

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) {
        if (inSkillsSection) outputLines.push('');
        continue;
      }

      // Check if this is a section header
      if (trimmed.startsWith('#') || trimmed.startsWith('//')) {
        const headerText = trimmed.replace(/^[#/]+\s*/, '').replace(/[═─\-=]+/g, '').trim();
        if (headerText.length > 2) {
          inSkillsSection = skillsSectionPatterns.some(p => p.test(headerText));
          if (inSkillsSection) {
            outputLines.push(trimmed);
          }
        }
        continue;
      }

      // If we're in a skills section, include the term
      if (inSkillsSection) {
        const eqIdx = trimmed.indexOf('=');
        if (eqIdx > 0) {
          outputLines.push(trimmed);
          extractedCount++;
        }
      }
    }

    if (extractedCount === 0) {
      setLastSaved('⚠️ لم يتم العثور على أقسام مهارات/فنون في القاموس');
      setTimeout(() => setLastSaved(""), 4000);
      return;
    }

    // Download as file
    const blob = new Blob([outputLines.join('\n')], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'xc3-skills-arts-glossary.txt';
    a.click();
    URL.revokeObjectURL(url);

    setLastSaved(`📤 تم تصدير ${extractedCount} مصطلح (مهارات + فنون) إلى ملف مستقل`);
    setTimeout(() => setLastSaved(""), 5000);
  }, [state?.glossary, setLastSaved]);

  // === Smart Merge: Compare combat glossary against full glossary (or current) ===
  const handleSmartMergeGlossaries = useCallback(async () => {
    setLastSaved('📊 جاري تحميل القواميس للمقارنة...');
    
    try {
      // Fetch both glossaries
      const [combatRes, fullRes] = await Promise.all([
        fetch('/xc3-combat-glossary.txt'),
        fetch('/xc3-full-glossary.txt'),
      ]);
      
      if (!combatRes.ok || !fullRes.ok) {
        throw new Error('فشل تحميل أحد القواميس');
      }
      
      const [combatText, fullText] = await Promise.all([
        combatRes.text(),
        fullRes.text(),
      ]);
      
      // Parse both into maps
      const combatMap = parseGlossaryMap(combatText);
      const fullMap = parseGlossaryMap(fullText);
      
      // Find differences: what's in combat but not in full, or different
      const diffs: GlossaryMergeDiff[] = [];
      
      for (const [key, combatVal] of combatMap) {
        const fullVal = fullMap.get(key);
        if (!fullVal) {
          // New term: exists in combat but not in full
          diffs.push({ key, newValue: combatVal, type: 'new' });
        } else if (fullVal !== combatVal) {
          // Different translation
          diffs.push({ key, newValue: combatVal, oldValue: fullVal, type: 'changed' });
        } else {
          // Same
          diffs.push({ key, newValue: combatVal, type: 'same' });
        }
      }
      
      const changesCount = diffs.filter(d => d.type !== 'same').length;
      
      if (changesCount === 0) {
        setLastSaved('✅ القواميس متطابقة — لا توجد إضافات أو تحديثات');
        setTimeout(() => setLastSaved(""), 4000);
        return;
      }
      
      // Show the merge preview dialog with the diffs
      setPendingMerge({
        name: 'مقارنة القتال → الشامل',
        diffs,
        rawText: combatText,
        replace: false, // merge mode, not replace
      });
      
      setLastSaved(`📊 تم العثور على ${changesCount} اختلاف — راجع التفاصيل`);
      setTimeout(() => setLastSaved(""), 4000);
      
    } catch (error) {
      console.error('Smart merge error:', error);
      setLastSaved('❌ خطأ في تحميل القواميس');
      setTimeout(() => setLastSaved(""), 4000);
    }
  }, [parseGlossaryMap, setLastSaved, setPendingMerge]);

  return {
    glossaryEnabled, setGlossaryEnabled,
    glossaryTermCount, activeGlossary,
    parseGlossaryMap,
    pendingMerge, setPendingMerge, applyMergeDiffs,
    handleImportGlossary, handleLoadXC3Glossary, handleLoadUIMenusGlossary, handleLoadFullGlossary, handleLoadCombatGlossary,
    handleSaveGlossaryToCloud, handleLoadGlossaryFromCloud,
    handleGenerateGlossaryFromTranslations,
    getGlossaryHealth, handleFixGlossaryIssues,
    handleExportSkillsGlossary,
    handleSmartMergeGlossaries,
  };
}