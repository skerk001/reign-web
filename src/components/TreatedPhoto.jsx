// A player photo rendered as a high-contrast duotone "photocopied" artifact —
// the signature treatment that unifies 1950s black-and-white and 2025 color
// shots into one archival look. Sourced from Basketball-Reference (CORS-open),
// treated via an SVG/CSS filter (no canvas, so cross-origin is never an issue),
// and gracefully falling back to the generated crest when a photo is missing.

import { useState } from 'react';
import { photoURL } from '../utils/playerPhoto';
import { PlayerCrest } from './PlayerArt';
import './TreatedPhoto.css';

/**
 * Hidden SVG holding the duotone filter. Render ONCE per page (the hero does).
 * The filter: desaturate to luminance -> steepen contrast -> remap black/white
 * onto ink/cream so photos print as two-color newsprint rather than gray.
 */
export function TreatmentDefs() {
  return (
    <svg width="0" height="0" aria-hidden="true" style={{ position: 'absolute' }}>
      <filter id="reign-ink" colorInterpolationFilters="sRGB">
        <feColorMatrix
          type="matrix"
          values="0.33 0.34 0.33 0 0
                  0.33 0.34 0.33 0 0
                  0.33 0.34 0.33 0 0
                  0    0    0    1 0"
        />
        <feComponentTransfer>
          <feFuncR type="gamma" amplitude="1.3" exponent="1.5" offset="-0.1" />
          <feFuncG type="gamma" amplitude="1.3" exponent="1.5" offset="-0.1" />
          <feFuncB type="gamma" amplitude="1.3" exponent="1.5" offset="-0.1" />
        </feComponentTransfer>
        <feComponentTransfer>
          {/* shadows -> warm ink (#211b12), highlights -> paper cream (#f3ead7) */}
          <feFuncR type="table" tableValues="0.13 0.95" />
          <feFuncG type="table" tableValues="0.106 0.917" />
          <feFuncB type="table" tableValues="0.07 0.843" />
        </feComponentTransfer>
      </filter>
    </svg>
  );
}

/**
 * @param {string} name   player name (drives both photo lookup and crest seed)
 * @param {string} team   team code for the crest fallback
 * @param {number} size   pixel size of the square
 * @param {number} peak   peak REIGN (crest crown detail)
 * @param {string} className extra classes
 */
export default function TreatedPhoto({ name, team, size = 56, peak = 0, className = '' }) {
  const [failed, setFailed] = useState(false);
  const url = photoURL(name);

  if (!url || failed) {
    return (
      <span
        className={`tphoto tphoto--crest ${className}`}
        style={{ width: size, height: size }}
      >
        <PlayerCrest name={name} team={team} peak={peak} size={size} compact />
      </span>
    );
  }

  return (
    <span className={`tphoto ${className}`} style={{ width: size, height: size }}>
      <img
        src={url}
        alt={name}
        width={size}
        height={size}
        loading="lazy"
        decoding="async"
        onError={() => setFailed(true)}
      />
    </span>
  );
}
