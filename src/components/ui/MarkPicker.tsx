import { Icons, PICKABLE, type IconName } from '../layout/Icons';

/**
 * Pick the mark that stands for something you named.
 *
 * This is the replacement for the emoji field. Choosing an emoji meant
 * opening the platform keyboard and hunting through faces and flags, and
 * whatever you landed on was drawn by Apple in Apple's palette, so no two of
 * them agreed with each other or with the app. These are the app's own marks.
 */
export function MarkPicker({
  value, onChange, label = 'Mark',
}: {
  value: IconName | undefined;
  onChange: (icon: IconName) => void;
  label?: string;
}) {
  return (
    <fieldset className="marks">
      <legend className="field-label">{label}</legend>
      <div className="marks-grid">
        {PICKABLE.map((name) => (
          <button
            key={name}
            type="button"
            className={`mark${value === name ? ' is-on' : ''}`}
            aria-pressed={value === name}
            aria-label={name}
            onClick={() => onChange(name)}
          >
            {Icons[name]()}
          </button>
        ))}
      </div>
    </fieldset>
  );
}
