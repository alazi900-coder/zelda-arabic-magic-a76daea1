import { idbGet, idbSet } from "./idb-storage";
import { resolveAiGameProfile } from "./ai-game-profiles";
import type { LibraryGame } from "./game-library";

/** The shared editor keeps using the legacy 'editorState' key.
 * This adapter only swaps already-saved complete sessions, never empty
 * placeholders and never mixes translation dictionaries from two games.
 */
export interface WorkspaceEditorSnapshot {
  entries: { msbtFile: string; index: number; original: string }[];
  translations: Record<string, string>;
  [key: string]: unknown;
}
export interface WorkspaceProgress {
  total: number;
  translated: number;
  ready: boolean;
}

const EMPTY: WorkspaceProgress = { total: 0, translated: 0, ready: false };
const noteKey = (id: string) => `gameWorkspace:v2:${id}:notes`;
const originalKey = (id: string) => `gameWorkspace:v2:${id}:originalTexts`;
const snapshotKey = (id: string) => `editorState:${id}`;
const normalizeSource = (source: string | undefined) => source === "risen" ? "risen1" : source;
const legacyXenoblade = (data: unknown) => isSnapshot(data) &&
  resolveAiGameProfile(data.entries[0]?.msbtFile) === "xenoblade";

function isSnapshot(data: unknown): data is WorkspaceEditorSnapshot {
  if (!data || typeof data !== "object") return false;
  const candidate = data as Partial<WorkspaceEditorSnapshot>;
  return Array.isArray(candidate.entries) && candidate.entries.length > 0 &&
    !!candidate.translations && typeof candidate.translations === "object";
}

function sameCatalog(a: WorkspaceEditorSnapshot, b: WorkspaceEditorSnapshot): boolean {
  return a.entries.length === b.entries.length &&
    a.entries.every((entry, index) =>
      entry.msbtFile === b.entries[index]?.msbtFile &&
      entry.index === b.entries[index]?.index &&
      entry.original === b.entries[index]?.original);
}

function countTranslated(data: WorkspaceEditorSnapshot): number {
  const keys = new Set(data.entries.map(entry => `${entry.msbtFile}:${entry.index}`));
  return Object.entries(data.translations).filter(([key, value]) =>
    keys.has(key) && typeof value === "string" && value.trim().length > 0).length;
}

/** Read-only, including when the game was imported by an older build. */
export async function getWorkspaceProgress(game: LibraryGame): Promise<WorkspaceProgress> {
  if (!game.sourceId) return EMPTY;
  const [source, saved] = await Promise.all([
    idbGet<string>("editor-source-game"),
    idbGet<unknown>(snapshotKey(game.sourceId)),
  ]);
  // Avoid cloning the (possibly huge) active editor for every library card.
  // Read it only for that game's card, or for an untagged legacy Xenoblade session.
  const sourceId = normalizeSource(source);
  const mayBeCurrent = sourceId === game.sourceId || (!sourceId && game.id === "xenoblade");
  const active = mayBeCurrent ? await idbGet<unknown>("editorState") : undefined;
  const current = (sourceId === game.sourceId || (!sourceId && game.id === "xenoblade" && legacyXenoblade(active))) &&
    isSnapshot(active) ? active : undefined;
  const stored = isSnapshot(saved) ? saved : undefined;
  const session = current && stored && sameCatalog(current, stored)
    ? countTranslated(current) >= countTranslated(stored) ? current : stored
    : current ?? stored;
  return session
    ? { total: session.entries.length, translated: countTranslated(session), ready: true }
    : EMPTY;
}

/** Activate a previously saved game. Returns false if this game has no
 * saved editor entries; in that case the user must import using its tool page.
 * The source workspace is backed up before changing the shared editor slot.
 */
export async function activateGameWorkspace(game: LibraryGame): Promise<boolean> {
  if (!game.sourceId) return false;
  const desired = game.sourceId;
  const [rawSource, active, stored] = await Promise.all([
    idbGet<string>("editor-source-game"),
    idbGet<unknown>("editorState"),
    idbGet<unknown>(snapshotKey(desired)),
  ]);
  const current = isSnapshot(active) ? active : undefined;
  const currentSource = normalizeSource(rawSource) ??
    (legacyXenoblade(active) ? "xenoblade" : undefined);

  if (currentSource === desired && current) {
    // Bring pre-profile Xenoblade sessions under the normal snapshot key
    // without changing a single translation.
    if (!rawSource) {
      await idbSet(snapshotKey(desired), current);
      await idbSet("editor-source-game", desired);
    }
    return true;
  }
  if (!isSnapshot(stored)) return false; // Never open another game's texts.

  if (current) {
    if (currentSource && currentSource !== desired) {
      const previous = await idbGet<unknown>(snapshotKey(currentSource));
      if (!isSnapshot(previous) ||
          (sameCatalog(previous, current) && countTranslated(current) >= countTranslated(previous))) {
        await idbSet(snapshotKey(currentSource), current);
      }
      const originals = await idbGet<unknown>("originalTexts");
      if (originals) await idbSet(originalKey(currentSource), originals);
    } else if (!currentSource) {
      // Unknown old session: archive it instead of silently losing translations.
      await idbSet(`gameWorkspace:v2:legacy-session:${Date.now()}`, current);
    }
  }

  // Restore originals per-game so identically named entries across games
  // cannot inherit English source strings from the previous editor session.
  const originals = await idbGet<Record<string, string>>(originalKey(desired));
  await idbSet("originalTexts", originals ?? Object.fromEntries(
    stored.entries.map(entry => [`${entry.msbtFile}:${entry.index}`, entry.original])
  ));
  await idbSet("editorState", stored);
  await idbSet("editor-source-game", desired);
  return true;
}

export function readWorkspaceNotes(id: string): string {
  try { return localStorage.getItem(noteKey(id)) ?? ""; }
  catch { return ""; }
}
export function saveWorkspaceNotes(id: string, notes: string): void {
  try {
    if (notes) localStorage.setItem(noteKey(id), notes);
    else localStorage.removeItem(noteKey(id));
  } catch { /* storage may be unavailable */ }
}
