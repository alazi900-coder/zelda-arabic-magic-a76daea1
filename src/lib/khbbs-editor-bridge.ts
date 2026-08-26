/**
 * KINGDOM HEARTS BBS EDITOR BRIDGE
 * Design: CTD files are opened locally, flattened only for the shared editor,
 * and retained intact in IndexedDB. CTD opened from the BBS manager also keep
 * their original DAT resource reference, never a guessed offset.
 */

import JSZip from "jszip";
import type { ExtractedEntry } from "@/components/editor/types";
import { idbGet, idbSet } from "@/lib/idb-storage";
import type { KHBbsCtdEditorInput, KHBbsResourceReference } from "@/lib/khbbs-bbs-workspace";
import { buildCTD, editableEntryCount, parseCTD, type CTDDocument } from "@/lib/khbbs-ctd";

export const KHBBS_SOURCE_GAME = "kingdom-hearts-bbs";
export const KHBBS_DOCUMENTS_KEY = "khbbs-ctd-documents";
export const KHBBS_FILE_RE = /^khbbs:/;

interface KHBbsStoredFile {
  path: string;
  document: CTDDocument;
  bbsSource?: KHBbsResourceReference;
}

interface CandidateCTD {
  path: string;
  bytes: ArrayBuffer;
  bbsSource?: KHBbsResourceReference;
}

interface KHBbsRebuiltFile {
  path: string;
  bytes: Uint8Array;
  changed: boolean;
  bbsSource?: KHBbsResourceReference;
}

type KHBbsEditorOpenInput = File | KHBbsCtdEditorInput;

export interface KHBbsOpenResult {
  fileCount: number;
  entryCount: number;
  rejected: string[];
}

export interface KHBbsBuildResult {
  archive: Blob;
  fileCount: number;
  changedFiles: number;
  translatedLines: number;
}

export interface KHBbsBbsBuildResult {
  replacements: Array<{ source: KHBbsResourceReference; bytes: Uint8Array }>;
  fileCount: number;
  changedFiles: number;
  translatedLines: number;
}

export function khbbsEntryKey(path: string, index: number): string {
  return `khbbs:${path}:${index}`;
}

function editorFileName(path: string): string {
  return `khbbs:${path}`;
}

function pathFromEditorFile(msbtFile: string): string {
  return msbtFile.slice("khbbs:".length);
}

function normalizeOpenInput(input: KHBbsEditorOpenInput): { file: File; bbsSource?: KHBbsResourceReference } {
  return input instanceof File ? { file: input } : input;
}

async function collectCandidates(uploads: KHBbsEditorOpenInput[]): Promise<{ candidates: CandidateCTD[]; rejected: string[] }> {
  const candidates: CandidateCTD[] = [];
  const rejected: string[] = [];

  for (const input of uploads) {
    const { file: upload, bbsSource } = normalizeOpenInput(input);
    const lowerName = upload.name.toLowerCase();
    if (lowerName.endsWith(".ctd")) {
      candidates.push({ path: upload.name, bytes: await upload.arrayBuffer(), bbsSource });
      continue;
    }

    if (lowerName.endsWith(".zip")) {
      try {
        const archive = await JSZip.loadAsync(upload);
        const members = Object.values(archive.files)
          .filter((member) => !member.dir && member.name.toLowerCase().endsWith(".ctd"))
          .sort((a, b) => a.name.localeCompare(b.name));
        if (members.length === 0) {
          rejected.push(`${upload.name}: لا يحتوي ملفات .ctd`);
          continue;
        }
        for (const member of members) candidates.push({ path: member.name, bytes: await member.async("arraybuffer") });
      } catch {
        rejected.push(`${upload.name}: ملف ZIP غير صالح أو غير قابل للقراءة`);
      }
      continue;
    }

    rejected.push(`${upload.name}: النوع غير مدعوم`);
  }

  return { candidates, rejected };
}

