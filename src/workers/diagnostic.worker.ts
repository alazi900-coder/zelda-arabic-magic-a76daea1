/**
 * Diagnostic Worker — Phase 3 + Detection offload.
 *
 * Handles two CPU-heavy operations off the main thread:
 *   1. `rebalance` — DP line balancer for big batches.
 *   2. `detect`    — running `detectIssues` on every entry/translation pair.
 *
 * Both `balance-lines` and `diagnostic-detect` are pure modules with no React
 * / DOM / IndexedDB deps, so they bundle cleanly into a Worker chunk via Vite's
 * native `new Worker(new URL(...), { type: 'module' })` syntax.
 *
 * Protocol:
 *   in  → { type: 'rebalance', id, batch: { key, original, translation, englishLineCount }[] }
 *   out → { type: 'rebalance:progress', id, done, total }
 *   out → { type: 'rebalance:done',     id, results: { key, fixed: string }[] }
 *
 *   in  → { type: 'detect', id, batch: { entry, translation }[] }
 *   out → { type: 'detect:progress', id, done, total }
 *   out → { type: 'detect:done',     id, issues: DiagnosticIssue[] }
 */

import { balanceLines, splitEvenlyByLines } from "@/lib/balance-lines";
import { detectIssues, type DetectableEntry, type DiagnosticIssue } from "@/lib/diagnostic-detect";

interface RebalanceItem {
  key: string;
  original: string;
  translation: string;
  englishLineCount: number;
}

interface RebalanceMsg {
  type: "rebalance";
  id: number;
  batch: RebalanceItem[];
}

interface DetectItem {
  entry: DetectableEntry;
  translation: string;
}

interface DetectMsg {
  type: "detect";
  id: number;
  batch: DetectItem[];
}

type WorkerMsg = RebalanceMsg | DetectMsg;

const post = (msg: unknown) => (self as unknown as Worker).postMessage(msg);

self.onmessage = (ev: MessageEvent<WorkerMsg>) => {
  const data = ev.data;
  if (!data) return;

  if (data.type === "rebalance") {
    const results: { key: string; fixed: string }[] = [];
    const total = data.batch.length;
    const STEP = 250;
    for (let i = 0; i < total; i += STEP) {
      const slice = data.batch.slice(i, Math.min(i + STEP, total));
      for (const item of slice) {
        try {
          const fixed = item.englishLineCount > 1
            ? splitEvenlyByLines(item.translation, item.englishLineCount)
            : balanceLines(item.translation);
          if (fixed !== item.translation) {
            results.push({ key: item.key, fixed });
          }
        } catch {
          // Skip on per-item failure.
        }
      }
      post({ type: "rebalance:progress", id: data.id, done: Math.min(i + STEP, total), total });
    }
    post({ type: "rebalance:done", id: data.id, results });
    return;
  }

  if (data.type === "detect") {
    const issues: DiagnosticIssue[] = [];
    const total = data.batch.length;
    const STEP = 250;
    for (let i = 0; i < total; i += STEP) {
      const slice = data.batch.slice(i, Math.min(i + STEP, total));
      for (const item of slice) {
        try {
          const found = detectIssues(item.entry, item.translation);
          if (found.length > 0) {
            for (const issue of found) issues.push(issue);
          }
        } catch {
          // Skip per-item failure.
        }
      }
      post({ type: "detect:progress", id: data.id, done: Math.min(i + STEP, total), total });
    }
    post({ type: "detect:done", id: data.id, issues });
    return;
  }
};

export {};
