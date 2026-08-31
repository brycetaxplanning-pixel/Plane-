import { useState } from 'react';

export interface Datum {
  key: string;
  value: number;
  label?: string;
}

interface BarChartProps {
  data: Datum[];
  color?: string;
  height?: number;
  /** Optional goal rule drawn across the plot, e.g. the daily pace needed. */
  target?: number;
  targetLabel?: string;
  formatValue?: (n: number) => string;
  /** Marks a bar as "now" so today reads differently without a second hue. */
  highlightKey?: string;
  ariaLabel?: string;
}

/** Single-series column chart. One hue for the whole series — magnitude is the
 *  bar height, never the colour. Built from real elements rather than a
 *  stretched SVG so the 4px rounded data-ends and the 2px gaps between fills
 *  stay true at any width. The tallest bar carries a direct label, so the
 *  scale is readable without hovering. */
export function BarChart({
  data, color = 'var(--series-1)', height = 132, target, targetLabel,
  formatValue = (n) => String(n), highlightKey, ariaLabel,
}: BarChartProps) {
  const [hover, setHover] = useState<number | null>(null);

  const tickStep = Math.max(1, Math.ceil(data.length / 8));

  // 12% headroom above the tallest mark so the direct label has somewhere to
  // sit without colliding with whatever is above the chart.
  const peakValue = Math.max(...data.map((d) => d.value), target ?? 0);
  const max = Math.max(1, peakValue * 1.12);
  const peak = data.reduce((best, d, i) => (d.value > (data[best]?.value ?? -1) ? i : best), 0);
  const showTarget = target !== undefined && target > 0;

  return (
    <div className="viz" role="img" aria-label={ariaLabel ?? 'Bar chart'}>
      <div className="bars" style={{ height }}>
        {showTarget && (
          <div className="bars-target" style={{ bottom: `${(target / max) * 100}%` }} aria-hidden />
        )}

        {data.map((d, i) => {
          const pct = d.value > 0 ? Math.max(1.5, (d.value / max) * 100) : 0;
          const dim = highlightKey && d.key !== highlightKey ? 0.55 : 1;
          return (
            <div
              key={d.key}
              className="bars-col"
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover(null)}
              onFocus={() => setHover(i)}
              onBlur={() => setHover(null)}
              tabIndex={-1}
            >
              {i === peak && d.value > 0 && (
                <span className="viz-value bars-peak" style={{ bottom: `calc(${pct}% + 3px)` }}>
                  {formatValue(d.value)}
                </span>
              )}
              <div
                className="bars-bar"
                style={{ height: `${pct}%`, background: color, opacity: hover === i ? 1 : dim }}
              />
            </div>
          );
        })}
      </div>

      <div className="bars-axis">
        {/* Past about eight bars the labels collide at phone width, so only
            every nth is drawn — the last one always, since that is the end of
            the range you are reading toward. Every bar keeps its label in the
            hover readout below. */}
        {data.map((d, i) => (
          <span key={d.key} className="viz-tick">
            {i % tickStep === 0 || i === data.length - 1 ? d.label ?? '' : ''}
          </span>
        ))}
      </div>

      {hover !== null && data[hover] && (
        <div
          className="viz-tip"
          style={{
            left: `${((hover + 0.5) / data.length) * 100}%`,
            top: Math.max(0, height - (data[hover].value / max) * height - 10),
          }}
        >
          {data[hover].label ?? data[hover].key} · <b>{formatValue(data[hover].value)}</b>
        </div>
      )}

      {showTarget && targetLabel && (
        <div className="viz-legend" style={{ marginTop: 8 }}>
          <span><i className="viz-swatch" style={{ background: color }} />Logged</span>
          <span><i className="viz-swatch-rule" style={{ background: 'var(--text-muted)' }} />{targetLabel}</span>
        </div>
      )}
    </div>
  );
}
