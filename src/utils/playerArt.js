// Deterministic generative art for players — pure functions returning SVG strings.
// Used by <PlayerCrest> / <CareerSkyline> in the app, and by the offline preview
// renderer. Art is seeded from the player's name so it's stable & reproducible.

// --- team palettes: { primary, accent } -------------------------------------
const TEAMS = {
  ATL: ['#E03A3E', '#C1D32F'], BOS: ['#007A33', '#BA9653'], BKN: ['#111111', '#cfcfcf'],
  NJN: ['#002A60', '#CD1041'], CHA: ['#1D1160', '#00788C'], CHH: ['#1D1160', '#00778B'],
  CHO: ['#1D1160', '#00788C'], CHI: ['#CE1141', '#cccccc'], CLE: ['#860038', '#FDBB30'],
  DAL: ['#00538C', '#B8C4CA'], DEN: ['#0E2240', '#FEC524'], DET: ['#C8102E', '#1D42BA'],
  GSW: ['#1D428A', '#FFC72C'], HOU: ['#CE1141', '#C4CED4'], IND: ['#002D62', '#FDBB30'],
  LAC: ['#C8102E', '#1D428A'], LAL: ['#552583', '#FDB927'], MEM: ['#5D76A9', '#F5B112'],
  MIA: ['#98002E', '#F9A01B'], MIL: ['#00471B', '#EEE1C6'], MIN: ['#0C2340', '#78BE20'],
  NOP: ['#0C2340', '#C8102E'], NOH: ['#0C2340', '#C8102E'], NOK: ['#0C2340', '#C8102E'],
  NYK: ['#006BB6', '#F58426'], OKC: ['#007AC1', '#EF3B24'], SEA: ['#00653A', '#FFC200'],
  ORL: ['#0077C0', '#C4CED4'], PHI: ['#006BB6', '#ED174C'], PHX: ['#1D1160', '#E56020'],
  POR: ['#E03A3E', '#cccccc'], SAC: ['#5A2D81', '#C4CED4'], SAS: ['#9aa3ad', '#111111'],
  TOR: ['#CE1141', '#cccccc'], UTA: ['#002B5C', '#F9A01B'], WAS: ['#002B5C', '#E31837'],
  WSB: ['#002B5C', '#E31837'], PHW: ['#003DA5', '#FFB81C'], SFW: ['#1D428A', '#FFC72C'],
  SYR: ['#C8102E', '#E0E0E0'], FTW: ['#C8102E', '#1D428A'], MNL: ['#552583', '#FDB927'],
  ROC: ['#7A1F2B', '#E0C36B'], BAL: ['#C8102E', '#002B5C'], KCK: ['#5A2D81', '#C4CED4'],
  SDC: ['#C8102E', '#1D428A'], BUF: ['#C8102E', '#000000'], VAN: ['#00788C', '#BC7844'],
};

const TEAL = '#5DFDCB', GOLD = '#FDB927';

