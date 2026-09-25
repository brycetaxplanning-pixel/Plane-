/**
 * How much of the bottom of the screen the on-screen keyboard is covering.
 *
 * iOS does not move the page when the keyboard opens. It shrinks the *visual*
 * viewport — the part you can see — and leaves the layout viewport exactly as
 * it was, so anything positioned against the bottom of the layout viewport
 * stays where it was and is now behind the keyboard. A bottom sheet with a
 * field in it does this every single time: the keyboard comes up, the sheet is
 * underneath it, and there is no sign of what you are typing into.
 *
 * `visualViewport` is what knows the difference. The inset is published as a
 * custom property so the fix is one line of CSS wherever it matters, and it is
 * zero on every platform that resizes the page properly, which makes it a
 * no-op there rather than a second layout to maintain.
 */
const VAR = '--kb';

function measure(): number {
  const vv = window.visualViewport;
  if (!vv) return 0;
  // The bottom edge of what can be seen, against the bottom of the layout
  // viewport. offsetTop matters because iOS also scrolls the visual viewport
  // within the layout one when a field near the bottom takes focus.
  const hidden = window.innerHeight - vv.height - vv.offsetTop;
  // Small negatives and a pixel or two of rounding are not a keyboard.
  return hidden > 24 ? Math.round(hidden) : 0;
}

/**
 * Starts publishing it. Returns the teardown.
 *
 * Safe to call where there is no visualViewport: the property is set to zero
 * once and nothing is listened to.
 */
export function trackKeyboard(): () => void {
  const root = document.documentElement;
  const apply = () => root.style.setProperty(VAR, `${measure()}px`);

  apply();
  const vv = window.visualViewport;
  if (!vv) return () => root.style.removeProperty(VAR);

  vv.addEventListener('resize', apply);
  vv.addEventListener('scroll', apply);
  return () => {
    vv.removeEventListener('resize', apply);
    vv.removeEventListener('scroll', apply);
    root.style.removeProperty(VAR);
  };
}
