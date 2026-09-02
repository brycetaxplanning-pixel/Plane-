import { useEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Icons } from '../layout/Icons';

interface ModalProps {
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
}

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function Modal({ title, onClose, children, footer }: ModalProps) {
  const box = useRef<HTMLDivElement>(null);
  // Captured during render, not in the effect: by the time effects run, a field
  // with autoFocus has already taken focus, and the opener is lost.
  const opener = useRef<HTMLElement | null>(document.activeElement as HTMLElement | null);

  useEffect(() => {

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { onClose(); return; }
      if (e.key !== 'Tab') return;

      // Keep the tab ring inside the dialog. Without this, tabbing walks out
      // into the page behind — which is still there, still scrolled, and now
      // being operated by someone who cannot see where they are.
      const items = [...(box.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? [])]
        .filter((el) => el.offsetParent !== null || el === document.activeElement);
      if (items.length === 0) return;

      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;

      if (e.shiftKey && (active === first || !box.current?.contains(active))) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    // Nothing inside asked for focus — a dialog that is only text and a close
    // button — so put it on the dialog itself rather than leaving it behind.
    const timer = window.setTimeout(() => {
      if (!box.current?.contains(document.activeElement)) box.current?.focus();
    }, 0);

    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
      window.clearTimeout(timer);
      // Back where it came from, so closing a dialog does not dump the keyboard
      // user at the top of the page.
      const back = opener.current;
      if (back && document.body.contains(back)) back.focus();
    };
  }, [onClose]);

  // Rendered into <body>. The route-transition wrapper animates a transform,
  // which makes it a containing block and a stacking context, so a dialog left
  // inside it paints beneath the sticky header and cannot be clicked there.
  return createPortal(
    <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={title} ref={box} tabIndex={-1}>
        <div className="modal-head">
          <h2>{title}</h2>
          <button className="btn btn-ghost btn-icon" onClick={onClose} aria-label="Close"><span className="btn-glyph" aria-hidden>{Icons.close()}</span></button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}
