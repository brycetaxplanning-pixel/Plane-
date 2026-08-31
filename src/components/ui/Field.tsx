import { cloneElement, isValidElement, useId, type ReactElement, type ReactNode } from 'react';

/** A labelled control. When there is exactly one child and it has no id of its
 *  own, the label is wired to it — so tapping the label focuses the field, and
 *  a screen reader reads the two together. */
export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  const id = useId();
  const single = isValidElement(children) ? (children as ReactElement<{ id?: string }>) : null;
  const wired = single !== null && !single.props.id;

  return (
    <div className="field">
      <label htmlFor={wired ? id : undefined}>{label}</label>
      {wired ? cloneElement(single, { id }) : children}
      {hint && <span className="t-xs t-muted">{hint}</span>}
    </div>
  );
}

export function EmptyState({ icon, title, hint }: { icon: string; title: string; hint?: string }) {
  return (
    <div className="empty">
      <span className="empty-icon" aria-hidden>{icon}</span>
      <strong style={{ fontWeight: 620 }}>{title}</strong>
      {hint && <span className="t-sm t-muted">{hint}</span>}
    </div>
  );
}

export function SectionHead({ title, sub, action }: { title: string; sub?: string; action?: ReactNode }) {
  return (
    <div className="card-head">
      <div>
        <h2 className="viz-title" style={{ fontSize: 15 }}>{title}</h2>
        {sub && <p className="viz-sub">{sub}</p>}
      </div>
      {action}
    </div>
  );
}
