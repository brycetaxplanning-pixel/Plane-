import { useState } from 'react';

export interface BudgetRow {
  category: string;
  spent: number;
  budget: number;
}

interface BudgetBarsProps {
  rows: BudgetRow[];
  format: (n: number) => string;
  color?: string;
}

/** Spend against budget, one row per category. The bar is spend; the rule is
 *  the budget. Two encodings on one scale — never two axes — and every row
 *  states both numbers as text, so the bars are a comparison aid rather than
 *  the only way to read the value. */
export function BudgetBars({ rows, format, color = 'var(--series-5)' }: BudgetBarsProps) {
  const [hover, setHover] = useState<string | null>(null);
  const scale = Math.max(1, ...rows.map((r) => Math.max(r.spent, r.budget)));
  const anyOver = rows.some((r) => r.budget > 0 && r.spent > r.budget);

  return (
    <div>
      <div className="viz-legend" style={{ marginBottom: 10 }}>
        <span><i className="viz-swatch" style={{ background: color }} />Spent</span>
        <span><i className="viz-swatch-rule" style={{ background: 'var(--text-muted)' }} />Budget</span>
        {anyOver && <span><i className="viz-swatch" style={{ background: 'var(--status-critical)' }} />Over budget</span>}
      </div>

      {rows.map((r) => {
        const over = r.budget > 0 && r.spent > r.budget;
        const pct = (r.spent / scale) * 100;
        const bpct = (r.budget / scale) * 100;
        return (
          <div
            className="bbar"
            key={r.category}
            onMouseEnter={() => setHover(r.category)}
            onMouseLeave={() => setHover(null)}
          >
            <span className="bbar-name" title={r.category}>{r.category}</span>
            <div style={{ position: 'relative', height: 20, background: 'var(--surface-sunken)', borderRadius: 4 }}>
              <div
                style={{
                  position: 'absolute', left: 0, top: 0, bottom: 0,
                  width: `${Math.min(100, pct)}%`,
                  background: over ? 'var(--status-critical)' : color,
                  borderRadius: 4,
                  opacity: hover && hover !== r.category ? 0.6 : 1,
                  transition: 'width 380ms cubic-bezier(0.2,0.8,0.3,1), opacity 120ms ease',
                }}
              />
              {r.budget > 0 && (
                <div
                  aria-hidden
                  style={{
                    position: 'absolute', left: `${Math.min(100, bpct)}%`, top: -2, bottom: -2,
                    width: 2, background: 'var(--text-muted)', borderRadius: 2,
                  }}
                />
              )}
            </div>
            <span className="bbar-num">
              {format(r.spent)}
              {r.budget > 0 && <span className="t-muted"> / {format(r.budget)}</span>}
            </span>
          </div>
        );
      })}
    </div>
  );
}
