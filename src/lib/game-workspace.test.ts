import { beforeEach, describe, expect, it, vi } from "vitest";
import { findLibraryGame, LIBRARY_GAMES } from "./game-library";

const memory = vi.hoisted(() => new Map<string, unknown>());
vi.mock("./idb-storage", () => ({
  idbGet: async <T>(key: string) => memory.get(key) as T | undefined,
  idbSet: async (key: string, value: unknown) => { memory.set(key, value); },
}));
import { activateGameWorkspace, getWorkspaceProgress, readWorkspaceNotes, saveWorkspaceNotes } from "./game-workspace";

const sun = findLibraryGame("goldensun")!;
const lost = findLibraryGame("goldensun2")!;
const record = (game: string, translations: Record<string, string> = {}) => ({
  entries: [{ msbtFile: `${game}/dialogue`, index: 0, original: "Hello" }],
  translations,
});
const key = (game: string) => `${game}/dialogue:0`;

describe("game library registry", () => {
  it("uses unique paths and keeps distinct profiles for the two Golden Sun games", () => {
    expect(new Set(LIBRARY_GAMES.map(game => game.id)).size).toBe(LIBRARY_GAMES.length);
    expect(sun.aiProfile).toBe("goldensun");
    expect(lost.aiProfile).toBe("goldensun2");
    for (const game of LIBRARY_GAMES) {
      expect(game.toolPath.startsWith("/")).toBe(true);
      expect(game.sourceId === undefined || game.sourceId.length > 0).toBe(true);
    }
  });
});

describe("safe switching between editor workspaces", () => {
  beforeEach(() => { memory.clear(); localStorage.clear(); });

  it("does not switch or erase a current game when the destination has no saved session", async () => {
    const previous = record("goldensun", { [key("goldensun")]: "مرحباً" });
    memory.set("editorState", previous);
    memory.set("editor-source-game", "goldensun");
    expect(await activateGameWorkspace(lost)).toBe(false);
    expect(memory.get("editorState")).toBe(previous);
    expect(memory.get("editor-source-game")).toBe("goldensun");
  });

  it("restores a saved game and backs up the current game's unsnapshotted progress", async () => {
    const first = record("goldensun", { [key("goldensun")]: "مرحباً" });
    const second = record("goldensun/lost-age", { [key("goldensun/lost-age")]: "أهلاً" });
    memory.set("editorState", first);
    memory.set("editor-source-game", "goldensun");
    memory.set("editorState:goldensun2", second);
    memory.set("originalTexts", { [key("goldensun")]: "Hello" });

    expect(await activateGameWorkspace(lost)).toBe(true);
    expect(memory.get("editorState:goldensun")).toEqual(first);
    expect(memory.get("editorState")).toEqual(second);
    expect(memory.get("editor-source-game")).toBe("goldensun2");
    expect(memory.get("originalTexts")).toEqual({ [key("goldensun/lost-age")]: "Hello" });
    expect(memory.get("gameWorkspace:v2:goldensun:originalTexts")).toEqual({ [key("goldensun")]: "Hello" });

    expect(await activateGameWorkspace(sun)).toBe(true);
    expect(memory.get("editorState")).toEqual(first);
    expect(memory.get("originalTexts")).toEqual({ [key("goldensun")]: "Hello" });
  });

  it("never replaces a richer saved snapshot with fewer translations", async () => {
    const previous = { entries: [
      { msbtFile: "goldensun/dialogue", index: 0, original: "Hello" },
      { msbtFile: "goldensun/dialogue", index: 1, original: "Bye" },
    ], translations: { "goldensun/dialogue:0": "مرحباً" } };
    const richer = { ...previous, translations: { ...previous.translations, "goldensun/dialogue:1": "وداعاً" } };
    memory.set("editorState", previous);
    memory.set("editor-source-game", "goldensun");
    memory.set("editorState:goldensun", richer);
    memory.set("editorState:goldensun2", record("goldensun/lost-age"));
    expect(await activateGameWorkspace(lost)).toBe(true);
    expect(memory.get("editorState:goldensun")).toEqual(richer);
  });

  it("shows only the selected game's progress, not the active other game's total", async () => {
    memory.set("editor-source-game", "goldensun");
    memory.set("editorState", record("goldensun", { [key("goldensun")]: "مرحباً" }));
    memory.set("editorState:goldensun2", record("goldensun/lost-age"));
    expect(await getWorkspaceProgress(sun)).toEqual({ ready: true, total: 1, translated: 1 });
    expect(await getWorkspaceProgress(lost)).toEqual({ ready: true, total: 1, translated: 0 });
  });

  it("recognizes a legacy Xenoblade session without an editor-source-game flag", async () => {
    const xeno = { entries: [{ msbtFile: "bdat_quest", index: 0, original: "Hello" }],
      translations: { "bdat_quest:0": "مرحباً" } };
    const game = findLibraryGame("xenoblade")!;
    memory.set("editorState", xeno);
    expect(await getWorkspaceProgress(game)).toEqual({ ready: true, total: 1, translated: 1 });
    expect(await activateGameWorkspace(game)).toBe(true);
    expect(memory.get("editorState:xenoblade")).toEqual(xeno);
    expect(memory.get("editor-source-game")).toBe("xenoblade");
  });

  it("archives an unlabelled legacy session rather than dropping it during a switch", async () => {
    const legacy = record("unknown-game", { [key("unknown-game")]: "قديم" });
    memory.set("editorState", legacy);
    memory.set("editorState:goldensun2", record("goldensun/lost-age"));
    expect(await activateGameWorkspace(lost)).toBe(true);
    expect([...memory.entries()].some(([id, value]) =>
      id.startsWith("gameWorkspace:v2:legacy-session:") && value === legacy)).toBe(true);
  });

  it("keeps project notes independent and doesn't delete on navigation", () => {
    saveWorkspaceNotes("goldensun", "اكتمال القائمة");
    saveWorkspaceNotes("goldensun2", "الخط الصغير");
    expect(readWorkspaceNotes("goldensun")).toBe("اكتمال القائمة");
    expect(readWorkspaceNotes("goldensun2")).toBe("الخط الصغير");
  });
});
