interface RingProps {
  /** 0–1; values above 1 are clamped for the arc but not for the label. */
  value: number;
  size?: number;
  stroke?: number;
  color?: string;
  /** Always rendered — the arc alone never carries the number. */
  label: string;
  caption?: string;
}

/** A single-value gauge. One mark, one track, the value in the middle. */
export function Ring({ value, size = 72, stroke = 7, color = 'var(--series-1)', label, caption }: RingProps) {
  const clamped = Math.max(0, Math.min(1, value));
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;

  return (
    <div className="ring-wrap">
      <div className="ring-figure" style={{ width: size, height: size }}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={`${label} ${caption ?? ''}`}>
          <circle className="ring-track" cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} />
          {clamped > 0 && (
            <circle
              cx={size / 2} cy={size / 2} r={r}
              fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round"
              strokeDasharray={`${c * clamped} ${c}`}
              transform={`rotate(-90 ${size / 2} ${size / 2})`}
              style={{ transition: 'stroke-dasharray 480ms cubic-bezier(0.2,0.8,0.3,1)' }}
            />
          )}
        </svg>
        <div className="ring-center">
          <span className="ring-value">{label}</span>
          {caption && <span className="ring-cap">{caption}</span>}
        </div>
      </div>
    </div>
  );
}
