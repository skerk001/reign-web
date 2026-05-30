import { useMemo } from 'react';

// Consistent era colors (match ERAS / EC across the site)
const ERA_COLOR = { P: '#8789C0', L: '#D97706', C: '#2563EB', M: '#10B981' };
const ERA_NAME = { P: 'Pioneer', L: 'Legacy', C: 'Classic', M: 'Modern' };

// A unique white glyph per era, evoking that era of basketball:
//  Pioneer = peach basket · Legacy = star · Classic = basketball · Modern = 3pt arc
function glyph(k) {
  switch (k) {
    case 'P': // peach basket — the original hoop
      return `<ellipse cx="12" cy="7.6" rx="6.4" ry="1.7" fill="none" stroke="#fff" stroke-width="1.4"/>`
        + `<path d="M6 7.8 L7.4 15.8 Q12 17.4 16.6 15.8 L18 7.8" fill="none" stroke="#fff" stroke-width="1.4" stroke-linejoin="round"/>`
        + `<path d="M9.5 8 L10 16.2 M12 8.1 L12 16.7 M14.5 8 L14 16.2" stroke="#fff" stroke-width="0.95" opacity="0.85"/>`;
    case 'L': // five-point star — the golden age
      return `<path d="M12 3.6 L13.95 9.3 L20 9.45 L15.2 13 L16.95 18.8 L12 15.3 L7.05 18.8 L8.8 13 L4 9.45 L10.05 9.3 Z" fill="#fff"/>`;
    case 'C': // basketball — the on-ball / iso era
      return `<circle cx="12" cy="12" r="6.7" fill="none" stroke="#fff" stroke-width="1.4"/>`
        + `<path d="M12 5.3 V18.7 M5.3 12 H18.7" stroke="#fff" stroke-width="1.15"/>`
        + `<path d="M6.9 7.3 Q12 12 6.9 16.7 M17.1 7.3 Q12 12 17.1 16.7" fill="none" stroke="#fff" stroke-width="1.15"/>`;
    case 'M': // three-point arc + splash — the analytics / range era
      return `<path d="M4.6 16.8 Q12 5.6 19.4 16.8" fill="none" stroke="#fff" stroke-width="1.5" stroke-linecap="round"/>`
        + `<circle cx="12" cy="9.4" r="2" fill="#fff"/>`
        + `<path d="M12 11.6 L12 14.6" stroke="#fff" stroke-width="1.3" stroke-linecap="round" stroke-dasharray="0.4 2"/>`;
    default: return '';
  }
}

export function eraEmblemSVG(era, size = 20) {
  const k = String(era || '').trim()[0]?.toUpperCase();
  if (!ERA_COLOR[k]) return '';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="${size}" height="${size}">`
    + `<rect x="0.5" y="0.5" width="23" height="23" rx="6.5" fill="${ERA_COLOR[k]}"/>`
    + `<rect x="0.5" y="0.5" width="23" height="11.5" rx="6.5" fill="#fff" opacity="0.1"/>`
    + glyph(k) + `</svg>`;
}

export default function EraBadge({ era, size = 20, className = '' }) {
  const k = String(era || '').trim()[0]?.toUpperCase();
  const html = useMemo(() => eraEmblemSVG(era, size), [era, size]);
  if (!html) return null;
  return (
    <span
      className={`era-badge ${className}`}
      title={ERA_NAME[k]}
      aria-label={`${ERA_NAME[k]} era`}
      style={{ display: 'inline-flex', lineHeight: 0, verticalAlign: 'middle', marginRight: 3 }}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
