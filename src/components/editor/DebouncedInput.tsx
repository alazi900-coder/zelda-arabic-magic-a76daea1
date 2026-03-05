import React, { useState, useEffect, useRef, memo } from "react";
import { INPUT_DEBOUNCE } from "./types";

const DebouncedInput = memo(({ value, onChange, placeholder, className, autoFocus, multiline }: {
  value: string;
  onChange: (val: string) => void;
  placeholder?: string;
  className?: string;
  autoFocus?: boolean;
  multiline?: boolean;
}) => {
  const [localValue, setLocalValue] = useState(value);
  const timerRef = useRef<ReturnType<typeof setTimeout>>();
  const localRef = useRef(value);
  const onChangeRef = useRef(onChange);
  const committedRef = useRef(value);

  // Keep refs current
  onChangeRef.current = onChange;
  
  useEffect(() => {
    setLocalValue(value);
    localRef.current = value;
    committedRef.current = value;
  }, [value]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const newVal = e.target.value;
    setLocalValue(newVal);
    localRef.current = newVal;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      onChangeRef.current(newVal);
      committedRef.current = newVal;
    }, INPUT_DEBOUNCE);
  };

  // Flush pending change on unmount instead of discarding it
  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        // If local value differs from last committed, flush it
        if (localRef.current !== committedRef.current) {
          onChangeRef.current(localRef.current);
        }
      }
    };
  }, []);

  const handleBlur = () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = undefined;
    }
    if (localRef.current !== committedRef.current) {
      onChangeRef.current(localRef.current);
      committedRef.current = localRef.current;
    }
  };

  if (multiline) {
    return (
      <textarea
        value={localValue}
        onChange={handleChange}
        onBlur={handleBlur}
        placeholder={placeholder}
        className={className}
        autoFocus={autoFocus}
        dir="auto"
        rows={Math.max(2, (localValue.match(/\n/g) || []).length + 1)}
        style={{ resize: 'vertical', minHeight: '2.5rem', unicodeBidi: 'plaintext' }}
      />
    );
  }

  return (
    <input
      type="text"
      value={localValue}
      onChange={handleChange}
      onBlur={handleBlur}
      placeholder={placeholder}
      className={className}
      autoFocus={autoFocus}
    />
  );
});

DebouncedInput.displayName = "DebouncedInput";

export default DebouncedInput;
