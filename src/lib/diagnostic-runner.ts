/**
 * Wrapper around the diagnostic worker — provides Promise-based APIs with
 * automatic main-thread fallback if Web Workers are unavailable (e.g. older
 * mobile browsers, restricted environments, or if the worker fails to spawn).
 *
 * Two operations supported:
 *   • runRebalanceBatch — DP line-balancer for "Fix all" workflows.
 *   • runDetectBatch    — `detectIssues` for the deep diagnostic scan.
 */

import { balanceLines, splitEvenlyByLines } from "@/lib/balance-lines";
import {
  detectIssues,
  type DetectableEntry,
  type DiagnosticIssue,
} from "@/lib/diagnostic-detect";

// ───────────────────────── Rebalance ─────────────────────────

export interface RebalanceItem {
  key: string;
  original: string;
  translation: string;
  englishLineCount: number;
}

export interface RebalanceProgress {
  done: number;
  total: number;
}

export interface RebalanceResult {
  key: string;
  fixed: string;
}

// ───────────────────────── Detect ─────────────────────────

export interface DetectItem {
  entry: DetectableEntry;
  translation: string;
}

export interface DetectProgress {
  done: number;
  total: number;
}

// ───────────────────────── Worker plumbing ─────────────────────────

let workerSingleton: Worker | null = null;
let workerUnsupported = false;
let nextId = 1;

function getWorker(): Worker | null {
  if (workerUnsupported) return null;
  if (workerSingleton) return workerSingleton;
  try {
    workerSingleton = new Worker(
      new URL("@/workers/diagnostic.worker.ts", import.meta.url),
      { type: "module" },
    );
    return workerSingleton;
  } catch (err) {
    console.warn("[diagnostic] Web Worker unavailable, falling back to main thread:", err);
    workerUnsupported = true;
    return null;
  }
}

// ───────────────────────── Rebalance API ─────────────────────────

export function runRebalanceBatch(
  batch: RebalanceItem[],
  onProgress?: (p: RebalanceProgress) => void,
): Promise<RebalanceResult[]> {
  const worker = getWorker();
  if (!worker) return runRebalanceMainThread(batch, onProgress);

  const id = nextId++;
  return new Promise<RebalanceResult[]>((resolve, reject) => {
    const handler = (ev: MessageEvent) => {
      const msg = ev.data;
      if (!msg || msg.id !== id) return;
      if (msg.type === "rebalance:progress" && onProgress) {
        onProgress({ done: msg.done, total: msg.total });
      } else if (msg.type === "rebalance:done") {
        worker.removeEventListener("message", handler);
        resolve(msg.results as RebalanceResult[]);
      }
    };
    const errHandler = (err: ErrorEvent) => {
      worker.removeEventListener("message", handler);
      worker.removeEventListener("error", errHandler);
      console.error("[diagnostic worker] error, falling back:", err.message);
      runRebalanceMainThread(batch, onProgress).then(resolve, reject);
    };
    worker.addEventListener("message", handler);
    worker.addEventListener("error", errHandler, { once: true });
    worker.postMessage({ type: "rebalance", id, batch });
  });
}

function runRebalanceMainThread(
  batch: RebalanceItem[],
  onProgress?: (p: RebalanceProgress) => void,
): Promise<RebalanceResult[]> {
  return new Promise((resolve) => {
    const results: RebalanceResult[] = [];
    const STEP = 100;
    let i = 0;
    const total = batch.length;
    const tick = () => {
      const end = Math.min(i + STEP, total);
      for (; i < end; i++) {
        const item = batch[i];
        try {
          const fixed = item.englishLineCount > 1
            ? splitEvenlyByLines(item.translation, item.englishLineCount)
            : balanceLines(item.translation);
          if (fixed !== item.translation) {
            results.push({ key: item.key, fixed });
          }
        } catch {
          // skip
        }
      }
      onProgress?.({ done: i, total });
      if (i < total) setTimeout(tick, 0);
      else resolve(results);
    };
    tick();
  });
}

// ───────────────────────── Detect API ─────────────────────────

/**
 * Run `detectIssues` over every entry/translation pair off the main thread.
 * Falls back to a chunked main-thread loop if the worker is unavailable.
 */
export function runDetectBatch(
  batch: DetectItem[],
  onProgress?: (p: DetectProgress) => void,
): Promise<DiagnosticIssue[]> {
  const worker = getWorker();
  if (!worker) return runDetectMainThread(batch, onProgress);

  const id = nextId++;
  return new Promise<DiagnosticIssue[]>((resolve, reject) => {
    const handler = (ev: MessageEvent) => {
      const msg = ev.data;
      if (!msg || msg.id !== id) return;
      if (msg.type === "detect:progress" && onProgress) {
        onProgress({ done: msg.done, total: msg.total });
      } else if (msg.type === "detect:done") {
        worker.removeEventListener("message", handler);
        resolve(msg.issues as DiagnosticIssue[]);
      }
    };
    const errHandler = (err: ErrorEvent) => {
      worker.removeEventListener("message", handler);
      worker.removeEventListener("error", errHandler);
      console.error("[detect worker] error, falling back:", err.message);
      runDetectMainThread(batch, onProgress).then(resolve, reject);
    };
    worker.addEventListener("message", handler);
    worker.addEventListener("error", errHandler, { once: true });
    worker.postMessage({ type: "detect", id, batch });
  });
}

function runDetectMainThread(
  batch: DetectItem[],
  onProgress?: (p: DetectProgress) => void,
): Promise<DiagnosticIssue[]> {
  return new Promise((resolve) => {
    const issues: DiagnosticIssue[] = [];
    const STEP = 250;
    let i = 0;
    const total = batch.length;
    const tick = () => {
      const end = Math.min(i + STEP, total);
      for (; i < end; i++) {
        const item = batch[i];
        try {
          const found = detectIssues(item.entry, item.translation);
          if (found.length > 0) {
            for (const issue of found) issues.push(issue);
          }
        } catch {
          // skip
        }
      }
      onProgress?.({ done: i, total });
      if (i < total) setTimeout(tick, 0);
      else resolve(issues);
    };
    tick();
  });
}
