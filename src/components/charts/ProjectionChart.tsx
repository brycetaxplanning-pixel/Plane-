import { useMemo, useState } from 'react';
import type { YearPoint } from '../../lib/invest';
import { fmtCompact } from '../../lib/invest';

interface ProjectionChartProps {
  data: YearPoint[];
  currency: string;
  height?: number;
  /** Colour for the growth band; contributions use a muted step below it. */
  color?: string;
}

const AXIS = 22;
const PAD_TOP = 22;

/** Stacked area: what you put in, and what the returns added on top.
 *
 *  One y-scale for both bands — a second axis for "growth" would let the two
 *  measures be drawn at unrelated scales and is never worth it. The final
 *  value is labelled directly so the headline number never depends on a hover. */
export function ProjectionChart({ data, currency, height = 230, color = 'var(--series-1)' }: ProjectionChartProps) {
  const [hover, setHover] = useState<number | null>(null);

  const plotH = height - AXIS - PAD_TOP;
  const max = Math.max(1, ...data.map((d) => d.balance));
  const last = data.length - 1;

  const { contributedArea, balanceArea, balanceLine, boundaryLine } = useMemo(() => {
    const fx = (i: number) => (i / Math.max(1, last)) * 100;
    const fy = (v: number) => PAD_TOP + (1 - v / max) * plotH;

    const top = (pick: (d: YearPoint) => number) =>
      data.map((d, i) => `${i === 0 ? 'M' : 'L'}${fx(i).toFixed(3)},${fy(pick(d)).toFixed(2)}`).join(' ');

    const close = ` L100,${(PAD_TOP + plotH).toFixed(2)} L0,${(PAD_TOP + plotH).toFixed(2)} Z`;
    return {
      contributedArea: top((d) => d.contributed) + close,
      balanceArea: top((d) => d.balance) + close,
      balanceLine: top((d) => d.balance),
      boundaryLine: top((d) => d.contributed),
    };
  }, [data, last, max, plotH]);

  // The top gridline is drawn but not labelled: its value is the end value,
  // which is already called out directly at the end of the line.
  const gridValues = [0.25, 0.5, 0.75, 1].map((f) => f * max);
  const labelledGrid = gridValues.slice(0, 3);
  const point = data[hover ?? last];
  const tickEvery = Math.max(1, Math.ceil(last / 6));

  return (
    <div className="viz proj" style={{ height }}>
      <svg
        viewBox={`0 0 100 ${height}`}
        preserveAspectRatio="none"
        style={{ height }}
        role="img"
        aria-label={`Projected portfolio value from ${data[0]?.calendar} to ${data[last]?.calendar}`}
      >
        {gridValues.map((v) => (
          <line
            key={v}
            className="viz-grid"
            x1={0} x2={100}
            y1={PAD_TOP + (1 - v / max) * plotH}
            y2={PAD_TOP + (1 - v / max) * plotH}
            vectorEffect="non-scaling-stroke"
          />
        ))}

        {/* Growth sits above contributions; drawing the full balance first and
            the contributions band over it keeps the stack in one pass. */}
        <path d={balanceArea} fill={color} opacity={0.26} />
        <path d={contributedArea} fill={color} opacity={0.62} />

        {/* 2px surface rule between the two fills so the boundary reads. */}
        <path d={boundaryLine} fill="none" stroke="var(--surface-1)" strokeWidth={2} vectorEffect="non-scaling-stroke" />
        <path d={balanceLine} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" vectorEffect="non-scaling-stroke" />

        <line className="viz-axis" x1={0} x2={100} y1={PAD_TOP + plotH} y2={PAD_TOP + plotH} vectorEffect="non-scaling-stroke" />

        {hover !== null && (
          <line
            x1={(hover / Math.max(1, last)) * 100} x2={(hover / Math.max(1, last)) * 100}
            y1={PAD_TOP} y2={PAD_TOP + plotH}
            stroke="var(--text-muted)" strokeWidth={1} vectorEffect="non-scaling-stroke"
          />
        )}
      </svg>

      {/* Text and markers live outside the stretched SVG so nothing distorts. */}
      <div className="proj-overlay">
        {labelledGrid.map((v) => (
          <span key={v} className="viz-tick proj-ytick" style={{ top: PAD_TOP + (1 - v / max) * plotH - 12 }}>
            {fmtCompact(v, currency)}
          </span>
        ))}

        <span
          className="proj-dot"
          style={{
            left: `${((hover ?? last) / Math.max(1, last)) * 100}%`,
            top: PAD_TOP + (1 - (point?.balance ?? 0) / max) * plotH,
            background: color,
          }}
          aria-hidden
        />

        <span
          className="viz-value proj-endlabel"
          style={{ top: PAD_TOP + (1 - (data[last]?.balance ?? 0) / max) * plotH - 17 }}
        >
          {fmtCompact(data[last]?.balance ?? 0, currency)}
        </span>

        {data.map((d, i) => (
          i % tickEvery === 0 || i === last ? (
            <span key={d.t} className="viz-tick proj-xtick" style={{ left: `${(i / Math.max(1, last)) * 100}%`, top: height - AXIS + 3 }}>
              {d.calendar}
            </span>
          ) : null
        ))}
      </div>

      {data.map((d, i) => (
        <span
          key={d.t}
          className="proj-hit"
          style={{ left: `${(i / Math.max(1, last)) * 100}%`, width: `${100 / data.length}%` }}
          onMouseEnter={() => setHover(i)}
          onMouseLeave={() => setHover(null)}
        />
      ))}

      {hover !== null && point && (
        <div
          className="viz-tip"
          style={{ left: `${(hover / Math.max(1, last)) * 100}%`, top: PAD_TOP + (1 - point.balance / max) * plotH - 10 }}
        >
          <b>{point.calendar}</b> · {fmtCompact(point.balance, currency)}
          <br />
          in {fmtCompact(point.contributed, currency)} · growth {fmtCompact(point.growth, currency)}
        </div>
      )}
    </div>
  );
}
