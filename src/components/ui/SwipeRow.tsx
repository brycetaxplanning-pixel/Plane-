import { useRef, useState } from 'react';
import { Icons } from '../layout/Icons';

const ACTION_W = 84;
/** How far you have to move before the gesture commits to being a swipe
 *  rather than a scroll. Below this it could be either. */
const LOCK = 8;

/**
 * A row you can drag to the left to reveal Delete, the way a Mail message
 * works.
 *
 * Deleting a habit used to live behind tapping its name, opening the edit
 * sheet and finding a button at the bottom — which is where you look last.
 * The gesture is the discoverable path; the sheet keeps its button, because a
 * gesture is not reachable by keyboard and nothing should be gesture-only.
 *
 * The pointer is only captured once the movement is decisively horizontal, so
 * dragging up and down still scrolls the list.
 */
export function SwipeRow({
  children, onDelete, label,
}: {
  children: React.ReactNode;
  onDelete: () => void;
  /** Named in the delete button's accessible label — "Delete Foam roll". */
  label: string;
}) {
  const [dx, setDx] = useState(0);
  const [open, setOpen] = useState(false);
  const [dragging, setDragging] = useState(false);
  const start = useRef<{ x: number; y: number; axis: null | 'x' | 'y' } | null>(null);
  /** A drag still ends in a click. Without swallowing that one the row opened
   *  and then closed itself in the same gesture, and the click went on to the
   *  row underneath and opened its edit sheet. */
  const swallowClick = useRef(false);

  const down = (e: React.PointerEvent) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    start.current = { x: e.clientX, y: e.clientY, axis: null };
  };

  const move = (e: React.PointerEvent) => {
    const s = start.current;
    if (!s) return;
    const moveX = e.clientX - s.x;
    const moveY = e.clientY - s.y;

    if (s.axis === null) {
      if (Math.abs(moveX) < LOCK && Math.abs(moveY) < LOCK) return;
      // Vertical wins ties: a list is for scrolling first.
      s.axis = Math.abs(moveX) > Math.abs(moveY) ? 'x' : 'y';
      if (s.axis === 'x') {
        e.currentTarget.setPointerCapture(e.pointerId);
        setDragging(true);
      }
    }
    if (s.axis !== 'x') return;

    const base = open ? -ACTION_W : 0;
    // Rightward past closed does nothing; leftward past the button gets
    // heavier, so the row cannot be dragged off into space.
    const next = Math.min(0, base + moveX);
    setDx(next < -ACTION_W ? -ACTION_W + (next + ACTION_W) / 3 : next);
  };

  const up = () => {
    const s = start.current;
    start.current = null;
    setDragging(false);
    if (!s || s.axis !== 'x') return;
    swallowClick.current = true;
    const shouldOpen = dx < -ACTION_W / 2;
    setOpen(shouldOpen);
    setDx(0);
  };

  const offset = dragging ? dx : open ? -ACTION_W : 0;

  return (
    <div className={`swipe${open ? ' is-open' : ''}`}>
      <button
        className="swipe-delete"
        style={{ width: ACTION_W }}
        aria-label={`Delete ${label}`}
        tabIndex={open ? 0 : -1}
        aria-hidden={!open}
        onClick={() => { setOpen(false); onDelete(); }}
      >
        <span aria-hidden>{Icons.trash()}</span>
        Delete
      </button>

      <div
        className="swipe-face"
        style={{
          transform: `translateX(${offset}px)`,
          transition: dragging ? 'none' : undefined,
        }}
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={up}
        // A tap anywhere on an open row puts it back, rather than leaving a
        // delete button armed behind something you meant to press — but the
        // click that ends a drag is not a tap and is thrown away.
        onClickCapture={(e) => {
          if (swallowClick.current) {
            swallowClick.current = false;
            e.preventDefault();
            e.stopPropagation();
            return;
          }
          if (open) { e.preventDefault(); e.stopPropagation(); setOpen(false); }
        }}
      >
        {children}
      </div>
    </div>
  );
}
