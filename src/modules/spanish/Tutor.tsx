import { useCallback, useEffect, useRef, useState } from 'react';
import { DIALECTS, type Dialect, type TutorConfig, type TutorLevel } from '../../lib/schema';
import { AIError, isAIConfigured, streamChat } from '../../lib/ai';
import { useDictation } from '../../lib/speech';
import { hasVoiceFor, useSpeaker, useVoices } from '../../lib/speak';
import { XP } from '../../lib/gamification';
import { todayKey } from '../../lib/date';
import { uid } from '../../lib/id';
import { useApp } from '../../state/context';
import { Field, SectionHead } from '../../components/ui/Field';
import { Slider } from '../../components/ui/Slider';

const ACCENT = 'var(--mod-spanish)';
const LEVELS: TutorLevel[] = ['Beginner', 'Intermediate', 'Advanced'];

const TOPICS = [
  'Everyday conversation',
  'Talking about work and taxes',
  'At the gym and training',
  'Ordering food and going out',
  'Travel and directions',
  'Telling a story about my week',
];

/** How long a pause means "I have finished my turn". Long enough to think
 *  mid-sentence, short enough not to feel like a dead line. */
const TURN_PAUSE_MS = 2200;

type Phase = 'idle' | 'greeting' | 'speaking' | 'listening' | 'thinking';

interface Turn {
  id: string;
  who: 'you' | 'tutor';
  text: string;
  fix?: string;
}

