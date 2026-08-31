import { useEffect, useRef, useState } from 'react';
import { Beat } from '../lib/beat';

/** The Late Night Set ornament: a cat behind the decks, drawn here in SVG.
 *  Original artwork and an original synthesised loop — no borrowed GIFs, no
 *  audio files, nothing that belongs to anybody else. */
export function CatDeck() {
  const beat = useRef<Beat | null>(null);
  const [playing, setPlaying] = useState(false);
  const [supported] = useState(() => Beat.supported());

  useEffect(() => () => beat.current?.dispose(), []);

  const toggle = async () => {
    if (!beat.current) beat.current = new Beat();
    if (playing) {
      beat.current.stop();
      setPlaying(false);
    } else {
      await beat.current.start();
      setPlaying(true);
    }
  };

  return (
    <div className={`catdeck${playing ? ' is-playing' : ''}`}>
      <svg className="catdeck-art" viewBox="0 0 260 90" role="img" aria-label="A cat behind two turntables">
        {/* decks */}
        <g className="deck deck-l">
          <circle cx="46" cy="62" r="24" className="platter" />
          <circle cx="46" cy="62" r="9" className="label" />
          <circle cx="46" cy="62" r="2" className="spindle" />
          <path d="M46 41 A21 21 0 0 1 64 52" className="groove" />
        </g>
        <g className="deck deck-r">
          <circle cx="214" cy="62" r="24" className="platter" />
          <circle cx="214" cy="62" r="9" className="label" />
          <circle cx="214" cy="62" r="2" className="spindle" />
          <path d="M214 41 A21 21 0 0 1 232 52" className="groove" />
        </g>

        {/* mixer */}
        <rect x="98" y="52" width="64" height="30" rx="5" className="mixer" />
        <g className="faders">
          <rect x="106" y="58" width="4" height="18" rx="2" className="fader-track" />
          <rect x="118" y="58" width="4" height="18" rx="2" className="fader-track" />
          <rect x="130" y="58" width="4" height="18" rx="2" className="fader-track" />
          <rect x="142" y="58" width="4" height="18" rx="2" className="fader-track" />
          <rect x="104" y="64" width="8" height="4" rx="2" className="fader-cap cap-1" />
          <rect x="116" y="68" width="8" height="4" rx="2" className="fader-cap cap-2" />
          <rect x="128" y="61" width="8" height="4" rx="2" className="fader-cap cap-3" />
          <rect x="140" y="66" width="8" height="4" rx="2" className="fader-cap cap-4" />
        </g>

        {/* the cat */}
        <g className="cat">
          <path d="M113 44 L115 21 L129 33 Z" className="ear" />
          <path d="M147 44 L145 21 L131 33 Z" className="ear" />
          <ellipse cx="130" cy="46" rx="22" ry="17" className="head" />
          <circle cx="122" cy="44" r="3.1" className="eye" />
          <circle cx="138" cy="44" r="3.1" className="eye" />
          <path d="M127 52 L130 55 L133 52 Z" className="nose" />
          <path d="M124 55 q6 5 12 0" className="mouth" />
          <g className="whiskers">
            <path d="M108 48 L118 50" /><path d="M108 54 L118 54" />
            <path d="M152 48 L142 50" /><path d="M152 54 L142 54" />
          </g>
        </g>

        {/* paw on the left platter — an arm out of the mixer and a pad with toes */}
        <g className="paw">
          <path d="M104 62 L74 66" className="arm" />
          <ellipse cx="64" cy="67" rx="10" ry="7" className="pad" />
          <circle cx="58" cy="62" r="2.1" className="toe" />
          <circle cx="63" cy="60" r="2.1" className="toe" />
          <circle cx="68" cy="61" r="2.1" className="toe" />
        </g>

        {/* equalizer */}
        <g className="eq">
          {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
            <rect key={i} x={172 + i * 5} y="20" width="3" height="16" rx="1.5" style={{ animationDelay: `${i * 90}ms` }} />
          ))}
        </g>
        <g className="eq eq-left">
          {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
            <rect key={i} x={52 + i * 5} y="20" width="3" height="16" rx="1.5" style={{ animationDelay: `${i * 70 + 40}ms` }} />
          ))}
        </g>
      </svg>

      <div className="catdeck-bar">
        <span className="t-xs t-muted grow">Late Night Set</span>
        {supported ? (
          <button className="btn btn-sm" onClick={() => void toggle()} aria-pressed={playing}>
            {playing ? '⏸ Stop the beat' : '▶ Drop the beat'}
          </button>
        ) : (
          <span className="t-xs t-muted">No audio in this browser</span>
        )}
      </div>
    </div>
  );
}
