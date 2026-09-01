import { MODULES, type ModuleId } from '../../lib/schema';
import { rankOf } from '../../lib/gamification';
import { moduleSummaries } from '../../state/selectors';
import { useApp } from '../../state/context';
import { Icons, ModuleGlyph } from './Icons';

/**
 * The card you just tapped, opened out.
 *
 * A module screen used to open on a plain title and a plain white panel, which
 * threw away every bit of identity the launcher had just established. This is
 * the same material — the same stock, the same mark, the same number, the same
 * meter reading the same weekly progress — so tapping a card feels like opening
 * it rather than leaving for somewhere else.
 *
 * What it deliberately does not carry is the foil. The sweep is what a card
 * earns; spending it on every screen inside the app would make it wallpaper.
 * The rank comes through as the rule under the heading instead.
 */
export function ModuleHero({ id }: { id: ModuleId }) {
  const { state } = useApp();
  const module = MODULES.find((m) => m.id === id);
  if (!module) return null;

  const summary = moduleSummaries(state)[id];
  const pct = Math.max(0, Math.min(1, summary.progress));
  const rank = rankOf(pct);

  return (
    <section className={`hero hero-${rank}${id === 'notes' ? ' hero-paper' : ''}`}>
      {/* The card's sweep, carried inside. It is softer here than on a tile:
          a hero is a much bigger surface, and the tile's band at full strength
          would take the mono line above the name below the contrast floor. */}
      {rank !== 'base' && <span className="hero-foil" aria-hidden><i /></span>}

      <span className="hero-mark"><ModuleGlyph id={id} size={34} /></span>

      {rank === 'gold' && (
        <span className="hero-medal" title="This week's target is met">
          <span className="sr-only">Target met.</span>
          {Icons.check()}
        </span>
      )}

      <span className="hero-lines">
        <span className="hero-num">Module {String(module.num).padStart(2, '0')}</span>
        <h1 className="hero-name">{module.name}</h1>
        <p className="hero-blurb">{module.blurb}</p>
      </span>

      <span className="hero-stat">
        <b>{summary.headline}</b>
        <span className="hero-cap">{summary.caption}</span>
      </span>

      <span className="hero-meter" aria-hidden>
        <i style={{ width: `${pct * 100}%` }} />
      </span>
    </section>
  );
}
