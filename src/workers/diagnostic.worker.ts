/**
 * Diagnostic Worker — Phase 3 + Detection offload + Transferable codec.
 *
 * Handles two CPU-heavy operations off the main thread:
 *   1. `rebalance` — DP line balancer for big batches.
 *   2. `detect`    — running `detectIssues` on every entry/translation pair.
 *
 * Both inputs and outputs are exchanged as packed `ArrayBuffer`s and passed
 * through the structured-clone "transfer list" (`postMessage(msg, [buffer])`)
 * so we get **zero-copy** semantics for big batches. Strings in JS are
 * immutable and can't be transferred individually, but a single packed buffer
 * can — eliminating the per-string structured-clone overhead.
 *
 * Protocol:
 *   in  → { type: 'rebalance', id, buffer: ArrayBuffer }   (packRebalanceBatch)
 *   out → { type: 'rebalance:progress', id, done, total }
 *   out → { type: 'rebalance:done',     id, buffer: ArrayBuffer }  (packRebalanceResults)
 *
 *   in  → { type: 'detect', id, buffer: ArrayBuffer }      (packDetectBatch)
 *   out → { type: 'detect:progress', id, done, total }
 *   out → { type: 'detect:done',     id, buffer: ArrayBuffer }  (packIssueBatch)
 */

import { balanceLines, splitEvenlyByLines } from "@/lib/balance-lines";
import { detectIssues } from "@/lib/diagnostic-detect";
import {
  unpackRebalanceBatch,
  packRebalanceResults,
  unpackDetectBatch,
  packIssueBatch,
  severityToCode,
  type RebalanceResultRecord,
  type PackedIssue,
} from "@/lib/worker-codec";

interface RebalanceMsg {
  type: "rebalance";
  id: number;
  buffer: ArrayBuffer;
}

interface DetectMsg {
  type: "detect";
  id: number;
  buffer: ArrayBuffer;
}

type WorkerMsg = RebalanceMsg | DetectMsg;

const post = (msg: unknown, transfer?: Transferable[]) => {
  if (transfer && transfer.length > 0) {
    (self as unknown as Worker).postMessage(msg, transfer);
  } else {
    (self as unknown as Worker).postMessage(msg);
  }
};

self.onmessage = (ev: MessageEvent<WorkerMsg>) => {
  const data = ev.data;
  if (!data) return;

  if (data.type === "rebalance") {
    const batch = unpackRebalanceBatch(data.buffer);
    const results: RebalanceResultRecord[] = [];
    const total = batch.length;
    const STEP = 250;
    for (let i = 0; i < total; i += STEP) {
      const end = Math.min(i + STEP, total);
      for (let j = i; j < end; j++) {
        const item = batch[j];
        try {
          const fixed = item.englishLineCount > 1
            ? splitEvenlyByLines(item.translation, item.englishLineCount)
            : balanceLines(item.translation);
          if (fixed !== item.translation) {
            results.push({ key: item.key, fixed });
          }
        } catch {
          // Skip per-item failure.
        }
      }
      post({ type: "rebalance:progress", id: data.id, done: end, total });
    }
    const packed = packRebalanceResults(results);
    post(
      { type: "rebalance:done", id: data.id, buffer: packed.buffer, count: packed.count },
      [packed.buffer],
    );
    return;
  }

  if (data.type === "detect") {
    const batch = unpackDetectBatch(data.buffer);
    const issues: PackedIssue[] = [];
    const total = batch.length;
    const STEP = 250;
    for (let i = 0; i < total; i += STEP) {
      const end = Math.min(i + STEP, total);
      for (let j = i; j < end; j++) {
        const item = batch[j];
        try {
          const found = detectIssues(
            {
              msbtFile: item.msbtFile,
              index: item.index,
              label: item.label,
              original: item.original,
              maxBytes: item.maxBytes,
            },
            item.translation,
          );
          for (const f of found) {
            issues.push({
              key: f.key,
              label: f.label,
              original: f.original,
              translation: f.translation,
              severity: severityToCode(f.severity),
              category: f.category,
              message: f.message,
            });
          }
        } catch {
          // Skip per-item failure.
        }
      }
      post({ type: "detect:progress", id: data.id, done: end, total });
    }
    const packed = packIssueBatch(issues);
    post(
      { type: "detect:done", id: data.id, buffer: packed.buffer, count: packed.count },
      [packed.buffer],
    );
    return;
  }
};

export {};
