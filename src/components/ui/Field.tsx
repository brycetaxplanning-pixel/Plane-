import type { ReactNode } from 'react';

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <div className="field">
      <label>{label}</label>
      {children}
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
