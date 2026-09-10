import { useEffect, useRef, useState } from 'react';

/**
 * A number field you can empty.
 *
 * The obvious way to write one — `value={n}` with `Number(e.target.value) || 0`
 * on every keystroke — cannot represent an empty box. Clearing it parses to 0,
 * the 0 is written back to state, and the field re-renders showing 0. Typing 60
 * into that gives 060, and the only way to reach 60 is to delete the 0, which
 * you cannot do until you have typed something in front of it. Reported from
 * the Spanish minutes field; the same fault was in six others.
 *
 * So the box keeps its own text while you are in it, and empty is a legitimate
 * thing for that text to be. A value is committed upward only when the text
 * actually parses. Leaving it blank and tapping away restores the last real
 * value rather than silently writing a zero — you cleared a field, which is not
 * the same as asking for none of something.
 */
export function NumberInput({
  value, onChange, min, max, className = 'input', ...rest
}: {
  value: number;
  onChange: (n: number) => void;
  min?: number;
  max?: number;
  className?: string;
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'min' | 'max' | 'type' | 'className'>) {
  const [draft, setDraft] = useState(String(value));
  const editing = useRef(false);

  // Track the outside world, but never while it is being typed in — that is
  // what would put the caret back at the wrong place mid-number.
  useEffect(() => {
    if (!editing.current) setDraft(String(value));
  }, [value]);

  const clamp = (n: number) => {
    if (min !== undefined && n < min) return min;
    if (max !== undefined && n > max) return max;
    return n;
  };

  return (
    <input
      {...rest}
      className={className}
      type="number"
      min={min}
      max={max}
      value={draft}
      onFocus={(e) => { editing.current = true; rest.onFocus?.(e); }}
      onChange={(e) => {
        const raw = e.target.value;
        setDraft(raw);
        if (raw.trim() === '') return;
        const n = Number(raw);
        if (Number.isFinite(n)) onChange(clamp(n));
      }}
      onBlur={(e) => {
        editing.current = false;
        // An empty box on the way out means nothing was chosen, so it goes
        // back to what it was rather than becoming a zero nobody asked for.
        setDraft(String(value));
        rest.onBlur?.(e);
      }}
    />
  );
}
