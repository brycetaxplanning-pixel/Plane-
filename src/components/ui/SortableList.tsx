import { useCallback, useEffect, useRef, useState } from 'react';
import { Icons } from '../layout/Icons';

/** How long a finger has to rest before the row is picked up. */
const HOLD_MS = 320;
/** Move further than this before the hold lands and it was never a reorder —
 *  it was a scroll, or a swipe, and those belong to whoever else wants them. */
const SLOP = 8;

export interface SortableProps {
  /** The ids being ordered, in the order they are shown. */
  ids: string[];
  /** The new order, once a row has been dropped. */
  onReorder: (ids: string[]) => void;
  /** Names a row for anyone not looking at the screen — "Reorder Foam roll". */
  labelOf: (id: string) => string;
  children: React.ReactNode[];
}

/**
 * A list whose rows can be put in the order you want them.
 *
 * Press and hold a row, then slide it. The hold is what makes this safe to add
 * to rows that already carry gestures: a list is for scrolling first and these
 * rows already swipe sideways to delete, so moving before the hold lands hands
 * the gesture back and nothing is picked up. SwipeRow only ever acts once it
 * has locked to the horizontal, which a stationary press never does.
 *
 * The grip on the right is the same thing for a mouse and a keyboard, where
 * pressing and holding is not an idiom anyone expects. It appears on hover or
 * focus, so it costs a phone nothing, and arrow keys move a row without any
 * pointer at all.
 *
 * Rows are measured on pick-up rather than assumed to be equal: a habit row
 * with a nudge under it is taller than one without, and guessing would drop
 * rows a place off further down a long list.
 */
export function SortableList({ ids, onReorder, labelOf, children }: SortableProps) {
  const list = useRef<HTMLUListElement>(null);
  const [dragging, setDragging] = useState<number | null>(null);
  const [dy, setDy] = useState(0);
  const [target, setTarget] = useState<number | null>(null);

  const hold = useRef<number | null>(null);
  const origin = useRef({ x: 0, y: 0 });
  const rects = useRef<{ top: number; height: number }[]>([]);

  const clearHold = () => {
    if (hold.current !== null) { window.clearTimeout(hold.current); hold.current = null; }
  };
  useEffect(() => clearHold, []);

  const move = useCallback((ids: string[], from: number, to: number): string[] => {
    if (from === to) return ids;
    const next = [...ids];
    const [taken] = next.splice(from, 1);
    next.splice(to, 0, taken);
    return next;
  }, []);

  const begin = (index: number, el: HTMLElement) => {
    const rows = [...(list.current?.children ?? [])] as HTMLElement[];
    rects.current = rows.map((r) => ({ top: r.offsetTop, height: r.offsetHeight }));
    setDragging(index);
    setTarget(index);
    setDy(0);
    // Held rather than tapped, so the press should be felt as well as seen.
    navigator.vibrate?.(12);
    el.focus?.({ preventScroll: true });
  };

  const onPointerDown = (index: number) => (e: React.PointerEvent) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    origin.current = { x: e.clientX, y: e.clientY };
    const el = e.currentTarget as HTMLElement;
    const id = e.pointerId;
    clearHold();
    hold.current = window.setTimeout(() => {
      hold.current = null;
      el.setPointerCapture(id);
      begin(index, el);
    }, HOLD_MS);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (dragging === null) {
      // Still deciding. Any real movement means this was not a hold.
      if (hold.current !== null) {
        const far = Math.abs(e.clientX - origin.current.x) > SLOP
          || Math.abs(e.clientY - origin.current.y) > SLOP;
        if (far) clearHold();
      }
      return;
    }

    const offset = e.clientY - origin.current.y;
    setDy(offset);

    // Whichever slot the row's own middle is over is the slot it takes. The
    // obvious alternative — take slot i once you pass the middle of row i —
    // means dragging a full row plus half of another before anything moves,
    // which reads as the list resisting you.
    const me = rects.current[dragging];
    if (!me) return;
    const centre = me.top + me.height / 2 + offset;
    let want = rects.current.length - 1;
    for (let i = 0; i < rects.current.length; i += 1) {
      const r = rects.current[i];
      if (centre < r.top + r.height) { want = i; break; }
    }
    setTarget(want);
  };

  const finish = () => {
    clearHold();
    if (dragging === null) return;
    const to = target ?? dragging;
    if (to !== dragging) onReorder(move(ids, dragging, to));
    setDragging(null);
    setTarget(null);
    setDy(0);
  };

  /** Arrow keys, for a keyboard and for anyone who would rather not drag. */
  const onKeyDown = (index: number) => (e: React.KeyboardEvent) => {
    const step = e.key === 'ArrowUp' ? -1 : e.key === 'ArrowDown' ? 1 : 0;
    if (step === 0) return;
    const to = index + step;
    if (to < 0 || to >= ids.length) return;
    e.preventDefault();
    onReorder(move(ids, index, to));
    // Keep the grip under the finger that is walking the row down the list.
    const grips = list.current?.querySelectorAll<HTMLElement>('.grip');
    window.requestAnimationFrame(() => grips?.[to]?.focus());
  };

  /** How far a row that is not being dragged has to step aside. */
  const shift = (i: number): number => {
    if (dragging === null || target === null || i === dragging) return 0;
    const h = rects.current[dragging]?.height ?? 0;
    if (dragging < target && i > dragging && i <= target) return -h;
    if (dragging > target && i < dragging && i >= target) return h;
    return 0;
  };

  return (
    <ul className={`sortable${dragging !== null ? ' is-sorting' : ''}`} ref={list}>
      {children.map((child, i) => {
        const held = dragging === i;
        return (
          <li
            key={ids[i]}
            className={`sortable-item${held ? ' is-held' : ''}`}
            style={{
              transform: `translateY(${held ? dy : shift(i)}px)`,
              transition: held || dragging === null ? undefined : 'transform 160ms ease',
              zIndex: held ? 2 : undefined,
            }}
            onPointerDown={onPointerDown(i)}
            onPointerMove={onPointerMove}
            onPointerUp={finish}
            onPointerCancel={finish}
          >
            {child}
            <button
              type="button"
              className="grip"
              aria-label={`Reorder ${labelOf(ids[i])}. Use the up and down arrow keys.`}
              onKeyDown={onKeyDown(i)}
              // The grip is for keyboards and mice; a press on it is not a drag.
              onPointerDown={(e) => e.stopPropagation()}
            >
              <span aria-hidden>{Icons.grip()}</span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
