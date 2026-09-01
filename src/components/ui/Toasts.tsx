import { useApp } from '../../state/context';

export function Toasts() {
  const { toasts, dismissToast } = useApp();
  if (toasts.length === 0) return null;
  return (
    <div className="toast-wrap" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className="toast">
          <span className="grow truncate">{t.text}</span>
          {t.xp !== undefined && <span className="toast-xp">+{t.xp} XP</span>}
          {t.action && (
            <button
              className="toast-action"
              onClick={() => { t.action?.run(); dismissToast(t.id); }}
            >
              {t.action.label}
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
