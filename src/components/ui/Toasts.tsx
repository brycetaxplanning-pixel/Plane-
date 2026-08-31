import { useApp } from '../../state/context';

export function Toasts() {
  const { toasts, dismissToast } = useApp();
  if (toasts.length === 0) return null;
  return (
    <div className="toast-wrap" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className="toast" style={{ pointerEvents: 'auto' }} onClick={() => dismissToast(t.id)}>
          <span className="grow truncate">{t.text}</span>
          {t.xp !== undefined && <span className="toast-xp">+{t.xp} XP</span>}
        </div>
      ))}
    </div>
  );
}
