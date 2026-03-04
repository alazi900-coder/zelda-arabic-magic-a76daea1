import { useCallback, useEffect, useRef, useState } from "react";
import type { ImportConflict } from "@/components/editor/ImportConflictDialog";
import { removeArabicPresentationForms } from "@/lib/arabic-processing";
import type { EditorState } from "@/components/editor/types";
import { ExtractedEntry, hasArabicChars, unReverseBidi } from "@/components/editor/types";
import { murmur3_32 } from "@/lib/bdat-hash-dictionary";
import { fetchBundledTranslations, uploadBundledTranslations } from "@/lib/bundled-cloud";

/** Parse a single JSON object chunk, repairing common issues */
function repairSingleChunk(raw: string): Record<string, string> | null {
  let text = raw.trim();
  if (!text) return null;
  // إضافة الأقواس الناقصة
  if (!text.startsWith('{')) text = '{' + text;
  if (!text.endsWith('}')) {
    // ابحث عن آخر سطر مكتمل
    const lines = text.split('\n');
    const goodLines: string[] = [];
    for (const line of lines) {
      goodLines.push(line);
    }
    // أزل الأسطر غير المكتملة من النهاية
    while (goodLines.length > 1) {
      const last = goodLines[goodLines.length - 1].trim();
      if (last === '' || last === '{' || last.match(/^"[^"]*"\s*:\s*".*",?\s*$/)) break;
      goodLines.pop();
    }
    text = goodLines.join('\n');
    if (!text.endsWith('}')) text += '\n}';
  }
  // إصلاح الفواصل الزائدة
  text = text.replace(/,\s*}/g, '}');
  // إصلاح الفواصل المفقودة بين المدخلات: "value"\n"key" → "value",\n"key"
  text = text.replace(/"\s*\n(\s*")/g, '",\n$1');
  try {
    return JSON.parse(text) as Record<string, string>;
  } catch {
    return null;
  }
}

/** إصلاح تلقائي لملفات JSON التالفة أو المقطوعة — يدعم كائنات متعددة متتالية */
function repairJson(raw: string): { parsed: Record<string, string>; wasTruncated: boolean; skippedCount: number } {
  let text = raw.trim();
  // إزالة أغلفة markdown
  text = text.replace(/^```json\s*/i, '').replace(/```\s*$/, '').trim();

  // محاولة أولى مباشرة
  try {
    const result = JSON.parse(text);
    return { parsed: result, wasTruncated: false, skippedCount: 0 };
  } catch {}

  // تقسيم عند }{ وتحليل كل جزء على حدة
  const chunks = text.split(/\}\s*\{/);
  if (chunks.length > 1) {
    const merged: Record<string, string> = {};
    let failedChunks = 0;
    for (let i = 0; i < chunks.length; i++) {
      let chunk = chunks[i].trim();
      if (i > 0) chunk = '{' + chunk;
      if (i < chunks.length - 1) chunk = chunk + '}';
      const parsed = repairSingleChunk(chunk);
      if (parsed) {
        Object.assign(merged, parsed);
      } else {
        failedChunks++;
      }
    }
    if (Object.keys(merged).length > 0) {
      return { parsed: merged, wasTruncated: failedChunks > 0, skippedCount: failedChunks };
    }
  }

  // محاولة إصلاح ككائن واحد
  const single = repairSingleChunk(text);
  if (single) {
    return { parsed: single, wasTruncated: false, skippedCount: 0 };
  }

  // آخر محاولة: استخراج المدخلات يدوياً بالـ regex
  const entryRegex = /"([^"]+)"\s*:\s*"((?:[^"\\]|\\.)*)"/g;
  const manual: Record<string, string> = {};
  let m: RegExpExecArray | null;
  while ((m = entryRegex.exec(text)) !== null) {
    manual[m[1]] = m[2];
  }
  if (Object.keys(manual).length > 0) {
    return { parsed: manual, wasTruncated: true, skippedCount: 0 };
  }

  throw new Error('تعذر إصلاح ملف JSON');
}

interface UseEditorFileIOProps {
  state: EditorState | null;
  setState: React.Dispatch<React.SetStateAction<EditorState | null>>;
  setLastSaved: React.Dispatch<React.SetStateAction<string>>;
  filteredEntries: ExtractedEntry[];
  filterLabel: string;
}

function normalizeArabicPresentationForms(text: string): string {
  if (!text) return text;
  return removeArabicPresentationForms(text);
}

function escapeCSV(text: string): string {
  if (text.includes('"') || text.includes(',') || text.includes('\n') || text.includes('\r')) {
    return '"' + text.replace(/"/g, '""') + '"';
  }
  return text;
}

function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"' && i + 1 < line.length && line[i + 1] === '"') {
        current += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        current += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ',') {
        result.push(current);
        current = '';
      } else {
        current += ch;
      }
    }
  }
  result.push(current);
  return result;
}

