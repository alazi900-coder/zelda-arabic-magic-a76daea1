/**
 * Diagnostic / Bulk Balance Worker — Phase 3.
 *
 * Offloads the CPU-heavy DP line-balancer for big batches (e.g. "إصلاح كل
 * المشاكل" on thousands of entries) so the main thread stays responsive on
 * mobile. We deliberately keep `detectIssues` on the main thread because it
 * pulls in a wide dependency graph (build-tag-guard, regex tables, etc.);
 * line-balancing is the actual freeze culprit and it is pure.
 *
 * Protocol:
 *   in  → { type: 'rebalance', id, batch: { key, original, translation, englishLineCount }[] }
 *   out → { type: 'rebalance:done', id, results: { key, fixed: string }[] }
 *   out → { type: 'rebalance:progress', id, done, total }
 */

import { balanceLines, splitEvenlyByLines } from "@/lib/balance-lines";

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

self.onmessage = (ev: MessageEvent<RebalanceMsg>) => {
  const data = ev.data;
  if (data?.type !== "rebalance") return;

  const results: { key: string; fixed: string }[] = [];
  const total = data.batch.length;
  // Slice into ~250-item progress steps so the worker can post updates.
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
        // Skip on per-item failure — never break the whole batch.
      }
    }
    (self as unknown as Worker).postMessage({
      type: "rebalance:progress",
      id: data.id,
      done: Math.min(i + STEP, total),
      total,
    });
  }

  (self as unknown as Worker).postMessage({
    type: "rebalance:done",
    id: data.id,
    results,
  });
};

export {};
