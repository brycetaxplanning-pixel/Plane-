import { useState } from 'react';
import type { Datum } from './BarChart';

interface SparklineProps {
  data: Datum[];
  color?: string;
  height?: number;
  formatValue?: (n: number) => string;
  ariaLabel?: string;
}

/** A trend, not a readout — the number it belongs to is always shown beside it
 *  by the caller. The 2px line is drawn in a stretched SVG (so it fills any
 *  width), while the end marker is a real element: a circle inside a
 *  non-uniformly scaled SVG would render as a distorted ellipse. */
export function Sparkline({
  data, color = 'var(--series-1)', height = 44, formatValue = (n) => String(n), ariaLabel,
}: SparklineProps) {
  const [hover, setHover] = useState<number | null>(null);
  if (data.length < 2) return <div style={{ height }} />;

  const pad = 5;
  const max = Math.max(...data.map((d) => d.value));
  const min = Math.min(...data.map((d) => d.value));
  const span = max - min || 1;

  const fx = (i: number) => i / (data.length - 1);           // 0–1 across the width
  const fy = (v: number) => 1 - (v - min) / span;            // 0–1 top to bottom
  const y = (v: number) => pad + fy(v) * (height - pad * 2);
  const path = data.map((d, i) => `${i === 0 ? 'M' : 'L'}${(fx(i) * 100).toFixed(2)},${y(d.value).toFixed(2)}`).join(' ');
  const last = data.length - 1;

  return (
    <div className="viz spark" style={{ height }}>
      <svg viewBox={`0 0 100 ${height}`} preserveAspectRatio="none" style={{ height }} role="img" aria-label={ariaLabel ?? 'Trend line'}>
        <path d={path} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
      </svg>

      {/* 2px surface ring keeps the marker readable where it overlaps the line. */}
      <span
        className="spark-dot"
        style={{ left: '100%', top: y(data[last].value), background: color }}
        aria-hidden
      />

      {data.map((d, i) => (
        <span
          key={d.key}
          className="spark-hit"
          style={{ left: `${fx(i) * 100}%`, width: `${100 / data.length}%` }}
          onMouseEnter={() => setHover(i)}
          onMouseLeave={() => setHover(null)}
        />
      ))}

      {hover !== null && (
        <div className="viz-tip" style={{ left: `${fx(hover) * 100}%`, top: y(data[hover].value) - 8 }}>
          {data[hover].label ?? data[hover].key} · <b>{formatValue(data[hover].value)}</b>
        </div>
      )}
    </div>
  );
}
