import { useMemo } from 'react';
import { crestSVG, skylineSVG } from '../utils/playerArt';

// Heraldic identity mark. `size` is the crest width in px (height = size * 1.25).
// Pass compact for small placements (table rows) — drops crown/split.
export function PlayerCrest({ name, team, off, def, peak, size = 56, compact = false, className = '' }) {
  const html = useMemo(
    () => crestSVG({ name, team, off, def, peak, size, compact }),
    [name, team, off, def, peak, size, compact]
  );
  return (
    <span
      className={`player-crest ${className}`}
      style={{ display: 'inline-flex', lineHeight: 0, flex: 'none' }}
      aria-label={`${name} crest`}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

// Wide "career as a city skyline" banner. `seasons`: [{ year, reign, team }].
export function CareerSkyline({ name, seasons, w = 1000, h = 280, className = '' }) {
  const html = useMemo(() => skylineSVG({ name, seasons, w, h }), [name, seasons, w, h]);
  return (
    <div
      className={`career-skyline ${className}`}
      role="img"
      aria-label={`${name} career skyline`}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
