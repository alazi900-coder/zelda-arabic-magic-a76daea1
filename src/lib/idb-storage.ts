const DB_NAME = "arabize-editor";
const STORE_NAME = "files";
const DB_VERSION = 1;

/**
 * SCHEMA_VERSION — bump this whenever the SHAPE of stored objects in IndexedDB
 * changes in a backwards-incompatible way (e.g. translations key format,
 * entry structure, protected-set encoding). On mismatch we will:
 *   1. Auto-export a JSON backup of `editorState` to the user's downloads.
 *   2. Wipe IDB (preserving nothing).
 *   3. Reload so the app starts on the fresh schema.
 *
 * Do NOT bump for cosmetic / additive changes — only when old data would
 * actively misbehave under new code.
 */
export const SCHEMA_VERSION = 1;

const META_KEY = "__schema_meta__";

interface SchemaMeta {
  schemaVersion: number;
  appVersion?: string;
  updatedAt: string;
}

// Cached DB handle — opening IndexedDB on every read/write piles up connections
// (especially noticeable during autosave). Keep one handle for the session.
let dbPromise: Promise<IDBDatabase> | null = null;

function openDB(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(STORE_NAME);
    };
    req.onsuccess = () => {
      const db = req.result;
      // If the DB is closed (e.g. another tab bumped the version), drop the
      // cache so the next call opens a fresh handle.
      db.onclose = () => { if (dbPromise) dbPromise = null; };
      db.onversionchange = () => {
        db.close();
        if (dbPromise) dbPromise = null;
      };
      resolve(db);
    };
    req.onerror = () => {
      dbPromise = null;
      reject(req.error);
    };
  });
  return dbPromise;
}

export async function idbSet(key: string, value: unknown): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function idbGet<T = unknown>(key: string): Promise<T | undefined> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const req = tx.objectStore(STORE_NAME).get(key);
    req.onsuccess = () => resolve(req.result as T);
    req.onerror = () => reject(req.error);
  });
}

export async function idbClear(): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).clear();
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function idbClearExcept(keepKeys: string[]): Promise<void> {
  // Read values to preserve
  const preserved: Record<string, unknown> = {};
  for (const key of keepKeys) {
    const val = await idbGet(key);
    if (val !== undefined) preserved[key] = val;
  }
  // Clear everything
  await idbClear();
  // Restore preserved keys
  for (const [key, val] of Object.entries(preserved)) {
    await idbSet(key, val);
  }
}

// ───────────────────────────────────────────────────────────────────────────
// Schema versioning + migration
// ───────────────────────────────────────────────────────────────────────────

export async function getSchemaMeta(): Promise<SchemaMeta | undefined> {
  return idbGet<SchemaMeta>(META_KEY);
}

export async function setSchemaMeta(meta: Partial<SchemaMeta>): Promise<void> {
  const existing = (await getSchemaMeta()) ?? {
    schemaVersion: SCHEMA_VERSION,
    updatedAt: new Date().toISOString(),
  };
  await idbSet(META_KEY, {
    ...existing,
    ...meta,
    updatedAt: new Date().toISOString(),
  });
}

/** Trigger a JSON download in the browser. Safe to call from anywhere. */
function downloadJson(filename: string, data: unknown): void {
  try {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  } catch (err) {
    console.error("[idb] Failed to trigger backup download:", err);
  }
}

export interface SchemaCheckResult {
  status: "fresh" | "match" | "appVersionChanged" | "migrated";
  storedSchemaVersion?: number;
  storedAppVersion?: string;
  backupTriggered: boolean;
}

/**
 * Run on app start. Compares stored schema/app versions against the running
 * build:
 *   - Schema mismatch → auto-export `editorState` as JSON backup, then wipe IDB.
 *   - App version changed → return "appVersionChanged" so the UI can surface a
 *     "تحديث متاح" toast (we do NOT wipe in this case — only on schema change).
 *   - First run → write meta and return "fresh".
 */