/** Opens CTD files or a ZIP. Inputs from BBS keep their real DAT resource reference. */
export async function openKHBbsInEditor(uploads: KHBbsEditorOpenInput[]): Promise<KHBbsOpenResult> {
  const { candidates, rejected } = await collectCandidates(uploads);
  const loaded: KHBbsStoredFile[] = [];
  const usedPaths = new Set<string>();

  for (const candidate of candidates) {
    const path = candidate.path.replace(/\\/g, "/");
    if (usedPaths.has(path)) {
      rejected.push(`${path}: اسم مكرر داخل الملفات المفتوحة`);
      continue;
    }
    try {
      loaded.push({ path, document: parseCTD(candidate.bytes), bbsSource: candidate.bbsSource });
      usedPaths.add(path);
    } catch (error) {
      rejected.push(`${path}: ${error instanceof Error ? error.message : "تعذر تحليل ملف CTD"}`);
    }
  }

  if (loaded.length === 0) throw new Error(rejected.length ? rejected.join("\n") : "لم يتم العثور على أي ملف CTD صالح.");

  const entries: ExtractedEntry[] = [];
  const originals: Record<string, string> = {};
  for (const file of loaded) {
    for (const entry of file.document.entries) {
      if (!entry.editable) continue;
      const msbtFile = editorFileName(file.path);
      entries.push({
        msbtFile,
        index: entry.index,
        label: `${file.path} · #${entry.index + 1}`,
        original: entry.text,
        // CTD pointers are rebuilt into a fresh string area; do not show a
        // false fixed-byte warning before the custom CTD builder runs.
        maxBytes: 0,
      });
      originals[khbbsEntryKey(file.path, entry.index)] = entry.text;
    }
  }

  const previous = await idbGet<{ translations?: Record<string, string> }>("editorState");
  const validKeys = new Set(entries.map((entry) => `${entry.msbtFile}:${entry.index}`));
  const translations: Record<string, string> = {};
  for (const [key, value] of Object.entries(previous?.translations || {})) {
    if (validKeys.has(key) && value?.trim()) translations[key] = value;
  }

  await idbSet(KHBBS_DOCUMENTS_KEY, loaded);
  await idbSet("editorState", { entries, translations, freshExtraction: true });
  await idbSet("editor-source-game", KHBBS_SOURCE_GAME);
  await idbSet("originalTexts", originals);

  return { fileCount: loaded.length, entryCount: entries.length, rejected };
}

async function rebuildKHBbsFiles(translations: Record<string, string>): Promise<{
  files: KHBbsRebuiltFile[];
  fileCount: number;
  changedFiles: number;
  translatedLines: number;
}> {
  const files = await idbGet<KHBbsStoredFile[]>(KHBBS_DOCUMENTS_KEY);
  if (!files?.length) throw new Error("لم يُعثر على ملفات CTD الأصلية. عد إلى صفحة Kingdom Hearts وافتحها من جديد.");

  const rebuilt: KHBbsRebuiltFile[] = [];
  let changedFiles = 0;
  let translatedLines = 0;
  for (const file of files) {
    const entries = file.document.entries.map((entry) => {
      const translation = translations[khbbsEntryKey(file.path, entry.index)];
      const nextTranslation = translation?.trim() ? translation : entry.text;
      if (entry.editable && nextTranslation !== entry.text) translatedLines += 1;
      return { ...entry, translation: nextTranslation };
    });
    const changed = entries.some((entry) => entry.translation !== entry.text);
    if (changed) changedFiles += 1;
    rebuilt.push({ path: file.path, bytes: buildCTD(file.document, entries), changed, bbsSource: file.bbsSource });
  }
  return { files: rebuilt, fileCount: files.length, changedFiles, translatedLines };
}

/** Rebuilds every opened CTD and packages them under their original ZIP paths. */
export async function buildKHBbsArchive(translations: Record<string, string>): Promise<KHBbsBuildResult> {
  const result = await rebuildKHBbsFiles(translations);
  const archive = new JSZip();
  for (const file of result.files) archive.file(file.path, file.bytes);
  return {
    archive: await archive.generateAsync({ type: "blob", compression: "DEFLATE", compressionOptions: { level: 6 } }),
    fileCount: result.fileCount,
    changedFiles: result.changedFiles,
    translatedLines: result.translatedLines,
  };
}

/** A DAT output is allowed only if every session file retained its exact BBS source. */
export async function hasKHBbsBbsSources(): Promise<boolean> {
  const files = await idbGet<KHBbsStoredFile[]>(KHBBS_DOCUMENTS_KEY);
  if (!files?.length) return false;
  return files.every((file) => Boolean(file.bbsSource));
}

/** Rebuilds only changed CTDs as original-resource replacements for safe DAT output. */
export async function buildKHBbsBbsReplacements(translations: Record<string, string>): Promise<KHBbsBbsBuildResult> {
  const result = await rebuildKHBbsFiles(translations);
  const missingReference = result.files.some((file) => !file.bbsSource);
  if (missingReference) throw new Error("تحتوي جلسة المحرر على CTD بلا مرجع BBS؛ استخدم تنزيل ZIP لهذه الجلسة.");
  return {
    replacements: result.files
      .filter((file) => file.changed && file.bbsSource)
      .map((file) => ({ source: file.bbsSource!, bytes: file.bytes })),
    fileCount: result.fileCount,
    changedFiles: result.changedFiles,
    translatedLines: result.translatedLines,
  };
}

export async function getKHBbsSummary(): Promise<{ fileCount: number; entryCount: number }> {
  const files = await idbGet<KHBbsStoredFile[]>(KHBBS_DOCUMENTS_KEY);
  return {
    fileCount: files?.length || 0,
    entryCount: files?.reduce((total, file) => total + editableEntryCount(file.document), 0) || 0,
  };
}

export function isKHBbsEditorFile(msbtFile: string): boolean {
  return KHBBS_FILE_RE.test(msbtFile) && pathFromEditorFile(msbtFile).toLowerCase().endsWith(".ctd");
}
