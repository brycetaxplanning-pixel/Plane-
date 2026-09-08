import { createPortal } from 'react-dom';

/**
 * The round button in the bottom corner.
 *
 * It renders into <body> rather than where it is written, and that is the
 * whole reason this component exists. `position: fixed` is measured against
 * the viewport only while no ancestor carries a transform; the module screen
 * animates in with `view-drill-in`, whose fill leaves an identity matrix on
 * <main> for good. An identity transform still makes a containing block, so a
 * fixed child anchors to <main> instead — and on a short screen the button
 * came to rest in the middle of the page, on top of the text.
 *
 * A portal steps outside that chain entirely, which is also why Modal uses
 * one. Fixing it here rather than in the animation keeps every other module's
 * drill-in exactly as it is.
 */
export function Fab({
  onClick, label, children, color,
}: {
  onClick: () => void;
  /** What it does, for anyone not looking at the screen. */
  label: string;
  children: React.ReactNode;
  /** The module's own colour, so the one loud thing on screen belongs to it. */
  color?: string;
}) {
  return createPortal(
    <button
      className="fab"
      onClick={onClick}
      aria-label={label}
      style={color ? { ['--fab' as string]: color } : undefined}
    >
      <span aria-hidden>{children}</span>
    </button>,
    document.body,
  );
}
