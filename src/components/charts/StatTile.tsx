import type { ReactNode } from 'react';

interface StatTileProps {
  label: string;
  value: ReactNode;
  caption?: ReactNode;
  small?: boolean;
}

/** When the story is one number, it is a number — not a chart. */
export function StatTile({ label, value, caption, small }: StatTileProps) {
  return (
    <div className="tile">
      <span className="tile-label">{label}</span>
      <span className={small ? 'tile-value tile-value-sm' : 'tile-value'}>{value}</span>
      {caption && <span className="tile-cap">{caption}</span>}
    </div>
  );
}
