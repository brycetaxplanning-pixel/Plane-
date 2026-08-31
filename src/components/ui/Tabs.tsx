import { useRef, type ReactNode } from 'react';

export interface TabDef<T extends string> {
  id: T;
  label: ReactNode;
}

/**
 * A tab row that keeps the promise its roles make.
 *
 * `role="tab"` tells a screen reader user this is a tab list, which sets an
 * expectation: one stop on the tab key, then arrows to move between them. Rows
 * that carry the role without that behaviour are worse than plain buttons,
 * because the user is told a contract that is not honoured. So this does the
 * whole thing — roving tabindex, arrow keys, Home and End — and wires each tab
 * to the panel it controls.
 */
export function Tabs<T extends string>({
  tabs, active, onChange, label, idBase,
}: {
  tabs: TabDef<T>[];
  active: T;
  onChange: (id: T) => void;
  /** Names the row for a screen reader: "Finance sections", say. */
  label: string;
  /** Prefix for the generated ids, so two rows on one page cannot collide. */
  idBase: string;
}) {
  const ref = useRef<HTMLDivElement>(null);

  const move = (delta: number) => {
    const index = tabs.findIndex((t) => t.id === active);
    const next = tabs[(index + delta + tabs.length) % tabs.length];
    if (!next) return;
    onChange(next.id);
    // Focus follows selection, which is the expected behaviour for tabs whose
    // panels are already rendered.
    requestAnimationFrame(() => {
      ref.current?.querySelector<HTMLElement>(`#${CSS.escape(`${idBase}-tab-${next.id}`)}`)?.focus();
    });
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { e.preventDefault(); move(1); }
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') { e.preventDefault(); move(-1); }
    else if (e.key === 'Home') { e.preventDefault(); onChange(tabs[0].id); }
    else if (e.key === 'End') { e.preventDefault(); onChange(tabs[tabs.length - 1].id); }
  };

  return (
    <div className="tabs" role="tablist" aria-label={label} ref={ref} onKeyDown={onKeyDown}>
      {tabs.map((t) => (
        <button
          key={t.id}
          id={`${idBase}-tab-${t.id}`}
          className="tab"
          role="tab"
          type="button"
          aria-selected={active === t.id}
          aria-controls={`${idBase}-panel-${t.id}`}
          // Only the selected tab is a tab stop; the arrows reach the rest.
          tabIndex={active === t.id ? 0 : -1}
          onClick={() => onChange(t.id)}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

/** Spread onto the element holding the active tab's content. */
export const panelProps = (idBase: string, active: string) => ({
  id: `${idBase}-panel-${active}`,
  role: 'tabpanel' as const,
  'aria-labelledby': `${idBase}-tab-${active}`,
  tabIndex: -1,
});
