import React, { useState, useEffect, useRef, memo } from "react";
import { Check, Undo2 } from "lucide-react";
import { INPUT_DEBOUNCE } from "./types";

const DebouncedInput = memo(({ value, onChange, placeholder, className, autoFocus, multiline, noSoftWrap, manualCommit }: {
  value: string;
  onChange: (val: string) => void;
  placeholder?: string;
  className?: string;
  autoFocus?: boolean;
  multiline?: boolean;
  noSoftWrap?: boolean;
  /** If true, typing does NOT auto-commit. User must press ✓ (or blur) to save. */
  manualCommit?: boolean;
}) => {
  const [localValue, setLocalValue] = useState(value);
  const timerRef = useRef<ReturnType<typeof setTimeout>>();
  const localRef = useRef(value);
  const onChangeRef = useRef(onChange);
  const committedRef = useRef(value);
  const focusedRef = useRef(false);
  const [dirty, setDirty] = useState(false);

  onChangeRef.current = onChange;

  useEffect(() => {
    // Don't clobber the user's in-progress edits when parent re-renders
    if (focusedRef.current && localRef.current !== committedRef.current) return;
    setLocalValue(value);
    localRef.current = value;
    committedRef.current = value;
    setDirty(false);
  }, [value]);

  const commit = () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = undefined;
    }
    if (localRef.current !== committedRef.current) {
      onChangeRef.current(localRef.current);
      committedRef.current = localRef.current;
    }
    setDirty(false);
  };

  const revert = () => {
    setLocalValue(committedRef.current);
    localRef.current = committedRef.current;
    setDirty(false);
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const newVal = e.target.value;
    setLocalValue(newVal);
    localRef.current = newVal;
    if (manualCommit) {
      setDirty(newVal !== committedRef.current);
      return;
    }
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      onChangeRef.current(newVal);
      committedRef.current = newVal;
    }, INPUT_DEBOUNCE);
  };

  // Flush pending change on unmount instead of discarding it
  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      if (localRef.current !== committedRef.current) {
        onChangeRef.current(localRef.current);
      }
    };
  }, []);

  const handleBlur = () => {
    focusedRef.current = false;
    commit();
  };

  const handleFocus = () => {
    focusedRef.current = true;
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (manualCommit && (e.ctrlKey || e.metaKey) && e.key === "Enter") {
      e.preventDefault();
      commit();
    }
  };

  if (multiline) {
    return (
      <div className="relative w-full">
        <textarea
          value={localValue}
          onChange={handleChange}
          onBlur={handleBlur}
          onFocus={handleFocus}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          className={className}
          autoFocus={autoFocus}
          dir="rtl"
          rows={Math.max(noSoftWrap ? 1 : 2, (localValue.match(/\n/g) || []).length + 1)}
          wrap={noSoftWrap ? "off" : "soft"}
          style={{ resize: 'vertical', minHeight: '2.5rem', unicodeBidi: 'isolate', whiteSpace: noSoftWrap ? 'pre' : undefined, overflowX: noSoftWrap ? 'auto' : undefined }}
        />
        {manualCommit && dirty && (
          <div className="absolute top-1 left-1 flex gap-1 z-10">
            <button
              type="button"
              onMouseDown={(e) => { e.preventDefault(); commit(); }}
              className="h-6 w-6 flex items-center justify-center rounded bg-primary text-primary-foreground shadow hover:bg-primary/90"
              title="حفظ (Ctrl+Enter)"
              aria-label="حفظ الترجمة"
            >
              <Check className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onMouseDown={(e) => { e.preventDefault(); revert(); }}
              className="h-6 w-6 flex items-center justify-center rounded bg-muted text-muted-foreground shadow hover:bg-muted/80"
              title="تراجع"
              aria-label="تراجع"
            >
              <Undo2 className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </div>
    );
  }

  return (
    <input
      type="text"
      value={localValue}
      onChange={handleChange}
      onBlur={handleBlur}
      onFocus={handleFocus}
      placeholder={placeholder}
      className={className}
      autoFocus={autoFocus}
      dir="auto"
      style={{ unicodeBidi: 'plaintext' }}
    />
  );
});

DebouncedInput.displayName = "DebouncedInput";

export default DebouncedInput;