export function Tutor() {
  const { state, update, reward, toast } = useApp();
  const cfg = state.spanish.tutor;
  const voices = useVoices();
  const speaker = useSpeaker(cfg.dialect, cfg.speechRate);
  const configured = isAIConfigured(state.settings);

  const [phase, setPhase] = useState<Phase>('idle');
  const [turns, setTurns] = useState<Turn[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);

  const startedAt = useRef<number | null>(null);
  const heard = useRef('');
  const turnTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const runningRef = useRef(false);
  const historyRef = useRef<Turn[]>([]);
  const logRef = useRef<HTMLDivElement>(null);

  historyRef.current = turns;

  const setCfg = (patch: Partial<TutorConfig>) =>
    update((s) => ({ ...s, spanish: { ...s.spanish, tutor: { ...s.spanish.tutor, ...patch } } }));

  /* ---- the conversation loop ---- */

  const dictation = useDictation({
    lang: cfg.dialect,
    continuous: true,
    onText: (text, final) => {
      if (!final || !runningRef.current) return;
      heard.current = `${heard.current} ${text}`.trim();
      if (turnTimer.current) clearTimeout(turnTimer.current);
      turnTimer.current = setTimeout(() => { void finishTurn(); }, TURN_PAUSE_MS);
    },
  });

  const dictationRef = useRef(dictation);
  dictationRef.current = dictation;

  /** Speaks a tutor line, then hands the microphone back. */
  const speakThenListen = useCallback(async (spanish: string) => {
    setPhase('speaking');
    // Never listen while speaking, or the tutor transcribes itself.
    dictationRef.current.stop();
    await speaker.say(spanish, { lang: cfg.dialect, rate: cfg.speechRate });
    if (!runningRef.current) return;
    if (cfg.autoContinue) {
      heard.current = '';
      setPhase('listening');
      dictationRef.current.start();
    } else {
      setPhase('idle');
    }
  }, [speaker, cfg.dialect, cfg.speechRate, cfg.autoContinue]);

  /** Sends what was heard, then speaks the answer. */
  const send = useCallback(async (said: string) => {
    setPhase('thinking');
    dictationRef.current.stop();

    const history = historyRef.current;
    try {
      let reply = '';
      await streamChat({
        settings: state.settings,
        system: buildTutorSystem(cfg, state.spanish.sessions.length),
        messages: [
          ...history.map((t) => ({
            id: t.id,
            role: (t.who === 'you' ? 'user' : 'assistant') as 'user' | 'assistant',
            content: t.text,
            at: 0,
          })),
          { id: uid('m'), role: 'user' as const, content: said, at: Date.now() },
        ].slice(-16),
        onDelta: () => { /* spoken at the end, not per token */ },
        effort: 'low',
      }).then((full) => { reply = full; });

      const { spanish, fix } = splitReply(reply);
      setTurns((t) => [...t, { id: uid('t'), who: 'tutor', text: spanish, fix }]);
      const toSpeak = fix && cfg.translate ? `${spanish} ... ${fix}` : spanish;
      await speakThenListen(toSpeak);
    } catch (err) {
      setError(err instanceof AIError ? [err.message, err.hint].filter(Boolean).join(' ') : 'Something went wrong.');
      setPhase('idle');
    }
  }, [state.settings, state.spanish.sessions.length, cfg, speakThenListen]);

  const finishTurn = useCallback(async () => {
    const said = heard.current.trim();
    heard.current = '';
    if (!said || !runningRef.current) return;
    setTurns((t) => [...t, { id: uid('t'), who: 'you', text: said }]);
    await send(said);
  }, [send]);

  const start = async () => {
    if (!configured) return;
    setError(null);
    setTurns([]);
    runningRef.current = true;
    startedAt.current = Date.now();
    setElapsed(0);
    setPhase('greeting');

    try {
      let opener = '';
      await streamChat({
        settings: state.settings,
        system: buildTutorSystem(cfg, state.spanish.sessions.length),
        messages: [{ id: uid('m'), role: 'user', content: '(The learner has just started the session. Greet them and ask your first question.)', at: Date.now() }],
        onDelta: () => {},
        effort: 'low',
      }).then((full) => { opener = full; });

      const { spanish, fix } = splitReply(opener);
      setTurns([{ id: uid('t'), who: 'tutor', text: spanish, fix }]);
      await speakThenListen(spanish);
    } catch (err) {
      setError(err instanceof AIError ? [err.message, err.hint].filter(Boolean).join(' ') : 'Could not start.');
      runningRef.current = false;
      setPhase('idle');
    }
  };

  const stop = () => {
    runningRef.current = false;
    if (turnTimer.current) clearTimeout(turnTimer.current);
    dictationRef.current.stop();
    speaker.cancel();
    setPhase('idle');

    // The session is worth logging only if it actually ran.
    const minutes = startedAt.current ? Math.round((Date.now() - startedAt.current) / 60000) : 0;
    startedAt.current = null;
    if (minutes >= 1) {
      reward('spanish', Math.max(2, Math.round((minutes / 10) * XP.spanishPerTenMin)), `${minutes} min with the tutor`, (s) => ({
        ...s,
        spanish: {
          ...s.spanish,
          sessions: [...s.spanish.sessions, {
            id: uid('sp'), date: todayKey(), minutes,
            platform: 'AI tutor', kind: 'Conversation' as const,
            notes: `${historyRef.current.filter((t) => t.who === 'you').length} turns`,
          }],
        },
      }));
    } else {
      toast('Too short to log');
    }
  };

  /* ---- housekeeping ---- */

  useEffect(() => {
    if (phase === 'idle') return;
    const id = setInterval(() => {
      if (startedAt.current) setElapsed(Math.floor((Date.now() - startedAt.current) / 1000));
    }, 1000);
    return () => clearInterval(id);
  }, [phase]);

  useEffect(() => {
    const el = logRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [turns]);

  useEffect(() => () => {
    runningRef.current = false;
    if (turnTimer.current) clearTimeout(turnTimer.current);
  }, []);

  const running = phase !== 'idle';
  const canHear = dictation.supported;
  const canSpeak = speaker.supported && hasVoiceFor(voices, cfg.dialect);
  const mm = String(Math.floor(elapsed / 60)).padStart(2, '0');
  const ss = String(elapsed % 60).padStart(2, '0');

  return (
    <>
      <section className="card" style={{ ['--mod' as string]: ACCENT }}>
        <SectionHead
          title="Talk to the tutor"
          sub="Hands-free. Built for a thirty-minute drive."
        />

        {!configured && (
          <p className="status status-warning" style={{ display: 'block', padding: '8px 12px' }}>
            The tutor needs an Anthropic API key. Add one in Settings.
          </p>
        )}
        {!canHear && (
          <p className="status status-warning" style={{ display: 'block', padding: '8px 12px' }}>
            This browser can't hear you. Chrome or Safari can — Firefox has no speech recognition.
          </p>
        )}
        {canHear && !canSpeak && (
          <p className="status status-warning" style={{ display: 'block', padding: '8px 12px' }}>
            No Spanish voice is installed on this device, so the tutor can't speak. On iOS add one under
            Settings → Accessibility → Spoken Content → Voices.
          </p>
        )}

        <div className="tutor-stage" data-phase={phase}>
          <span className="tutor-orb" aria-hidden>
            <i /><i /><i />
          </span>
          <p className="tutor-phase">
            {phase === 'idle' ? 'Ready' :
             phase === 'greeting' ? 'Starting…' :
             phase === 'speaking' ? 'Tutor is talking' :
             phase === 'listening' ? 'Listening — go ahead' : 'Thinking…'}
          </p>
          {running && <p className="tutor-clock t-num">{mm}:{ss}</p>}
        </div>

        {error && <p className="t-sm t-crit" style={{ marginTop: 'var(--sp-2)' }}>{error}</p>}

        <div className="row-2" style={{ marginTop: 'var(--sp-4)' }}>
          {running ? (
            <>
              <button className="btn btn-lg btn-danger grow" onClick={stop}>■ End and log it</button>
              {phase === 'listening' && (
                <button className="btn btn-lg" onClick={() => void finishTurn()}>Done talking</button>
              )}
            </>
          ) : (
            <button
              className="btn btn-accent btn-lg btn-block"
              style={{ ['--mod' as string]: ACCENT }}
              disabled={!configured || !canHear}
              onClick={() => void start()}
            >
              ▶ Start talking
            </button>
          )}
        </div>

        <p className="t-xs t-muted" style={{ marginTop: 'var(--sp-3)' }}>
          Set it up before you drive, not while you're moving. Time is logged to Spanish automatically
          when you end the session.
        </p>
      </section>

      {turns.length > 0 && (
        <section className="card">
          <SectionHead title="Transcript" sub={`${turns.filter((t) => t.who === 'you').length} turns from you`} />
          <div className="chat-log" ref={logRef}>
            {turns.map((t) => (
              <div key={t.id} className={t.who === 'you' ? 'bubble bubble-user' : 'bubble bubble-ai'}>
                {t.text}
                {t.fix && <span className="tutor-fix">{t.fix}</span>}
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="card">
        <SectionHead title="How it should talk to you" />
        <div className="stack-3">
          <Field label="Level">
            <div className="row-2 wrap">
              {LEVELS.map((l) => (
                <button key={l} className="chip" aria-pressed={cfg.level === l} onClick={() => setCfg({ level: l })}>{l}</button>
              ))}
            </div>
          </Field>

          <Field label="What to talk about">
            <div className="row-2 wrap">
              {TOPICS.map((t) => (
                <button key={t} className="chip" aria-pressed={cfg.topic === t} onClick={() => setCfg({ topic: t })}>{t}</button>
              ))}
            </div>
          </Field>

          <Field label="Accent">
            <div className="row-2 wrap">
              {DIALECTS.map((d) => (
                <button
                  key={d.id}
                  className="chip"
                  aria-pressed={cfg.dialect === d.id}
                  onClick={() => setCfg({ dialect: d.id as Dialect })}
                  title={hasVoiceFor(voices, d.id) ? undefined : 'No voice for this accent is installed on this device'}
                  style={hasVoiceFor(voices, d.id) ? undefined : { opacity: 0.55 }}
                >
                  {d.label}{hasVoiceFor(voices, d.id) ? '' : ' · no voice'}
                </button>
              ))}
            </div>
          </Field>

          <Slider
            label="Speaking speed"
            value={cfg.speechRate} min={0.6} max={1.2} step={0.05}
            display={`${cfg.speechRate.toFixed(2)}×`}
            hint="Slower is easier to follow at lower levels."
            onChange={(speechRate) => setCfg({ speechRate })}
          />

          <label className="row-2" style={{ cursor: 'pointer' }}>
            <input className="checkbox" type="checkbox" checked={cfg.autoContinue} onChange={(e) => setCfg({ autoContinue: e.target.checked })} />
            <span className="t-sm">Keep listening after each reply (hands-free)</span>
          </label>

          <label className="row-2" style={{ cursor: 'pointer' }}>
            <input className="checkbox" type="checkbox" checked={cfg.translate} onChange={(e) => setCfg({ translate: e.target.checked })} />
            <span className="t-sm">Say corrections out loud in English</span>
          </label>
        </div>
      </section>
    </>
  );
}

/* ---------------- prompting ---------------- */

const LEVEL_BRIEF: Record<TutorLevel, string> = {
  Beginner: 'Use present tense and short sentences. Common vocabulary only. Speak in two or three sentences at most, and ask one simple question at a time.',
  Intermediate: 'Use natural everyday speech including past and future tenses. Three or four sentences, then one question. Introduce a new useful word now and then and use it in context so it can be guessed.',
  Advanced: 'Speak as you would to a fluent adult: idioms, subjunctive, colloquial connectors. Push back, disagree, tell a short story. Do not simplify.',
};

function buildTutorSystem(cfg: TutorConfig, sessionsSoFar: number): string {
  const region = DIALECTS.find((d) => d.id === cfg.dialect)?.label ?? 'Latin America';

  return `You are a Spanish conversation partner in a voice call. Everything you say will be read aloud by a speech synthesiser and heard, not read, so write for the ear: no markdown, no lists, no emoji, no parentheses, no stage directions.

LEVEL — ${cfg.level}
${LEVEL_BRIEF[cfg.level]}

Speak Spanish as spoken in ${region}. Topic to steer toward: ${cfg.topic}.

HOW THE TURN WORKS
Reply in Spanish only. Keep it short — this is a conversation, not a lecture — and always end with a question so they have something to answer.
The learner is speaking through voice recognition, so expect missing accents and mistranscribed words. Do not correct spelling or punctuation, and if a word is clearly a mis-hearing, work out what they meant and carry on.

CORRECTIONS
If they made a real mistake worth fixing — wrong tense, wrong gender, a word that does not mean what they think — add one final line, in English, starting with exactly [fix] and no more than fifteen words. Correct at most one thing per turn, and only when it matters. If they said something fine, add no [fix] line at all. Never mention the [fix] convention itself.

They have logged ${sessionsSoFar} study sessions in this app so far. Do not talk about the app.`;
}

/** Separates the spoken Spanish from the English correction line. */
export function splitReply(raw: string): { spanish: string; fix?: string } {
  const text = raw.trim();
  const at = text.search(/\[fix\]/i);
  if (at < 0) return { spanish: text };
  return {
    spanish: text.slice(0, at).trim(),
    fix: text.slice(at).replace(/^\[fix\]\s*/i, '').trim() || undefined,
  };
}