export async function checkAndMigrateSchema(currentAppVersion: string): Promise<SchemaCheckResult> {
  const meta = await getSchemaMeta();

  // First run — no meta yet.
  if (!meta) {
    await setSchemaMeta({ schemaVersion: SCHEMA_VERSION, appVersion: currentAppVersion });
    return { status: "fresh", backupTriggered: false };
  }

  // Schema mismatch — auto-backup then wipe.
  if (meta.schemaVersion !== SCHEMA_VERSION) {
    let backupTriggered = false;
    try {
      const editorState = await idbGet<unknown>("editorState");
      const originals = await idbGet<unknown>("originalTexts");
      if (editorState || originals) {
        const ts = new Date().toISOString().replace(/[:.]/g, "-");
        downloadJson(`arabize-backup-schema-v${meta.schemaVersion}-to-v${SCHEMA_VERSION}-${ts}.json`, {
          schemaVersion: meta.schemaVersion,
          appVersion: meta.appVersion,
          exportedAt: new Date().toISOString(),
          editorState,
          originalTexts: originals,
        });
        backupTriggered = true;
      }
    } catch (err) {
      console.error("[idb] backup before migration failed:", err);
    }

    await idbClear();
    await setSchemaMeta({ schemaVersion: SCHEMA_VERSION, appVersion: currentAppVersion });
    return {
      status: "migrated",
      storedSchemaVersion: meta.schemaVersion,
      storedAppVersion: meta.appVersion,
      backupTriggered,
    };
  }

  // App version changed but schema is still compatible — just refresh meta.
  if (meta.appVersion !== currentAppVersion) {
    await setSchemaMeta({ schemaVersion: SCHEMA_VERSION, appVersion: currentAppVersion });
    return {
      status: "appVersionChanged",
      storedSchemaVersion: meta.schemaVersion,
      storedAppVersion: meta.appVersion,
      backupTriggered: false,
    };
  }

  return {
    status: "match",
    storedSchemaVersion: meta.schemaVersion,
    storedAppVersion: meta.appVersion,
    backupTriggered: false,
  };
}

export interface BackupImportResult {
  ok: boolean;
  reason?: string;
  importedEditorState: boolean;
  importedOriginals: boolean;
  schemaVersion?: number;
}

/**
 * Import a previously-exported backup JSON file. Validates shape, then writes
 * `editorState` and `originalTexts` back into IDB. Caller should reload after.
 */
export async function importEditorStateBackup(file: File): Promise<BackupImportResult> {
  try {
    const text = await file.text();
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      return { ok: false, reason: "ملف JSON غير صالح", importedEditorState: false, importedOriginals: false };
    }

    if (!parsed || typeof parsed !== "object") {
      return { ok: false, reason: "بنية الملف غير متوقعة", importedEditorState: false, importedOriginals: false };
    }

    const obj = parsed as Record<string, unknown>;
    const editorState = obj.editorState;
    const originalTexts = obj.originalTexts;
    const schemaVersion = typeof obj.schemaVersion === "number" ? obj.schemaVersion : undefined;

    if (editorState === undefined && originalTexts === undefined) {
      return {
        ok: false,
        reason: "الملف لا يحتوي على ترجمات (editorState/originalTexts مفقودة)",
        importedEditorState: false,
        importedOriginals: false,
      };
    }

    let importedEditorState = false;
    let importedOriginals = false;

    if (editorState !== undefined) {
      await idbSet("editorState", editorState);
      importedEditorState = true;
    }
    if (originalTexts !== undefined) {
      await idbSet("originalTexts", originalTexts);
      importedOriginals = true;
    }

    // Mark current schema as the active one — the data we just imported is now
    // canonical, regardless of what version it was exported from.
    await setSchemaMeta({ schemaVersion: SCHEMA_VERSION });

    return { ok: true, importedEditorState, importedOriginals, schemaVersion };
  } catch (err) {
    console.error("[idb] import backup failed:", err);
    return {
      ok: false,
      reason: err instanceof Error ? err.message : "خطأ غير معروف",
      importedEditorState: false,
      importedOriginals: false,
    };
  }
}

/** Manual backup — used by the "نسخة احتياطية قبل الترقية" button. */
export async function exportEditorStateBackup(label = "manual"): Promise<boolean> {
  try {
    const editorState = await idbGet<unknown>("editorState");
    const originals = await idbGet<unknown>("originalTexts");
    if (!editorState && !originals) return false;
    const ts = new Date().toISOString().replace(/[:.]/g, "-");
    downloadJson(`arabize-backup-${label}-${ts}.json`, {
      schemaVersion: SCHEMA_VERSION,
      exportedAt: new Date().toISOString(),
      editorState,
      originalTexts: originals,
    });
    return true;
  } catch (err) {
    console.error("[idb] manual backup failed:", err);
    return false;
  }
}
