import { fromKey, todayKey, type DateKey } from './date';

export type SkinId = 'classic' | 'miami' | 'arcade' | 'shinobi' | 'deployment' | 'ringworld' | 'latenight';

export interface Skin {
  id: SkinId;
  name: string;
  blurb: string;
  /** Swatch shown in the picker: the skin's first three module colours. */
  swatch: [string, string, string];
  surface: string;
}

/** Palette/mood skins, not licensed artwork — each one is an original colour
 *  scheme, and every skin's six module colours passed the palette validator
 *  against that skin's own surface. */
export const SKINS: Skin[] = [
  // The id stays 'classic' so settings saved before the rename still resolve.
  { id: 'classic',    name: 'Holo',           blurb: 'Holo black with a violet cast. The default.',       swatch: ['#3987e5', '#d95926', '#199e70'], surface: '#15141d' },
  { id: 'miami',      name: 'Neon Miami',     blurb: 'Sunset pink and teal on deep purple.',              swatch: ['#d94382', '#1795a5', '#d4711c'], surface: '#1a1226' },
  { id: 'arcade',     name: 'Arcade Brawler', blurb: 'Cartridge-era primaries on a black cabinet.',       swatch: ['#ff5a5f', '#5b9cf0', '#f2b724'], surface: '#1c1810' },
  { id: 'shinobi',    name: 'Shinobi',        blurb: 'Ink black with a burnt-orange chakra glow.',        swatch: ['#d4630f', '#4a8fe0', '#d4404a'], surface: '#15141a' },
  { id: 'deployment', name: 'Deployment',     blurb: 'Olive drab, brass and hard corners.',               swatch: ['#a8912c', '#3987e5', '#d95926'], surface: '#1a1c14' },
  { id: 'ringworld',  name: 'Ringworld',      blurb: 'Cold cyan HUD over deep space navy.',               swatch: ['#20a5b5', '#d55181', '#c98500'], surface: '#0b1420' },
  { id: 'latenight',  name: 'Late Night Set',  blurb: 'Club dark, with a cat on the decks.',               swatch: ['#22a2bd', '#d24f92', '#c48208'], surface: '#12101d' },
];

export const skinById = (id: string): Skin => SKINS.find((s) => s.id === id) ?? SKINS[0];

/** Skins that take part in the daily rotation. Holo is excluded so the
 *  rotation always actually looks like something. */
const ROTATION: SkinId[] = ['miami', 'arcade', 'shinobi', 'deployment', 'ringworld', 'latenight'];

/** Deterministic from the date, so the skin holds for a full 24 hours and is
 *  the same whichever device you open. */
export function skinForDay(key: DateKey = todayKey()): SkinId {
  const days = Math.floor(fromKey(key).getTime() / 86_400_000);
  return ROTATION[((days % ROTATION.length) + ROTATION.length) % ROTATION.length];
}

export function resolveSkin(settings: { skin: SkinId; skinRotation: boolean }): SkinId {
  return settings.skinRotation ? skinForDay() : settings.skin;
}
