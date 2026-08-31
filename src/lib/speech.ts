import { useCallback, useEffect, useRef, useState } from 'react';

/* The Web Speech API is still vendor-prefixed and is not in lib.dom, so the
   surface this app uses is declared here rather than pulling in a dependency. */

interface SpeechAlternative { transcript: string; confidence: number }
interface SpeechResult { readonly length: number; isFinal: boolean; [i: number]: SpeechAlternative }
interface SpeechResultList { readonly length: number; [i: number]: SpeechResult }
interface SpeechEvent extends Event { resultIndex: number; results: SpeechResultList }
interface SpeechErrorEvent extends Event { error: string; message?: string }

interface SpeechRecognitionLike extends EventTarget {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((e: SpeechEvent) => void) | null;
  onerror: ((e: SpeechErrorEvent) => void) | null;
  onend: (() => void) | null;
  onstart: (() => void) | null;
}

type SpeechCtor = new () => SpeechRecognitionLike;

function getCtor(): SpeechCtor | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as { SpeechRecognition?: SpeechCtor; webkitSpeechRecognition?: SpeechCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

/** Dictation is unavailable in Firefox and in some embedded webviews; every
 *  caller checks this before showing a microphone. */
export const dictationSupported = (): boolean => getCtor() !== null;

const FRIENDLY_ERROR: Record<string, string> = {
  'not-allowed': 'Microphone access was blocked. Allow it for this site and try again.',
  'service-not-allowed': 'The browser refused speech recognition. On iOS this needs Safari, not an in-app browser.',
  network: 'Speech recognition needs a network connection.',
  'audio-capture': 'No microphone was found.',
  aborted: '',
  'no-speech': '',
};

export interface DictationOptions {
  /** Called with the running transcript. `final` marks a settled phrase. */
  onText: (text: string, final: boolean) => void;
  lang?: string;
  /** Keep listening through pauses. Off for short one-shot fields. */
  continuous?: boolean;
}

export interface Dictation {
  supported: boolean;
  listening: boolean;
  /** What has been heard but not yet settled, for live feedback. */
  interim: string;
  error: string | null;
  start: () => void;
  stop: () => void;
  toggle: () => void;
}

/**
 * Wraps the browser's recogniser into something a component can drive.
 *
 * Two behaviours matter in practice: engines end the session on their own
 * after a pause, so a session the user has not stopped is restarted; and the
 * final transcript is emitted phrase by phrase, so callers append rather than
 * replace.
 */
export function useDictation({ onText, lang = 'en-US', continuous = true }: DictationOptions): Dictation {
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState('');
  const [error, setError] = useState<string | null>(null);

  const recRef = useRef<SpeechRecognitionLike | null>(null);
  const wantedRef = useRef(false);
  const onTextRef = useRef(onText);
  onTextRef.current = onText;

  const supported = typeof window !== 'undefined' && getCtor() !== null;

  const stop = useCallback(() => {
    wantedRef.current = false;
    setListening(false);
    setInterim('');
    try { recRef.current?.stop(); } catch { /* already stopped */ }
  }, []);

  const start = useCallback(() => {
    const Ctor = getCtor();
    if (!Ctor) { setError('This browser cannot do speech recognition.'); return; }
    if (wantedRef.current) return;

    const rec = new Ctor();
    rec.lang = lang;
    rec.continuous = continuous;
    rec.interimResults = true;
    rec.maxAlternatives = 1;

    rec.onstart = () => { setListening(true); setError(null); };

    rec.onresult = (e) => {
      let pending = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const result = e.results[i];
        const text = result[0]?.transcript ?? '';
        if (result.isFinal) onTextRef.current(text.trim(), true);
        else pending += text;
      }
      setInterim(pending);
    };

    rec.onerror = (e) => {
      const message = FRIENDLY_ERROR[e.error] ?? `Speech recognition failed (${e.error}).`;
      if (message) { setError(message); wantedRef.current = false; setListening(false); }
    };

    rec.onend = () => {
      setInterim('');
      // Engines stop on their own after a pause; resume unless the user asked
      // to stop, otherwise long dictation cuts out mid-thought.
      if (wantedRef.current) {
        try { rec.start(); } catch { wantedRef.current = false; setListening(false); }
      } else {
        setListening(false);
      }
    };

    recRef.current = rec;
    wantedRef.current = true;
    try { rec.start(); } catch { wantedRef.current = false; setError('Could not start the microphone.'); }
  }, [lang, continuous]);

  const toggle = useCallback(() => { if (wantedRef.current) stop(); else start(); }, [start, stop]);

  useEffect(() => () => {
    wantedRef.current = false;
    try { recRef.current?.abort(); } catch { /* nothing to abort */ }
  }, []);

  return { supported, listening, interim, error, start, stop, toggle };
}

/** Appends a dictated phrase to existing text with sane spacing. */
export function appendPhrase(existing: string, phrase: string): string {
  const clean = phrase.trim();
  if (!clean) return existing;
  if (!existing.trim()) return clean.charAt(0).toUpperCase() + clean.slice(1);
  const needsSpace = !/\s$/.test(existing);
  const afterSentence = /[.!?]\s*$/.test(existing);
  const piece = afterSentence ? clean.charAt(0).toUpperCase() + clean.slice(1) : clean;
  return existing + (needsSpace ? ' ' : '') + piece;
}
