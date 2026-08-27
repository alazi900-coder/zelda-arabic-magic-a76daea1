/**
 * سياسة هذا الملف: النسخة الاحتياطية تنقل نصوص المحرر ومساحة عمله فقط.
 * لا تُضمَّن إعدادات الذكاء أو المفاتيح أو الملفات الثنائية المصدرية مطلقاً.
 */
import type { EditorState, ExtractedEntry } from "@/components/editor/types";
import {
  defaultEditorWorkspace,
  readEditorWorkspace,
  type EditorWorkspaceSnapshot,
} from "@/lib/editor-workspace";

export const EDITOR_WORKSPACE_BACKUP_FORMAT = "arabize-editor-workspace-backup";
export const EDITOR_WORKSPACE_BACKUP_VERSION = 1;

export interface StoredEditorStateSnapshot {
  entries: ExtractedEntry[];
  translations: Record<string, string>;
  protectedEntries: string[];
  technicalBypass: string[];
  clearedKeys: string[];
}

export interface EditorWorkspaceBackup {
  format: typeof EDITOR_WORKSPACE_BACKUP_FORMAT;
  version: typeof EDITOR_WORKSPACE_BACKUP_VERSION;
  exportedAt: string;
  appVersion: string;
  sourceGame: string;
  editorState: StoredEditorStateSnapshot;
  workspace: EditorWorkspaceSnapshot;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function isEntries(value: unknown): value is ExtractedEntry[] {
  return Array.isArray(value) && value.every((entry) => isRecord(entry)
    && typeof entry.msbtFile === "string"
    && typeof entry.index === "number"
    && typeof entry.label === "string"
    && typeof entry.original === "string"
    && typeof entry.maxBytes === "number");
}

function isTranslations(value: unknown): value is Record<string, string> {
  return isRecord(value) && Object.values(value).every((translation) => typeof translation === "string");
}

export function serializeEditorState(state: EditorState): StoredEditorStateSnapshot {
  return {
    entries: state.entries,
    translations: state.translations,
    protectedEntries: Array.from(state.protectedEntries || []),
    technicalBypass: Array.from(state.technicalBypass || []),
    clearedKeys: Array.from(state.clearedKeys || []),
  };
}

export function restoreEditorState(snapshot: StoredEditorStateSnapshot): EditorState {
  return {
    entries: snapshot.entries,
    translations: snapshot.translations,
    protectedEntries: new Set(snapshot.protectedEntries),
    technicalBypass: new Set(snapshot.technicalBypass),
    clearedKeys: new Set(snapshot.clearedKeys),
  };
}

export function createEditorWorkspaceBackup({
  state,
  workspace,
  sourceGame,
  appVersion,
}: {
  state: EditorState;
  workspace: EditorWorkspaceSnapshot;
  sourceGame: string;
  appVersion: string;
}): EditorWorkspaceBackup {
  return {
    format: EDITOR_WORKSPACE_BACKUP_FORMAT,
    version: EDITOR_WORKSPACE_BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    appVersion,
    sourceGame,
    editorState: serializeEditorState(state),
    workspace,
  };
}

export type EditorWorkspaceBackupParseResult =
  | { ok: true; backup: EditorWorkspaceBackup }
  | { ok: false; reason: string };

/** يرفض أي ملف لا يطابق المخطط قبل أن يسمح للواجهة بكتابة حالة المحرر. */
export function parseEditorWorkspaceBackup(value: unknown): EditorWorkspaceBackupParseResult {
  if (!isRecord(value)) return { ok: false, reason: "ملف النسخة الاحتياطية ليس كائناً صالحاً" };
  if (value.format !== EDITOR_WORKSPACE_BACKUP_FORMAT || value.version !== EDITOR_WORKSPACE_BACKUP_VERSION) {
    return { ok: false, reason: "صيغة النسخة الاحتياطية أو إصدارها غير مدعوم" };
  }
  if (typeof value.exportedAt !== "string" || typeof value.appVersion !== "string" || typeof value.sourceGame !== "string") {
    return { ok: false, reason: "بيانات تعريف النسخة الاحتياطية غير مكتملة" };
  }
  if (!isRecord(value.editorState)) return { ok: false, reason: "حالة المحرر مفقودة" };

  const stored = value.editorState;
  if (!isEntries(stored.entries) || !isTranslations(stored.translations)
    || !isStringArray(stored.protectedEntries) || !isStringArray(stored.technicalBypass)
    || !isStringArray(stored.clearedKeys)) {
    return { ok: false, reason: "بيانات الترجمات في النسخة الاحتياطية غير صالحة" };
  }

  return {
    ok: true,
    backup: {
      format: EDITOR_WORKSPACE_BACKUP_FORMAT,
      version: EDITOR_WORKSPACE_BACKUP_VERSION,
      exportedAt: value.exportedAt,
      appVersion: value.appVersion,
      sourceGame: value.sourceGame,
      editorState: {
        entries: stored.entries,
        translations: stored.translations,
        protectedEntries: stored.protectedEntries,
        technicalBypass: stored.technicalBypass,
        clearedKeys: stored.clearedKeys,
      },
      // مساحة العمل غير الموثوقة تمر عبر مرشحها القائم؛ القيم الغريبة تعود إلى الآمن.
      workspace: readEditorWorkspace(value.workspace ?? defaultEditorWorkspace()),
    },
  };
}

export function downloadEditorWorkspaceBackup(backup: EditorWorkspaceBackup): void {
  const stamp = backup.exportedAt.replace(/[:.]/g, "-");
  const game = backup.sourceGame.replace(/[^a-z0-9_-]/gi, "-") || "editor";
  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `arabize-workspace-${game}-${stamp}.json`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
