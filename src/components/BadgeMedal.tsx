import { Icons } from './layout/Icons';
import type { BadgeDef } from '../lib/gamification';

/**
 * An award, struck as a medallion.
 *
 * Unearned ones are shown, not hidden: a set you can see the shape of is the
 * thing worth collecting. The locked state is carried by the dashed ring and
 * the outline rather than by fading — a faded badge is one you can see is
 * there and cannot read.
 */
export function BadgeMedal({ badge, earned }: { badge: BadgeDef; earned: boolean }) {
  return (
    <div className={`medal${earned ? ' medal-won' : ''}`} title={badge.description}>
      <span className="medal-disc" aria-hidden>{Icons[badge.icon]()}</span>
      <span className="medal-name">{badge.name}</span>
      <span className="sr-only">{earned ? 'Earned. ' : 'Not yet earned. '}{badge.description}</span>
    </div>
  );
}

export function BadgeWall({ badges, earned }: { badges: BadgeDef[]; earned: Set<string> }) {
  return (
    <div className="medal-wall">
      {badges.map((b) => <BadgeMedal key={b.id} badge={b} earned={earned.has(b.id)} />)}
    </div>
  );
}