function hashStr(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
export function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Stable color for any team — known palette, or derived from the code's hash.
export function teamPalette(team) {
  if (team && TEAMS[team]) return { primary: TEAMS[team][0], accent: TEAMS[team][1] };
  const h = hashStr(team || 'REIGN');
  const hue = h % 360;
  return { primary: `hsl(${hue} 55% 32%)`, accent: `hsl(${(hue + 40) % 360} 70% 55%)` };
}

export function initialsOf(name) {
  return name.split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase();
}

const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');

/* ════════════════ CREST ════════════════
 * Team-colored heraldic shield. Left/right split encodes OFF vs DEF in the
 * two team colors; crown points scale with peak REIGN. `compact` (small sizes,
 * e.g. table rows) drops the crown/split for a clean, cheap mark.
 */
export function crestSVG({ name, team, off = 0, def = 0, peak = 0, size = 120, compact = false }) {
  const { primary, accent } = teamPalette(team);
  const ini = initialsOf(name);
  const uid = (hashStr(name + team) % 100000).toString(36);
  const offFrac = Math.max(0.32, Math.min(0.82, (off + def) > 0 ? off / (off + def) : 0.6));
  const splitX = 20 + 60 * offFrac;
  const shield = 'M20 30 H80 V70 Q80 100 50 118 Q20 100 20 70 Z';

  let crown = '';
  if (!compact) {
    const pts = Math.max(3, Math.min(7, Math.round(3 + (peak / 30) * 4)));
    const lx = 26, cw = 48, base = 28, top = 12;
    let poly = `${lx},${base} `;
    for (let i = 0; i < pts; i++) {
      const px = lx + (cw * (i + 0.5)) / pts;
      const peakY = i === Math.floor(pts / 2) ? top - 4 : top;
      poly += `${px},${peakY} ${lx + (cw * (i + 1)) / pts},${base - 4} `;
    }
    poly += `${lx + cw},${base}`;
    crown = `<polygon points="${poly}" fill="${GOLD}" stroke="#b8860b" stroke-width="0.8"/>`
      + Array.from({ length: pts }, (_, i) => `<circle cx="${lx + cw * (i + 0.5) / pts}" cy="${top + 1}" r="2" fill="#fff8e1"/>`).join('');
  }

  const fill = compact
    ? `<path d="${shield}" fill="url(#p${uid})"/>`
    : `<clipPath id="c${uid}"><path d="${shield}"/></clipPath>
       <g clip-path="url(#c${uid})">
         <rect x="20" y="30" width="${splitX - 20}" height="90" fill="url(#p${uid})"/>
         <rect x="${splitX}" y="30" width="${80 - splitX}" height="90" fill="${accent}"/>
       </g>`;

  const r = compact ? 16 : 17;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 125" width="${size}" height="${size * 1.25}">
   <defs><linearGradient id="p${uid}" x1="0" y1="0" x2="0" y2="1">
     <stop offset="0%" stop-color="${primary}"/><stop offset="100%" stop-color="${primary}" stop-opacity="0.72"/>
   </linearGradient></defs>
   ${crown}
   ${fill}
   <path d="${shield}" fill="none" stroke="${accent}" stroke-width="${compact ? 2 : 2.5}"/>
   <circle cx="50" cy="72" r="${r}" fill="#0d0f13" stroke="${accent}" stroke-width="1.5"/>
   <text x="50" y="72" font-family="DejaVu Serif, Georgia, serif" font-weight="bold" font-size="${compact ? 17 : 16}" fill="#fff" text-anchor="middle" dominant-baseline="central">${esc(ini)}</text>
  </svg>`;
}

/* ════════════════ CAREER SKYLINE ════════════════
 * Each season = a tower; height ∝ REIGN; color = team. A career drawn as a
 * city at night. `seasons`: [{ year, reign, team }] sorted by year.
 */
export function skylineSVG({ name, seasons, w = 1000, h = 310 }) {
  const rnd = mulberry32(hashStr(name));
  if (!seasons || !seasons.length) return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"></svg>`;
  const topPad = 36, bottomPad = 48, baseY = h - bottomPad, avail = baseY - topPad;
  const maxR = Math.max(...seasons.map(s => s.reign), 1);
  const n = seasons.length, bw = (w - 60) / n;
  const yrFont = bw < 30 ? 8 : 9.5, valFont = bw < 34 ? 8.5 : 10;
  let bars = '', labels = '';
  seasons.forEach((s, i) => {
    const bh = 16 + (Math.max(0, s.reign) / maxR) * (avail - 16);
    const x = 30 + i * bw, y = baseY - bh, cx = x + bw / 2;
    const { primary, accent } = teamPalette(s.team);
    const isPeak = s.reign === maxR;
    let windows = '';
    const rows = Math.floor(bh / 18), cols = Math.max(1, Math.floor(bw / 11));
    for (let rr = 0; rr < rows; rr++) for (let cc = 0; cc < cols; cc++) if (rnd() > 0.52)
      windows += `<rect x="${(x + 4 + cc * 9).toFixed(1)}" y="${(y + 10 + rr * 16).toFixed(1)}" width="3.5" height="6" fill="${accent}" opacity="${(0.35 + rnd() * 0.5).toFixed(2)}"/>`;
    bars += `<g><rect x="${(x + 1.5).toFixed(1)}" y="${y.toFixed(1)}" width="${(bw - 3).toFixed(1)}" height="${bh.toFixed(1)}" fill="${primary}"/>`
      + `<rect x="${(x + 1.5).toFixed(1)}" y="${y.toFixed(1)}" width="${(bw - 3).toFixed(1)}" height="4" fill="${accent}"/>${windows}`
      + `<rect x="${(x + 1.5).toFixed(1)}" y="${baseY}" width="${(bw - 3).toFixed(1)}" height="${(bh * 0.28).toFixed(1)}" fill="${primary}" opacity="0.16"/></g>`;
    // REIGN value atop each tower
    if (isPeak) labels += `<text x="${cx.toFixed(1)}" y="${(y - 19).toFixed(1)}" font-size="11" fill="${GOLD}" text-anchor="middle">★</text>`;
    labels += `<text x="${cx.toFixed(1)}" y="${(y - 6).toFixed(1)}" font-family="DejaVu Sans, sans-serif" font-size="${valFont}" font-weight="${isPeak ? 'bold' : 'normal'}" fill="${isPeak ? GOLD : '#d2d5e2'}" text-anchor="middle">${s.reign.toFixed(1)}</text>`;
    // season label under the baseline
    labels += `<text x="${cx.toFixed(1)}" y="${(baseY + 16).toFixed(1)}" font-family="DejaVu Sans, sans-serif" font-size="${yrFont}" fill="#9498ad" text-anchor="middle">'${String(s.year + 1).slice(-2)}</text>`;
  });
  const stars = Array.from({ length: 30 }, () => `<circle cx="${(rnd() * w).toFixed(0)}" cy="${(rnd() * 22).toFixed(0)}" r="${(rnd() * 1.1).toFixed(1)}" fill="#fff" opacity="${(rnd() * 0.5).toFixed(2)}"/>`).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
   <defs><linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#160d2e"/><stop offset="70%" stop-color="#08090A"/></linearGradient></defs>
   <rect width="${w}" height="${h}" fill="url(#sky)"/>
   ${stars}${bars}
   <line x1="30" y1="${baseY}" x2="${w - 30}" y2="${baseY}" stroke="#2a2d3a" stroke-width="1"/>
   ${labels}
  </svg>`;
}
