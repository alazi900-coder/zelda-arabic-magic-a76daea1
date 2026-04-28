/**
 * Translation Request Coalescer
 *
 * يجمع طلبات الترجمة الفردية القادمة خلال نافذة زمنية قصيرة (debounce)
 * في طلب AI واحد إلى edge function `translate-entries`، لتقليل عدد الطلبات
 * وتقليل استهلاك حصة Gemini المجانية.
 *
 * الاستخدام:
 *   const coalescer = createTranslationCoalescer({ buildPayload, fetcher });
 *   const translated = await coalescer.enqueue({ key, original });
 *
 * يدعم نفس البنية التي يتوقعها edge function: { entries: [{key, original}], ...rest }.
 */

export interface CoalescerEntry {
  key: string;
  original: string;
}

export interface CoalescerOptions {
  /** نافذة الانتظار قبل إرسال الدفعة المجمّعة (ms). افتراضي 200. */
  windowMs?: number;
  /** أقصى عدد نصوص في الدفعة الواحدة. عند الوصول، تُرسل فوراً. افتراضي 20. */
  maxBatch?: number;
  /**
   * يبني جسم الطلب من قائمة النصوص المجمّعة.
   * تُمرَّر الـ entries فقط؛ الـ caller يضيف glossary/provider/...
   */
  buildPayload: (entries: CoalescerEntry[]) => Record<string, unknown>;
  /** ينفّذ طلب fetch ويعيد الـ JSON المُحلّل (يجب أن يحوي { translations: Record<key,string>, ... }). */
  fetcher: (payload: Record<string, unknown>) => Promise<any>;
  /** callback اختياري عند اكتمال دفعة (للـ telemetry: عدد العناصر، fallback، إلخ). */
  onBatchComplete?: (data: any, batchSize: number) => void;
}

interface PendingItem {
  entry: CoalescerEntry;
  resolve: (data: { translation: string | undefined; raw: any }) => void;
  reject: (err: unknown) => void;
}

export interface TranslationCoalescer {
  enqueue: (entry: CoalescerEntry) => Promise<{ translation: string | undefined; raw: any }>;
  /** يُجبر الإرسال الفوري لما تجمّع (مفيد عند unmount). */
  flush: () => void;
  /** إفراغ الطابور مع رفض الوعود المعلّقة. */
  cancel: () => void;
}

export function createTranslationCoalescer(opts: CoalescerOptions): TranslationCoalescer {
  const windowMs = opts.windowMs ?? 200;
  const maxBatch = opts.maxBatch ?? 20;

  let queue: PendingItem[] = [];
  let timer: ReturnType<typeof setTimeout> | null = null;

  const clearTimer = () => {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
  };

  const flush = () => {
    clearTimer();
    if (queue.length === 0) return;
    const batch = queue;
    queue = [];

    // إزالة المفاتيح المكررة (قد يطلب المستخدم نفس النص مرتين بسرعة).
    // نحتفظ بآخر طلب لكل key ونوزّع نتيجته على كل الـ resolvers بنفس key.
    const byKey = new Map<string, PendingItem[]>();
    for (const item of batch) {
      const arr = byKey.get(item.entry.key) ?? [];
      arr.push(item);
      byKey.set(item.entry.key, arr);
    }
    const uniqueEntries: CoalescerEntry[] = [];
    for (const [key, items] of byKey) {
      uniqueEntries.push({ key, original: items[items.length - 1].entry.original });
    }

    const payload = opts.buildPayload(uniqueEntries);
    opts
      .fetcher(payload)
      .then((data) => {
        opts.onBatchComplete?.(data, uniqueEntries.length);
        const translations: Record<string, string> = data?.translations ?? {};
        for (const [key, items] of byKey) {
          const translation = translations[key];
          for (const it of items) it.resolve({ translation, raw: data });
        }
      })
      .catch((err) => {
        for (const items of byKey.values()) {
          for (const it of items) it.reject(err);
        }
      });
  };

  const enqueue = (entry: CoalescerEntry) =>
    new Promise<{ translation: string | undefined; raw: any }>((resolve, reject) => {
      queue.push({ entry, resolve, reject });
      if (queue.length >= maxBatch) {
        flush();
        return;
      }
      clearTimer();
      timer = setTimeout(flush, windowMs);
    });

  const cancel = () => {
    clearTimer();
    const pending = queue;
    queue = [];
    const err = new Error('Coalescer cancelled');
    for (const it of pending) it.reject(err);
  };

  return { enqueue, flush, cancel };
}
