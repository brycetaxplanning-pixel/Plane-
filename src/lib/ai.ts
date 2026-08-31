import Anthropic from '@anthropic-ai/sdk';
import type { ChatMessage, Settings } from './schema';

/** Only models that accept `output_config.effort` are offered, so the
 *  request shape below is valid for every choice in the picker. */
export const AI_MODELS = [
  { id: 'claude-opus-5',   label: 'Claude Opus 5 — most capable' },
  { id: 'claude-sonnet-5', label: 'Claude Sonnet 5 — faster, cheaper' },
] as const;

export const DEFAULT_MODEL = 'claude-opus-5';

export const isAIConfigured = (s: Settings): boolean => s.anthropicApiKey.trim().length > 0;

/** The key lives in this browser only. `dangerouslyAllowBrowser` makes the SDK
 *  send `anthropic-dangerous-direct-browser-access`, which is what lets a
 *  serverless page call the API at all. */
function createClient(settings: Settings): Anthropic {
  return new Anthropic({
    apiKey: settings.anthropicApiKey.trim(),
    dangerouslyAllowBrowser: true,
  });
}

const toParams = (messages: ChatMessage[]): Anthropic.MessageParam[] =>
  messages.map((m) => ({ role: m.role, content: m.content }));

export class AIError extends Error {
  hint?: string;
  constructor(message: string, hint?: string) {
    super(message);
    this.name = 'AIError';
    this.hint = hint;
  }
}

function describe(error: unknown): AIError {
  if (error instanceof Anthropic.AuthenticationError) {
    return new AIError('That API key was rejected.', 'Check the key in Settings — it should start with "sk-ant-".');
  }
  if (error instanceof Anthropic.RateLimitError) {
    return new AIError('Rate limited by the API.', 'Wait a few seconds and send it again.');
  }
  if (error instanceof Anthropic.BadRequestError) {
    return new AIError(`The request was rejected: ${error.message}`);
  }
  if (error instanceof Anthropic.APIConnectionError) {
    return new AIError('Could not reach the Anthropic API.', 'Check your connection and try again.');
  }
  if (error instanceof Anthropic.APIError) {
    // A 5xx body is the API's own JSON, which is no use to the person reading
    // it. Say what happened and what to do; the detail is in the console.
    if (error.status && error.status >= 500) {
      return new AIError('The API is having trouble right now.', 'It was retried and still failed. Try again in a moment.');
    }
    if (error.status === 413) {
      return new AIError('That was too much text to send at once.', 'Send a smaller piece of it.');
    }
    return new AIError(`The API returned ${error.status ?? 'an error'}.`, error.message.slice(0, 140));
  }
  return new AIError(error instanceof Error ? error.message : 'Something went wrong talking to Claude.');
}

export interface StreamOptions {
  settings: Settings;
  system: string;
  messages: ChatMessage[];
  onDelta: (text: string) => void;
  signal?: AbortSignal;
  effort?: 'low' | 'medium' | 'high';
}

/** Streams a reply, calling `onDelta` with each text chunk, and resolves with
 *  the complete text. */
export async function streamChat({
  settings, system, messages, onDelta, signal, effort = 'medium',
}: StreamOptions): Promise<string> {
  const client = createClient(settings);
  let full = '';
  try {
    const stream = client.messages.stream(
      {
        model: settings.aiModel || DEFAULT_MODEL,
        max_tokens: 4000,
        output_config: { effort },
        system,
        messages: toParams(messages),
      },
      { signal },
    );

    for await (const event of stream) {
      if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
        full += event.delta.text;
        onDelta(event.delta.text);
      }
    }

    const final = await stream.finalMessage();
    if (final.stop_reason === 'refusal') {
      throw new AIError('Claude declined to answer that one.', 'Try rephrasing the question.');
    }
    return full.trim();
  } catch (err) {
    if (err instanceof AIError) throw err;
    if (signal?.aborted) return full.trim();
    throw describe(err);
  }
}

/** One-shot call used for structured helpers (transaction splitting). The
 *  reply is prompted to be JSON and parsed defensively — a model that wraps
 *  it in prose or a fenced block still gets read correctly. */
export async function askJSON<T>(settings: Settings, system: string, prompt: string): Promise<T> {
  const client = createClient(settings);
  try {
    const res = await client.messages.create({
      model: settings.aiModel || DEFAULT_MODEL,
      max_tokens: 2000,
      output_config: { effort: 'low' },
      system: `${system}\n\nRespond with JSON only. No prose, no code fences.`,
      messages: [{ role: 'user', content: prompt }],
    });

    if (res.stop_reason === 'refusal') throw new AIError('Claude declined that request.');

    const text = res.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('');

    return parseLooseJSON<T>(text);
  } catch (err) {
    if (err instanceof AIError) throw err;
    throw describe(err);
  }
}

export function parseLooseJSON<T>(text: string): T {
  const cleaned = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/```$/, '').trim();
  try {
    return JSON.parse(cleaned) as T;
  } catch {
    const start = cleaned.search(/[[{]/);
    const end = Math.max(cleaned.lastIndexOf(']'), cleaned.lastIndexOf('}'));
    if (start >= 0 && end > start) return JSON.parse(cleaned.slice(start, end + 1)) as T;
    throw new AIError('Could not read the response as JSON.');
  }
}
