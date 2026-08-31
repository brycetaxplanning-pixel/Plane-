interface SliderProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (n: number) => void;
  /** Rendered beside the label — the value in whatever unit reads best. */
  display: string;
  hint?: string;
}

export function Slider({ label, value, min, max, step = 1, onChange, display, hint }: SliderProps) {
  const pct = ((value - min) / (max - min)) * 100;
  return (
    <div className="slider">
      <div className="slider-head">
        <span className="slider-label">{label}</span>
        <span className="slider-value">{display}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        aria-label={label}
        style={{ ['--pct' as string]: `${pct}%` }}
        onChange={(e) => onChange(Number(e.target.value))}
      />
      {hint && <span className="t-xs t-muted">{hint}</span>}
    </div>
  );
}
