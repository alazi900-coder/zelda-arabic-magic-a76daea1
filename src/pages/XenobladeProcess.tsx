import { useState, useCallback, useEffect, useRef } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Upload, FileText, ArrowRight, Loader2, CheckCircle2, Clock, Pencil, Database, Binary, Sparkles, Download, ChevronDown, ChevronRight, Shield, Tag, Settings2, FolderOpen } from "lucide-react";
import heroBg from "@/assets/xc3-hero-bg.jpg";
import { categorizeBdatTable, categorizeByTableName, categorizeByColumnName, categorizeByFilename, type ExtractedEntry } from "@/components/editor/types";
import type { BdatSchemaReport } from "@/lib/bdat-schema-inspector";
import { loadBdatSettings, saveBdatSettings, formatMarginPct } from "@/lib/bdat-settings";
import { getEdgeFunctionUrl, getSupabaseHeaders } from "@/lib/supabase-edge";

type ProcessingStage = "idle" | "uploading" | "extracting" | "done" | "error";

const stageLabels: Record<ProcessingStage, string> = {
  idle: "في انتظار رفع الملفات",
  uploading: "إرسال الملفات...",
  extracting: "استخراج النصوص...",
  done: "اكتمل بنجاح! ✨",
  error: "حدث خطأ",
};

const stageProgress: Record<ProcessingStage, number> = {
  idle: 0, uploading: 30, extracting: 70, done: 100, error: 0,
};

