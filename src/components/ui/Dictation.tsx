import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { appendPhrase, useDictation } from '../../lib/speech';
import { Icons } from '../layout/Icons';

/** A microphone that dictates into whatever field it is attached to. */
export function MicButton({
  onPhrase, title = 'Dictate', continuous = true, size = 'sm',
}: {
  onPhrase: (phrase: string) => void;
  title?: string;
  continuous?: boolean;
  size?: 'sm' | 'lg';
}) {
  const { supported, listening, interim, error, toggle } = useDictation({ onText: (t, final) => { if (final) onPhrase(t); }, continuous });
  if (!supported) return null;

  return (
    <span className="mic-wrap">
      <button
        type="button"
        className={`mic${listening ? ' is-live' : ''}${size === 'lg' ? ' mic-lg' : ''}`}
        onClick={toggle}
        aria-pressed={listening}
        aria-label={listening ? 'Stop dictating' : title}
        title={listening ? 'Stop dictating' : title}
      >
        <MicGlyph />
      </button>
      {listening && interim && <span className="mic-interim">{interim}</span>}
      {error && <span className="mic-error t-xs t-crit">{error}</span>}
    </span>
  );
}

function MicGlyph() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" aria-hidden>
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M5.5 11.5a6.5 6.5 0 0 0 13 0" />
      <path d="M12 18v3" />
    </svg>
  );
}

/** A text field with dictation attached. Behaves like a normal controlled
 *  input otherwise, so it can replace one anywhere. */
export function DictateInput({
  value, onChange, placeholder, suggestions, textarea, rows, label, hint, autoFocus,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  /** Shown as chips above the field when it is still empty. */
  suggestions?: string[];
  textarea?: boolean;
  rows?: number;
  label?: string;
  hint?: string;
  autoFocus?: boolean;
}) {
  const id = useId();
  const valueRef = useRef(value);
  valueRef.current = value;

  return (
    <div className="field">
      {label && <label htmlFor={id}>{label}</label>}

      {suggestions && suggestions.length > 0 && !value.trim() && (
        <div className="row-2 wrap" style={{ marginBottom: 2 }}>
          {suggestions.map((s) => (
            <button key={s} type="button" className="chip" onClick={() => onChange(s)}>{s}</button>
          ))}
        </div>
      )}

      <div className="dictate">
        {textarea ? (
          <textarea
            id={id}
            className="textarea"
            rows={rows ?? 4}
            value={value}
            placeholder={placeholder}
            autoFocus={autoFocus}
            onChange={(e) => onChange(e.target.value)}
          />
        ) : (
          <input
            id={id}
            className="input"
            value={value}
            placeholder={placeholder}
            autoFocus={autoFocus}
            onChange={(e) => onChange(e.target.value)}
          />
        )}
        <MicButton onPhrase={(p) => onChange(appendPhrase(valueRef.current, p))} />
      </div>

      {hint && <span className="t-xs t-muted">{hint}</span>}
    </div>
  );
}

/** Big press-and-talk panel for capturing a long thought — a journal entry or
 *  a business idea — without touching the keyboard. */
export function VoiceCapture({
  onDone, placeholder, children,
}: {
  onDone: (text: string) => void;
  placeholder: string;
  children?: ReactNode;
}) {
  const [text, setText] = useState('');
  const textRef = useRef('');
  textRef.current = text;

  const { supported, listening, interim, error, toggle, stop } = useDictation({
    onText: (t, final) => { if (final) setText((prev) => appendPhrase(prev, t)); },
  });

  useEffect(() => () => stop(), [stop]);

  return (
    <div className="capture">
      <div className="capture-body">
        <textarea
          className="textarea"
          rows={5}
          value={text + (interim ? (text ? ' ' : '') + interim : '')}
          placeholder={placeholder}
          onChange={(e) => setText(e.target.value)}
        />
      </div>

      {error && <p className="t-xs t-crit">{error}</p>}
      {!supported && (
        <p className="t-xs t-muted">
          This browser can't do speech recognition — Chrome or Safari can. Typing works everywhere.
        </p>
      )}

      <div className="row-2 wrap">
        {supported && (
          <button
            type="button"
            className={`btn btn-lg${listening ? ' btn-danger' : ''}`}
            onClick={toggle}
          >
            {listening ? '■ Stop' : <><span className="btn-glyph" aria-hidden>{Icons.mic()}</span> Hold the thought — talk</>}
          </button>
        )}
        <button
          type="button"
          className="btn btn-primary btn-lg grow"
          disabled={!text.trim()}
          onClick={() => { stop(); onDone(text.trim()); setText(''); }}
        >
          Save
        </button>
      </div>

      {children}
    </div>
  );
}
