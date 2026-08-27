import { describe, expect, it } from "vitest";
import {
  createEditorWorkspaceBackup,
  parseEditorWorkspaceBackup,
  restoreEditorState,
} from "@/lib/editor-workspace-backup";
import { defaultEditorWorkspace } from "@/lib/editor-workspace";

const state = {
  entries: [{ msbtFile: "data/a.bundle", index: 4, label: "line", original: "Keep {name}", maxBytes: 0 }],
  translations: { "data/a.bundle:4": "أبقِ {name}" },
  protectedEntries: new Set(["data/a.bundle:4"]),
  technicalBypass: new Set<string>(),
  clearedKeys: new Set<string>(),
};

describe("editor workspace backup", () => {
  it("يحفظ النصوص ومساحة العمل فقط ويستعيد المجموعات بصورة صحيحة", () => {
    const backup = createEditorWorkspaceBackup({
      state,
      workspace: { ...defaultEditorWorkspace(), search: "name", filtersOpen: true },
      sourceGame: "lumentale",
      appVersion: "2.2.8",
    });

    const parsed = parseEditorWorkspaceBackup(JSON.parse(JSON.stringify(backup)));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.backup).not.toHaveProperty("userGmiCloudKey");
    expect(parsed.backup.workspace.search).toBe("name");
    const restored = restoreEditorState(parsed.backup.editorState);
    expect(restored.translations).toEqual(state.translations);
    expect(restored.protectedEntries?.has("data/a.bundle:4")).toBe(true);
  });

  it("يرفض ملفاً ناقصاً قبل أن يصل إلى حالة المحرر", () => {
    expect(parseEditorWorkspaceBackup({ format: "arabize-editor-workspace-backup", version: 1 })).toEqual({
      ok: false,
      reason: "بيانات تعريف النسخة الاحتياطية غير مكتملة",
    });
  });

  it("يعيد مساحة العمل ذات القيم الغريبة إلى القيم الآمنة", () => {
    const backup = createEditorWorkspaceBackup({
      state,
      workspace: defaultEditorWorkspace(),
      sourceGame: "lumentale",
      appVersion: "2.2.8",
    });
    const parsed = parseEditorWorkspaceBackup({
      ...backup,
      workspace: { ...backup.workspace, filterStatus: "unexpected", search: 42 },
    });
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.backup.workspace).toEqual(defaultEditorWorkspace());
  });
});