export function useEditorFileIO({ state, setState, setLastSaved, filteredEntries, filterLabel }: UseEditorFileIOProps) {

  const isFilterActive = filterLabel !== "";

  // Conflict dialog state
  const [importConflicts, setImportConflicts] = useState<ImportConflict[]>([]);
  const [pendingImport, setPendingImport] = useState<{
    cleanedImported: Record<string, string>;
    msg: string;
    repaired: { wasTruncated?: boolean; skippedCount?: number };
  } | null>(null);

  const handleExportTranslations = () => {
    if (!state) return;
    const cleanTranslations: Record<string, string> = {};

    if (isFilterActive) {
      const allowedKeys = new Set(filteredEntries.map(e => `${e.msbtFile}:${e.index}`));
      for (const [key, value] of Object.entries(state.translations)) {
        if (allowedKeys.has(key)) {
          cleanTranslations[key] = normalizeArabicPresentationForms(value);
        }
      }
    } else {
      for (const [key, value] of Object.entries(state.translations)) {
        cleanTranslations[key] = normalizeArabicPresentationForms(value);
      }
    }

    // Add fingerprint mappings: "__fp__:filename:row:col" → original key
    // This ensures imports work even if hash names change between extractions
    const fingerprintMap: Record<string, string> = {};
    for (const key of Object.keys(cleanTranslations)) {
      const fp = bdatKeyFingerprint(key);
      if (fp) {
        fingerprintMap[`__fp__:${fp.exact}`] = key;
      }
    }
    if (Object.keys(fingerprintMap).length > 0) {
      Object.assign(cleanTranslations, fingerprintMap);
    }

    const data = JSON.stringify(cleanTranslations, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const suffix = isFilterActive ? `_${filterLabel}` : '';
    a.download = `translations${suffix}_${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);

    const countMsg = Object.keys(cleanTranslations).length;
    setLastSaved(isFilterActive
      ? `✅ تم تصدير ${countMsg} ترجمة (${filterLabel})`
      : `✅ تم تصدير ${countMsg} ترجمة`
    );
    setTimeout(() => setLastSaved(""), 3000);

    // Auto-merge to bundled if enabled
    if (autoMergeToBundledRef.current) {
      setTimeout(() => handleMergeToBundledRef.current?.(), 500);
    }
  };

  /** Build the list of entries grouped by file, optionally filtered by scope */
  const getEntriesGrouped = (scope: 'untranslated' | 'all' = 'untranslated', startPage?: number, endPage?: number) => {
    if (!state) return { groupedByFile: {} as Record<string, { index: number; original: string; label: string }[]>, totalCount: 0 };
    // Use filteredEntries to respect active filters (category, file, status, etc.)
    let entriesToExport = filteredEntries;
    
    // Apply page range filter if specified
    if (startPage !== undefined && endPage !== undefined) {
      const PAGE_SIZE = 50;
      const fromIdx = startPage * PAGE_SIZE;
      const toIdx = (endPage + 1) * PAGE_SIZE;
      entriesToExport = entriesToExport.slice(fromIdx, toIdx);
    }
    
    const groupedByFile: Record<string, { index: number; original: string; label: string }[]> = {};
    for (const entry of entriesToExport) {
      const key = `${entry.msbtFile}:${entry.index}`;
      const translation = state.translations[key]?.trim();
      const isUntranslated = !translation || translation === entry.original || translation === entry.original.trim();
      
      if (scope === 'all' || isUntranslated) {
        if (!groupedByFile[entry.msbtFile]) groupedByFile[entry.msbtFile] = [];
        groupedByFile[entry.msbtFile].push({ index: entry.index, original: entry.original, label: entry.label || '' });
      }
    }
    const totalCount = Object.values(groupedByFile).reduce((sum, arr) => sum + arr.length, 0);
    return { groupedByFile, totalCount };
  };

  /** Legacy wrapper */
  const getUntranslatedGrouped = () => getEntriesGrouped('untranslated');

  /** Build text content for a flat list of entries */
  const buildEnglishTxt = (
    flatEntries: { file: string; index: number; original: string; label: string }[],
    partLabel: string,
    totalParts: number,
    partNum: number,
  ): string => {
    const lines: string[] = [];
    lines.push('='.repeat(60));
    lines.push(`  English Texts for Translation — ${new Date().toISOString().slice(0, 10)}`);
    lines.push(`  Total: ${flatEntries.length} texts`);
    if (totalParts > 1) lines.push(`  Part: ${partNum} / ${totalParts}`);
    if (isFilterActive) lines.push(`  Filter: ${filterLabel}`);
    lines.push('='.repeat(60));
    lines.push('');

    let currentFile = '';
    let rowNum = 1;
    for (const entry of flatEntries) {
      if (entry.file !== currentFile) {
        currentFile = entry.file;
        lines.push('─'.repeat(60));
        lines.push(`📁 ${entry.file}`);
        lines.push('─'.repeat(60));
        lines.push('');
      }
      lines.push(`[${rowNum}] (${entry.file}:${entry.index})`);
      if (entry.label) lines.push(`Label: ${entry.label}`);
      lines.push('');
      lines.push(entry.original);
      lines.push('');
      lines.push('▶ Translation:');
      lines.push('');
      lines.push('═'.repeat(60));
      lines.push('');
      rowNum++;
    }
    return lines.join('\n');
  };

  /** Download a single text blob */
  const downloadTxt = (content: string, filename: string) => {
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const getUntranslatedCount = (): number => {
    if (!state) return 0;
    return getUntranslatedGrouped().totalCount;
  };

  const handleExportEnglishOnly = async (chunkSize?: number, scope: 'untranslated' | 'all' = 'untranslated', startPage?: number, endPage?: number) => {
    if (!state) return;
    const { groupedByFile, totalCount } = getEntriesGrouped(scope, startPage, endPage);
    if (totalCount === 0) {
      setLastSaved(scope === 'untranslated' ? "ℹ️ لا توجد نصوص غير مترجمة للتصدير" : "ℹ️ لا توجد نصوص للتصدير");
      setTimeout(() => setLastSaved(""), 3000);
      return;
    }

    // Flatten all entries in file order
    const sortedFiles = Object.keys(groupedByFile).sort();
    const flatEntries: { file: string; index: number; original: string; label: string }[] = [];
    for (const file of sortedFiles) {
      for (const entry of groupedByFile[file].sort((a, b) => a.index - b.index)) {
        flatEntries.push({ file, ...entry });
      }
    }

    const suffix = isFilterActive ? `_${filterLabel}` : '';
    const date = new Date().toISOString().slice(0, 10);
    const pageRangeLabel = startPage !== undefined && endPage !== undefined
      ? ` • الصفحات ${startPage + 1}-${endPage + 1}`
      : '';

    if (!chunkSize || chunkSize >= totalCount) {
      // تصدير كامل
      const content = buildEnglishTxt(flatEntries, '', 1, 1);
      downloadTxt(content, `english-only${suffix}_${date}.txt`);
      setLastSaved(`✅ تم تصدير ${totalCount} نص إنجليزي (${sortedFiles.length} ملف)${pageRangeLabel}`);
    } else {
      // تقسيم إلى أجزاء في ZIP
      const totalParts = Math.ceil(totalCount / chunkSize);
      const JSZip = (await import("jszip")).default;
      const zip = new JSZip();
      for (let i = 0; i < totalParts; i++) {
        const chunk = flatEntries.slice(i * chunkSize, (i + 1) * chunkSize);
        const content = buildEnglishTxt(chunk, '', totalParts, i + 1);
        zip.file(`english-only${suffix}_part${i + 1}_of_${totalParts}.txt`, content);
      }
      const blob = await zip.generateAsync({ type: "blob" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `english-only${suffix}_${totalParts}files_${date}.zip`;
      a.click();
      URL.revokeObjectURL(url);
      setLastSaved(`✅ تم تصدير ${totalCount} نص في ${totalParts} ملفات ZIP (${chunkSize} لكل ملف)`);
    }
    setTimeout(() => setLastSaved(""), 4000);
  };

  const handleExportEnglishOnlyJson = async (chunkSize?: number, scope: 'untranslated' | 'all' = 'untranslated', startPage?: number, endPage?: number) => {
    if (!state) return;
    const { groupedByFile, totalCount } = getEntriesGrouped(scope, startPage, endPage);
    if (totalCount === 0) {
      setLastSaved(scope === 'untranslated' ? "ℹ️ لا توجد نصوص غير مترجمة للتصدير" : "ℹ️ لا توجد نصوص للتصدير");
      setTimeout(() => setLastSaved(""), 3000);
      return;
    }

    const sortedFiles = Object.keys(groupedByFile).sort();
    const flatEntries: { file: string; index: number; original: string; label: string }[] = [];
    for (const file of sortedFiles) {
      for (const entry of groupedByFile[file].sort((a, b) => a.index - b.index)) {
        flatEntries.push({ file, ...entry });
      }
    }

    const suffix = isFilterActive ? `_${filterLabel}` : '';
    const date = new Date().toISOString().slice(0, 10);

    const buildJsonChunk = (entries: typeof flatEntries) => {
      const obj: Record<string, string> = {};
      for (const entry of entries) {
        const key = `${entry.file}:${entry.index}`;
        obj[key] = entry.original;
      }
      return JSON.stringify(obj, null, 2);
    };

    if (!chunkSize || chunkSize >= totalCount) {
      const content = buildJsonChunk(flatEntries);
      const blob = new Blob([content], { type: 'application/json;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `english-only${suffix}_${date}.json`;
      a.click();
      URL.revokeObjectURL(url);
      setLastSaved(`✅ تم تصدير ${totalCount} نص إنجليزي JSON (${sortedFiles.length} ملف)`);
    } else {
      const totalParts = Math.ceil(totalCount / chunkSize);
      const JSZip = (await import("jszip")).default;
      const zip = new JSZip();
      for (let i = 0; i < totalParts; i++) {
        const chunk = flatEntries.slice(i * chunkSize, (i + 1) * chunkSize);
        zip.file(`english-only${suffix}_part${i + 1}_of_${totalParts}.json`, buildJsonChunk(chunk));
      }
      const blob = await zip.generateAsync({ type: "blob" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `english-only${suffix}_${totalParts}files_${date}.zip`;
      a.click();
      URL.revokeObjectURL(url);
      setLastSaved(`✅ تم تصدير ${totalCount} نص JSON في ${totalParts} ملفات ZIP`);
    }
    setTimeout(() => setLastSaved(""), 4000);
  };

  /**
   * Extract multi-level fingerprints from a bdat-bin key for cross-extraction matching.
   * Key format: "bdat-bin:filename:<tableHash>:rowIndex:<colHash>:0"
   */
  const bdatKeyFingerprint = (key: string) => {
    if (!key.startsWith('bdat-bin:')) return null;
    const parts = key.split(':');
    if (parts.length < 6) return null;
    const filename = parts[1];
    const tableHash = parts[2];
    const rowIndex = parts[3];
    const colHash = parts[4];
    return {
      exact: `${filename}:${tableHash}:${rowIndex}:${colHash}`,
      noTable: `${filename}:*:${rowIndex}:${colHash}`,
      noCol: `${filename}:${tableHash}:${rowIndex}:*`,
      base: `${filename}:*:${rowIndex}:*`,
    };
  };

  /**
   * Normalize a key part to its numeric hash string.
   * If it's already a hex hash like "<0x00b8f58d>", extract the number.
   * If it's a name like "MNU_Msg", compute murmur3_32 and return hex.
   */
  const normalizeToHash = (part: string): string => {
    const hexMatch = part.match(/^<0x([0-9a-fA-F]+)>$/);
    if (hexMatch) return hexMatch[1].toLowerCase();
    // It's a resolved name — compute its hash
    return murmur3_32(part).toString(16).padStart(8, '0').toLowerCase();
  };

  /**
   * Create a hash-normalized fingerprint for exact matching across hash resolution changes.
   * Both "<0x00b8f58d>" and "MNU_Msg" normalize to the same hash string.
   */
  const normalizedFingerprint = (key: string): string | null => {
    if (!key.startsWith('bdat-bin:')) return null;
    const parts = key.split(':');
    if (parts.length < 6) return null;
    const filename = parts[1];
    const tableNorm = normalizeToHash(parts[2]);
    const rowIndex = parts[3];
    const colNorm = normalizeToHash(parts[4]);
    return `${filename}:${tableNorm}:${rowIndex}:${colNorm}`;
  };

  /** Core logic: process raw JSON text into translations */
  const processJsonImport = useCallback(async (rawText: string, sourceName?: string) => {
    const repaired = repairJson(rawText);
    const imported = repaired.parsed;
    const totalInFile = Object.keys(imported).length;

    if (totalInFile === 0) {
      alert('⚠️ الملف فارغ أو لا يحتوي على ترجمات صالحة.');
      return;
    }

    let cleanedImported: Record<string, string> = {};

    // Extract embedded fingerprint map (__fp__: entries → original key)
    const embeddedFpMap = new Map<string, string>();
    for (const [key, value] of Object.entries(imported)) {
      if (key.startsWith('__fp__:')) {
        embeddedFpMap.set(key.slice(6), value);
      }
    }

    // Always import ALL keys regardless of active filter
    for (const [key, value] of Object.entries(imported)) {
      if (key.startsWith('__fp__:')) continue;
      cleanedImported[key] = normalizeArabicPresentationForms(value);
    }

    // ── Convert legacy "table[row].column" keys to bdat-bin format ──
    const legacyKeyRegex = /^(\w+)\[(\d+)\]\.(\w+)$/;
    const entryKeySet = new Set(
      (state?.entries || []).map(e => `${e.msbtFile}:${e.index}`)
    );

    // Build lookup: "tableName:rowIndex:colName" → actual entry key
    const legacyLookup = new Map<string, string>();
    for (const ek of entryKeySet) {
      // ek format: "bdat-bin:filename:table:row:col:0"
      const parts = ek.split(':');
      if (parts.length >= 6 && parts[0] === 'bdat-bin') {
        const tableName = parts[2];
        const rowIndex = parts[3];
        const colName = parts[4];
        legacyLookup.set(`${tableName}:${rowIndex}:${colName}`, ek);
      }
    }

    // Remap legacy keys in cleanedImported
    let legacyConverted = 0;
    const remappedImport: Record<string, string> = {};
    for (const [key, value] of Object.entries(cleanedImported)) {
      const legacyMatch = key.match(legacyKeyRegex);
      if (legacyMatch) {
        const [, tableName, rowIndex, colName] = legacyMatch;
        const lookupKey = `${tableName}:${rowIndex}:${colName}`;
        const newKey = legacyLookup.get(lookupKey);
        if (newKey && !remappedImport[newKey]) {
          remappedImport[newKey] = value;
          legacyConverted++;
          continue;
        }
      }
      // Keep as-is (either already bdat-bin or no match found)
      if (!remappedImport[key]) {
        remappedImport[key] = value;
      }
    }
    if (legacyConverted > 0) {
      console.log(`🔑 Import: converted ${legacyConverted} legacy keys (table[row].col → bdat-bin)`);
      cleanedImported = remappedImport;
    }

    // ── Diagnostic: count how many imported keys match loaded entries ──
    let directMatchCount = Object.keys(cleanedImported).filter(k => entryKeySet.has(k)).length;
    let fpRemappedTotal = 0;

    // Build hash-normalized map for current entries: normalizedFp → entryKey
    const buildEntryFpMaps = () => {
      const normalizedMap = new Map<string, string>(); // hash-normalized → entryKey
      const exactMap = new Map<string, string>();
      const noTableMap = new Map<string, string[]>();
      const noColMap = new Map<string, string[]>();
      const baseMap = new Map<string, string[]>();
      for (const e of state!.entries) {
        const ek = `${e.msbtFile}:${e.index}`;
        // Hash-normalized fingerprint (primary matching method)
        const nfp = normalizedFingerprint(ek);
        if (nfp) normalizedMap.set(nfp, ek);
        // Multi-level fallback fingerprints
        const fp = bdatKeyFingerprint(ek);
        if (fp) {
          exactMap.set(fp.exact, ek);
          const nt = noTableMap.get(fp.noTable) || []; nt.push(ek); noTableMap.set(fp.noTable, nt);
          const nc = noColMap.get(fp.noCol) || []; nc.push(ek); noColMap.set(fp.noCol, nc);
          const b = baseMap.get(fp.base) || []; b.push(ek); baseMap.set(fp.base, b);
        }
      }
      return { normalizedMap, exactMap, noTableMap, noColMap, baseMap };
    };

    type FpMaps = ReturnType<typeof buildEntryFpMaps>;

    /** Try to find the new key for an old key using hash-normalized + progressive fingerprint matching */
    const findNewKey = (oldKey: string, maps: FpMaps): string | undefined => {
      // 0. Hash-normalized exact match (handles hash↔name resolution changes)
      const nfp = normalizedFingerprint(oldKey);
      if (nfp) {
        const found = maps.normalizedMap.get(nfp);
        if (found) return found;
      }
      // 1-4. Multi-level fallback
      const fp = bdatKeyFingerprint(oldKey);
      if (!fp) return undefined;
      let newKey = maps.exactMap.get(fp.exact);
      if (newKey) return newKey;
      const ntCandidates = maps.noTableMap.get(fp.noTable);
      if (ntCandidates && ntCandidates.length === 1) return ntCandidates[0];
      const ncCandidates = maps.noColMap.get(fp.noCol);
      if (ncCandidates && ncCandidates.length === 1) return ncCandidates[0];
      const bCandidates = maps.baseMap.get(fp.base);
      if (bCandidates && bCandidates.length === 1) return bCandidates[0];
      return undefined;
    };

    // Use fingerprint-based remapping for unmatched keys
    if ((state?.entries || []).length > 0) {
      const maps = buildEntryFpMaps();

      // Build reverse map from old embedded fps: oldKey → base fp (for old-format compat)
      // Old format: "filename:row:0" — treat as base fp "filename:*:row:*"
      const oldKeyToBaseFp = new Map<string, string>();
      if (embeddedFpMap.size > 0) {
        for (const [fpStr, oldKey] of embeddedFpMap.entries()) {
          const fpParts = fpStr.split(':');
          if (fpParts.length === 3) {
            // Old format: filename:row:0 → base = "filename:*:row:*"
            oldKeyToBaseFp.set(oldKey, `${fpParts[0]}:*:${fpParts[1]}:*`);
          } else if (fpParts.length === 4) {
            // New format: filename:tableHash:rowIndex:colHash — already handled by bdatKeyFingerprint
          }
        }
      }

      const remapped: Record<string, string> = {};
      for (const [oldKey, value] of Object.entries(cleanedImported)) {
        if (entryKeySet.has(oldKey)) {
          remapped[oldKey] = value;
          continue;
        }
        // Try multi-level fingerprint matching from key structure
        let newKey = findNewKey(oldKey, maps);
        // Fallback: use old-format embedded fp as base-level match
        if (!newKey && oldKeyToBaseFp.has(oldKey)) {
          const baseFp = oldKeyToBaseFp.get(oldKey)!;
          const candidates = maps.baseMap.get(baseFp);
          if (candidates && candidates.length === 1) {
            newKey = candidates[0];
          }
        }
        if (newKey && !remapped[newKey]) {
          remapped[newKey] = value;
          fpRemappedTotal++;
        } else {
          remapped[oldKey] = value;
        }
      }
      if (fpRemappedTotal > 0) {
        console.log(`🔄 Import: remapped ${fpRemappedTotal} keys via multi-level fingerprints`);
        cleanedImported = remapped;
        directMatchCount = Object.keys(cleanedImported).filter(k => entryKeySet.has(k)).length - fpRemappedTotal;
        if (directMatchCount < 0) directMatchCount = 0;
      }
    }

    let matchedCount = Object.keys(cleanedImported).filter(k => entryKeySet.has(k)).length;
    let unmatchedCount = Object.keys(cleanedImported).length - matchedCount;
    const noEntriesLoaded = (state?.entries || []).length === 0;

    // Backward compat: convert legacy FFF9-FFFC markers in imported translations to PUA markers
    if (state?.entries) {
      const entryMap = new Map(state.entries.map(e => [`${e.msbtFile}:${e.index}`, e]));
      for (const [key, value] of Object.entries(cleanedImported)) {
        if (/[\uFFF9-\uFFFC]/.test(value)) {
          const entry = entryMap.get(key);
          if (entry) {
            const puaMarkers = entry.original.match(/[\uE000-\uE0FF]/g) || [];
            if (puaMarkers.length > 0) {
              let idx = 0;
              cleanedImported[key] = value.replace(/[\uFFF9-\uFFFC]/g, () => {
                if (idx < puaMarkers.length) return puaMarkers[idx++];
                return '';
              });
            }
          }
        }
      }
    }

    // ── Show warning if no entries are loaded or keys don't match ──
    if (noEntriesLoaded) {
      alert(
        `⚠️ لا يوجد ملف BDAT مرفوع في الجلسة الحالية!\n\n` +
        `الملف يحتوي على ${totalInFile} ترجمة لكن لن تظهر في المحرر لأنه لا توجد مدخلات محملة.\n\n` +
        `الحل: اذهب إلى صفحة المعالجة وارفع ملفات BDAT أولاً، ثم عد وأعد الاستيراد.`
      );
      return;
    }

    // إذا كانت الجلسة تعرض demo data — لا نوقف الاستيراد بل نتيح له أن يُحدِّث الترجمات
    const isDemo = state?.isDemo === true;

    if (!isDemo && matchedCount === 0 && unmatchedCount > 0) {
      const sampleKey = Object.keys(cleanedImported)[0] || '';
      const sampleEntry = state?.entries[0];
      const sampleEntryKey = sampleEntry ? `${sampleEntry.msbtFile}:${sampleEntry.index}` : '';
      alert(
        `⚠️ لم يتطابق أي مفتاح من الملف مع المدخلات المحملة!\n\n` +
        `مثال مفتاح في الملف: "${sampleKey}"\n` +
        `مثال مفتاح في المحرر: "${sampleEntryKey}"\n\n` +
        `تأكد أن الملف المستورد صادر من نفس ملفات BDAT المرفوعة حالياً، أو ارفع ملفات BDAT أولاً من صفحة المعالجة.`
      );
      return;
    }

    // No longer block import for low match rate — all keys are saved regardless
    // and will appear when corresponding BDAT files are loaded later
    if (!isDemo && matchedCount > 0 && unmatchedCount > 0) {
      console.log(`ℹ️ Import: ${matchedCount} matched, ${unmatchedCount} unmatched (saved for later)`);
    }

    const appliedCount = Object.keys(cleanedImported).length;
    const statsDetails: string[] = [];
    if (directMatchCount > 0) statsDetails.push(`${directMatchCount} مباشرة`);
    if (legacyConverted > 0) statsDetails.push(`${legacyConverted} محوّلة من صيغة قديمة 🔑`);
    if (fpRemappedTotal > 0) statsDetails.push(`${fpRemappedTotal} عبر البصمة 🔄`);
    const statsInfo = statsDetails.length > 0 ? ` (${statsDetails.join(' + ')})` : '';
    let msg: string;
    if (isDemo) {
      msg = `✅ تم استيراد ${appliedCount} ترجمة — ستظهر عند رفع ملفات BDAT من صفحة المعالجة`;
    } else if (matchedCount > 0 && unmatchedCount > 0) {
      msg = `✅ تم استيراد ${appliedCount} ترجمة${statsInfo} — ${matchedCount} تظهر الآن، ${unmatchedCount} محفوظة لملفات BDAT أخرى`;
    } else if (isFilterActive) {
      msg = `✅ تم استيراد ${appliedCount} من ${totalInFile} ترجمة${statsInfo} (${filterLabel})`;
    } else {
      msg = `✅ تم استيراد ${appliedCount} ترجمة — ${matchedCount} مطابقة في المحرر${statsInfo}`;
    }
    if (sourceName) msg += ` — ${sourceName}`;
    if (repaired.wasTruncated) {
      msg += ` ⚠️ الملف كان مقطوعاً — تم تخطي ${repaired.skippedCount} سطر غير مكتمل`;
    }

    // ── Detect conflicts: existing translations that differ from imported ones ──
    const conflicts: ImportConflict[] = [];
    if (state) {
      for (const [key, newValue] of Object.entries(cleanedImported)) {
        const oldValue = state.translations[key];
        if (oldValue && oldValue.trim() && oldValue.trim() !== newValue.trim()) {
          // Find a readable label
          const entry = state.entries.find(e => `${e.msbtFile}:${e.index}` === key);
          const label = entry ? entry.original.slice(0, 60) : key.split(':').slice(-3).join(':');
          conflicts.push({ key, label, oldValue, newValue });
        }
      }
    }

    if (conflicts.length > 0) {
      // Store pending import and show conflict dialog
      setPendingImport({ cleanedImported, msg, repaired });
      setImportConflicts(conflicts);
      return; // Wait for user decision in the dialog
    }

    // No conflicts — apply directly
    applyImport(cleanedImported, msg, repaired);
  }, [state, setState, setLastSaved, isFilterActive, filteredEntries, filterLabel]);

  /** Apply imported translations (after conflict resolution or directly) */
  const applyImport = useCallback((cleanedImported: Record<string, string>, msg: string, repaired: { wasTruncated?: boolean; skippedCount?: number }) => {
    setState(prev => { if (!prev) return null; return { ...prev, translations: { ...prev.translations, ...cleanedImported } }; });

    alert(msg);
    setLastSaved(msg);

    // Apply BiDi fix to entries that have Arabic in the ORIGINAL and no imported translation
    setState(prevState => {
      if (!prevState) return null;
      const newTranslations = { ...prevState.translations };
      const newProtected = new Set(prevState.protectedEntries || []);
      let count = 0;
      const importedKeys = new Set(Object.keys(cleanedImported));
      for (const entry of prevState.entries) {
        const key = `${entry.msbtFile}:${entry.index}`;
        if (importedKeys.has(key)) continue;
        if (hasArabicChars(entry.original)) {
          if (newProtected.has(key)) continue;
          const existing = newTranslations[key]?.trim();
          const isAutoDetected = !existing || existing === entry.original || existing === entry.original.trim();
          if (isAutoDetected) {
            const corrected = unReverseBidi(entry.original);
            if (corrected !== entry.original) {
              newTranslations[key] = corrected;
              newProtected.add(key);
              count++;
            }
          }
        }
      }
      if (count > 0) setLastSaved(prev => prev + ` + تصحيح ${count} نص معكوس`);
      return { ...prevState, translations: newTranslations, protectedEntries: newProtected };
    });
  }, [setState, setLastSaved]);

  /** Handle conflict dialog confirmation */
  const handleConflictConfirm = useCallback((acceptedKeys: Set<string>) => {
    if (!pendingImport) return;
    const { cleanedImported, msg, repaired } = pendingImport;
    // Remove rejected conflicts from the import
    const filtered = { ...cleanedImported };
    for (const conflict of importConflicts) {
      if (!acceptedKeys.has(conflict.key)) {
        delete filtered[conflict.key];
      }
    }
    const rejectedCount = importConflicts.length - acceptedKeys.size;
    const finalMsg = rejectedCount > 0
      ? msg + ` (${acceptedKeys.size} استبدال، ${rejectedCount} إبقاء الحالية)`
      : msg;
    setImportConflicts([]);
    setPendingImport(null);
    applyImport(filtered, finalMsg, repaired);
  }, [pendingImport, importConflicts, applyImport]);

  /** Handle conflict dialog cancellation */
  const handleConflictCancel = useCallback(() => {
    if (!pendingImport) return;
    const { cleanedImported, msg, repaired } = pendingImport;
    // Remove ALL conflicting keys — keep only new translations
    const filtered = { ...cleanedImported };
    for (const conflict of importConflicts) {
      delete filtered[conflict.key];
    }
    setImportConflicts([]);
    setPendingImport(null);
    if (Object.keys(filtered).length > 0) {
      applyImport(filtered, msg + ` (${importConflicts.length} ترجمة حالية لم تُستبدل)`, repaired);
    } else {
      alert('تم إلغاء الاستيراد — لم يتم تغيير أي ترجمة.');
    }
  }, [pendingImport, importConflicts, applyImport]);

  /** Handle drop/paste of JSON file or text */
  const handleDropImport = useCallback(async (dataTransfer: DataTransfer) => {
    // Try files first
    if (dataTransfer.files && dataTransfer.files.length > 0) {
      const file = dataTransfer.files[0];
      try {
        const rawText = (await file.text()).trim();
        await processJsonImport(rawText, file.name);
      } catch (err) {
        console.error('Drop import error:', err);
        alert(`ملف JSON غير صالح\n\nالخطأ: ${err instanceof Error ? err.message : err}`);
      }
      return;
    }
    // Try text
    const text = dataTransfer.getData('text/plain')?.trim();
    if (text) {
      try {
        await processJsonImport(text, 'لصق من الحافظة');
      } catch (err) {
        console.error('Paste import error:', err);
        alert(`نص JSON غير صالح\n\nالخطأ: ${err instanceof Error ? err.message : err}`);
      }
    }
  }, [processJsonImport]);

  const handleImportTranslations = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,application/json,text/plain,.txt,*/*';
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      try {
        const rawText = (await file.text()).trim();
        await processJsonImport(rawText, file.name);
      } catch (err) {
        console.error('JSON import error:', err);
        alert(`ملف JSON غير صالح\n\nالخطأ: ${err instanceof Error ? err.message : err}`);
      }
    };
    input.click();
  };

  const handleExportCSV = () => {
    if (!state) return;
    const entriesToExport = (isFilterActive && filteredEntries.length < state.entries.length) ? filteredEntries : state.entries;
    const header = 'file,index,label,original,translation,max_bytes';
    const rows = entriesToExport.map(entry => {
      const key = `${entry.msbtFile}:${entry.index}`;
      const translation = normalizeArabicPresentationForms(state.translations[key] || '');
      return [
        escapeCSV(entry.msbtFile),
        entry.index.toString(),
        escapeCSV(entry.label),
        escapeCSV(entry.original),
        escapeCSV(translation),
        entry.maxBytes.toString(),
      ].join(',');
    });
    const csv = '\uFEFF' + header + '\n' + rows.join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const suffix = isFilterActive ? `_${filterLabel}` : '';
    a.download = `translations${suffix}_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    const msg = isFilterActive
      ? `✅ تم تصدير ${entriesToExport.length} نص كملف CSV (${filterLabel})`
      : `✅ تم تصدير ${entriesToExport.length} نص كملف CSV`;
    setLastSaved(msg);
    setTimeout(() => setLastSaved(""), 3000);
  };

  const handleImportCSV = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.csv';
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      try {
        const text = await file.text();
        const lines = text.split(/\r?\n/).filter(l => l.trim());
        if (lines.length < 2) { alert('ملف CSV فارغ أو غير صالح'); return; }

        const header = lines[0].toLowerCase();
        const hasHeader = header.includes('file') || header.includes('translation') || header.includes('original');
        const dataLines = hasHeader ? lines.slice(1) : lines;

        const allowedKeys = isFilterActive && filteredEntries.length < (state?.entries.length || 0)
          ? new Set(filteredEntries.map(e => `${e.msbtFile}:${e.index}`))
          : null;

        let imported = 0;
        const updates: Record<string, string> = {};

        for (const line of dataLines) {
          const cols = parseCSVLine(line);
          if (cols.length < 5) continue;
          const filePath = cols[0].trim();
          const index = cols[1].trim();
          const translation = cols[4].trim();
          if (!filePath || !index || !translation) continue;
          const key = `${filePath}:${index}`;
          if (allowedKeys && !allowedKeys.has(key)) continue;
          updates[key] = normalizeArabicPresentationForms(translation);
          imported++;
        }

        if (imported === 0) { alert('لم يتم العثور على ترجمات في الملف'); return; }
        setState(prev => prev ? { ...prev, translations: { ...prev.translations, ...updates } } : null);
        const msg = isFilterActive
          ? `✅ تم استيراد ${imported} ترجمة من CSV (${filterLabel})`
          : `✅ تم استيراد ${imported} ترجمة من CSV`;
        setLastSaved(msg);
        setTimeout(() => setLastSaved(""), 4000);
      } catch { alert('خطأ في قراءة ملف CSV'); }
    };
    input.click();
  };

  /** Export ALL English originals as JSON {key: original} for external translation */
  const handleExportAllEnglishJson = () => {
    if (!state) return;
    const entriesToExport = isFilterActive ? filteredEntries : state.entries;
    const exportObj: Record<string, string> = {};
    for (const entry of entriesToExport) {
      const key = `${entry.msbtFile}:${entry.index}`;
      exportObj[key] = entry.original;
    }
    const data = JSON.stringify(exportObj, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const suffix = isFilterActive ? `_${filterLabel}` : '';
    a.download = `english-all${suffix}_${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    setLastSaved(`✅ تم تصدير ${Object.keys(exportObj).length} نص إنجليزي كـ JSON للترجمة الخارجية`);
    setTimeout(() => setLastSaved(""), 4000);
  };

  /** Import external translations JSON {key: translation} back */
  const handleImportExternalJson = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,application/json';
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      try {
        const rawText = (await file.text()).trim();
        await processJsonImport(rawText, file.name);
      } catch (err) {
        console.error('External JSON import error:', err);
        alert(`ملف JSON غير صالح\n\nالخطأ: ${err instanceof Error ? err.message : err}`);
      }
    };
    input.click();
  };

  /** Build XLIFF 1.2 XML string */
  const buildXliff = (entries: ExtractedEntry[], translations: Record<string, string>): string => {
    const escXml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    const units: string[] = [];
    for (const entry of entries) {
      const key = `${entry.msbtFile}:${entry.index}`;
      const target = translations[key]?.trim() || '';
      const state = target && target !== entry.original ? ' state="translated"' : ' state="new"';
      units.push(
        `      <trans-unit id="${escXml(key)}" resname="${escXml(entry.label || key)}">\n` +
        `        <source xml:lang="en">${escXml(entry.original)}</source>\n` +
        `        <target xml:lang="ar"${state}>${escXml(target)}</target>\n` +
        (entry.maxBytes ? `        <note>maxBytes:${entry.maxBytes}</note>\n` : '') +
        `      </trans-unit>`
      );
    }
    return `<?xml version="1.0" encoding="UTF-8"?>\n` +
      `<xliff version="1.2" xmlns="urn:oasis:names:tc:xliff:document:1.2">\n` +
      `  <file source-language="en" target-language="ar" datatype="plaintext" original="translation-project">\n` +
      `    <body>\n` +
      units.join('\n') + '\n' +
      `    </body>\n` +
      `  </file>\n` +
      `</xliff>`;
  };

  /** Build TMX XML string */
  const buildTmx = (entries: ExtractedEntry[], translations: Record<string, string>): string => {
    const escXml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    const tus: string[] = [];
    for (const entry of entries) {
      const key = `${entry.msbtFile}:${entry.index}`;
      const target = translations[key]?.trim() || '';
      if (!target || target === entry.original) continue; // TMX only includes translated pairs
      tus.push(
        `    <tu tuid="${escXml(key)}">\n` +
        `      <tuv xml:lang="en"><seg>${escXml(entry.original)}</seg></tuv>\n` +
        `      <tuv xml:lang="ar"><seg>${escXml(target)}</seg></tuv>\n` +
        `    </tu>`
      );
    }
    return `<?xml version="1.0" encoding="UTF-8"?>\n` +
      `<tmx version="1.4">\n` +
      `  <header creationtool="Lovable Translation Editor" creationtoolversion="1.0" datatype="plaintext" segtype="sentence" adminlang="en" srclang="en" o-tmf="undefined"/>\n` +
      `  <body>\n` +
      tus.join('\n') + '\n' +
      `  </body>\n` +
      `</tmx>`;
  };

  const handleExportXLIFF = () => {
    if (!state) return;
    const entriesToExport = isFilterActive ? filteredEntries : state.entries;
    const xliff = buildXliff(entriesToExport, state.translations);
    const blob = new Blob([xliff], { type: 'application/xliff+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const suffix = isFilterActive ? `_${filterLabel}` : '';
    a.download = `translations${suffix}_${new Date().toISOString().slice(0, 10)}.xlf`;
    a.click();
    URL.revokeObjectURL(url);
    setLastSaved(`✅ تم تصدير ${entriesToExport.length} نص كملف XLIFF`);
    setTimeout(() => setLastSaved(""), 4000);
  };

  const handleExportTMX = () => {
    if (!state) return;
    const entriesToExport = isFilterActive ? filteredEntries : state.entries;
    const tmx = buildTmx(entriesToExport, state.translations);
    const translatedCount = entriesToExport.filter(e => {
      const t = state.translations[`${e.msbtFile}:${e.index}`]?.trim();
      return t && t !== e.original;
    }).length;
    const blob = new Blob([tmx], { type: 'application/x-tmx+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const suffix = isFilterActive ? `_${filterLabel}` : '';
    a.download = `translation-memory${suffix}_${new Date().toISOString().slice(0, 10)}.tmx`;
    a.click();
    URL.revokeObjectURL(url);
    setLastSaved(`✅ تم تصدير ${translatedCount} زوج ترجمة كملف TMX`);
    setTimeout(() => setLastSaved(""), 4000);
  };

  /** Import XLIFF file and extract target translations */
  const handleImportXLIFF = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.xlf,.xliff,.sdlxliff,application/xliff+xml';
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      try {
        const text = await file.text();
        const parser = new DOMParser();
        const doc = parser.parseFromString(text, 'text/xml');
        const parseError = doc.querySelector('parsererror');
        if (parseError) { alert('ملف XLIFF غير صالح'); return; }

        const units = doc.querySelectorAll('trans-unit');
        const updates: Record<string, string> = {};
        const allowedKeys = isFilterActive && filteredEntries.length < (state?.entries.length || 0)
          ? new Set(filteredEntries.map(e => `${e.msbtFile}:${e.index}`))
          : null;

        units.forEach(unit => {
          const id = unit.getAttribute('id') || '';
          const target = unit.querySelector('target');
          if (!id || !target?.textContent?.trim()) return;
          if (allowedKeys && !allowedKeys.has(id)) return;
          updates[id] = normalizeArabicPresentationForms(target.textContent.trim());
        });

        if (Object.keys(updates).length === 0) { alert('لم يتم العثور على ترجمات في ملف XLIFF'); return; }
        setState(prev => prev ? { ...prev, translations: { ...prev.translations, ...updates } } : null);
        setLastSaved(`✅ تم استيراد ${Object.keys(updates).length} ترجمة من XLIFF — ${file.name}`);
        setTimeout(() => setLastSaved(""), 4000);
      } catch (err) {
        console.error('XLIFF import error:', err);
        alert(`خطأ في قراءة ملف XLIFF\n\n${err instanceof Error ? err.message : err}`);
      }
    };
    input.click();
  };

  /** Compute bigram similarity between two strings (0..1) */
  const bigramSimilarity = (a: string, b: string): number => {
    const normalize = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim();
    const na = normalize(a);
    const nb = normalize(b);
    if (na === nb) return 1;
    if (na.length < 2 || nb.length < 2) return 0;
    const getBigrams = (s: string): Map<string, number> => {
      const map = new Map<string, number>();
      for (let i = 0; i < s.length - 1; i++) {
        const bg = s.slice(i, i + 2);
        map.set(bg, (map.get(bg) || 0) + 1);
      }
      return map;
    };
    const bigramsA = getBigrams(na);
    const bigramsB = getBigrams(nb);
    let intersection = 0;
    for (const [bg, count] of bigramsA) {
      intersection += Math.min(count, bigramsB.get(bg) || 0);
    }
    const totalA = na.length - 1;
    const totalB = nb.length - 1;
    return (2 * intersection) / (totalA + totalB);
  };

  /** Import TMX file and match translations by tuid, source text, or fuzzy match */
  const handleImportTMX = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.tmx,application/x-tmx+xml';
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      try {
        const text = await file.text();
        const parser = new DOMParser();
        const doc = parser.parseFromString(text, 'text/xml');
        const parseError = doc.querySelector('parsererror');
        if (parseError) { alert('ملف TMX غير صالح'); return; }

        const sourceToArabic = new Map<string, string>();
        const tuidToArabic = new Map<string, string>();
        const tus = doc.querySelectorAll('tu');

        tus.forEach(tu => {
          const tuid = tu.getAttribute('tuid') || '';
          const tuvs = tu.querySelectorAll('tuv');
          let srcText = '';
          let arText = '';
          tuvs.forEach(tuv => {
            const lang = (tuv.getAttribute('xml:lang') || tuv.getAttribute('lang') || '').toLowerCase();
            const seg = tuv.querySelector('seg');
            if (!seg?.textContent) return;
            if (lang.startsWith('en')) srcText = seg.textContent.trim();
            if (lang.startsWith('ar')) arText = seg.textContent.trim();
          });
          if (arText) {
            if (tuid) tuidToArabic.set(tuid, arText);
            if (srcText) sourceToArabic.set(srcText, arText);
          }
        });

        if (tuidToArabic.size === 0 && sourceToArabic.size === 0) {
          alert('لم يتم العثور على ترجمات عربية في ملف TMX');
          return;
        }

        const allowedKeys = isFilterActive && filteredEntries.length < (state?.entries.length || 0)
          ? new Set(filteredEntries.map(e => `${e.msbtFile}:${e.index}`))
          : null;

        const FUZZY_THRESHOLD = 0.6; // minimum similarity for fuzzy match
        const updates: Record<string, string> = {};
        const fuzzyMatches: Record<string, number> = {}; // key → similarity score
        const entriesToCheck = isFilterActive ? filteredEntries : (state?.entries || []);
        const sourceTexts = Array.from(sourceToArabic.keys());

        let exactCount = 0;
        let fuzzyCount = 0;

        for (const entry of entriesToCheck) {
          const key = `${entry.msbtFile}:${entry.index}`;
          if (allowedKeys && !allowedKeys.has(key)) continue;

          // Priority 1: match by tuid (exact key match)
          if (tuidToArabic.has(key)) {
            updates[key] = normalizeArabicPresentationForms(tuidToArabic.get(key)!);
            exactCount++;
            continue;
          }
          // Priority 2: match by exact source text
          if (sourceToArabic.has(entry.original)) {
            updates[key] = normalizeArabicPresentationForms(sourceToArabic.get(entry.original)!);
            exactCount++;
            continue;
          }
          // Priority 3: fuzzy match by source text similarity
          let bestScore = 0;
          let bestTranslation = '';
          for (const src of sourceTexts) {
            // Skip very different lengths (optimization)
            const lenRatio = Math.min(entry.original.length, src.length) / Math.max(entry.original.length, src.length);
            if (lenRatio < 0.5) continue;
            const score = bigramSimilarity(entry.original, src);
            if (score > bestScore) {
              bestScore = score;
              bestTranslation = sourceToArabic.get(src)!;
            }
          }
          if (bestScore >= FUZZY_THRESHOLD) {
            updates[key] = normalizeArabicPresentationForms(bestTranslation);
            fuzzyMatches[key] = Math.round(bestScore * 100);
            fuzzyCount++;
          }
        }

        if (Object.keys(updates).length === 0) {
          alert(`لم يتم مطابقة أي ترجمة.\n\nالملف يحتوي ${tuidToArabic.size + sourceToArabic.size} زوج ترجمة لكن لم يتطابق أي منها مع النصوص الحالية.`);
          return;
        }

        // If there are fuzzy matches, ask for confirmation
        if (fuzzyCount > 0) {
          const sampleKeys = Object.keys(fuzzyMatches).slice(0, 3);
          const entryMap = new Map((state?.entries || []).map(e => [`${e.msbtFile}:${e.index}`, e]));
          const samples = sampleKeys.map(k => {
            const e = entryMap.get(k);
            return `• "${(e?.original || k).slice(0, 50)}..." → ${fuzzyMatches[k]}% تشابه`;
          }).join('\n');
          const confirmMsg = `تم العثور على:\n• ${exactCount} مطابقة تامة\n• ${fuzzyCount} مطابقة جزئية\n\nأمثلة على المطابقة الجزئية:\n${samples}\n\nهل تريد تطبيق المطابقات الجزئية أيضاً؟`;
          if (!confirm(confirmMsg)) {
            // Remove fuzzy matches, keep only exact
            for (const k of Object.keys(fuzzyMatches)) {
              delete updates[k];
            }
            fuzzyCount = 0;
          }
        }

        if (Object.keys(updates).length === 0) {
          alert('لم يتم تطبيق أي ترجمة بعد إلغاء المطابقات الجزئية.');
          return;
        }

        setState(prev => {
          if (!prev) return null;
          const newFuzzy = { ...(prev.fuzzyScores || {}), ...fuzzyMatches };
          return { ...prev, translations: { ...prev.translations, ...updates }, fuzzyScores: newFuzzy };
        });
        const totalPairs = tuidToArabic.size + sourceToArabic.size;
        const fuzzyNote = fuzzyCount > 0 ? ` (${fuzzyCount} جزئية)` : '';
        setLastSaved(`✅ تم استيراد ${Object.keys(updates).length} ترجمة من TMX${fuzzyNote} (${totalPairs} زوج في الملف) — ${file.name}`);
        setTimeout(() => setLastSaved(""), 5000);
      } catch (err) {
        console.error('TMX import error:', err);
        alert(`خطأ في قراءة ملف TMX\n\n${err instanceof Error ? err.message : err}`);
      }
    };
    input.click();
  };

  /** Convert legacy sequential keys (bdat-bin:file.bdat:N) to new structural keys */
  const convertLegacyKeys = (imported: Record<string, string>, entries: ExtractedEntry[]): { converted: Record<string, string>; convertedCount: number; skippedCount: number } => {
    // Group entries by source filename
    const entriesByFile: Record<string, ExtractedEntry[]> = {};
    for (const entry of entries) {
      // Extract filename from the structural key: "bdat-bin:FILE.bdat:Table:row:col:0"
      const parts = entry.msbtFile.split(':');
      const filename = parts.length >= 2 ? parts[1] : entry.msbtFile;
      if (!entriesByFile[filename]) entriesByFile[filename] = [];
      entriesByFile[filename].push(entry);
    }

    const converted: Record<string, string> = {};
    let convertedCount = 0;
    let skippedCount = 0;

    for (const [key, value] of Object.entries(imported)) {
      const parts = key.split(':');
      // Legacy key pattern: "bdat-bin:filename.bdat:NUMBER" (3 parts, last is integer)
      if (parts.length === 3 && !isNaN(parseInt(parts[2], 10))) {
        const filename = parts[1];
        const index = parseInt(parts[2], 10);
        const fileEntries = entriesByFile[filename];
        if (fileEntries && index < fileEntries.length) {
          const entry = fileEntries[index];
          const newKey = `${entry.msbtFile}:${entry.index}`;
          converted[newKey] = value;
          convertedCount++;
        } else {
          skippedCount++;
        }
      } else {
        // Not a legacy key — pass through as-is
        converted[key] = value;
      }
    }

    return { converted, convertedCount, skippedCount };
  };

  /** Import old-format JSON with legacy sequential keys */
  const handleImportLegacyJson = () => {
    if (!state || state.entries.length === 0) {
      alert('⚠️ لا توجد مدخلات محملة! ارفع ملفات BDAT أولاً من صفحة المعالجة.');
      return;
    }
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,application/json,text/plain,.txt,*/*';
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      try {
        const rawText = (await file.text()).trim();
        const repaired = repairJson(rawText);
        const imported = repaired.parsed;
        const totalInFile = Object.keys(imported).length;
        if (totalInFile === 0) {
          alert('⚠️ الملف فارغ أو لا يحتوي على ترجمات صالحة.');
          return;
        }

        const { converted, convertedCount, skippedCount } = convertLegacyKeys(imported, state.entries);

        if (convertedCount === 0) {
          alert(`⚠️ لم يتم تحويل أي مفتاح قديم!\n\nتأكد أن الملف يستخدم التنسيق القديم مثل:\n"bdat-bin:filename.bdat:0": "ترجمة"\n\nوأن ملفات BDAT المرفوعة تطابق الملف المستورد.`);
          return;
        }

        // Clean presentation forms
        const cleaned: Record<string, string> = {};
        for (const [key, value] of Object.entries(converted)) {
          cleaned[key] = normalizeArabicPresentationForms(value);
        }

        setState(prev => {
          if (!prev) return null;
          return { ...prev, translations: { ...prev.translations, ...cleaned } };
        });

        let msg = `✅ تم تحويل واستيراد ${convertedCount} ترجمة من التنسيق القديم — ${file.name}`;
        if (skippedCount > 0) msg += ` (${skippedCount} مفتاح لم يُطابق)`;
        if (repaired.wasTruncated) msg += ` ⚠️ ملف مقطوع`;
        setLastSaved(msg);
        setTimeout(() => setLastSaved(""), 5000);
      } catch (err) {
        console.error('Legacy JSON import error:', err);
        alert(`ملف JSON غير صالح\n\nالخطأ: ${err instanceof Error ? err.message : err}`);
      }
    };
    input.click();
  };

  /** Bundled translations count */
  const [bundledCount, setBundledCount] = useState(0);
  useEffect(() => {
    fetchBundledTranslations()
      .then(data => setBundledCount(Object.keys(data).length))
      .catch(() => {});
  }, []);

  /** Load bundled translations from the app's public folder */
  const [loadingBundled, setLoadingBundled] = useState(false);
  const handleLoadBundledTranslations = useCallback(async () => {
    setLoadingBundled(true);
    try {
      const bundled = await fetchBundledTranslations();
      const rawText = JSON.stringify(bundled);
      await processJsonImport(rawText, 'الترجمات المدمجة 📦');
    } catch (err) {
      alert(`❌ فشل تحميل الترجمات المدمجة: ${err instanceof Error ? err.message : err}`);
    } finally {
      setLoadingBundled(false);
    }
  }, [processJsonImport]);

  /** Save current translations back to bundled format & download */
  const [savingBundled, setSavingBundled] = useState(false);
  const handleSaveBundledTranslations = useCallback(async () => {
    setSavingBundled(true);
    try {
      let bundled: Record<string, any> = {};
      try {
        bundled = await fetchBundledTranslations();
      } catch { /* start fresh */ }

      for (const entry of (state?.entries || [])) {
        const key = `${entry.msbtFile}:${entry.index}`;
        const translation = state?.translations[key];
        if (translation) {
          bundled[key] = translation;
        }
      }

      // Upload to cloud
      const uploadResult = await uploadBundledTranslations(bundled);
      if (!uploadResult.success) {
        console.warn('Cloud upload failed:', uploadResult.error);
      }

      // Also download locally
      const blob = new Blob([JSON.stringify(bundled, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `bundled-translations-updated.json`;
      a.click();
      URL.revokeObjectURL(url);
      setBundledCount(Object.keys(bundled).length);
      alert(`✅ تم حفظ ${Object.keys(bundled).length} ترجمة${uploadResult.success ? ' ورفعها للسحابة ☁️' : ' (محلياً فقط)'}`);
      // Auto-merge to bundled if enabled
      if (autoMergeToBundledRef.current) {
        setTimeout(() => handleMergeToBundledRef.current?.(), 500);
      }
    } catch (err) {
      alert(`❌ فشل حفظ الترجمات: ${err instanceof Error ? err.message : err}`);
    } finally {
      setSavingBundled(false);
    }
  }, [state?.entries, state?.translations]);

  /** Download the current bundled translations file as-is */
  const handleDownloadBundled = useCallback(async () => {
    try {
      const bundled = await fetchBundledTranslations();
      const blob = new Blob([JSON.stringify(bundled, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'bundled-translations.json';
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      alert(`❌ فشل التحميل: ${err instanceof Error ? err.message : err}`);
    }
  }, []);

  /** ─── Linguistic cleanup for bundled translations ─── */
  const normalizeArabicText = (text: string): string => {
    let t = text;
    // Normalize alef variants → ا
    t = t.replace(/[إأآٱ]/g, 'ا');
    // Remove tatweel
    t = t.replace(/ـ/g, '');
    // Fix duplicate alefs: "اال" → "الا" (swap alef before ال), then remove remaining duplicates
    t = t.replace(/ا(ال)/g, '$1ا');
    t = t.replace(/ا{2,}/g, 'ا');
    // Remove extra spaces
    t = t.replace(/\s{2,}/g, ' ').trim();
    // Remove stray escape sequences
    t = t.replace(/\\n/g, ' ').replace(/\\r/g, '').replace(/\s{2,}/g, ' ').trim();
    return t;
  };

  const [cleaningBundled, setCleaningBundled] = useState(false);
  const handleCleanBundledTranslations = useCallback(async () => {
    setCleaningBundled(true);
    try {
      const bundled: Record<string, string> = await fetchBundledTranslations();

      let cleaned = 0;
      const result: Record<string, string> = {};
      for (const [key, value] of Object.entries(bundled)) {
        const normalized = normalizeArabicText(value);
        if (normalized !== value) cleaned++;
        result[key] = normalized;
      }

      if (cleaned === 0) {
        alert('✅ الترجمات نظيفة بالفعل — لا تغييرات مطلوبة');
        return;
      }

      // Upload cleaned version to cloud
      const uploadResult = await uploadBundledTranslations(result);

      const blob = new Blob([JSON.stringify(result, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'bundled-translations-cleaned.json';
      a.click();
      URL.revokeObjectURL(url);
      alert(`✅ تم تنظيف ${cleaned} ترجمة من أصل ${Object.keys(bundled).length}${uploadResult.success ? ' ☁️ تم الرفع للسحابة' : ''}\n\n• توحيد الألف والهمزات\n• إزالة المسافات الزائدة\n• إزالة الألف المكررة\n• تنظيف رموز الهروب`);
    } catch (err) {
      alert(`❌ فشل التنظيف: ${err instanceof Error ? err.message : err}`);
    } finally {
      setCleaningBundled(false);
    }
  }, []);

  /** ─── Quality check for bundled translations ─── */
  const [bundledQualityReport, setBundledQualityReport] = useState<{
    total: number;
    shortTexts: string[];
    mixedLanguage: string[];
    byteLimitExceeded: string[];
    emptyValues: string[];
  } | null>(null);
  const [checkingBundledQuality, setCheckingBundledQuality] = useState(false);

  const handleCheckBundledQuality = useCallback(async () => {
    setCheckingBundledQuality(true);
    try {
      const bundled: Record<string, string> = await fetchBundledTranslations();
      const encoder = new TextEncoder();

      const shortTexts: string[] = [];
      const mixedLanguage: string[] = [];
      const byteLimitExceeded: string[] = [];
      const emptyValues: string[] = [];

      for (const [key, value] of Object.entries(bundled)) {
        if (!value || !value.trim()) { emptyValues.push(key); continue; }
        if (value.trim().length < 3) shortTexts.push(key);
        const hasAr = /[\u0600-\u06FF]/.test(value);
        const hasLatin = /[a-zA-Z]{2,}/.test(value);
        if (hasAr && hasLatin) mixedLanguage.push(key);
        if (encoder.encode(value).length > 255) byteLimitExceeded.push(key);
      }

      const report = { total: Object.keys(bundled).length, shortTexts, mixedLanguage, byteLimitExceeded, emptyValues };
      setBundledQualityReport(report);

      const issues = shortTexts.length + mixedLanguage.length + byteLimitExceeded.length + emptyValues.length;

      // Build text report
      const formatSection = (title: string, keys: string[]) => {
        if (keys.length === 0) return '';
        return `\n━━ ${title} (${keys.length}) ━━\n` + keys.map((k, i) => `  ${i + 1}. ${k} → ${bundled[k]?.substring(0, 80) || '(فارغ)'}`).join('\n') + '\n';
      };

      const textReport =
        `📊 تقرير فحص جودة الترجمات المدمجة\n` +
        `التاريخ: ${new Date().toLocaleString('ar-SA')}\n` +
        `إجمالي الترجمات: ${report.total}\n` +
        `إجمالي المشاكل: ${issues}\n` +
        formatSection('نصوص فارغة', emptyValues) +
        formatSection('نصوص قصيرة جداً (< 3 حروف)', shortTexts) +
        formatSection('لغة مختلطة (عربي + إنجليزي)', mixedLanguage) +
        formatSection('تجاوز حد البايت (> 255)', byteLimitExceeded);

      if (issues === 0) {
        alert(`✅ فحص ${report.total} ترجمة — لم يتم العثور على مشاكل!`);
      } else {
        // Auto-download the report
        const blob = new Blob([textReport], { type: 'text/plain;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'bundled-quality-report.txt';
        a.click();
        URL.revokeObjectURL(url);

        alert(
          `📊 نتائج فحص الجودة (${report.total} ترجمة):\n\n` +
          `• نصوص فارغة: ${emptyValues.length}\n` +
          `• نصوص قصيرة جداً: ${shortTexts.length}\n` +
          `• لغة مختلطة: ${mixedLanguage.length}\n` +
          `• تجاوز حد البايت: ${byteLimitExceeded.length}\n\n` +
          `📄 تم تحميل التقرير التفصيلي تلقائياً`
        );
      }
    } catch (err) {
      alert(`❌ فشل الفحص: ${err instanceof Error ? err.message : err}`);
    } finally {
      setCheckingBundledQuality(false);
    }
  }, []);

  /** ─── Conflict detection: same English → different Arabic ─── */
  const [conflictDetectionRunning, setConflictDetectionRunning] = useState(false);
  const [bundledConflicts, setBundledConflicts] = useState<
    { english: string; variants: { key: string; arabic: string }[] }[] | null
  >(null);

  const handleDetectBundledConflicts = useCallback(async () => {
    if (!state?.entries?.length) {
      alert('⚠️ يجب رفع ملف BDAT أولاً لمعرفة النصوص الإنجليزية الأصلية');
      return;
    }
    setConflictDetectionRunning(true);
    try {
      const bundled: Record<string, string> = await fetchBundledTranslations();

      // Build english→key map from loaded entries
      const englishMap = new Map<string, { key: string; arabic: string }[]>();
      for (const entry of (state?.entries || [])) {
        const key = `${entry.msbtFile}:${entry.index}`;
        const arabic = bundled[key];
        if (!arabic?.trim()) continue;
        const eng = entry.original.trim();
        if (!eng) continue;
        const arr = englishMap.get(eng) || [];
        arr.push({ key, arabic: arabic.trim() });
        englishMap.set(eng, arr);
      }

      // Find conflicts: same English with ≥2 different Arabic translations
      const conflicts: { english: string; variants: { key: string; arabic: string }[] }[] = [];
      for (const [eng, entries] of englishMap) {
        const uniqueArabic = new Set(entries.map(e => e.arabic));
        if (uniqueArabic.size > 1) {
          conflicts.push({ english: eng, variants: entries });
        }
      }

      setBundledConflicts(conflicts);

      if (conflicts.length === 0) {
        alert(`✅ لا توجد ترجمات متضاربة — كل نص إنجليزي له ترجمة واحدة موحدة`);
      } else {
        // Generate and download report
        let report = `📊 تقرير الترجمات المتضاربة\nالتاريخ: ${new Date().toLocaleString('ar-SA')}\nعدد التضاربات: ${conflicts.length}\n\n`;
        for (const c of conflicts) {
          report += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
          report += `🔤 الإنجليزي: ${c.english.substring(0, 100)}\n`;
          const grouped = new Map<string, string[]>();
          for (const v of c.variants) {
            const arr = grouped.get(v.arabic) || [];
            arr.push(v.key);
            grouped.set(v.arabic, arr);
          }
          let i = 1;
          for (const [arabic, keys] of grouped) {
            report += `  الترجمة ${i++}: "${arabic.substring(0, 80)}" (${keys.length} مدخل)\n`;
            for (const k of keys.slice(0, 5)) report += `    → ${k}\n`;
            if (keys.length > 5) report += `    ... و${keys.length - 5} مدخلات أخرى\n`;
          }
          report += `\n`;
        }

        const blob = new Blob([report], { type: 'text/plain;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'bundled-conflicts-report.txt';
        a.click();
        URL.revokeObjectURL(url);

        alert(
          `⚠️ تم العثور على ${conflicts.length} تضارب في الترجمات!\n\n` +
          `📄 تم تحميل التقرير التفصيلي\n\n` +
          `يمكنك الضغط على "توحيد الترجمات" لاختيار الترجمة الأكثر شيوعاً تلقائياً`
        );
      }
    } catch (err) {
      alert(`❌ فشل الفحص: ${err instanceof Error ? err.message : err}`);
    } finally {
      setConflictDetectionRunning(false);
    }
  }, [state?.entries]);

  /** Unify conflicts: pick the most common Arabic translation for each English text */
  const [unifyingConflicts, setUnifyingConflicts] = useState(false);
  const handleUnifyBundledConflicts = useCallback(async () => {
    if (!bundledConflicts?.length) return;
    setUnifyingConflicts(true);
    try {
      const bundled: Record<string, string> = await fetchBundledTranslations();

      let unified = 0;
      for (const conflict of bundledConflicts) {
        // Count occurrences of each Arabic variant
        const freq = new Map<string, number>();
        for (const v of conflict.variants) {
          freq.set(v.arabic, (freq.get(v.arabic) || 0) + 1);
        }
        // Pick the most common one
        let best = '', bestCount = 0;
        for (const [arabic, count] of freq) {
          if (count > bestCount) { best = arabic; bestCount = count; }
        }
        // Apply to all keys
        for (const v of conflict.variants) {
          if (bundled[v.key] && bundled[v.key] !== best) {
            bundled[v.key] = best;
            unified++;
          }
        }
      }

      // Upload unified to cloud
      const uploadResult = await uploadBundledTranslations(bundled);

      const blob = new Blob([JSON.stringify(bundled, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'bundled-translations-unified.json';
      a.click();
      URL.revokeObjectURL(url);
      setBundledConflicts(null);
      alert(`✅ تم توحيد ${unified} ترجمة متضاربة${uploadResult.success ? ' ☁️ تم الرفع للسحابة' : ''}`);
    } catch (err) {
      alert(`❌ فشل التوحيد: ${err instanceof Error ? err.message : err}`);
    } finally {
      setUnifyingConflicts(false);
    }
  }, [bundledConflicts]);

  /** ─── Merge editor translations into bundled ─── */
  const [mergeToBundledItems, setMergeToBundledItems] = useState<
    import("@/components/editor/MergeToBundledPanel").MergeToBundledItem[] | null
  >(null);
  const [mergingToBundled, setMergingToBundled] = useState(false);
  const [autoMergeToBundled, setAutoMergeToBundled] = useState(false);
  const autoMergeToBundledRef = useRef(false);
  autoMergeToBundledRef.current = autoMergeToBundled;

  const handleMergeToBundledRef = useRef<(() => void) | null>(null);

  const handleMergeToBundled = useCallback(async () => {
    if (!state) return;
    setMergingToBundled(true);
    try {
      const bundled: Record<string, string> = await fetchBundledTranslations();

      const diffs: import("@/components/editor/MergeToBundledPanel").MergeToBundledItem[] = [];
      for (const entry of (state.entries || [])) {
        const key = `${entry.msbtFile}:${entry.index}`;
        const editorVal = state.translations[key]?.trim();
        if (!editorVal) continue;
        const bundledVal = (bundled[key] || '').trim();
        if (editorVal !== bundledVal) {
          diffs.push({ key, bundledValue: bundledVal, editorValue: editorVal, status: 'pending' });
        }
      }

      if (diffs.length === 0) {
        setLastSaved("✅ لا توجد تعديلات مختلفة عن الترجمات المدمجة");
        setTimeout(() => setLastSaved(""), 4000);
      } else {
        setMergeToBundledItems(diffs);
      }
    } catch (err) {
      alert(`❌ فشل المقارنة: ${err instanceof Error ? err.message : err}`);
    } finally {
      setMergingToBundled(false);
    }
  }, [state, setLastSaved]);
  handleMergeToBundledRef.current = handleMergeToBundled;

  const handleMergeToBundledAccept = useCallback((key: string) => {
    setMergeToBundledItems(prev => prev ? prev.map(i => i.key === key ? { ...i, status: 'accepted' as const } : i) : null);
  }, []);

  const handleMergeToBundledReject = useCallback((key: string) => {
    setMergeToBundledItems(prev => prev ? prev.map(i => i.key === key ? { ...i, status: 'rejected' as const } : i) : null);
  }, []);

  const handleMergeToBundledAcceptAll = useCallback(() => {
    setMergeToBundledItems(prev => prev ? prev.map(i => i.status === 'pending' ? { ...i, status: 'accepted' as const } : i) : null);
  }, []);

  const handleMergeToBundledRejectAll = useCallback(() => {
    setMergeToBundledItems(prev => prev ? prev.map(i => i.status === 'pending' ? { ...i, status: 'rejected' as const } : i) : null);
  }, []);

  const handleMergeToBundledDownload = useCallback(async () => {
    if (!mergeToBundledItems) return;
    try {
      const bundled: Record<string, string> = await fetchBundledTranslations();

      const accepted = mergeToBundledItems.filter(i => i.status === 'accepted');
      for (const item of accepted) {
        bundled[item.key] = item.editorValue;
      }

      // Upload merged to cloud
      const uploadResult = await uploadBundledTranslations(bundled);

      const blob = new Blob([JSON.stringify(bundled, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'bundled-translations-merged.json';
      a.click();
      URL.revokeObjectURL(url);
      setBundledCount(Object.keys(bundled).length);
      setMergeToBundledItems(null);
      setLastSaved(`✅ تم دمج ${accepted.length} تعديل${uploadResult.success ? ' ☁️ ورفعها للسحابة' : ''}`);
      setTimeout(() => setLastSaved(""), 4000);
    } catch (err) {
      alert(`❌ فشل التحميل: ${err instanceof Error ? err.message : err}`);
    }
  }, [mergeToBundledItems, setLastSaved]);

  /** ─── AI Proofreading for bundled translations ─── */
  const [proofreadingBundled, setProofreadingBundled] = useState(false);
  const handleProofreadBundled = useCallback(async () => {
    setProofreadingBundled(true);
    try {
      const bundled: Record<string, string> = await fetchBundledTranslations();

      // Filter short Arabic translations (≤ 80 chars) that actually have Arabic content
      const candidates = Object.entries(bundled)
        .filter(([_, v]) => {
          if (!v?.trim() || v.trim().length > 80) return false;
          return /[\u0600-\u06FF]/.test(v);
        })
        .map(([key, arabic]) => ({ key, arabic }));

      if (candidates.length === 0) {
        alert('✅ لا توجد ترجمات قصيرة تحتاج تدقيق');
        return;
      }

      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

      const fnResp = await fetch(`${supabaseUrl}/functions/v1/proofread-bundled`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${supabaseKey}`,
        },
        body: JSON.stringify({ entries: candidates }),
      });

      if (!fnResp.ok) {
        const errData = await fnResp.json().catch(() => ({}));
        throw new Error(errData.error || `HTTP ${fnResp.status}`);
      }

      const { results, total } = await fnResp.json();

      if (!results || results.length === 0) {
        alert(`✅ تم فحص ${total} ترجمة — لم يتم العثور على أخطاء إملائية`);
        return;
      }

      // Generate report
      let report = `📝 تقرير التصحيح الإملائي بالذكاء الاصطناعي\n`;
      report += `التاريخ: ${new Date().toLocaleString('ar-SA')}\n`;
      report += `الترجمات المفحوصة: ${total}\n`;
      report += `التصحيحات: ${results.length}\n\n`;

      for (const r of results) {
        report += `━━━━━━━━━━━━━━━━━━━━\n`;
        report += `🔑 ${r.key}\n`;
        report += `  قبل: "${r.original}"\n`;
        report += `  بعد: "${r.corrected}"\n`;
      }

      // Download report
      const reportBlob = new Blob([report], { type: 'text/plain;charset=utf-8' });
      const reportUrl = URL.createObjectURL(reportBlob);
      const reportA = document.createElement('a');
      reportA.href = reportUrl;
      reportA.download = 'bundled-proofread-report.txt';
      reportA.click();
      URL.revokeObjectURL(reportUrl);

      // Apply corrections and download corrected file
      const corrected = { ...bundled };
      for (const r of results) {
        corrected[r.key] = r.corrected;
      }

      // Upload proofread version to cloud
      const uploadResult = await uploadBundledTranslations(corrected);

      const corrBlob = new Blob([JSON.stringify(corrected, null, 2)], { type: 'application/json' });
      const corrUrl = URL.createObjectURL(corrBlob);
      const corrA = document.createElement('a');
      corrA.href = corrUrl;
      corrA.download = 'bundled-translations-proofread.json';
      corrA.click();
      URL.revokeObjectURL(corrUrl);

      setBundledCount(Object.keys(corrected).length);
      alert(
        `📝 تم التصحيح الإملائي:\n\n` +
        `• الترجمات المفحوصة: ${total}\n` +
        `• التصحيحات: ${results.length}\n\n` +
        `📄 تم تحميل التقرير والملف المصحح${uploadResult.success ? ' ☁️ ورفعها للسحابة' : ''}`
      );
    } catch (err) {
      alert(`❌ فشل التصحيح: ${err instanceof Error ? err.message : err}`);
    } finally {
      setProofreadingBundled(false);
    }
  }, []);

  /** Quick export: export current page's entries (respects active filter) as JSON */
  const handleExportCurrentPageEnglish = (currentPage: number) => {
    if (!state) return;
    const PAGE_SIZE = 50;
    const fromIdx = currentPage * PAGE_SIZE;
    const toIdx = Math.min((currentPage + 1) * PAGE_SIZE, filteredEntries.length);
    const pageEntries = filteredEntries.slice(fromIdx, toIdx);
    if (pageEntries.length === 0) return;
    const obj: Record<string, string> = {};
    for (const entry of pageEntries) {
      obj[`${entry.msbtFile}:${entry.index}`] = entry.original;
    }
    const data = JSON.stringify(obj, null, 2);
    const blob = new Blob([data], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `english-page${currentPage + 1}_${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    setLastSaved(`✅ تم تصدير ${pageEntries.length} نص من الصفحة ${currentPage + 1}`);
    setTimeout(() => setLastSaved(""), 3000);
  };

  return {
    handleExportTranslations,
    handleExportEnglishOnly,
    handleExportEnglishOnlyJson,
    getUntranslatedCount,
    getEntriesGroupedCount: (scope: 'untranslated' | 'all', startPage?: number, endPage?: number) => getEntriesGrouped(scope, startPage, endPage).totalCount,
    absoluteTotalEntries: state ? state.entries.length : 0,
    absoluteTotalPages: state ? Math.ceil(state.entries.length / 50) : 0,
    handleExportCurrentPageEnglish,
    handleImportTranslations,
    handleDropImport,
    processJsonImport,
    handleExportCSV,
    handleImportCSV,
    handleExportAllEnglishJson,
    handleImportExternalJson,
    handleExportXLIFF,
    handleExportTMX,
    handleImportXLIFF,
    handleImportTMX,
    handleImportLegacyJson,
    normalizeArabicPresentationForms,
    isFilterActive,
    filterLabel,
    // Conflict dialog
    importConflicts,
    handleConflictConfirm,
    handleConflictCancel,
    // Bundled translations
    handleLoadBundledTranslations,
    loadingBundled,
    handleSaveBundledTranslations,
    savingBundled,
    handleDownloadBundled,
    bundledCount,
    // Bundled quality & cleanup
    handleCleanBundledTranslations,
    cleaningBundled,
    handleCheckBundledQuality,
    checkingBundledQuality,
    bundledQualityReport,
    // Bundled conflict detection
    handleDetectBundledConflicts,
    conflictDetectionRunning,
    bundledConflicts,
    handleUnifyBundledConflicts,
    unifyingConflicts,
    // AI proofreading
    handleProofreadBundled,
    proofreadingBundled,
    // Merge to bundled
    mergeToBundledItems,
    mergingToBundled,
    handleMergeToBundled,
    handleMergeToBundledAccept,
    handleMergeToBundledReject,
    handleMergeToBundledAcceptAll,
    handleMergeToBundledRejectAll,
    handleMergeToBundledDownload,
    setMergeToBundledItems,
    // Auto-merge toggle
    autoMergeToBundled,
    setAutoMergeToBundled,
  };
}
