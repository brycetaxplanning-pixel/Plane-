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
 *
 * It is the whole of a module's header, and it is deliberately short. There is
 * no bar above it: you tapped this card to get here, so the screen does not
 * need half its height to agree with you. One line — mark, number, name and
 * the week's figure — with the way back out under it rather than over it.
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
      {/* The card's sweep, carried inside, and softer than a tile's: the
          band at full strength takes the mono line above the name below the
          contrast floor. */}
      {rank !== 'base' && <span className="hero-foil" aria-hidden><i /></span>}

      {/* On the mark rather than loose in a corner: the card is one line
          tall now, and every corner of it is already spoken for. */}
      <span className="hero-mark">
        <ModuleGlyph id={id} size={22} />
        {rank === 'gold' && (
          <span className="hero-medal" title="This week's target is met">
            <span className="sr-only">Target met.</span>
            {Icons.check()}
          </span>
        )}
      </span>

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
