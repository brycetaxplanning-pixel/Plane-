import { useEffect, useState, type ReactNode } from 'react';
import { nextEffect, type Effect } from '../lib/completionFx';

interface CompletionFxProps {
  children: ReactNode;
  /** Called once the animation has finished, so the caller can commit the
   *  state change with the visual already resolved. */
  onFinished?: () => void;
  enabled?: boolean;
}

export interface FxHandle {
  play: () => void;
  playing: boolean;
}

/** Wraps a row and plays one random completion effect over it. */
export function useCompletionFx(enabled: boolean, onFinished?: () => void) {
  const [effect, setEffect] = useState<Effect | null>(null);

  useEffect(() => {
    if (!effect) return;
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const t = setTimeout(() => {
      setEffect(null);
      onFinished?.();
    }, reduce ? 120 : effect.duration);
    return () => clearTimeout(t);
    // onFinished is captured per play; re-running on identity change would
    // restart the timer mid-animation.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effect]);

  const play = () => {
    if (!enabled) { onFinished?.(); return; }
    if (effect) return;
    setEffect(nextEffect());
  };

  return { effect, play, playing: effect !== null };
}

export function CompletionFx({ children, effect }: { children: ReactNode; effect: Effect | null }) {
  return (
    <div className="fx-wrap" data-fx={effect?.id} data-playing={effect ? 'true' : undefined}>
      <div className="fx-body">{children}</div>
      {effect && (
        <>
          <span className="fx-layer fx-sweep" aria-hidden />
          <span className="fx-layer fx-flash" aria-hidden />
          <span className="fx-bits" aria-hidden>
            {Array.from({ length: 14 }, (_, i) => (
              <i key={i} style={{ ['--i' as string]: i, ['--r' as string]: `${(i * 37) % 100}` }} />
            ))}
          </span>
          <span className="fx-word" aria-hidden>{effect.name}</span>
          <span className="sr-only" role="status">{effect.name}</span>
        </>
      )}
    </div>
  );
}

/** Convenience wrapper for the common case: a row that plays an effect and
 *  then commits. */
export function FxRow({
  children, enabled, onFinished,
}: CompletionFxProps & { children: (play: () => void) => ReactNode }) {
  const { effect, play } = useCompletionFx(enabled ?? true, onFinished);
  return <CompletionFx effect={effect}>{children(play)}</CompletionFx>;
}
