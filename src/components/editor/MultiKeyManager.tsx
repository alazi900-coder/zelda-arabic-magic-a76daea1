import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Loader2, CheckCircle2, XCircle, Wifi, Plus, Trash2, Clock } from "lucide-react";

type TestConnState = 'idle' | 'testing' | 'ok' | 'error';

interface MultiKeyManagerProps {
  /** Provider id used in test-connection callbacks (e.g. 'gemini'). */
  providerId: string;
  /** Friendly label for the provider (e.g. 'Gemini'). */
  providerLabel: string;
  /** Current array of keys. */
  keys: string[];
  /** Replace the keys array. */
  setKeys: (keys: string[]) => void;
  /** Map of `key string -> unix ms when it unblocks`. */
  keyBlocks: Record<string, number>;
  /** Manually clear all blocks for keys belonging to this provider. */
  unblockAll: () => void;
  /** Per-key test state (keyed by `${providerId}:${key.slice(-6)}`). */
  testStatus: Record<string, TestConnState>;
  testMsg: Record<string, string>;
  /** Run a connection test against a single specific key. */
  onTest: (key: string) => void | Promise<void>;
  placeholder: string;
}

const formatBlockedUntil = (ms: number): string => {
  const d = new Date(ms);
  const hh = d.getHours().toString().padStart(2, '0');
  const mm = d.getMinutes().toString().padStart(2, '0');
  return `${hh}:${mm}`;
};

const maskKey = (key: string): string => {
  if (key.length <= 12) return key;
  return `${key.slice(0, 8)}…${key.slice(-4)}`;
};

const MultiKeyManager: React.FC<MultiKeyManagerProps> = ({
  providerId, providerLabel, keys, setKeys, keyBlocks, unblockAll, testStatus, testMsg, onTest, placeholder,
}) => {
  const [draft, setDraft] = useState('');
  const [addError, setAddError] = useState<string | null>(null);

  const now = Date.now();
  const anyBlocked = keys.some(k => keyBlocks[k] && keyBlocks[k] > now);

  const handleAdd = () => {
    const t = draft.trim();
    if (!t) { setAddError('الصق المفتاح أولاً'); return; }
    if (keys.includes(t)) { setAddError('هذا المفتاح مضاف بالفعل في القائمة'); return; }
    setKeys([...keys, t]);
    setDraft('');
    setAddError(null);
  };

  const handleDelete = (idx: number) => {
    setKeys(keys.filter((_, i) => i !== idx));
  };

  return (
    <div className="flex flex-col gap-2">
      {keys.length > 0 && (
        <div className="flex flex-col gap-1.5">
          {keys.map((key, idx) => {
            const blockedAt = keyBlocks[key] && keyBlocks[key] > now ? keyBlocks[key] : null;
            const testKey = `${providerId}:${key.slice(-6)}`;
            const status = testStatus[testKey];
            const msg = testMsg[testKey];
            return (
              <div key={key} className="flex flex-col gap-0.5">
                <div className="flex gap-2 items-center">
                  <span className="text-xs shrink-0 w-4 text-center" aria-hidden>
                    {blockedAt ? '⏰' : status === 'error' ? '❌' : '✅'}
                  </span>
                  <code className="flex-1 px-2 py-1 rounded bg-background border border-border text-xs font-mono truncate" dir="ltr">
                    {maskKey(key)}
                  </code>
                  <Button
                    variant="outline" size="sm"
                    onClick={() => onTest(key)}
                    disabled={status === 'testing'}
                    className="text-xs shrink-0 gap-1 h-7"
                    title="اختبر هذا المفتاح"
                  >
                    {status === 'testing' ? <Loader2 className="w-3 h-3 animate-spin" /> :
                     status === 'ok' ? <CheckCircle2 className="w-3 h-3 text-green-500" /> :
                     status === 'error' ? <XCircle className="w-3 h-3 text-red-500" /> :
                     <Wifi className="w-3 h-3" />}
                  </Button>
                  <Button
                    variant="ghost" size="sm"
                    onClick={() => handleDelete(idx)}
                    className="text-xs text-destructive shrink-0 h-7 px-2"
                    title="حذف هذا المفتاح"
                  >
                    <Trash2 className="w-3 h-3" />
                  </Button>
                </div>
                {blockedAt && (
                  <p className="text-[10px] text-amber-500 font-body pr-6 flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    محظور حتى ~{formatBlockedUntil(blockedAt)} (تجاوز الحد اليومي)
                  </p>
                )}
                {msg && !blockedAt && (
                  <p className={`text-[10px] font-body pr-6 ${status === 'ok' ? 'text-green-500' : 'text-red-500'}`}>
                    {msg}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}

      <div className="flex gap-2">
        <input
          type="password"
          placeholder={placeholder}
          value={draft}
          onChange={(e) => { setDraft(e.target.value); if (addError) setAddError(null); }}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAdd(); } }}
          className="flex-1 px-3 py-1.5 rounded bg-background border border-border font-body text-sm"
          dir="ltr"
        />
        <Button
          variant="outline" size="sm"
          onClick={handleAdd}
          disabled={!draft.trim()}
          className="text-xs shrink-0 gap-1"
        >
          <Plus className="w-3 h-3" />
          إضافة
        </Button>
      </div>

      {addError && (
        <p className="text-[11px] text-red-500 font-body">⚠️ {addError}</p>
      )}

      {anyBlocked && (
        <div className="flex items-center justify-between bg-amber-500/10 border border-amber-500/30 rounded px-2 py-1">
          <span className="text-[11px] text-amber-600 dark:text-amber-400 font-body">
            بعض مفاتيح {providerLabel} محظورة 24 ساعة بسبب تجاوز الحد. يتنقل النظام تلقائياً للمفاتيح المتاحة.
          </span>
          <Button variant="ghost" size="sm" onClick={unblockAll} className="text-[11px] h-6 shrink-0">
            إعادة التنشيط
          </Button>
        </div>
      )}

      {keys.length > 0 && (
        <p className="text-[10px] text-muted-foreground font-body">
          {keys.length === 1
            ? '💡 أضف مفاتيح إضافية من حسابات مختلفة لمضاعفة الحد اليومي. النظام يتنقل بينها تلقائياً.'
            : `🔁 ${keys.length} مفاتيح — يتنقل النظام بينها تلقائياً (round-robin) ويتخطى المحظورة 24 ساعة بعد 429.`}
        </p>
      )}
    </div>
  );
};

export default MultiKeyManager;
