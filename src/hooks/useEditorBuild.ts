import { useState, useRef, useEffect } from "react";
import type { IntegrityCheckResult } from "@/components/editor/IntegrityCheckDialog";
import { idbGet } from "@/lib/idb-storage";
import { processArabicText, hasArabicChars as hasArabicCharsProcessing, hasArabicPresentationForms, removeArabicPresentationForms, reverseBidi } from "@/lib/arabic-processing";
import { stripBidiMarkers } from "@/lib/arabic-processing";
import { EditorState, hasTechnicalTags, restoreTagsLocally } from "@/components/editor/types";
import { BuildPreview } from "@/components/editor/BuildConfirmDialog";
import { repairTranslationTagsForBuild } from "@/lib/xc3-build-tag-guard";
import type { MutableRefObject } from "react";
import { getEdgeFunctionUrl, getSupabaseHeaders } from "@/lib/supabase-edge";

export interface BuildStats {
  modifiedCount: number;
  expandedCount: number;
  fileSize: number;
  compressedSize?: number;
  avgBytePercent: number;
  maxBytePercent: number;
  longest: { key: string; bytes: number } | null;
  shortest: { key: string; bytes: number } | null;
  categories: Record<string, { total: number; modified: number }>;
}

export interface BdatFileStat {
  fileName: string;
  total: number;
  translated: number;
  hasError?: boolean;
}

export interface SafetyRepairEntry {
  key: string;
  label: string;
  action: 'repaired' | 'reverted';
  reason: string;
  missingControl: number;
  missingPua: number;
}

interface UseEditorBuildProps {
  state: EditorState | null;
  setState: React.Dispatch<React.SetStateAction<EditorState | null>>;
  setLastSaved: (msg: string) => void;
  arabicNumerals: boolean;
  mirrorPunctuation: boolean;
  gameType?: string;
  forceSaveRef?: React.RefObject<() => Promise<void>>;
}