const XenobladeProcess = () => {
  const [msbtFiles, setMsbtFiles] = useState<File[]>([]);
  const [bdatFiles, setBdatFiles] = useState<File[]>([]);
  const [bdatBinaryFiles, setBdatBinaryFiles] = useState<File[]>([]);
  const [stage, setStage] = useState<ProcessingStage>("idle");
  const [logs, setLogs] = useState<string[]>([]);
  const [extracting, setExtracting] = useState(false);
  const [autoDetectedCount, setAutoDetectedCount] = useState(0);
  const [mergeMode, setMergeMode] = useState<"fresh" | "merge">("fresh");
  const [hasPreviousSession, setHasPreviousSession] = useState(false);
  // Schema Inspector state
  const [schemaReports, setSchemaReports] = useState<BdatSchemaReport[]>([]);
  const [schemaTab, setSchemaTab] = useState<"summary" | "tables">("summary");
  const [selectedTable, setSelectedTable] = useState<string | null>(null);
  const [samplesEnabled, setSamplesEnabled] = useState(false);
  const [dangerFilter, setDangerFilter] = useState<"all" | "critical" | "limited">("all");
  const [safetyMargin, setSafetyMargin] = useState<number>(() => loadBdatSettings().safetyMargin);
  const [arabicMultiplier, setArabicMultiplier] = useState<number>(() => loadBdatSettings().arabicMultiplier);
  const [showSettings, setShowSettings] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    (async () => {
      const { idbGet } = await import("@/lib/idb-storage");
      const existing = await idbGet<{ translations?: Record<string, string> }>("editorState");
      const game = await idbGet<string>("editorGame");
      const hasOriginals = await idbGet<Record<string, string>>("originalTexts");
      const hasTranslations = !!(existing?.translations && Object.keys(existing.translations).length > 0);
      const hasOriginalTexts = !!(hasOriginals && Object.keys(hasOriginals).length > 0);
      setHasPreviousSession(!!(game === "xenoblade" && (hasTranslations || hasOriginalTexts)));
    })();
  }, []);

  const addLog = (msg: string) => setLogs(prev => [...prev, `[${new Date().toLocaleTimeString("ar-SA")}] ${msg}`]);

  const [fileLoadProgress, setFileLoadProgress] = useState<{ current: number; total: number } | null>(null);

  const handleFileSelect = useCallback(async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const total = files.length;
    setFileLoadProgress({ current: 0, total });

    const newMsbt: File[] = [];
    const newBdat: File[] = [];
    const newBdatBin: File[] = [];

    const BATCH = 200;
    for (let start = 0; start < total; start += BATCH) {
      const end = Math.min(start + BATCH, total);
      for (let i = start; i < end; i++) {
        const f = files[i];
        const name = f.name.toLowerCase();
        if (name.endsWith('.msbt')) newMsbt.push(f);
        else if (name.endsWith('.json')) newBdat.push(f);
        else if (name.endsWith('.bdat')) newBdatBin.push(f);
      }
      setFileLoadProgress({ current: end, total });
      // Yield to UI thread
      await new Promise(r => setTimeout(r, 0));
    }

    if (newMsbt.length > 0) setMsbtFiles(prev => [...prev, ...newMsbt]);
    if (newBdat.length > 0) setBdatFiles(prev => [...prev, ...newBdat]);
    if (newBdatBin.length > 0) setBdatBinaryFiles(prev => [...prev, ...newBdatBin]);

    setFileLoadProgress(null);
    addLog(`📂 تم تحميل ${total} ملف (MSBT: ${newMsbt.length} | JSON: ${newBdat.length} | BDAT: ${newBdatBin.length})`);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    handleFileSelect(e.dataTransfer.files);
  }, [handleFileSelect]);

  const removeFile = (type: "msbt" | "bdat" | "bdat-bin", index: number) => {
    if (type === "msbt") setMsbtFiles(prev => prev.filter((_, i) => i !== index));
    else if (type === "bdat") setBdatFiles(prev => prev.filter((_, i) => i !== index));
    else setBdatBinaryFiles(prev => prev.filter((_, i) => i !== index));
  };

  const handleExtract = async () => {
    const totalFiles = msbtFiles.length + bdatFiles.length + bdatBinaryFiles.length;
    if (totalFiles === 0) return;
    setExtracting(true);
    setStage("uploading");
    setLogs([]);
    setSchemaReports([]);
    addLog("🚀 بدء استخراج النصوص...");
    addLog(`📄 MSBT: ${msbtFiles.length} | BDAT JSON: ${bdatFiles.length} | BDAT ثنائي: ${bdatBinaryFiles.length}`);

    try {
      // Process binary BDAT files locally in the browser
      let bdatBinaryEntries: { msbtFile: string; index: number; label: string; original: string; maxBytes: number; type: string; columnName?: string }[] = [];
      const bdatBinaryBuffers: Record<string, ArrayBuffer> = {};
      
      if (bdatBinaryFiles.length > 0) {
        addLog("🔧 معالجة ملفات BDAT الثنائية محلياً...");
        const { parseBdatFile, extractBdatStrings } = await import("@/lib/bdat-parser");
        const { unhashLabel } = await import("@/lib/bdat-hash-dictionary");
        const { inspectBdatSchema } = await import("@/lib/bdat-schema-inspector");
        const schemaReportsAccumulator: BdatSchemaReport[] = [];
        
        for (const file of bdatBinaryFiles) {
          try {
            const buffer = await file.arrayBuffer();
            bdatBinaryBuffers[file.name] = buffer;
            const data = new Uint8Array(buffer);
            addLog(`📂 حجم الملف: ${(data.length / 1024).toFixed(1)} KB — أول 4 بايت: ${String.fromCharCode(...data.slice(0, 4))}`);
            const bdatFile = parseBdatFile(data, unhashLabel);

            // 📊 Schema Inspector — يعمل على نفس BdatFile
            const schema = inspectBdatSchema(bdatFile, file.name, {
              include_samples: samplesEnabled,
              sample_mask_mode: samplesEnabled ? "prefix5" : "statsOnly",
              max_records_for_full_scan: 5000,
              sample_record_cap: 1000,
              safety_margin: safetyMargin,
            });
            schemaReportsAccumulator.push(schema);
            addLog(`📊 Schema: ${schema.table_count} جدول | ${schema.translatable_tables} قابلة للترجمة | ${schema.all_discovered_tags.length} وسم`);

            const strings = extractBdatStrings(bdatFile, file.name, safetyMargin);
            
            // تفاصيل إضافية للتشخيص — أنواع الأعمدة
            const totalStringCols = bdatFile.tables.reduce((sum, t) => sum + t.columns.filter(c => c.valueType === 7 || c.valueType === 11).length, 0);
            const totalMsgIdCols = bdatFile.tables.reduce((sum, t) => sum + t.columns.filter(c => c.valueType === 13).length, 0);
            const totalRows = bdatFile.tables.reduce((sum, t) => sum + t.rows.length, 0);
            addLog(`📦 ${file.name}: ${bdatFile.tables.length} جدول، ${totalRows} صف، ${totalStringCols} عمود String، ${totalMsgIdCols} عمود MessageId، ${strings.length} نص مستخرج`);
            
            // عرض تفاصيل كل جدول (أول 5)
            for (const t of bdatFile.tables.slice(0, 5)) {
              const colTypes = t.columns.map(c => `${c.name}(${c.valueType})`).join(', ');
              const strCols = t.columns.filter(c => c.valueType === 7 || c.valueType === 11);
              const sampleVals = strCols.length > 0 && t.rows.length > 0
                ? strCols.slice(0, 2).map(c => `${c.name}="${String(t.rows[0].values[c.name] || '').slice(0, 40)}"`).join(' | ')
                : '(لا توجد أعمدة نصية)';
              addLog(`  📋 ${t.name}: ${t.columns.length} عمود [${colTypes.slice(0, 120)}] | عيّنة: ${sampleVals}`);
            }
            if (bdatFile.tables.length > 5) addLog(`  ... و ${bdatFile.tables.length - 5} جدول آخر`);
            
            if (strings.length === 0 && bdatFile.tables.length > 0) {
              const tableNames = bdatFile.tables.slice(0, 5).map(t => t.name).join(', ');
              addLog(`ℹ️ أسماء الجداول: ${tableNames}${bdatFile.tables.length > 5 ? '...' : ''}`);
              addLog(`⚠️ لا توجد نصوص في هذا الملف — قد يحتوي فقط على بيانات رقمية أو أعمدة MessageId`);
            }

            // 🔍 Classification diagnostics (shown in UI)
            if (strings.length > 0) {
              const categoryMap: Record<string, number> = {};
              const sampleLabels: string[] = [];
              let stage1Count = 0;
              let stage2Count = 0;
              let stage3Count = 0;
              let otherCount = 0;
              for (let i = 0; i < Math.min(strings.length, 500); i++) {
                const s = strings[i];
                const label = `${s.tableName}[${s.rowIndex}].${s.columnName}`;
                const cat = categorizeBdatTable(label, file.name);
                categoryMap[cat] = (categoryMap[cat] || 0) + 1;

                // Track which stage classified this entry
                const tblMatch = label.match(/^(.+?)\[\d+\]/);
                const tbl = tblMatch ? tblMatch[1] : "";
                const colMatch = label.match(/\]\s*\.?\s*(.+)/);
                const col = colMatch ? colMatch[1] : "";
                if (categorizeByTableName(tbl)) {
                  stage1Count++;
                } else if (categorizeByColumnName(col)) {
                  stage2Count++;
                } else if (categorizeByFilename(file.name)) {
                  stage3Count++;
                } else {
                  otherCount++;
                }

                if (sampleLabels.length < 15 && cat === "other") {
                  sampleLabels.push(label);
                }
              }
              const sampled = Math.min(strings.length, 500);
              const catSummary = Object.entries(categoryMap)
                .sort((a, b) => b[1] - a[1])
                .map(([k, v]) => `${k}: ${v}`)
                .join(' | ');
              addLog(`📊 تصنيف ${file.name}: ${catSummary}`);
              addLog(`🏷️ مرحلة التصنيف (من ${sampled} نص): المرحلة ١ (اسم الجدول): ${stage1Count} | المرحلة ٢ (اسم العمود): ${stage2Count} | المرحلة ٣ (اسم الملف): ${stage3Count} | غير مصنّف: ${otherCount}`);
              const s1Pct = ((stage1Count / sampled) * 100).toFixed(1);
              const s2Pct = ((stage2Count / sampled) * 100).toFixed(1);
              const s3Pct = ((stage3Count / sampled) * 100).toFixed(1);
              const otherPct = ((otherCount / sampled) * 100).toFixed(1);
              addLog(`📈 النسب: المرحلة ١: ${s1Pct}% | المرحلة ٢: ${s2Pct}% | المرحلة ٣: ${s3Pct}% | أخرى: ${otherPct}%`);
              if (sampleLabels.length > 0) {
                addLog(`🔍 عيّنات "أخرى" (${sampleLabels.length}):`);
                for (const lbl of sampleLabels) {
                  addLog(`   → ${lbl}`);
                }
              }
              // Unique table→column pairs
              const uniquePairs = new Set<string>();
              for (const s of strings.slice(0, 500)) {
                uniquePairs.add(`${s.tableName} → ${s.columnName}`);
              }
              addLog(`📋 أزواج جدول→عمود (${uniquePairs.size}):`);
              for (const pair of [...uniquePairs].slice(0, 30)) {
                addLog(`   • ${pair}`);
              }
            }
            
            for (let i = 0; i < strings.length; i++) {
              const s = strings[i];
              // Key encodes structural position directly: "bdat-bin:filename:tableName:rowIndex:colName"
              // This makes build step independent of extraction order matching.
              bdatBinaryEntries.push({
                msbtFile: `bdat-bin:${file.name}:${s.tableName}:${s.rowIndex}:${s.columnName}`,
                index: 0,
                label: `${s.tableName}[${s.rowIndex}].${s.columnName}`,
                original: s.original,
                maxBytes: s.maxBytes,
                type: 'bdat-bin',
                columnName: s.columnName,
              });
            }
          } catch (e) {
            addLog(`⚠️ فشل تحليل ${file.name}: ${e instanceof Error ? e.message : 'خطأ'}`);
            if (e instanceof Error && e.message.includes('Invalid BDAT')) {
              addLog(`💡 الملف ليس بصيغة BDAT صالحة. تأكد أنه ملف .bdat من Xenoblade Chronicles 3.`);
            }
          }
        }
        if (schemaReportsAccumulator.length > 0) {
          setSchemaReports(schemaReportsAccumulator);
        }
      }

      const formData = new FormData();
      for (let i = 0; i < msbtFiles.length; i++) {
        formData.append(`msbt_${i}`, msbtFiles[i]);
      }
      for (let i = 0; i < bdatFiles.length; i++) {
        formData.append(`bdat_${i}`, bdatFiles[i]);
      }

      // Only call server if we have MSBT or JSON BDAT files
      let serverEntries: ExtractedEntry[] = [];
      let msbtCount = 0, bdatJsonCount = 0;

      if (msbtFiles.length > 0 || bdatFiles.length > 0) {
        setStage("extracting");
        addLog("📤 إرسال ملفات MSBT/JSON للمعالجة...");

        const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
        const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

        const response = await fetch(`${supabaseUrl}/functions/v1/arabize-xenoblade?mode=extract`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${supabaseKey}`, 'apikey': supabaseKey },
          body: formData,
        });

        if (!response.ok) {
          const ct = response.headers.get('content-type') || '';
          if (ct.includes('json')) {
            const err = await response.json();
            throw new Error(err.error || `خطأ ${response.status}`);
          }
          throw new Error(`خطأ ${response.status}`);
        }

        const data = await response.json();
        serverEntries = data.entries || [];
        msbtCount = data.msbtCount || 0;
        bdatJsonCount = data.bdatCount || 0;
      } else {
        setStage("extracting");
      }

      // Merge server entries with local binary BDAT entries
      const allEntries = [...serverEntries, ...bdatBinaryEntries];
      
      // إحصائيات الحوارات مقابل باقي النصوص
      const dialogueEntries = bdatBinaryEntries.filter(e => /msg_(ev|fev|ask|bev|sev)\d/i.test(e.msbtFile));
      const otherBdatEntries = bdatBinaryEntries.length - dialogueEntries.length;
      addLog(`✅ تم استخراج ${allEntries.length} نص (${msbtCount} MSBT + ${bdatJsonCount} BDAT JSON + ${bdatBinaryEntries.length} BDAT ثنائي)`);
      if (dialogueEntries.length > 0) {
        addLog(`🎬 حوارات ومشاهد (msg_ev/fev/ask/bev/sev): ${dialogueEntries.length} نص | باقي النصوص: ${otherBdatEntries}`);
      }

      if (allEntries.length === 0) {
        setStage("error");
        addLog("⚠️ لم يتم العثور على نصوص قابلة للترجمة في الملفات المرفوعة.");
        addLog("💡 تأكد أن الملف يحتوي على جداول بها أعمدة نصية (String columns).");
        if (bdatBinaryFiles.length > 0) {
          addLog("💡 هذا المحلل يدعم صيغة BDAT الحديثة (XC3). إذا كان الملف من XC1/XC2 فقد يكون بصيغة مختلفة.");
        }
        setExtracting(false);
        return;
      }

      // Store files in IndexedDB
      const { idbSet, idbGet, idbClear } = await import("@/lib/idb-storage");

      // Store each MSBT file's buffer
      const fileBuffers: Record<string, ArrayBuffer> = {};
      for (const file of msbtFiles) {
        fileBuffers[file.name] = await file.arrayBuffer();
      }

      // Store BDAT JSON texts
      const bdatTexts: Record<string, string> = {};
      for (const file of bdatFiles) {
        bdatTexts[file.name] = await file.text();
      }

      // Early check: is this a re-uploaded built file? (presentation forms in originals)
      const { hasArabicPresentationForms, removeArabicPresentationForms, reverseBidi } = await import("@/lib/arabic-processing");
      const isReUploadedBuild = allEntries.some(e => hasArabicPresentationForms(e.original));

      // Auto-detect Arabic entries — but SKIP if this is a re-uploaded built file
      // because the "originals" contain processed Arabic (reshaped+reversed) which
      // would produce broken auto-translations that override the correct buildTranslations
      const autoTranslations: Record<string, string> = {};
      if (!isReUploadedBuild) {
        const arabicLetterRegex = /[\u0621-\u064A\u0671-\u06D3\uFB50-\uFDFF\uFE70-\uFEFF]/g;
        for (const entry of allEntries) {
          const stripped = entry.original.replace(/[\uE000-\uF8FF\uFFF9-\uFFFC\u0000-\u001F]/g, '').trim();
          const arabicMatches = stripped.match(arabicLetterRegex);
          if (arabicMatches && arabicMatches.length >= 2) {
            const key = `${entry.msbtFile}:${entry.index}`;
            let cleaned = stripped.normalize("NFKD");
            cleaned = cleaned.split('\n').map((line: string) => {
              const segments: { text: string; isLTR: boolean }[] = [];
              let current = '';
              let currentIsLTR: boolean | null = null;
              for (const ch of line) {
                const code = ch.charCodeAt(0);
                const charIsArabic = (code >= 0x0600 && code <= 0x06FF) || (code >= 0xFB50 && code <= 0xFDFF) || (code >= 0xFE70 && code <= 0xFEFF);
                const charIsLTR = /[a-zA-Z0-9]/.test(ch);
                if (charIsArabic) {
                  if (currentIsLTR === true && current) { segments.push({ text: current, isLTR: true }); current = ''; }
                  currentIsLTR = false; current += ch;
                } else if (charIsLTR) {
                  if (currentIsLTR === false && current) { segments.push({ text: current, isLTR: false }); current = ''; }
                  currentIsLTR = true; current += ch;
                } else { current += ch; }
              }
              if (current) segments.push({ text: current, isLTR: currentIsLTR === true });
              return segments.reverse().map(seg => seg.isLTR ? seg.text : [...seg.text].reverse().join('')).join('');
            }).join('\n');
            autoTranslations[key] = cleaned;
          }
        }
      } else {
        addLog("📌 ملف مبني سابقاً — تم تخطي الكشف التلقائي واستخدام الترجمات المحفوظة");
      }
      setAutoDetectedCount(Object.keys(autoTranslations).length);
      if (!isReUploadedBuild) {
        addLog(`🎯 كشف تلقائي: ${Object.keys(autoTranslations).length} نص معرّب من أصل ${allEntries.length} نص مستخرج`);
      }
      
      // Diagnostic: show sample character codes from first few entries to debug detection
      if (!isReUploadedBuild && Object.keys(autoTranslations).length === 0 && allEntries.length > 0) {
        const sampleEntries = allEntries.slice(0, 5);
        for (const entry of sampleEntries) {
          const first20 = [...entry.original.slice(0, 20)];
          const codes = first20.map(ch => `U+${ch.charCodeAt(0).toString(16).toUpperCase().padStart(4, '0')}`).join(' ');
          addLog(`🔍 عينة [${entry.index}]: "${entry.original.slice(0, 30)}" → ${codes}`);
        }
        // Check if ANY entry has Arabic-range chars
        const arabicCheckRegex = /[\u0600-\u06FF\uFB50-\uFDFF\uFE70-\uFEFF]/;
        const entriesWithArabic = allEntries.filter(e => arabicCheckRegex.test(e.original));
        addLog(`🔎 عدد النصوص التي تحتوي أحرف عربية (أي نطاق): ${entriesWithArabic.length}`);
        if (entriesWithArabic.length > 0 && entriesWithArabic.length <= 5) {
          for (const e of entriesWithArabic) {
            addLog(`  → [${e.index}] "${e.original.slice(0, 40)}"`);
          }
        } else if (entriesWithArabic.length > 5) {
          for (const e of entriesWithArabic.slice(0, 3)) {
            addLog(`  → [${e.index}] "${e.original.slice(0, 40)}"`);
          }
          addLog(`  ... و ${entriesWithArabic.length - 3} أخرى`);
        }
      }

      let finalTranslations: Record<string, string> = { ...autoTranslations };

      if (mergeMode === "merge") {
        const existing = await idbGet<{ translations?: Record<string, string> }>("editorState");
        const existingTranslations = existing?.translations || {};
        const validKeys = new Set(allEntries.map(e => `${e.msbtFile}:${e.index}`));

        // Build legacy-to-new key mapping for old sequential keys
        const entriesByFile: Record<string, typeof allEntries> = {};
        for (const entry of allEntries) {
          const parts = entry.msbtFile.split(':');
          const filename = parts.length >= 2 ? parts[1] : entry.msbtFile;
          if (!entriesByFile[filename]) entriesByFile[filename] = [];
          entriesByFile[filename].push(entry);
        }

        let legacyConverted = 0;
        for (const [k, v] of Object.entries(existingTranslations)) {
          if (validKeys.has(k) && v && !finalTranslations[k]) {
            finalTranslations[k] = v as string;
          } else if (!validKeys.has(k) && v) {
            // Try legacy key conversion: "bdat-bin:filename.bdat:NUMBER"
            const parts = k.split(':');
            if (parts.length === 3 && !isNaN(parseInt(parts[2], 10))) {
              const filename = parts[1];
              const idx = parseInt(parts[2], 10);
              const fileEntries = entriesByFile[filename];
              if (fileEntries && idx < fileEntries.length) {
                const entry = fileEntries[idx];
                const newKey = `${entry.msbtFile}:${entry.index}`;
                if (!finalTranslations[newKey]) {
                  finalTranslations[newKey] = v as string;
                  legacyConverted++;
                }
              }
            }
          }
        }
        if (legacyConverted > 0) {
          addLog(`🔄 تم تحويل ${legacyConverted} ترجمة من التنسيق القديم`);
        }
      }

      // Check for saved build translations (most reliable method)
      const { idbClearExcept } = await import("@/lib/idb-storage");
      const savedBuildTranslations = await idbGet<Record<string, string>>("buildTranslations");
      
      if (savedBuildTranslations && Object.keys(savedBuildTranslations).length > 0) {
        // Build hash-normalized + multi-level fingerprint maps for current entries
        // Build hash-normalized + multi-level fingerprint maps
        const { murmur3_32 } = await import("@/lib/bdat-hash-dictionary");
        const normalizeToHash = (part: string): string => {
          const hexMatch = part.match(/^<0x([0-9a-fA-F]+)>$/);
          if (hexMatch) return hexMatch[1].toLowerCase();
          return murmur3_32(part).toString(16).padStart(8, '0').toLowerCase();
        };
        const normalizedMap = new Map<string, string>();
        const exactMap = new Map<string, string>();
        const noTableMap = new Map<string, string[]>();
        const noColMap = new Map<string, string[]>();
        const baseMap = new Map<string, string[]>();
        const validKeys = new Set<string>();
        for (const e of allEntries) {
          const ek = `${e.msbtFile}:${e.index}`;
          validKeys.add(ek);
          if (ek.startsWith('bdat-bin:')) {
            const parts = ek.split(':');
            if (parts.length >= 6) {
              const [filename, tableHash, rowIndex, colHash] = [parts[1], parts[2], parts[3], parts[4]];
              // Hash-normalized fingerprint (primary)
              const nfp = `${filename}:${normalizeToHash(tableHash)}:${rowIndex}:${normalizeToHash(colHash)}`;
              normalizedMap.set(nfp, ek);
              // Multi-level fallbacks
              exactMap.set(`${filename}:${tableHash}:${rowIndex}:${colHash}`, ek);
              const ntKey = `${filename}:*:${rowIndex}:${colHash}`;
              const nt = noTableMap.get(ntKey) || []; nt.push(ek); noTableMap.set(ntKey, nt);
              const ncKey = `${filename}:${tableHash}:${rowIndex}:*`;
              const nc = noColMap.get(ncKey) || []; nc.push(ek); noColMap.set(ncKey, nc);
              const bKey = `${filename}:*:${rowIndex}:*`;
              const b = baseMap.get(bKey) || []; b.push(ek); baseMap.set(bKey, b);
            }
          }
        }

        const findNewKey = (oldKey: string): string | undefined => {
          if (!oldKey.startsWith('bdat-bin:')) return undefined;
          const parts = oldKey.split(':');
          if (parts.length < 6) return undefined;
          const [filename, tableHash, rowIndex, colHash] = [parts[1], parts[2], parts[3], parts[4]];
          // 0. Hash-normalized exact match (handles hash↔name changes)
          const nfp = `${filename}:${normalizeToHash(tableHash)}:${rowIndex}:${normalizeToHash(colHash)}`;
          const normMatch = normalizedMap.get(nfp);
          if (normMatch) return normMatch;
          // 1-4. Multi-level fallbacks
          let nk = exactMap.get(`${filename}:${tableHash}:${rowIndex}:${colHash}`);
          if (nk) return nk;
          const ntC = noTableMap.get(`${filename}:*:${rowIndex}:${colHash}`);
          if (ntC && ntC.length === 1) return ntC[0];
          const ncC = noColMap.get(`${filename}:${tableHash}:${rowIndex}:*`);
          if (ncC && ncC.length === 1) return ncC[0];
          const bC = baseMap.get(`${filename}:*:${rowIndex}:*`);
          if (bC && bC.length === 1) return bC[0];
          return undefined;
        };

        let restoredCount = 0;
        for (const [k, v] of Object.entries(savedBuildTranslations)) {
          if (!v?.trim()) continue;
          if (validKeys.has(k) && !finalTranslations[k]) {
            finalTranslations[k] = v;
            restoredCount++;
          } else {
            const newKey = findNewKey(k);
            if (newKey && !finalTranslations[newKey]) {
              finalTranslations[newKey] = v;
              restoredCount++;
            }
          }
        }
        addLog(`🔄 تم استعادة ${restoredCount} ترجمة من آخر بناء`);
      }

      // Check if extracted texts contain presentation forms (re-extraction from built file)
      // (hasArabicPresentationForms already imported above; reuse isReUploadedBuild)
      
      if (isReUploadedBuild) {
        addLog("⚠️ تم اكتشاف نصوص عربية مُشكَّلة (Presentation Forms) — يبدو أن الملف مبني سابقاً");
        
        // Try to restore original English texts from saved originals
        const savedOriginals = await idbGet<Record<string, string>>("originalTexts");
        let restoredFromSnapshot = 0;
        let restoredByDecoding = 0;

        for (let i = 0; i < allEntries.length; i++) {
          const entry = allEntries[i];
          if (!hasArabicPresentationForms(entry.original)) continue;

          const key = `${entry.msbtFile}:${entry.index}`;
          const savedOriginal = savedOriginals?.[key];

          if (savedOriginal) {
            entry.original = savedOriginal;
            restoredFromSnapshot++;
            continue;
          }

          // Fallback: recover readable logical text from processed built Arabic
          // (BiDi reverse is self-inverse, then map Presentation Forms back to standard Arabic)
          entry.original = removeArabicPresentationForms(reverseBidi(entry.original));
          restoredByDecoding++;
        }

        if (savedOriginals && Object.keys(savedOriginals).length > 0) {
          addLog(`🔄 تم استعادة ${restoredFromSnapshot} نص أصلي إنجليزي من النسخة المحفوظة`);
        }
        addLog(`🧩 تم فك ${restoredByDecoding} نص عربي مبني إلى صيغة قابلة للتحرير`);
        
        // Clear everything EXCEPT originalTexts and buildTranslations
        await idbClearExcept(["originalTexts", "buildTranslations"]);
      } else {
        // Clean file — save original English texts for future restoration
        const originalTextsMap: Record<string, string> = {};
        for (const entry of allEntries) {
          const key = `${entry.msbtFile}:${entry.index}`;
          originalTextsMap[key] = entry.original;
        }
        
        await idbClearExcept(["buildTranslations"]);
        
        // Save originalTexts after clear
        try {
          await idbSet("originalTexts", originalTextsMap);
          addLog(`📝 تم حفظ ${Object.keys(originalTextsMap).length} نص أصلي للاستعادة المستقبلية`);
        } catch (err) {
          addLog("⚠️ لم يتم حفظ النصوص الأصلية — مساحة التخزين محدودة");
        }
      }

      // Log translation stats before saving
      const translationCount = Object.values(finalTranslations).filter(v => v?.trim()).length;
      addLog(`📊 إحصائيات الحفظ: ${translationCount} ترجمة من أصل ${allEntries.length} نص`);
      if (translationCount === 0 && Object.keys(autoTranslations).length > 0) {
        addLog(`⚠️ تحذير: الكشف التلقائي وجد ${Object.keys(autoTranslations).length} نص لكن لم تُحفظ ترجمات!`);
      }

      // CRITICAL: Save editor state FIRST (most important data)
      await idbSet("editorState", {
        entries: allEntries,
        translations: finalTranslations,
        freshExtraction: true,
      });
      await idbSet("editorGame", "xenoblade");
      // Verify save worked
      const verifyState = await idbGet<{ entries?: any[]; translations?: Record<string, string> }>("editorState");
      if (!verifyState?.entries || verifyState.entries.length !== allEntries.length) {
        addLog(`⚠️ تحذير: تم حفظ ${verifyState?.entries?.length || 0} من ${allEntries.length} نص - قد تكون مساحة التخزين محدودة`);
      } else {
        const savedTransCount = Object.values(verifyState.translations || {}).filter(v => (v as string)?.trim()).length;
        addLog(`💾 تم حفظ ${allEntries.length} نص + ${savedTransCount} ترجمة في المحرر بنجاح ✅`);
      }
      
      // Then save file buffers (less critical, may fail on mobile due to quota)
      try {
        await idbSet("editorMsbtFiles", fileBuffers);
        await idbSet("editorMsbtFileNames", msbtFiles.map(f => f.name));
        await idbSet("editorBdatFiles", bdatTexts);
        await idbSet("editorBdatFileNames", bdatFiles.map(f => f.name));
        await idbSet("editorBdatBinaryFiles", bdatBinaryBuffers);
        await idbSet("editorBdatBinaryFileNames", bdatBinaryFiles.map(f => f.name));
      } catch (storageErr) {
        addLog(`⚠️ لم يتم حفظ الملفات الثنائية (مساحة تخزين محدودة) - النصوص محفوظة بنجاح`);
        console.warn("IDB storage quota exceeded for binary files:", storageErr);
      }

      setStage("done");
      addLog("✨ جاهز للتحرير! اضغط الزر أدناه للانتقال إلى المحرر.");
    } catch (err) {
      setStage("error");
      addLog(`❌ ${err instanceof Error ? err.message : "خطأ غير معروف"}`);
    } finally {
      setExtracting(false);
    }
  };

  const isProcessing = !["idle", "done", "error"].includes(stage);
  const totalFiles = msbtFiles.length + bdatFiles.length + bdatBinaryFiles.length;

  return (
    <div className="min-h-screen flex flex-col">
      {/* Hero header */}
      <header className="relative flex flex-col items-center justify-center py-16 px-4 text-center overflow-hidden">
        <div className="absolute inset-0">
          <img src={heroBg} alt="" className="w-full h-full object-cover" fetchPriority="high" />
          <div className="absolute inset-0 bg-gradient-to-b from-background/80 via-background/60 to-background" />
        </div>
        <div className="relative z-10 max-w-2xl mx-auto">
          <Link to="/" className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground mb-6 font-body text-sm">
            <ArrowRight className="w-4 h-4" />
            العودة للرئيسية
          </Link>
          <div className="inline-flex items-center gap-2 mb-4 px-4 py-2 rounded-full bg-background/60 backdrop-blur-md border border-primary/30">
            <Sparkles className="w-4 h-4 text-primary" />
            <span className="text-sm text-primary font-display font-semibold">رفع ومعالجة الملفات</span>
          </div>
          <h1 className="text-3xl md:text-4xl font-display font-black mb-3 drop-shadow-lg">رفع ملفات زينوبليد 🔮</h1>
          <p className="text-muted-foreground font-body bg-background/40 backdrop-blur-sm rounded-lg px-4 py-2 inline-block">
            ارفع ملفات MSBT و/أو BDAT — يمكنك رفع عدة ملفات دفعة واحدة
          </p>
        </div>
      </header>

      <div className="flex-1 py-8 px-4">
      <div className="max-w-3xl mx-auto">

        {/* MSBT Upload */}
        <div
          onDrop={handleDrop}
          onDragOver={e => e.preventDefault()}
          className={`relative flex flex-col items-center justify-center p-10 rounded-xl border-2 border-dashed transition-colors cursor-pointer mb-4
            ${totalFiles > 0 ? "border-primary/50 bg-primary/5" : "border-border hover:border-primary/30 bg-card"}
            ${isProcessing ? "opacity-50 pointer-events-none" : ""}`}
        >
          <div className="flex items-center gap-6">
            <div className="text-center">
              <FileText className="w-8 h-8 text-primary mb-2 mx-auto" />
              <p className="font-display font-semibold text-sm">MSBT</p>
              <p className="text-xs text-muted-foreground">ملفات الحوارات</p>
            </div>
            <div className="h-12 w-px bg-border" />
            <div className="text-center">
              <Binary className="w-8 h-8 text-secondary mb-2 mx-auto" />
              <p className="font-display font-semibold text-sm">BDAT</p>
              <p className="text-xs text-muted-foreground">ثنائي مباشر</p>
            </div>
            <div className="h-12 w-px bg-border" />
            <div className="text-center">
              <Database className="w-8 h-8 text-accent mb-2 mx-auto" />
              <p className="font-display font-semibold text-sm">JSON</p>
              <p className="text-xs text-muted-foreground">جداول محوّلة</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-3 mt-4">
            <label className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary/10 border border-primary/30 text-sm font-display font-semibold cursor-pointer hover:bg-primary/20 transition-colors ${isProcessing ? 'opacity-50 pointer-events-none' : ''}`}>
              <Upload className="w-4 h-4" />
              اختيار ملفات (.bdat/.msbt/.json)
              <input
                type="file"
                accept=".msbt,.json,.bdat"
                multiple
                className="hidden"
                onChange={e => handleFileSelect(e.target.files)}
                disabled={isProcessing}
              />
            </label>
            <label className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-secondary/10 border border-secondary/30 text-sm font-display font-semibold cursor-pointer hover:bg-secondary/20 transition-colors ${isProcessing ? 'opacity-50 pointer-events-none' : ''}`}>
              <Upload className="w-4 h-4" />
              اختيار ملفات (كل الأنواع)
              <input
                type="file"
                multiple
                className="hidden"
                onChange={e => handleFileSelect(e.target.files)}
                disabled={isProcessing}
              />
            </label>
            <label className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-accent/10 border border-accent/30 text-sm font-display font-semibold cursor-pointer hover:bg-accent/20 transition-colors ${isProcessing ? 'opacity-50 pointer-events-none' : ''}`}>
              <FolderOpen className="w-4 h-4" />
              رفع مجلد كامل
              <input
                type="file"
                multiple
                className="hidden"
                // @ts-ignore - webkitdirectory is non-standard but widely supported
                webkitdirectory=""
                directory=""
                onChange={e => { handleFileSelect(e.target.files); e.target.value = ''; }}
                disabled={isProcessing}
              />
            </label>
          </div>
          {fileLoadProgress && (
            <div className="mt-3 flex items-center gap-3 px-2">
              <Loader2 className="w-4 h-4 animate-spin text-primary shrink-0" />
              <div className="flex-1">
                <div className="h-2 rounded-full bg-muted overflow-hidden">
                  <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${Math.round((fileLoadProgress.current / fileLoadProgress.total) * 100)}%` }} />
                </div>
              </div>
              <span className="text-xs font-mono text-muted-foreground shrink-0">{fileLoadProgress.current}/{fileLoadProgress.total}</span>
            </div>
          )}
          <p className="text-xs text-muted-foreground mt-2">💡 استخدم "كل الأنواع" لاختيار عدة ملفات من مدير الملفات، أو "رفع مجلد كامل" لرفع مجلد بكل ملفاته تلقائياً (يمكنك الضغط عدة مرات لإضافة مجلدات متعددة)</p>
          <input
            type="file"
            accept=".msbt,.json,.bdat"
            multiple
            className="absolute inset-0 opacity-0 cursor-pointer"
            onChange={e => handleFileSelect(e.target.files)}
            disabled={isProcessing}
          />
        </div>

        {/* BDAT Info */}
        <Card className="mb-6 border-primary/20 bg-primary/5">
          <CardContent className="p-4">
            <p className="text-sm font-display font-bold mb-2">📦 دعم BDAT الثنائي المباشر</p>
            <p className="text-xs text-muted-foreground font-body" dir="rtl">
              يمكنك الآن رفع ملفات <code className="bg-background px-1 rounded" dir="ltr">.bdat</code> مباشرة! المحلل الثنائي يستخرج النصوص تلقائياً بدون الحاجة لتحويلها إلى JSON.
              <br />
              كما يمكنك أيضاً رفع ملفات JSON المحوّلة عبر <code className="bg-background px-1 rounded" dir="ltr">bdat-toolset</code>.
            </p>
          </CardContent>
        </Card>

        {/* Project Settings */}
        <Card className="mb-6 border-secondary/20 bg-secondary/5">
          <CardContent className="p-4">
            <button
              className="flex items-center gap-2 w-full text-right"
              onClick={() => setShowSettings(v => !v)}
            >
              <Settings2 className="w-4 h-4 text-secondary" />
              <span className="text-sm font-display font-bold flex-1 text-right">⚙️ إعدادات المشروع</span>
              <span className="text-xs text-muted-foreground">
                هامش: <strong>{formatMarginPct(safetyMargin)}</strong> | مضاعف عربي: <strong>×{arabicMultiplier.toFixed(1)}</strong>
              </span>
              <span className="text-muted-foreground text-xs">{showSettings ? "▲" : "▼"}</span>
            </button>

            {showSettings && (
              <div className="mt-4 space-y-4 border-t border-border pt-4">
                <div>
                  <label className="block text-xs font-display font-semibold mb-1 text-foreground">
                    هامش أمان البايتات
                    <span className="mr-2 text-secondary font-mono">{formatMarginPct(safetyMargin)}</span>
                  </label>
                  <p className="text-xs text-muted-foreground mb-3">
                    يُضاف فوق أطول نص أصلي في كل عمود BDAT. القيمة الأعلى تمنح مرونة أكبر للمترجم لكن تزيد خطر تجاوز سعة العمود.
                  </p>
                  <div className="flex items-center gap-3">
                    <input
                      type="range"
                      min={0}
                      max={100}
                      step={5}
                      value={Math.round((safetyMargin - 1) * 100)}
                      onChange={e => {
                        const pct = Number(e.target.value);
                        const newMargin = 1 + pct / 100;
                        setSafetyMargin(newMargin);
                        saveBdatSettings({ safetyMargin: newMargin });
                      }}
                      className="flex-1 accent-secondary cursor-pointer"
                    />
                    <span className="text-xs font-mono text-secondary w-10 text-center">{formatMarginPct(safetyMargin)}</span>
                  </div>
                  <div className="flex justify-between text-xs text-muted-foreground mt-1">
                    <span>0% (بدون هامش)</span>
                    <span>50%</span>
                    <span>100% (ضعف الحجم)</span>
                  </div>
                  {/* Quick presets */}
                  <div className="flex gap-2 mt-3 flex-wrap">
                    {[
                      { label: "0% (صارم)", value: 1.0 },
                      { label: "10%", value: 1.1 },
                      { label: "20% (افتراضي)", value: 1.2 },
                      { label: "30%", value: 1.3 },
                      { label: "50%", value: 1.5 },
                    ].map(p => (
                      <button
                        key={p.value}
                        onClick={() => {
                          setSafetyMargin(p.value);
                          saveBdatSettings({ safetyMargin: p.value });
                        }}
                        className={`px-2 py-1 rounded text-xs font-mono transition-all ${
                          Math.abs(safetyMargin - p.value) < 0.005
                            ? "bg-secondary text-secondary-foreground"
                            : "bg-muted text-muted-foreground hover:bg-muted/80"
                        }`}
                      >
                        {p.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Arabic Multiplier */}
                <div className="mt-4 pt-4 border-t border-border">
                  <label className="block text-xs font-display font-semibold mb-1 text-foreground">
                    مضاعف البايتات العربي
                    <span className="mr-2 text-secondary font-mono">×{arabicMultiplier.toFixed(1)}</span>
                  </label>
                  <p className="text-xs text-muted-foreground mb-3">
                    يُضاعف ميزانية البايتات لأن الحرف العربي يأخذ 2 بايت مقابل 1 للإنجليزي. القيمة ×2.0 تعني ضعف المساحة.
                  </p>
                  <div className="flex items-center gap-3">
                    <input
                      type="range"
                      min={150}
                      max={300}
                      step={10}
                      value={Math.round(arabicMultiplier * 100)}
                      onChange={e => {
                        const newMul = Number(e.target.value) / 100;
                        setArabicMultiplier(newMul);
                        saveBdatSettings({ arabicMultiplier: newMul });
                      }}
                      className="flex-1 accent-secondary cursor-pointer"
                    />
                    <span className="text-xs font-mono text-secondary w-10 text-center">×{arabicMultiplier.toFixed(1)}</span>
                  </div>
                  <div className="flex justify-between text-xs text-muted-foreground mt-1">
                    <span>×1.5</span>
                    <span>×2.0</span>
                    <span>×2.5</span>
                    <span>×3.0</span>
                  </div>
                  <div className="flex gap-2 mt-3 flex-wrap">
                    {[
                      { label: "×1.5 (محدود)", value: 1.5 },
                      { label: "×2.0 (افتراضي)", value: 2.0 },
                      { label: "×2.5", value: 2.5 },
                      { label: "×3.0 (واسع)", value: 3.0 },
                    ].map(p => (
                      <button
                        key={p.value}
                        onClick={() => {
                          setArabicMultiplier(p.value);
                          saveBdatSettings({ arabicMultiplier: p.value });
                        }}
                        className={`px-2 py-1 rounded text-xs font-mono transition-all ${
                          Math.abs(arabicMultiplier - p.value) < 0.05
                            ? "bg-secondary text-secondary-foreground"
                            : "bg-muted text-muted-foreground hover:bg-muted/80"
                        }`}
                      >
                        {p.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* File Lists */}
        {msbtFiles.length > 0 && (
          <Card className="mb-4">
            <CardHeader className="pb-2">
              <CardTitle className="font-display text-lg">📄 ملفات MSBT ({msbtFiles.length})</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-1.5 max-h-36 overflow-y-auto">
                {msbtFiles.map((f, i) => (
                  <div key={i} className="flex items-center justify-between px-3 py-1.5 rounded bg-background border border-border text-sm">
                    <span className="font-mono text-xs truncate flex-1" dir="ltr">{f.name}</span>
                    <span className="text-muted-foreground text-xs mx-3">{(f.size / 1024).toFixed(1)} KB</span>
                    <button onClick={() => removeFile("msbt", i)} className="text-destructive text-xs hover:underline" disabled={isProcessing}>حذف</button>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {bdatFiles.length > 0 && (
          <Card className="mb-4">
            <CardHeader className="pb-2">
              <CardTitle className="font-display text-lg">🗃️ ملفات BDAT JSON ({bdatFiles.length})</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-1.5 max-h-36 overflow-y-auto">
                {bdatFiles.map((f, i) => (
                  <div key={i} className="flex items-center justify-between px-3 py-1.5 rounded bg-background border border-border text-sm">
                    <span className="font-mono text-xs truncate flex-1" dir="ltr">{f.name}</span>
                    <span className="text-muted-foreground text-xs mx-3">{(f.size / 1024).toFixed(1)} KB</span>
                    <button onClick={() => removeFile("bdat", i)} className="text-destructive text-xs hover:underline" disabled={isProcessing}>حذف</button>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {bdatBinaryFiles.length > 0 && (
          <Card className="mb-4">
            <CardHeader className="pb-2">
              <CardTitle className="font-display text-lg">📦 ملفات BDAT ثنائية ({bdatBinaryFiles.length})</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-1.5 max-h-36 overflow-y-auto">
                {bdatBinaryFiles.map((f, i) => (
                  <div key={i} className="flex items-center justify-between px-3 py-1.5 rounded bg-background border border-border text-sm">
                    <span className="font-mono text-xs truncate flex-1" dir="ltr">{f.name}</span>
                    <span className="text-muted-foreground text-xs mx-3">{(f.size / 1024).toFixed(1)} KB</span>
                    <button onClick={() => removeFile("bdat-bin", i)} className="text-destructive text-xs hover:underline" disabled={isProcessing}>حذف</button>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}


        {hasPreviousSession && (
          <div className="flex items-center justify-center gap-3 mb-6">
            <button onClick={() => setMergeMode("fresh")}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-lg border text-sm font-display font-bold transition-all ${
                mergeMode === "fresh" ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground"
              }`}>
              بدء مشروع جديد
            </button>
            <button onClick={() => setMergeMode("merge")}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-lg border text-sm font-display font-bold transition-all ${
                mergeMode === "merge" ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground"
              }`}>
              <CheckCircle2 className="w-4 h-4" />
              دمج مع الترجمات السابقة
            </button>
          </div>
        )}

        {/* Extract Button */}
        <div className="flex flex-col items-center gap-4 mb-8">
          <Button
            size="lg"
            onClick={handleExtract}
            disabled={totalFiles === 0 || isProcessing || extracting}
            className="font-display font-bold text-lg px-10 py-6 bg-primary hover:bg-primary/90 text-primary-foreground shadow-xl shadow-primary/30"
          >
            {extracting ? (
              <><Loader2 className="w-5 h-5 animate-spin" /> جاري الاستخراج...</>
            ) : (
              <><Pencil className="w-5 h-5" /> استخراج وتحرير ✍️</>
            )}
          </Button>
          {autoDetectedCount > 0 && (
            <p className="text-sm text-muted-foreground">
              تم اكتشاف <span className="font-bold text-primary">{autoDetectedCount}</span> نص معرّب تلقائياً 🎯
            </p>
          )}
        </div>

        {/* Progress */}
        {stage !== "idle" && (
          <Card className={`mb-6 ${stage === "error" ? "border-destructive/50 bg-destructive/5" : stage === "done" ? "border-green-500/50 bg-green-500/5" : ""}`}>
            <CardHeader>
              <CardTitle className="font-display text-lg">{stageLabels[stage]}</CardTitle>
            </CardHeader>
            <CardContent>
              <Progress value={stageProgress[stage]} className="h-3" />
              <div className="flex justify-between items-center text-xs text-muted-foreground mt-1">
                <span>{stageProgress[stage]}%</span>
                {isProcessing && <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> جاري المعالجة...</span>}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Logs */}
        {logs.length > 0 && (
          <Card className="mb-6">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="font-display text-lg">📋 سجل العمليات</CardTitle>
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5"
                onClick={() => {
                  const text = logs.join('\n');
                  const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = url;
                  a.download = `process-log-${new Date().toISOString().slice(0, 10)}.txt`;
                  a.click();
                  URL.revokeObjectURL(url);
                }}
              >
                <Download className="w-4 h-4" />
                تصدير
              </Button>
            </CardHeader>
            <CardContent>
              <div className="bg-background rounded-lg p-4 max-h-96 overflow-y-auto font-mono text-xs space-y-1 border border-border/40" dir="ltr">
                {logs.map((log, i) => (
                  <div key={i} className="text-muted-foreground whitespace-pre-wrap">{log}</div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* ===== Schema Inspector Panel ===== */}
        {stage === "done" && schemaReports.length > 0 && (
          <Card className="mb-6 border-primary/30 bg-primary/5">
            <CardHeader>
              <div className="flex items-center justify-between flex-wrap gap-2">
                <CardTitle className="font-display text-lg flex items-center gap-2">
                  📊 Schema BDAT Inspector
                  <span className="text-xs font-normal text-muted-foreground font-body">
                    ({schemaReports.reduce((s, r) => s + r.table_count, 0)} جدول | {schemaReports.reduce((s, r) => s + r.translatable_tables, 0)} قابلة للترجمة)
                  </span>
                </CardTitle>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1.5 text-xs"
                    onClick={() => setSamplesEnabled(v => !v)}
                  >
                    {samplesEnabled ? "🙈 إخفاء العينات" : "👁 تفعيل العينات"}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    title={samplesEnabled ? "سيتضمن القاموس عينات نصية من الملف" : "فعّل العينات أولاً للحصول على قاموس أغنى بالمصطلحات"}
                    className="gap-1.5 text-xs border-secondary/40 text-secondary hover:text-secondary"
                    onClick={() => {
                      // Build glossary .txt: one English term per line = ready for Arabic
                      const lines: string[] = [
                        `# قاموس مُولَّد تلقائياً من Schema BDAT Inspector`,
                        `# التاريخ: ${new Date().toISOString().slice(0, 10)}`,
                        `# الصيغة: English=Arabic`,
                        `# أضف الترجمة العربية بعد علامة =`,
                        ``,
                      ];
                      // Collect unique translatable samples across all reports
                      const seen = new Set<string>();
                      for (const report of schemaReports) {
                        lines.push(`# ── الملف: ${report.file} ──`);
                        for (const tbl of report.tables) {
                          const translatableFields = tbl.fields.filter(f => f.translate);
                          if (translatableFields.length === 0) continue;
                          lines.push(`# الجدول: ${tbl.table}`);
                          for (const field of translatableFields) {
                            // Add unmasked samples if available, else field name as placeholder
                            if (field.samples && field.samples.length > 0) {
                              for (const sample of field.samples) {
                                // Strip masking suffix (***) to get the prefix hint
                                const clean = sample.replace(/\*+$/, "").trim();
                                if (clean && !seen.has(clean)) {
                                  seen.add(clean);
                                  lines.push(`${clean}=`);
                                }
                              }
                            } else {
                              // No samples: export field name as a category comment
                              const key = `${tbl.table}/${field.field_name}`;
                              if (!seen.has(key)) {
                                seen.add(key);
                                lines.push(`# ${field.field_name} (max ${field.max_chars} حرف / ${field.max_utf8_bytes} byte)`);
                              }
                            }
                          }
                          lines.push(``);
                        }
                      }
                      const txt = lines.join("\n");
                      const blob = new Blob([txt], { type: "text/plain;charset=utf-8" });
                      const url = URL.createObjectURL(blob);
                      const a = document.createElement("a");
                      a.href = url;
                      a.download = `bdat-glossary-${new Date().toISOString().slice(0, 10)}.txt`;
                      a.click();
                      URL.revokeObjectURL(url);
                    }}
                  >
                    <Download className="w-3.5 h-3.5" />
                    تصدير قاموس .txt
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1.5 text-xs"
                    onClick={() => {
                      const payload = {
                        meta: {
                          game: "Xenoblade Chronicles 3",
                          generated_at: new Date().toISOString(),
                          tool: "XC3 BDAT Schema Inspector v1",
                        },
                        reports: schemaReports,
                      };
                      const json = JSON.stringify(payload, null, 2);
                      const blob = new Blob([json], { type: "application/json" });
                      const url = URL.createObjectURL(blob);
                      const a = document.createElement("a");
                      a.href = url;
                      a.download = `bdat-schema-${new Date().toISOString().slice(0, 10)}.json`;
                      a.click();
                      URL.revokeObjectURL(url);
                    }}
                  >
                    <Download className="w-3.5 h-3.5" />
                    تصدير JSON
                  </Button>
                </div>
              </div>

              {/* Tab selector */}
              <div className="flex items-center gap-2 mt-3 flex-wrap">
                <div className="flex gap-1">
                  {(["summary", "tables"] as const).map(tab => (
                    <button
                      key={tab}
                      onClick={() => setSchemaTab(tab)}
                      className={`px-4 py-1.5 rounded-lg text-sm font-display font-semibold transition-all ${
                        schemaTab === tab
                          ? "bg-primary text-primary-foreground"
                          : "text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      {tab === "summary" ? "📋 ملخص" : "📁 الجداول"}
                    </button>
                  ))}
                </div>
                {schemaTab === "tables" && (
                  <div className="flex gap-1 mr-auto">
                    {([
                      { key: "all",      label: "الكل",        cls: "bg-muted text-muted-foreground hover:text-foreground" },
                      { key: "critical", label: "🔴 خطرة",     cls: "bg-red-500/15 text-red-600 dark:text-red-400 border border-red-500/30 hover:bg-red-500/25" },
                      { key: "limited",  label: "🟡 محدودة",   cls: "bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30 hover:bg-amber-500/25" },
                    ] as const).map(f => (
                      <button
                        key={f.key}
                        onClick={() => setDangerFilter(f.key)}
                        className={`px-3 py-1 rounded-lg text-xs font-display font-semibold transition-all ${
                          dangerFilter === f.key
                            ? f.key === "critical"
                              ? "bg-red-500 text-white"
                              : f.key === "limited"
                              ? "bg-amber-500 text-white"
                              : "bg-foreground text-background"
                            : f.cls
                        }`}
                      >
                        {f.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </CardHeader>

            <CardContent>
              {/* ── Summary Tab ── */}
              {schemaTab === "summary" && schemaReports.map((report, ri) => (
                <div key={ri} className="mb-6 last:mb-0">
                  {schemaReports.length > 1 && (
                    <p className="font-mono text-xs text-muted-foreground mb-3" dir="ltr">{report.file}</p>
                  )}

                  {/* Stats row */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
                    {[
                      { label: "إجمالي الجداول", value: report.table_count },
                      { label: "قابلة للترجمة", value: report.translatable_tables, highlight: true },
                      { label: "غير قابلة", value: report.table_count - report.translatable_tables },
                      { label: "أنواع وسوم", value: report.all_discovered_tags.length },
                    ].map(({ label, value, highlight }) => (
                      <div key={label} className={`rounded-lg p-3 text-center border ${highlight ? "border-primary/40 bg-primary/10" : "border-border bg-background"}`}>
                        <div className={`text-2xl font-display font-black ${highlight ? "text-primary" : ""}`}>{value}</div>
                        <div className="text-xs text-muted-foreground font-body mt-0.5">{label}</div>
                      </div>
                    ))}
                  </div>

                  {/* Tags */}
                  {report.all_discovered_tags.length > 0 && (
                    <div className="mb-4">
                      <p className="text-xs font-display font-semibold mb-2 flex items-center gap-1.5">
                        <Tag className="w-3.5 h-3.5" />
                        وسوم التحكم المكتشفة
                      </p>
                      <div className="flex flex-wrap gap-1.5">
                        {report.all_discovered_tags.map(tag => (
                          <span key={tag} className="px-2 py-0.5 rounded-full bg-secondary/20 border border-secondary/40 text-xs font-mono text-secondary-foreground" dir="ltr">
                            {tag}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Safety Contract */}
                  <div className="rounded-lg border border-warning/30 bg-warning/5 p-4">
                    <p className="text-xs font-display font-bold text-warning-foreground mb-2 flex items-center gap-1.5">
                      <Shield className="w-3.5 h-3.5" />
                      قواعد السلامة (Translation Safety Contract)
                    </p>
                    <ol className="space-y-1">
                      {report.safety_contract.map((rule, i) => (
                        <li key={i} className="text-xs text-muted-foreground flex items-start gap-2">
                          <span className="font-bold text-foreground shrink-0">{i + 1}.</span>
                          {rule}
                        </li>
                      ))}
                    </ol>
                  </div>
                </div>
              ))}

              {/* ── Tables Tab ── */}
              {schemaTab === "tables" && schemaReports.map((report, ri) => {
                // Pre-compute danger level for each field
                const getFieldDanger = (maxBytes: number, translate: boolean): "critical" | "limited" | "safe" | "none" => {
                  if (!translate || maxBytes <= 0) return "none";
                  const chars = Math.floor(maxBytes / 2);
                  return chars <= 10 ? "critical" : chars <= 30 ? "limited" : "safe";
                };

                // Filter tables: only show tables that have at least one field matching the filter
                const filteredTables = report.tables.filter(tbl => {
                  if (dangerFilter === "all") return true;
                  return tbl.fields.some(f => getFieldDanger(f.max_utf8_bytes, f.translate) === dangerFilter);
                });

                const hiddenCount = report.tables.length - filteredTables.length;

                return (
                <div key={ri} className="mb-6 last:mb-0">
                  {schemaReports.length > 1 && (
                    <p className="font-mono text-xs text-muted-foreground mb-3" dir="ltr">{report.file}</p>
                  )}
                  {dangerFilter !== "all" && hiddenCount > 0 && (
                    <p className="text-xs text-muted-foreground mb-2 flex items-center gap-1.5">
                      <span>{dangerFilter === "critical" ? "🔴" : "🟡"}</span>
                      يُعرض {filteredTables.length} جدول يحتوي على حقول {dangerFilter === "critical" ? "خطرة" : "محدودة"} — {hiddenCount} جدول مخفي
                    </p>
                  )}

                  <div className="space-y-2">
                    {filteredTables.map(tbl => {
                      const isOpen = selectedTable === `${ri}:${tbl.table}`;
                      return (
                        <div key={tbl.table} className="rounded-lg border border-border overflow-hidden">
                          {/* Table header row */}
                          <button
                            className="w-full flex items-center justify-between px-4 py-2.5 text-left hover:bg-muted/30 transition-colors"
                            onClick={() => setSelectedTable(isOpen ? null : `${ri}:${tbl.table}`)}
                          >
                            <div className="flex items-center gap-2">
                              {isOpen ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronRight className="w-4 h-4 text-muted-foreground" />}
                              <span className="font-mono text-sm font-semibold" dir="ltr">{tbl.table}</span>
                              {tbl.primary_key && (
                                <span className="text-[10px] px-1.5 py-0.5 rounded bg-accent/20 text-accent-foreground font-mono" dir="ltr">
                                  PK: {tbl.primary_key}
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${tbl.translatable_count > 0 ? "bg-green-500/15 text-green-600 dark:text-green-400" : "bg-muted text-muted-foreground"}`}>
                                {tbl.translatable_count > 0 ? `✓ ${tbl.translatable_count} قابل` : "غير قابل"}
                              </span>
                              <span className="text-xs text-muted-foreground">{tbl.fields.length} حقل</span>
                            </div>
                          </button>

                          {/* Field details */}
                          {isOpen && (
                            <div className="border-t border-border bg-background/60">
                              <p className="px-4 pt-2 pb-0 text-[10px] text-muted-foreground flex items-center gap-1.5">
                                <span>ℹ️</span>
                                <span><strong className="text-foreground">max_bytes ~</strong> قيمة مُقدَّرة من أطول نص مرصود — لا يوجد حدٌّ مكتوب في بنية BDAT. الحد الحقيقي محدد برمجياً داخل محرك اللعبة.</span>
                              </p>
                              <div className="overflow-x-auto">
                                <table className="w-full text-xs">
                                   <thead>
                                    <tr className="border-b border-border bg-muted/30">
                                       {[
                                         { key: "الحقل", title: undefined },
                                         { key: "النوع", title: undefined },
                                         { key: "ترجمة", title: undefined },
                                         { key: "max_bytes ~", title: "⚠ هذه القيمة مُقدَّرة وليست مكتوبة في بنية BDAT — تُمثّل أطول نص مرصود في هذا العمود. الحد الحقيقي محدد برمجياً داخل محرك اللعبة فقط." },
                                         { key: "أحرف عربية", title: "عدد الأحرف العربية المتاحة (كل حرف = 2 بايت)" },
                                         { key: "خطورة الطول", title: "مؤشر خطورة الطول: 🔴 خطرة جداً (≤10) | 🟡 محدودة (11-30) | 🟢 مريحة (>30)" },
                                         { key: "صفوف", title: undefined },
                                         { key: "multiline", title: undefined },
                                         { key: "وسوم", title: undefined },
                                       ].map(h => (
                                         <th key={h.key} title={h.title} className={`px-3 py-2 text-right font-display font-semibold whitespace-nowrap ${h.title ? "text-foreground cursor-help underline decoration-dotted" : "text-muted-foreground"}`}>{h.key}</th>
                                       ))}
                                      {samplesEnabled && <th className="px-3 py-2 text-right font-display font-semibold text-muted-foreground">عينة</th>}
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {tbl.fields.filter(field => {
                                      if (dangerFilter === "all") return true;
                                      const chars = field.max_utf8_bytes > 0 ? Math.floor(field.max_utf8_bytes / 2) : 0;
                                      const d = !field.translate || field.max_utf8_bytes <= 0 ? "none" : chars <= 10 ? "critical" : chars <= 30 ? "limited" : "safe";
                                      return d === dangerFilter;
                                    }).map(field => {
                                      // Arabic chars available = floor(max_utf8_bytes / 2)
                                      const arabicChars = field.max_utf8_bytes > 0 ? Math.floor(field.max_utf8_bytes / 2) : 0;
                                      const danger: "critical" | "limited" | "safe" | "none" = !field.translate || field.max_utf8_bytes <= 0
                                        ? "none"
                                        : arabicChars <= 10
                                        ? "critical"
                                        : arabicChars <= 30
                                        ? "limited"
                                        : "safe";
                                      const dangerConfig = {
                                        critical: { emoji: "🔴", label: "خطرة", cls: "bg-red-500/15 text-red-600 dark:text-red-400 border-red-500/30" },
                                        limited:  { emoji: "🟡", label: "محدودة", cls: "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30" },
                                        safe:     { emoji: "🟢", label: "مريحة", cls: "bg-green-500/15 text-green-600 dark:text-green-400 border-green-500/30" },
                                        none:     { emoji: "–", label: "–", cls: "text-muted-foreground" },
                                      }[danger];
                                      return (
                                      <tr key={field.field_name} className={`border-b border-border/50 hover:bg-muted/20 transition-colors ${danger === "critical" ? "bg-red-500/5" : ""}`}>
                                        <td className="px-3 py-2 font-mono font-semibold whitespace-nowrap" dir="ltr">{field.field_name}</td>
                                        <td className="px-3 py-2">
                                          <span className="px-1.5 py-0.5 rounded bg-secondary/20 font-mono text-[10px]">{field.data_type}</span>
                                        </td>
                                        <td className="px-3 py-2">
                                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${field.translate ? "bg-green-500/15 text-green-600 dark:text-green-400" : "bg-muted text-muted-foreground"}`}>
                                            {field.translate ? "✓ نعم" : "✗ لا"}
                                          </span>
                                        </td>
                                         <td className="px-3 py-2 text-center font-mono text-xs">{field.max_utf8_bytes > 0 ? field.max_utf8_bytes : "–"}</td>
                                         <td className="px-3 py-2 text-center font-mono">
                                           {field.translate && arabicChars > 0 ? (
                                             <span className={`font-bold text-sm ${danger === "critical" ? "text-red-500 dark:text-red-400" : danger === "limited" ? "text-amber-500 dark:text-amber-400" : "text-green-600 dark:text-green-400"}`}>
                                               {arabicChars}
                                             </span>
                                           ) : (
                                             <span className="text-muted-foreground">–</span>
                                           )}
                                         </td>
                                         <td className="px-3 py-2 text-center">
                                           {danger !== "none" ? (
                                             <span
                                               className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold border ${dangerConfig.cls}`}
                                               title={`${arabicChars} حرف عربي متاح (${field.max_utf8_bytes} بايت)`}
                                             >
                                               {dangerConfig.emoji} {dangerConfig.label}
                                             </span>
                                           ) : (
                                             <span className="text-muted-foreground text-[10px]">–</span>
                                           )}
                                         </td>
                                        <td className="px-3 py-2 text-center font-mono">{field.record_count}</td>
                                        <td className="px-3 py-2 text-center">
                                          <span className={`text-[10px] ${field.multiline ? "text-blue-500" : "text-muted-foreground"}`}>
                                            {field.multiline ? "✓" : "–"}
                                          </span>
                                        </td>
                                        <td className="px-3 py-2 max-w-[180px]">
                                          <div className="flex flex-wrap gap-1" dir="ltr">
                                            {field.allowed_tags.slice(0, 4).map(t => (
                                              <span key={t} className="px-1 py-0.5 rounded bg-primary/10 text-primary font-mono text-[10px]">{t}</span>
                                            ))}
                                            {field.allowed_tags.length > 4 && (
                                              <span className="text-[10px] text-muted-foreground">+{field.allowed_tags.length - 4}</span>
                                            )}
                                          </div>
                                        </td>
                                         {samplesEnabled && (
                                           <td className="px-3 py-2 font-mono text-[10px] text-muted-foreground max-w-[120px] truncate" dir="ltr">
                                             {field.samples?.[0] ?? "–"}
                                           </td>
                                         )}
                                       </tr>
                                     );
                                    })}
                                  </tbody>
                                </table>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
                );
              })}
            </CardContent>
          </Card>
        )}

        {/* Go to editor button - shown after processing is done */}
        {stage === "done" && (
          <div className="flex justify-center mb-6">
            <Button size="lg" onClick={() => navigate("/editor")} className="gap-2 text-lg px-8">
              <Pencil className="w-5 h-5" />
              انتقل إلى المحرر
              <ArrowRight className="w-5 h-5" />
            </Button>
          </div>
        )}
      </div>
      </div>
    </div>
  );
};

export default XenobladeProcess;
