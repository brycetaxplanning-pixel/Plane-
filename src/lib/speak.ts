import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Speech synthesis, wrapped for the tutor.
 *
 * Three browser quirks are handled here rather than in the component:
 * the voice list is often empty until `voiceschanged` fires; Chrome cuts off
 * utterances longer than roughly fifteen seconds, so text is spoken in
 * sentence-sized pieces; and iOS will not speak at all until synthesis has
 * been triggered once from a user gesture.
 */

export const speechSupported = (): boolean =>
  typeof window !== 'undefined' && 'speechSynthesis' in window;

export function useVoices(): SpeechSynthesisVoice[] {
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);

  useEffect(() => {
    if (!speechSupported()) return;
    const load = () => setVoices(window.speechSynthesis.getVoices());
    load();
    window.speechSynthesis.addEventListener('voiceschanged', load);
    return () => window.speechSynthesis.removeEventListener('voiceschanged', load);
  }, []);

  return voices;
}

/** Best available voice for a language tag, preferring an exact region match
 *  and then any voice for the base language. */
export function pickVoice(voices: SpeechSynthesisVoice[], lang: string): SpeechSynthesisVoice | null {
  const base = lang.split('-')[0].toLowerCase();
  return (
    voices.find((v) => v.lang.replace('_', '-').toLowerCase() === lang.toLowerCase())
    ?? voices.find((v) => v.lang.toLowerCase().startsWith(base))
    ?? null
  );
}

/** Splits on sentence ends, then hard-wraps anything still too long. */
function chunk(text: string, max = 180): string[] {
  const sentences = text.replace(/\s+/g, ' ').trim().match(/[^.!?¡¿]+[.!?]*\s*/g) ?? [text];
  const out: string[] = [];
  let buffer = '';

  for (const sentence of sentences) {
    if ((buffer + sentence).length > max && buffer) { out.push(buffer.trim()); buffer = ''; }
    if (sentence.length > max) {
      if (buffer) { out.push(buffer.trim()); buffer = ''; }
      for (let i = 0; i < sentence.length; i += max) out.push(sentence.slice(i, i + max).trim());
    } else {
      buffer += sentence;
    }
  }
  if (buffer.trim()) out.push(buffer.trim());
  return out.filter(Boolean);
}

export interface Speaker {
  supported: boolean;
  speaking: boolean;
  /** Resolves when the whole passage has finished, or immediately if cancelled. */
  say: (text: string, opts?: { lang?: string; rate?: number }) => Promise<void>;
  cancel: () => void;
}

export function useSpeaker(defaultLang = 'es-ES', defaultRate = 1): Speaker {
  const voices = useVoices();
  const [speaking, setSpeaking] = useState(false);
  const cancelledRef = useRef(false);

  const cancel = useCallback(() => {
    cancelledRef.current = true;
    if (speechSupported()) window.speechSynthesis.cancel();
    setSpeaking(false);
  }, []);

  useEffect(() => cancel, [cancel]);

  const say = useCallback(
    async (text: string, opts?: { lang?: string; rate?: number }) => {
      if (!speechSupported() || !text.trim()) return;
      const lang = opts?.lang ?? defaultLang;
      const rate = opts?.rate ?? defaultRate;
      const voice = pickVoice(voices, lang);

      cancelledRef.current = false;
      window.speechSynthesis.cancel();
      setSpeaking(true);

      for (const piece of chunk(text)) {
        if (cancelledRef.current) break;
        await new Promise<void>((resolve) => {
          const u = new SpeechSynthesisUtterance(piece);
          u.lang = lang;
          u.rate = rate;
          if (voice) u.voice = voice;
          u.onend = () => resolve();
          u.onerror = () => resolve();
          window.speechSynthesis.speak(u);
        });
      }

      setSpeaking(false);
    },
    [voices, defaultLang, defaultRate],
  );

  return { supported: speechSupported(), speaking, say, cancel };
}

/** True when the device can actually speak the language, not just synthesise
 *  something in the wrong accent. */
export const hasVoiceFor = (voices: SpeechSynthesisVoice[], lang: string): boolean =>
  pickVoice(voices, lang) !== null;