export function useEditorBuild({ state, setState, setLastSaved, arabicNumerals, mirrorPunctuation, gameType, forceSaveRef }: UseEditorBuildProps) {
  // Use a ref to always access the LATEST state in async handlers
  const stateRef = useRef(state);
  useEffect(() => { stateRef.current = state; }, [state]);

  const [building, setBuilding] = useState(false);
  const [buildProgress, setBuildProgress] = useState("");
  const [applyingArabic, setApplyingArabic] = useState(false);
  const [buildStats, setBuildStats] = useState<BuildStats | null>(null);
  const [buildPreview, setBuildPreview] = useState<BuildPreview | null>(null);
  const [showBuildConfirm, setShowBuildConfirm] = useState(false);
  const [bdatFileStats, setBdatFileStats] = useState<BdatFileStat[]>([]);
  const [integrityResult, setIntegrityResult] = useState<IntegrityCheckResult | null>(null);
  const [showIntegrityDialog, setShowIntegrityDialog] = useState(false);
  const [checkingIntegrity, setCheckingIntegrity] = useState(false);
  const [safetyRepairs, setSafetyRepairs] = useState<SafetyRepairEntry[]>([]);
  const [showSafetyReport, setShowSafetyReport] = useState(false);

  const handleApplyArabicProcessing = () => {
    const currentState = stateRef.current;
    if (!currentState) return;
    setApplyingArabic(true);
    const newTranslations = { ...currentState.translations };
    let processedCount = 0, skippedCount = 0;
    for (const [key, value] of Object.entries(newTranslations)) {
      if (!value?.trim()) continue;
      if (hasArabicPresentationForms(value)) { skippedCount++; continue; }
      if (!hasArabicCharsProcessing(value)) continue;
      newTranslations[key] = processArabicText(value, { arabicNumerals, mirrorPunct: mirrorPunctuation });
      processedCount++;
    }
    setState(prev => prev ? { ...prev, translations: newTranslations } : null);
    setApplyingArabic(false);
    setLastSaved(`✅ تم تطبيق المعالجة العربية على ${processedCount} نص` + (skippedCount > 0 ? ` (تم تخطي ${skippedCount} نص معالج مسبقاً)` : ''));
    setTimeout(() => setLastSaved(""), 5000);
  };

  const handleUndoArabicProcessing = () => {
    const currentState = stateRef.current;
    if (!currentState) return;
    setApplyingArabic(true);
    const newTranslations = { ...currentState.translations };
    let revertedCount = 0;
    for (const [key, value] of Object.entries(newTranslations)) {
      if (!value?.trim()) continue;
      if (!hasArabicPresentationForms(value)) continue;
      // Reverse BiDi (self-inverse) then map presentation forms back to standard
      const unReversed = reverseBidi(value);
      newTranslations[key] = removeArabicPresentationForms(unReversed);
      revertedCount++;
    }
    setState(prev => prev ? { ...prev, translations: newTranslations } : null);
    setApplyingArabic(false);
    setLastSaved(`↩️ تم التراجع عن المعالجة العربية لـ ${revertedCount} نص`);
    setTimeout(() => setLastSaved(""), 5000);
  };

  const handlePreBuild = async () => {
    const currentState = stateRef.current;
    if (!currentState) return;
    
    // Force-save before preview too
    if (forceSaveRef?.current) {
      await forceSaveRef.current();
    }

    const nonEmptyTranslations: Record<string, string> = {};
    for (const [k, v] of Object.entries(currentState.translations)) {
      if (v.trim()) nonEmptyTranslations[k] = v;
    }

    const protectedCount = Array.from(currentState.protectedEntries || []).filter(k => nonEmptyTranslations[k]).length;
    const normalCount = Object.keys(nonEmptyTranslations).length - protectedCount;

    // Category breakdown
    const categories: Record<string, number> = {};
    for (const key of Object.keys(nonEmptyTranslations)) {
      const parts = key.split(':')[0].split('/');
      const cat = parts.length > 1 ? parts[0] : 'Other';
      categories[cat] = (categories[cat] || 0) + 1;
    }

    // Compute warnings
    let overflowCount = 0;
    let unprocessedArabicCount = 0;
    let missingClosingTagCount = 0;
    const arabicRegex = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF]/;
    const formsRegex = /[\uFB50-\uFDFF\uFE70-\uFEFF]/;
    const closingTagRegex = /\[\s*\/\s*\w+\s*:[^\]]*\]/g;

    for (const entry of currentState.entries) {
      const key = `${entry.msbtFile}:${entry.index}`;
      const trans = nonEmptyTranslations[key];
      if (!trans) continue;

      // Check byte overflow
      if (entry.maxBytes > 0) {
        const byteLen = new TextEncoder().encode(trans).length;
        if (byteLen > entry.maxBytes) overflowCount++;
      }

      // Check unprocessed Arabic
      if (arabicRegex.test(trans) && !formsRegex.test(trans)) {
        unprocessedArabicCount++;
      }

      // Check missing closing tags
      if (hasTechnicalTags(entry.original)) {
        const origClosing = [...entry.original.matchAll(closingTagRegex)].map(m => m[0]);
        for (const tag of origClosing) {
          if (!trans.includes(tag)) {
            missingClosingTagCount++;
            break; // count per-entry, not per-tag
          }
        }
      }
    }

    // Check if real files are loaded
    const bdatBinaryFileNames = await idbGet<string[]>("editorBdatBinaryFileNames");
    const hasBdatFiles = !!(bdatBinaryFileNames && bdatBinaryFileNames.length > 0);
    const isDemo = currentState.isDemo === true;

    // Count affected BDAT files
    let affectedFileCount = 0;
    if (hasBdatFiles && bdatBinaryFileNames) {
      for (const fileName of bdatBinaryFileNames) {
        const prefix = `bdat-bin:${fileName}:`;
        if (Object.keys(nonEmptyTranslations).some(k => k.startsWith(prefix))) {
          affectedFileCount++;
        }
      }
    }

    const sampleKeys = Object.keys(nonEmptyTranslations).slice(0, 10);

    console.log('[BUILD-PREVIEW] Total translations:', Object.keys(nonEmptyTranslations).length);
    console.log('[BUILD-PREVIEW] Overflow:', overflowCount, 'Unprocessed Arabic:', unprocessedArabicCount);
    console.log('[BUILD-PREVIEW] BDAT files:', affectedFileCount, 'isDemo:', isDemo);

    setBuildPreview({
      totalTranslations: Object.keys(nonEmptyTranslations).length,
      protectedCount,
      normalCount,
      categories,
      sampleKeys,
      overflowCount,
      unprocessedArabicCount,
      missingClosingTagCount,
      hasBdatFiles,
      isDemo,
      affectedFileCount,
    });
    setShowBuildConfirm(true);
  };

  const handleBuildXenoblade = async () => {
    // Always use the LATEST state via ref to avoid stale closures
    const currentState = stateRef.current;
    if (!currentState) return;
    // Close the build confirm dialog so progress messages are visible
    setShowBuildConfirm(false);
    // Force-save to IDB before reading data — prevents race condition with autosave
    if (forceSaveRef?.current) {
      await forceSaveRef.current();
    }
    setBuilding(true); setBuildProgress("تجهيز الترجمات...");
    try {
      const msbtFiles = await idbGet<Record<string, ArrayBuffer>>("editorMsbtFiles");
      const msbtFileNames = await idbGet<string[]>("editorMsbtFileNames");
      const bdatFiles = await idbGet<Record<string, string>>("editorBdatFiles");
      const bdatFileNames = await idbGet<string[]>("editorBdatFileNames");
      const bdatBinaryFiles = await idbGet<Record<string, ArrayBuffer>>("editorBdatBinaryFiles");
      const bdatBinaryFileNames = await idbGet<string[]>("editorBdatBinaryFileNames");

      const hasMsbt = msbtFiles && msbtFileNames && msbtFileNames.length > 0;
      const hasBdat = bdatFiles && bdatFileNames && bdatFileNames.length > 0;
      const hasBdatBinary = bdatBinaryFiles && bdatBinaryFileNames && bdatBinaryFileNames.length > 0;

      if (!hasMsbt && !hasBdat && !hasBdatBinary) {
        setBuildProgress("❌ لا توجد ملفات. يرجى العودة لصفحة المعالجة وإعادة رفع الملفات.");
        setBuilding(false);
        return;
      }

      // Process binary BDAT files locally
      let localBdatResults: { name: string; data: Uint8Array }[] = [];
      let localModifiedCount = 0;
      const newBdatFileStats: BdatFileStat[] = [];
      const allOverflowErrors: { fileName: string; key: string; originalBytes: number; translationBytes: number; reason?: string; newOffset?: number }[] = [];

      if (hasBdatBinary) {
        setBuildProgress("معالجة ملفات BDAT الثنائية محلياً...");
        const { parseBdatFile } = await import("@/lib/bdat-parser");
        const { patchBdatFile } = await import("@/lib/bdat-writer");
        const { unhashLabel } = await import("@/lib/bdat-hash-dictionary");
        const { processArabicText, hasArabicPresentationForms: hasPF } = await import("@/lib/arabic-processing");

        const nonEmptyTranslations: Record<string, string> = {};
        for (const [k, v] of Object.entries(currentState.translations)) { if (v.trim()) nonEmptyTranslations[k] = v; }
        
        const totalKeys = Object.keys(currentState.translations).length;
        const nonEmptyCount = Object.keys(nonEmptyTranslations).length;
        setBuildProgress(`📊 وجدت ${nonEmptyCount} ترجمة من أصل ${totalKeys} مفتاح...`);
        await new Promise(r => setTimeout(r, 200));
        console.log('[BUILD] ✅ State has', totalKeys, 'total keys,', nonEmptyCount, 'non-empty');
        
        if (nonEmptyCount === 0) {
          setBuildProgress(`❌ لا توجد ترجمات! تأكد من ترجمة النصوص أولاً. (${totalKeys} مفتاح بدون ترجمات)`);
          setBuilding(false);
          return;
        }

        // Auto Arabic processing before build
        let autoProcessedCountBin = 0;
        // Strip newlines from bubble dialogue files (tlk, fev, cq) — game engine hides text with \n in bubbles
        const BUBBLE_FILE_PATTERNS = /(?:^|[:/])(?:tlk_|fev_|cq_)/i;
        let strippedNewlineCount = 0;
        for (const [key, value] of Object.entries(nonEmptyTranslations)) {
          if (!value?.trim()) continue;
          // Strip BiDi isolate markers before game build
          if (value.includes('\u2068') || value.includes('\u2069')) {
            nonEmptyTranslations[key] = stripBidiMarkers(value);
          }
          // Strip \n from bubble dialogue files
          if (value.includes('\n') && BUBBLE_FILE_PATTERNS.test(key)) {
            nonEmptyTranslations[key] = value.replace(/\n/g, ' ');
            strippedNewlineCount++;
          }
          const current = nonEmptyTranslations[key];
          if (hasArabicPresentationForms(current)) continue;
          if (!hasArabicCharsProcessing(current)) continue;
          nonEmptyTranslations[key] = processArabicText(current, { arabicNumerals, mirrorPunct: mirrorPunctuation });
          autoProcessedCountBin++;
        }
        if (strippedNewlineCount > 0) {
          setBuildProgress(`🫧 إزالة فواصل أسطر من ${strippedNewlineCount} نص فقاعي (tlk/fev/cq)...`);
          await new Promise(r => setTimeout(r, 200));
        }
        if (autoProcessedCountBin > 0) {
          setBuildProgress(`✅ تمت معالجة ${autoProcessedCountBin} نص عربي تلقائياً...`);
          await new Promise(r => setTimeout(r, 200));
        }

      // === Safety gate: smart-repair translations with missing control/PUA characters ===
      // Strategy: extract the structural "frame" (control/PUA chars + positions) from the original,
      // then inject the Arabic translation text into that frame, preserving all technical markers.
      const RE_CONTROL_BUILD = /[\uFFF9\uFFFA\uFFFB\uFFFC]/g;
      const RE_PUA_BUILD = /[\uE000-\uE0FF]/g;
      const RE_SPECIAL = /[\uFFF9-\uFFFC\uE000-\uE0FF]/g;
      let repairedCount = 0;
      let revertedCount = 0;
      const repairLog: SafetyRepairEntry[] = [];

      // Build lookups from key → original text and key → label
      const entryOriginals = new Map<string, string>();
      const entryLabels = new Map<string, string>();
      for (const entry of currentState.entries) {
        const k = `${entry.msbtFile}:${entry.index}`;
        entryOriginals.set(k, entry.original);
        entryLabels.set(k, entry.label);
      }

      // === Protection: revert translations for technical/measurement BDAT tables ===
      // Tables like MNU_style_standard_ms contain font metrics the engine uses for
      // layout calculations. Translating them causes freezes/crashes.
      const PROTECTED_TABLE_PATTERNS = [
        /^MNU_style_standard_ms$/i,
        /^MNU_style_\w+_ms$/i,        // All MNU style measurement tables
        /^MNU_font_/i,                 // Font configuration tables
        /^sys_/i,                      // System tables (config, not dialogue)
      ];

      let protectedRevertCount = 0;
      for (const [key, _trans] of Object.entries(nonEmptyTranslations)) {
        const label = entryLabels.get(key) || '';
        // Extract table name from label like "TableName[row].column"
        const tableMatch = label.match(/^([^\[]+)\[/);
        if (!tableMatch) continue;
        const tableName = tableMatch[1];
        if (PROTECTED_TABLE_PATTERNS.some(p => p.test(tableName))) {
          const orig = entryOriginals.get(key);
          if (orig) {
            nonEmptyTranslations[key] = orig;
            protectedRevertCount++;
          }
        }
      }
      if (protectedRevertCount > 0) {
        setBuildProgress(`🛡️ حماية: تم استعادة ${protectedRevertCount} نص تقني (جداول قياس/نظام) لمنع تجمد اللعبة`);
        console.warn(`[BUILD-SAFETY] Protected ${protectedRevertCount} technical table entries from translation`);
        await new Promise(r => setTimeout(r, 400));
      }

      for (const [key, trans] of Object.entries(nonEmptyTranslations)) {
        const orig = entryOriginals.get(key);
        if (!orig) continue;

        const origControlChars = orig.match(RE_CONTROL_BUILD) || [];
        const transControlChars = trans.match(RE_CONTROL_BUILD) || [];
        const origPuaChars = orig.match(RE_PUA_BUILD) || [];
        const transPuaChars = trans.match(RE_PUA_BUILD) || [];

        const controlMissing = origControlChars.length > 0 && transControlChars.length < origControlChars.length;
        const puaMissing = origPuaChars.length > 0 && transPuaChars.length < origPuaChars.length;
        const missingControlN = controlMissing ? origControlChars.length - transControlChars.length : 0;
        const missingPuaN = puaMissing ? origPuaChars.length - transPuaChars.length : 0;

        if (!controlMissing && !puaMissing) continue;
        const entryLabel = entryLabels.get(key) || key;

        // Smart repair: use original as structural template, inject translated content
        // Split original by special chars to get the "frame"
        const origParts = orig.split(RE_SPECIAL);
        const origSpecials: string[] = [];
        let m: RegExpExecArray | null;
        RE_SPECIAL.lastIndex = 0;
        while ((m = RE_SPECIAL.exec(orig)) !== null) origSpecials.push(m[0]);

        // Strip all special chars from translation to get pure translated text
        RE_SPECIAL.lastIndex = 0;
        const pureTransText = trans.replace(RE_SPECIAL, '').trim();

        if (!pureTransText) {
          // No real text in translation — revert to original
          nonEmptyTranslations[key] = orig;
          revertedCount++;
          repairLog.push({ key, label: entryLabel, action: 'reverted', reason: 'ترجمة فارغة بعد إزالة الرموز', missingControl: missingControlN, missingPua: missingPuaN });
          continue;
        }

        // If original has simple structure (special chars only at start/end), 
        // wrap the translation with the same prefix/suffix
        if (origParts.length === origSpecials.length + 1) {
          // Reconstruct: origPart[0] may be empty (prefix specials), 
          // replace the middle text parts with translated text
          // Strategy: keep prefix specials + translated text + suffix specials
          let prefix = '';
          let suffix = '';
          
          // Collect leading specials (where original text parts are empty)
          let leadIdx = 0;
          while (leadIdx < origParts.length - 1 && origParts[leadIdx].trim() === '') {
            prefix += origParts[leadIdx] + origSpecials[leadIdx];
            leadIdx++;
          }
          
          // Collect trailing specials (where original text parts are empty)
          let trailIdx = origParts.length - 1;
          const trailParts: string[] = [];
          while (trailIdx > leadIdx && origParts[trailIdx].trim() === '') {
            trailParts.unshift(origSpecials[trailIdx - 1] + origParts[trailIdx]);
            trailIdx--;
          }
          suffix = trailParts.join('');

          // Middle specials that are between actual text
          const middleSpecials = origSpecials.slice(leadIdx, trailIdx);
          
          if (middleSpecials.length === 0) {
            // Simple case: just prefix + translated text + suffix
            nonEmptyTranslations[key] = prefix + pureTransText + suffix;
            repairedCount++;
            repairLog.push({ key, label: entryLabel, action: 'repaired', reason: 'حقن رموز في بداية/نهاية النص', missingControl: missingControlN, missingPua: missingPuaN });
          } else {
            // Has inline specials — try to distribute them proportionally in the translated text
            // Split translated text roughly into same number of segments
            const segments = middleSpecials.length + 1;
            const avgLen = Math.ceil(pureTransText.length / segments);
            let rebuilt = prefix;
            let pos = 0;
            for (let s = 0; s < segments; s++) {
              if (s === segments - 1) {
                rebuilt += pureTransText.slice(pos);
              } else {
                // Find a good break point near avgLen (prefer space)
                let breakAt = pos + avgLen;
                if (breakAt >= pureTransText.length) breakAt = pureTransText.length;
                else {
                  // Look for nearest space
                  const spaceAfter = pureTransText.indexOf(' ', breakAt);
                  const spaceBefore = pureTransText.lastIndexOf(' ', breakAt);
                  if (spaceAfter !== -1 && spaceAfter - breakAt < 10) breakAt = spaceAfter + 1;
                  else if (spaceBefore > pos) breakAt = spaceBefore + 1;
                }
                rebuilt += pureTransText.slice(pos, breakAt);
                rebuilt += middleSpecials[s];
                pos = breakAt;
              }
            }
            rebuilt += suffix;
            nonEmptyTranslations[key] = rebuilt;
            repairedCount++;
            repairLog.push({ key, label: entryLabel, action: 'repaired', reason: 'توزيع رموز داخلية في النص', missingControl: missingControlN, missingPua: missingPuaN });
          }
        } else {
          // Complex/unexpected structure — fall back to original for safety
          nonEmptyTranslations[key] = orig;
          revertedCount++;
          repairLog.push({ key, label: entryLabel, action: 'reverted', reason: 'بنية رموز معقدة لا يمكن إصلاحها', missingControl: missingControlN, missingPua: missingPuaN });
        }
      }

      if (repairedCount > 0 || revertedCount > 0) {
        setSafetyRepairs(repairLog);
        const parts: string[] = [];
        if (repairedCount > 0) parts.push(`🔧 إصلاح ${repairedCount} ترجمة (حقن رموز مفقودة)`);
        if (revertedCount > 0) parts.push(`↩️ استعادة ${revertedCount} نص أصلي (بنية معقدة)`);
        setBuildProgress(`🛡️ حماية: ${parts.join(' | ')} — اضغط لعرض التقرير`);
        setShowSafetyReport(true);
        console.warn(`[BUILD-SAFETY] Repaired: ${repairedCount}, Reverted: ${revertedCount}`);
        await new Promise(r => setTimeout(r, 500));
      } else {
        setSafetyRepairs([]);
      }

      // === Auto-truncation: cap translations at Nx original byte length ===
      const truncLimit = (await import('@/lib/bdat-settings')).loadBdatSettings().truncationLimit;
      let truncatedCount = 0;
      for (const [key, trans] of Object.entries(nonEmptyTranslations)) {
        const orig = entryOriginals.get(key);
        if (!orig || orig.length < 10) continue;
        const origLen = new TextEncoder().encode(orig).length;
        const transLen = new TextEncoder().encode(trans).length;
        const maxAllowed = Math.max(origLen * truncLimit, 200);
        if (transLen > maxAllowed) {
          let truncated = trans;
          while (new TextEncoder().encode(truncated).length > maxAllowed && truncated.length > 1) {
            truncated = truncated.slice(0, Math.floor(truncated.length * 0.9));
          }
          nonEmptyTranslations[key] = truncated;
          truncatedCount++;
        }
      }
      if (truncatedCount > 0) {
        setBuildProgress(`✂️ تم تقليص ${truncatedCount} نص طويل جداً (أكثر من ${truncLimit}x الأصل)...`);
        await new Promise(r => setTimeout(r, 300));
      }

        let finalTagRepairCount = 0;
        let finalTagRevertCount = 0;
        for (const [key, trans] of Object.entries(nonEmptyTranslations)) {
          const orig = entryOriginals.get(key);
          if (!orig) continue;

          const tagRepair = repairTranslationTagsForBuild(orig, trans);
          if (tagRepair.changed) {
            nonEmptyTranslations[key] = tagRepair.text;
            finalTagRepairCount++;
          }

          // If tags are still broken after repair, revert to original instead of deleting
          if (!tagRepair.exactTagMatch || tagRepair.missingClosingTags || tagRepair.missingControlOrPua) {
            nonEmptyTranslations[key] = orig;
            finalTagRevertCount++;
            const entryLabel = entryLabels.get(key) || key;
            repairLog.push({
              key,
              label: entryLabel,
              action: 'reverted',
              reason: !tagRepair.exactTagMatch ? 'وسوم تقنية غير مطابقة' : tagRepair.missingClosingTags ? 'وسوم إغلاق مفقودة' : 'رموز تحكم مفقودة',
              missingControl: tagRepair.missingControlOrPua ? 1 : 0,
              missingPua: 0,
            });
          }
        }

        if (finalTagRepairCount > 0 || finalTagRevertCount > 0) {
          // Update safety report with any new reverts
          if (finalTagRevertCount > 0) setSafetyRepairs([...repairLog]);
          const parts: string[] = [];
          if (finalTagRepairCount > 0) parts.push(`🏷️ إصلاح ${finalTagRepairCount} نص (وسوم + متغيرات $N)`);
          if (finalTagRevertCount > 0) parts.push(`↩️ استعادة ${finalTagRevertCount} نص أصلي (وسوم غير قابلة للإصلاح)`);
          setBuildProgress(`${parts.join(' | ')} قبل حقن ترجمات BDAT...`);
          if (finalTagRevertCount > 0) setShowSafetyReport(true);
          await new Promise(r => setTimeout(r, 300));
        }

        // Pre-scan: build per-file index of translations for O(1) lookup
      const perFileTranslations = new Map<string, Map<string, string>>();
      const perFileLegacy = new Map<string, Map<string, string>>();
      for (const [key, trans] of Object.entries(nonEmptyTranslations)) {
        if (key.startsWith('bdat-bin:')) {
          const secondColon = key.indexOf(':', 9);
          if (secondColon === -1) continue;
          const fName = key.slice(9, secondColon);
          const rest = key.slice(secondColon + 1);
          const lastColon = rest.lastIndexOf(':');
          if (lastColon === -1) continue;
          const mapKey = rest.slice(0, lastColon);
          if (mapKey.split(':').length < 3) continue;
          if (!perFileTranslations.has(fName)) perFileTranslations.set(fName, new Map());
          perFileTranslations.get(fName)!.set(mapKey, trans);
        } else if (key.startsWith('bdat:')) {
          const secondColon = key.indexOf(':', 5);
          if (secondColon === -1) continue;
          const fName = key.slice(5, secondColon);
          if (!perFileLegacy.has(fName)) perFileLegacy.set(fName, new Map());
          perFileLegacy.get(fName)!.set(key, trans);
        }
      }

      const filesWithTranslations = new Set([...perFileTranslations.keys(), ...perFileLegacy.keys()]);
      const filesToBuild = bdatBinaryFileNames!.filter(f => filesWithTranslations.has(f));
      const skippedCount = bdatBinaryFileNames!.length - filesToBuild.length;
      if (skippedCount > 0) {
        setBuildProgress(`⏭️ تخطي ${skippedCount} ملف بدون ترجمات، بناء ${filesToBuild.length} ملف فقط...`);
        await new Promise(r => setTimeout(r, 300));
      }

      // Process files in batches to keep UI responsive
      const BUILD_BATCH = 5;
      for (let batchStart = 0; batchStart < filesToBuild.length; batchStart += BUILD_BATCH) {
        const batchEnd = Math.min(batchStart + BUILD_BATCH, filesToBuild.length);
        setBuildProgress(`⚙️ بناء ${batchStart + 1}-${batchEnd} من ${filesToBuild.length} ملف...`);

        for (let fi = batchStart; fi < batchEnd; fi++) {
          const fileName = filesToBuild[fi];
          const buf = bdatBinaryFiles![fileName];
          if (!buf) continue;
          try {
            const data = new Uint8Array(buf);
            const bdatFile = parseBdatFile(data, unhashLabel);

            const translationMap = new Map<string, string>();

            // Use pre-indexed translations — no scanning needed
            const fileTransMap = perFileTranslations.get(fileName);
            if (fileTransMap) {
              for (const [mapKey, trans] of fileTransMap) {
                const processed = hasPF(trans) ? trans : processArabicText(trans, { arabicNumerals, mirrorPunct: mirrorPunctuation });
                translationMap.set(mapKey, processed);
              }
            }

            // Legacy fallback
            if (translationMap.size === 0) {
              const legacyMap = perFileLegacy.get(fileName);
              if (legacyMap && legacyMap.size > 0) {
                const { extractBdatStrings } = await import("@/lib/bdat-parser");
                const extractedStrings = extractBdatStrings(bdatFile, fileName);
                for (let i = 0; i < extractedStrings.length; i++) {
                  const s = extractedStrings[i];
                  const stateKey = `bdat:${fileName}:${i}`;
                  const trans = legacyMap.get(stateKey);
                  if (!trans) continue;
                  const processed = hasPF(trans) ? trans : processArabicText(trans, { arabicNumerals, mirrorPunct: mirrorPunctuation });
                  translationMap.set(`${s.tableName}:${s.rowIndex}:${s.columnName}`, processed);
                  localModifiedCount++;
                }
              }
            }

            // Record per-file stats (use translationMap size instead of expensive re-parse)
            newBdatFileStats.push({
              fileName,
              total: translationMap.size, // approximate — avoids costly extractBdatStrings
              translated: translationMap.size,
            });

            if (translationMap.size > 0) {
              const { result: patched, overflowErrors, patchedCount, skippedCount: patchSkipped, tableStats } = patchBdatFile(bdatFile, translationMap);
              localBdatResults.push({ name: fileName, data: patched });
              for (const e of overflowErrors) {
                allOverflowErrors.push({ fileName, ...e });
              }
              const u16Tables = tableStats.filter(ts => ts.hasU16Columns && ts.stringsSkipped > 0);
              if (u16Tables.length > 0) {
                console.warn(`[BUILD-BDAT] ${fileName}: ${u16Tables.length} u16 overflow tables`);
              }
              localModifiedCount += patchedCount;
            } else {
              localBdatResults.push({ name: fileName, data });
            }
          } catch (e) {
            console.warn(`Failed to rebuild BDAT ${fileName}:`, e);
            newBdatFileStats.push({ fileName, total: 0, translated: 0, hasError: true });
            localBdatResults.push({ name: fileName, data: new Uint8Array(buf) });
          }
        }
        // Yield to UI between batches
        await new Promise(r => setTimeout(r, 0));
      }

        // Update stats state so UI can display per-file breakdown
        setBdatFileStats(newBdatFileStats);
      }
      
      // Handle MSBT and JSON BDAT files via server
      if (hasMsbt || hasBdat) {
        const formData = new FormData();
        if (hasMsbt) {
          for (let i = 0; i < msbtFileNames!.length; i++) {
            const name = msbtFileNames![i];
            const buf = msbtFiles![name];
            if (buf) formData.append(`msbt_${i}`, new File([new Uint8Array(buf)], name));
          }
        }
        if (hasBdat) {
          for (let i = 0; i < bdatFileNames!.length; i++) {
            const name = bdatFileNames![i];
            const text = bdatFiles![name];
            if (text) formData.append(`bdat_${i}`, new File([text], name, { type: 'application/json' }));
          }
        }
        
        const nonEmptyTranslations: Record<string, string> = {};
        for (const [k, v] of Object.entries(currentState.translations)) { if (v.trim()) nonEmptyTranslations[k] = v; }

        // Auto Arabic processing before build
        let autoProcessedCountMsbt = 0;
        for (const [key, value] of Object.entries(nonEmptyTranslations)) {
          if (!value?.trim()) continue;
          if (hasArabicPresentationForms(value)) continue;
          if (!hasArabicCharsProcessing(value)) continue;
          nonEmptyTranslations[key] = processArabicText(value, { arabicNumerals, mirrorPunct: mirrorPunctuation });
          autoProcessedCountMsbt++;
        }
        if (autoProcessedCountMsbt > 0) {
          setBuildProgress(`✅ تمت معالجة ${autoProcessedCountMsbt} نص عربي تلقائياً...`);
          await new Promise(r => setTimeout(r, 800));
        }

        // Hard safety gate before server build: repair what يمكن إصلاحه locally, and skip anything still dangerous
        let fixedTechnicalCount = 0;
        let skippedUnsafeCount = 0;
        for (const entry of currentState.entries) {
          const key = `${entry.msbtFile}:${entry.index}`;
          let trans = nonEmptyTranslations[key];
          if (!trans) continue;

          const tagRepair = repairTranslationTagsForBuild(entry.original, trans);
          trans = tagRepair.text;
          if (tagRepair.changed) {
            fixedTechnicalCount++;
          }

          const hasNullChar = trans.includes('\x00');
          const bracketMismatch = ((trans.match(/\[/g) || []).length !== (trans.match(/\]/g) || []).length);
          const rubyOpenCount = (trans.match(/\[\s*System\s*:\s*Ruby[^\]]*\]/gi) || []).length;
          const rubyCloseCount = (trans.match(/\[\s*\/\s*System\s*:\s*Ruby[^\]]*\]/gi) || []).length;

          if (
            hasNullChar ||
            bracketMismatch ||
            rubyOpenCount !== rubyCloseCount ||
            !tagRepair.exactTagMatch ||
            tagRepair.missingClosingTags ||
            tagRepair.missingControlOrPua
          ) {
            delete nonEmptyTranslations[key];
            skippedUnsafeCount++;
            continue;
          }

          nonEmptyTranslations[key] = trans;
        }

        if (fixedTechnicalCount > 0) {
          setBuildProgress(`🏷️ تم إصلاح ${fixedTechnicalCount} نص تقني قبل البناء...`);
          await new Promise(r => setTimeout(r, 400));
        }

        if (skippedUnsafeCount > 0) {
          setBuildProgress(`🛡️ تم استبعاد ${skippedUnsafeCount} نص خطر تلقائياً لحماية اللعبة...`);
          await new Promise(r => setTimeout(r, 800));
        }
        
        formData.append("translations", JSON.stringify(nonEmptyTranslations));
        formData.append("protectedEntries", JSON.stringify(Array.from(currentState.protectedEntries || [])));
        if (arabicNumerals) formData.append("arabicNumerals", "true");
        if (mirrorPunctuation) formData.append("mirrorPunctuation", "true");
        
        setBuildProgress("إرسال للمعالجة...");
        const response = await fetch(getEdgeFunctionUrl("arabize-xenoblade?mode=build"), {
          method: 'POST',
          headers: getSupabaseHeaders(),
          body: formData,
        });
        if (!response.ok) {
          const ct = response.headers.get('content-type') || '';
          if (ct.includes('json')) { const err = await response.json(); throw new Error(err.error || `خطأ ${response.status}`); }
          throw new Error(`خطأ ${response.status}`);
        }
        setBuildProgress("تحميل الملف...");
        const blob = await response.blob();
        const modifiedCount = parseInt(response.headers.get('X-Modified-Count') || '0') + localModifiedCount;
        
        // Pack everything into a single ZIP (server ZIP + local BDAT results)
        if (localBdatResults.length > 0) {
          setBuildProgress(`دمج ${localBdatResults.length} ملف BDAT مع ملفات MSBT في ZIP واحد...`);
          const JSZip = (await import("jszip")).default;
          // Load the server ZIP so we can merge it
          const serverZip = await JSZip.loadAsync(blob);
          for (const result of localBdatResults) {
            const cleanName = result.name.replace(/\.(txt|bin)$/i, "");
            const finalName = cleanName.endsWith(".bdat") ? cleanName : cleanName + ".bdat";
            serverZip.file(finalName, result.data);
          }
          const mergedBlob = await serverZip.generateAsync({ type: "blob", compression: "DEFLATE", compressionOptions: { level: 6 } });
          const mergedUrl = URL.createObjectURL(mergedBlob);
          const a = document.createElement("a");
          a.href = mergedUrl;
          a.download = "xenoblade_arabized.zip";
          a.click();
          URL.revokeObjectURL(mergedUrl);
          const overflowSummary = allOverflowErrors.length > 0
            ? ` ⚠️ ${allOverflowErrors.length} نص تجاوز الحجم وتم تخطيه`
            : '';
          setBuildProgress(`✅ تم بنجاح! تم تعديل ${modifiedCount} نص — جميع الملفات في ZIP واحد${overflowSummary}`);
        } else {
          const blobUrl = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = blobUrl;
          a.download = "xenoblade_arabized.zip";
          a.click();
          setBuildProgress(`✅ تم بنجاح! تم تعديل ${modifiedCount} نص — الملفات في ملف ZIP`);
        }
      } else if (localBdatResults.length > 0) {
        // Only binary BDAT files → pack ALL into a single ZIP
        setBuildProgress(`تجميع ${localBdatResults.length} ملف BDAT في ZIP...`);
        const JSZip = (await import("jszip")).default;
        const zip = new JSZip();
        for (const result of localBdatResults) {
          const cleanName = result.name.replace(/\.(txt|bin)$/i, "");
          const finalName = cleanName.endsWith(".bdat") ? cleanName : cleanName + ".bdat";
          zip.file(finalName, result.data);
        }
        const zipBlob = await zip.generateAsync({ type: "blob", compression: "DEFLATE", compressionOptions: { level: 6 } });
        const zipUrl = URL.createObjectURL(zipBlob);
        const a = document.createElement("a");
        a.href = zipUrl;
        a.download = "xenoblade_arabized_bdat.zip";
        a.click();
        URL.revokeObjectURL(zipUrl);
        const overflowSummary = allOverflowErrors.length > 0
          ? ` ⚠️ ${allOverflowErrors.length} نص تجاوز الحجم الأصلي وتم تخطيه`
          : '';
        setBuildProgress(`✅ تم بنجاح! ${localBdatResults.length} ملف BDAT في ZIP — تم تطبيق ${localModifiedCount} نص${overflowSummary}`);
      }
      
      // Save translations snapshot for future re-extraction
      try {
        const { idbSet } = await import("@/lib/idb-storage");
        const nonEmpty: Record<string, string> = {};
        for (const [k, v] of Object.entries(currentState.translations || {})) {
          if (v && (v as string).trim()) nonEmpty[k] = v as string;
        }
        if (Object.keys(nonEmpty).length > 0) {
          await idbSet("buildTranslations", nonEmpty);
        }
      } catch (e) {
        console.warn("Could not save build translations snapshot:", e);
      }

      setBuilding(false);
    } catch (err) {
      setBuildProgress(`❌ ${err instanceof Error ? err.message : 'خطأ غير معروف'}`);
      setBuilding(false);
    }
  };

  const handleCheckIntegrity = async () => {
    const currentState = stateRef.current;
    if (!currentState) return;
    setCheckingIntegrity(true);
    setShowIntegrityDialog(true);

    try {
      const { idbGet } = await import("@/lib/idb-storage");
      const bdatBinaryFiles = await idbGet<Record<string, ArrayBuffer>>("editorBdatBinaryFiles");
      const bdatBinaryFileNames = await idbGet<string[]>("editorBdatBinaryFileNames");

      // All translated (non-empty) keys
      const allTransKeys = Object.keys(currentState.translations).filter(k => currentState.translations[k]?.trim());
      // All entry keys (including untranslated) — used to count total extracted strings per file
      const allEntryKeys = currentState.entries
        ? currentState.entries.map(e => `${e.msbtFile}:${e.index}`)
        : Object.keys(currentState.translations);

      // Collect unique filenames from entry keys + translated keys
      const newFormatFiles = new Set<string>();
      const oldFormatFiles = new Set<string>();

      const collectFileNames = (keys: string[]) => {
        for (const key of keys) {
          if (key.startsWith('bdat-bin:')) {
            const parts = key.split(':');
            if (parts.length >= 2) newFormatFiles.add(parts[1]);
          } else if (key.startsWith('bdat:')) {
            const parts = key.split(':');
            if (parts.length >= 2) oldFormatFiles.add(parts[1]);
          }
        }
      };
      collectFileNames(allEntryKeys);
      collectFileNames(allTransKeys);

      const allFileNames = new Set([
        ...Array.from(newFormatFiles),
        ...Array.from(oldFormatFiles),
        ...(bdatBinaryFileNames || []),
      ]);

      const files: IntegrityCheckResult['files'] = [];
      let totalWillApply = 0;
      let totalOrphaned = 0;
      let hasLegacy = false;

      for (const fileName of Array.from(allFileNames)) {
        const fileExists = !!(bdatBinaryFiles && bdatBinaryFiles[fileName]);
        const isLegacyFormat = oldFormatFiles.has(fileName) && !newFormatFiles.has(fileName);
        if (isLegacyFormat) hasLegacy = true;

        const prefix = `bdat-bin:${fileName}:`;

        // Count translated (non-empty) for this file
        const matched = allTransKeys.filter(k => k.startsWith(prefix)).length;

        // Count total entries loaded for this file (translated + untranslated)
        const totalLoaded = allEntryKeys.filter(k => k.startsWith(prefix)).length;

        // Count orphaned old-format keys
        const oldPrefix = `bdat:${fileName}:`;
        const orphanedCount = (!fileExists && isLegacyFormat)
          ? allTransKeys.filter(k => k.startsWith(oldPrefix)).length
          : 0;

        // Total = from loaded entries; fallback to re-parsing IDB file
        let total = totalLoaded;
        if (total === 0 && fileExists && bdatBinaryFiles![fileName]) {
          try {
            const { parseBdatFile, extractBdatStrings } = await import("@/lib/bdat-parser");
            const { unhashLabel } = await import("@/lib/bdat-hash-dictionary");
            const data = new Uint8Array(bdatBinaryFiles![fileName]);
            const bdatFile = parseBdatFile(data, unhashLabel);
            total = extractBdatStrings(bdatFile, fileName).length;
          } catch { total = 0; }
        }

        files.push({ fileName, matched, total, orphaned: orphanedCount, isLegacyFormat, fileExists });

        if (fileExists && !isLegacyFormat) totalWillApply += matched;
        if (!fileExists || isLegacyFormat) totalOrphaned += isLegacyFormat
          ? allTransKeys.filter(k => k.startsWith(`bdat:${fileName}:`)).length
          : 0;
      }

      // Count MSBT/other translated entries too
      const msbtTranslated = allTransKeys.filter(k => !k.startsWith('bdat-bin:') && !k.startsWith('bdat:')).length;
      if (msbtTranslated > 0) totalWillApply += msbtTranslated;

      const isHealthy = files.length > 0
        && !hasLegacy
        && files.every(f => f.fileExists)
        && files.some(f => f.matched > 0);

      setIntegrityResult({
        files: files.sort((a, b) => b.matched - a.matched),
        willApply: totalWillApply,
        orphaned: totalOrphaned,
        hasLegacy,
        isHealthy,
      });
    } catch (e) {
      console.error('[INTEGRITY]', e);
      setIntegrityResult({ files: [], willApply: 0, orphaned: 0, hasLegacy: false, isHealthy: false });
    } finally {
      setCheckingIntegrity(false);
    }
  };

  const handleBuild = async () => {
    const currentState = stateRef.current;
    if (!currentState) return;
    setShowBuildConfirm(false);
    // Force-save before build
    if (forceSaveRef?.current) {
      await forceSaveRef.current();
    }
    const isXenoblade = gameType === "xenoblade";
    
    if (isXenoblade) {
      return handleBuildXenoblade();
    }
    
    const langBuf = await idbGet<ArrayBuffer>("editorLangFile");
    const dictBuf = await idbGet<ArrayBuffer>("editorDictFile");
    const langFileName = (await idbGet<string>("editorLangFileName")) || "output.zs";
    if (!langBuf) { setBuildProgress("❌ ملف اللغة غير موجود. يرجى العودة لصفحة المعالجة وإعادة رفع الملفات."); return; }
    setBuilding(true); setBuildProgress("تجهيز الترجمات...");
    try {
      const formData = new FormData();
      formData.append("langFile", new File([new Uint8Array(langBuf)], langFileName));
      if (dictBuf) formData.append("dictFile", new File([new Uint8Array(dictBuf)], (await idbGet<string>("editorDictFileName")) || "ZsDic.pack.zs"));
      const nonEmptyTranslations: Record<string, string> = {};
      for (const [k, v] of Object.entries(currentState.translations)) { if (v.trim()) nonEmptyTranslations[k] = v; }

      // Auto-fix and validate technical tags before build
      let tagFixCount = 0;
      let tagSkipCount = 0;
      let tagOkCount = 0;
      for (const entry of currentState.entries) {
        const key = `${entry.msbtFile}:${entry.index}`;
        const trans = nonEmptyTranslations[key];
        if (!trans) continue;

        const tagRepair = repairTranslationTagsForBuild(entry.original, trans);
        const fixed = tagRepair.text;

        if (tagRepair.changed) {
          nonEmptyTranslations[key] = fixed;
          tagFixCount++;
        }

        if (!tagRepair.exactTagMatch || tagRepair.missingClosingTags || tagRepair.missingControlOrPua) {
          delete nonEmptyTranslations[key];
          tagSkipCount++;
          continue;
        }

        tagOkCount++;
      }
      console.log(`[BUILD-TAGS] Fixed: ${tagFixCount}, Safe: ${tagOkCount}, Skipped: ${tagSkipCount}`);
      
      // Validate translations size
      const translationsJson = JSON.stringify(nonEmptyTranslations);
      const translationsSizeKB = Math.round(translationsJson.length / 1024);
      console.log(`[BUILD] Total translations being sent: ${Object.keys(nonEmptyTranslations).length}`);
      console.log(`[BUILD] Translations JSON size: ${translationsSizeKB} KB`);
      console.log('[BUILD] Protected entries:', Array.from(currentState.protectedEntries || []).length);
      console.log('[BUILD] Sample keys:', Object.keys(nonEmptyTranslations).slice(0, 10));
      
      if (translationsSizeKB > 5000) {
        console.warn(`[BUILD] ⚠️ Translations JSON is very large (${translationsSizeKB} KB). This may cause issues.`);
      }
      
      formData.append("translations", JSON.stringify(nonEmptyTranslations));
      formData.append("protectedEntries", JSON.stringify(Array.from(currentState.protectedEntries || [])));
      if (arabicNumerals) formData.append("arabicNumerals", "true");
      if (mirrorPunctuation) formData.append("mirrorPunctuation", "true");
      setBuildProgress("إرسال للمعالجة...");
      const response = await fetch(getEdgeFunctionUrl("arabize?mode=build"), {
        method: 'POST',
        headers: getSupabaseHeaders(),
        body: formData,
      });
      if (!response.ok) {
        const ct = response.headers.get('content-type') || '';
        if (ct.includes('json')) { const err = await response.json(); throw new Error(err.error || `خطأ ${response.status}`); }
        throw new Error(`خطأ ${response.status}`);
      }
      setBuildProgress("تحميل الملف...");
      const blob = await response.blob();
      const blobUrl = URL.createObjectURL(blob);
      const modifiedCount = parseInt(response.headers.get('X-Modified-Count') || '0');
      const expandedCount = parseInt(response.headers.get('X-Expanded-Count') || '0');
      const fileSize = parseInt(response.headers.get('X-File-Size') || '0');
      const compressedSize = response.headers.get('X-Compressed-Size');
      
      console.log('[BUILD] Response headers - Modified:', response.headers.get('X-Modified-Count'), 'Expanded:', response.headers.get('X-Expanded-Count'));
      
      let buildStatsData: BuildStats | null = null;
      try { buildStatsData = JSON.parse(decodeURIComponent(response.headers.get('X-Build-Stats') || '{}')); } catch {}
      const a = document.createElement("a");
      a.href = blobUrl;
      a.download = `arabized_${langFileName}`;
      a.click();
      const expandedMsg = expandedCount > 0 ? ` (${expandedCount} تم توسيعها 📐)` : '';
      setBuildProgress(`✅ تم بنجاح! تم تعديل ${modifiedCount} نص${expandedMsg}`);
      setBuildStats({
        modifiedCount,
        expandedCount,
        fileSize,
        compressedSize: compressedSize ? parseInt(compressedSize) : undefined,
        avgBytePercent: buildStatsData?.avgBytePercent || 0,
        maxBytePercent: buildStatsData?.maxBytePercent || 0,
        longest: buildStatsData?.longest || null,
        shortest: buildStatsData?.shortest || null,
        categories: buildStatsData?.categories || {},
      });
      setBuilding(false);
    } catch (err) {
      setBuildProgress(`❌ ${err instanceof Error ? err.message : 'خطأ غير معروف'}`);
      setBuilding(false);
    }
  };

  const dismissBuildProgress = () => { setBuildProgress(""); };

  return {
    building,
    buildProgress,
    dismissBuildProgress,
    applyingArabic,
    buildStats,
    setBuildStats,
    buildPreview,
    showBuildConfirm,
    setShowBuildConfirm,
    bdatFileStats,
    safetyRepairs,
    showSafetyReport,
    setShowSafetyReport,
    integrityResult,
    showIntegrityDialog,
    setShowIntegrityDialog,
    checkingIntegrity,
    handleApplyArabicProcessing,
    handleUndoArabicProcessing,
    handlePreBuild,
    handleBuild,
    handleCheckIntegrity,
  };
}

