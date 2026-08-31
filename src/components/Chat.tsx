import { useEffect, useRef, useState } from 'react';
import { AIError, isAIConfigured, streamChat } from '../lib/ai';
import type { ChatMessage } from '../lib/schema';
import { uid } from '../lib/id';
import { useApp } from '../state/context';

interface ChatProps {
  /** Rebuilt on every send so the model always sees current numbers. */
  buildSystem: () => string;
  messages: ChatMessage[];
  onChange: (next: ChatMessage[]) => void;
  placeholder: string;
  suggestions?: string[];
  accent?: string;
  /** Used when no API key is set, so the panel is still useful offline. */
  offlineReply: (input: string) => string;
  emptyHint: string;
}

export function Chat({
  buildSystem, messages, onChange, placeholder, suggestions = [], accent, offlineReply, emptyHint,
}: ChatProps) {
  const { state } = useApp();
  const [draft, setDraft] = useState('');
  const [pending, setPending] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<AIError | null>(null);
  const logRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const el = logRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, pending]);

  useEffect(() => () => abortRef.current?.abort(), []);

  async function send(text: string) {
    const body = text.trim();
    if (!body || busy) return;

    const userMsg: ChatMessage = { id: uid('m'), role: 'user', content: body, at: Date.now() };
    const history = [...messages, userMsg];
    onChange(history);
    setDraft('');
    setError(null);

    if (!isAIConfigured(state.settings)) {
      onChange([...history, { id: uid('m'), role: 'assistant', content: offlineReply(body), at: Date.now() }]);
      return;
    }

    setBusy(true);
    setPending('');
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const reply = await streamChat({
        settings: state.settings,
        system: buildSystem(),
        // Keeping the last 20 turns bounds both cost and latency.
        messages: history.slice(-20),
        onDelta: (chunk) => setPending((p) => p + chunk),
        signal: controller.signal,
      });
      if (reply) {
        onChange([...history, { id: uid('m'), role: 'assistant', content: reply, at: Date.now() }]);
      }
    } catch (err) {
      setError(err instanceof AIError ? err : new AIError('Something went wrong.'));
    } finally {
      setBusy(false);
      setPending('');
      abortRef.current = null;
    }
  }

  return (
    <div className="chat">
      <div className="chat-log" ref={logRef}>
        {messages.length === 0 && !pending && (
          <div className="bubble bubble-ai t-sec">{emptyHint}</div>
        )}
        {messages.map((m) => (
          <div key={m.id} className={m.role === 'user' ? 'bubble bubble-user' : 'bubble bubble-ai'}>
            {m.content}
          </div>
        ))}
        {pending && <div className="bubble bubble-ai">{pending}</div>}
        {busy && !pending && (
          <div className="bubble bubble-ai"><span className="typing"><i /><i /><i /></span></div>
        )}
      </div>

      {error && (
        <div className="status status-critical" style={{ display: 'block', padding: '8px 12px' }}>
          <strong>{error.message}</strong>
          {error.hint && <div className="t-xs" style={{ marginTop: 2 }}>{error.hint}</div>}
        </div>
      )}

      {!isAIConfigured(state.settings) && (
        <p className="t-xs t-muted">
          Add an Anthropic API key in Settings for a real conversation. Without one you still get
          built-in coaching based on your logged data.
        </p>
      )}

      {suggestions.length > 0 && messages.length === 0 && (
        <div className="row-2 wrap">
          {suggestions.map((s) => (
            <button key={s} type="button" className="chip" onClick={() => void send(s)} disabled={busy}>{s}</button>
          ))}
        </div>
      )}

      <form
        className="chat-form"
        onSubmit={(e) => { e.preventDefault(); void send(draft); }}
      >
        <textarea
          className="textarea grow"
          style={{ minHeight: 44, maxHeight: 130 }}
          rows={1}
          value={draft}
          placeholder={placeholder}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void send(draft); }
          }}
        />
        {busy ? (
          <button type="button" className="btn" onClick={() => abortRef.current?.abort()}>Stop</button>
        ) : (
          <button type="submit" className="btn btn-accent" style={accent ? { ['--mod' as string]: accent } : undefined} disabled={!draft.trim()}>
            Send
          </button>
        )}
      </form>
    </div>
  );
}
