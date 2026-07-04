// Centralized heatmap palette — single source of truth for the colored cells
// used across Rankings, Players, and Compare. Ramps are DARK-NATIVE: low values
// sit quietly near the page background and high values glow, so the tables read
// as intentional on the dark theme (instead of light-mode pastels on black).
//
// Semantics kept: REIGN = brand mint (overall), OFF = gold (warm), DEF = blue
// (cool), CLUTCH = gold diverging (its own identity), negatives = muted red.

const NEG = '#3b2327'; // muted, desaturated dark red for sub-zero values

// REIGN — deep teal → mint glow
export function reignBg(v) {
  if (v == null) return 'transparent';
  if (v >= 25) return '#5DFDCB';
  if (v >= 20) return '#33e3ad';
  if (v >= 15) return '#15b487';
  if (v >= 10) return '#0f8061';
  if (v >= 5) return '#0e5141';
  if (v >= 0) return '#143029';
  return NEG;
}

// OFFENSE — warm gold/amber
export function offBg(v) {
  if (v == null) return 'transparent';
  if (v >= 18) return '#F5B942';
  if (v >= 14) return '#e0962a';
  if (v >= 10) return '#b06d14';
  if (v >= 6) return '#7a4d10';
  if (v >= 0) return '#352712';
  return NEG;
}

// DEFENSE — cool blue
export function defBg(v) {
  if (v == null) return 'transparent';
  if (v >= 8) return '#7CC6FE';
  if (v >= 5) return '#3f8fd4';
  if (v >= 3) return '#2a5f9c';
  if (v >= 0) return '#183353';
  return NEG;
}

// REL TS% (efficiency vs league) — diverging on the mint axis
export function relTsBg(v) {
  if (v == null) return 'transparent';
  if (v >= 10) return '#5DFDCB';
  if (v >= 5) return '#22cf9c';
  if (v >= 2) return '#129472';
  if (v >= 0) return '#114a3d';
  if (v >= -3) return NEG;
  return '#5a2730';
}

// CLUTCH +/- — gold diverging ("clutch = money / ice")
export function clutchBg(v) {
  if (v == null) return 'transparent';
  if (v >= 4) return '#F5B942';
  if (v >= 2.5) return '#e0962a';
  if (v >= 1) return '#b06d14';
  if (v >= 0) return '#4a3415';
  if (v >= -1) return NEG;
  return '#5a2730';
}

// CLUTCH by percentile (0–100) — gold ramp
export function clutchPctBg(pct) {
  if (pct == null) return 'transparent';
  if (pct >= 90) return '#F5B942';
  if (pct >= 80) return '#e0962a';
  if (pct >= 70) return '#b06d14';
  if (pct >= 55) return '#7a4d10';
  if (pct >= 35) return '#3a2a14';
  if (pct >= 15) return '#241f15';
  return NEG;
}

// Cells bright enough to need dark text; everything else (incl. transparent) gets light text.
// Membership is contrast-driven (WCAG AA, 4.5:1): every color here fails with white
// text but passes with near-black. Includes the pale one-off swatches used by the
// clutch Tot PTS/+- columns in Rankings (#a7f3d0/#fee2e2/#10B981), which were
// nearly unreadable with white text (1.2-2.5:1).
const DARK_TEXT = new Set([
  '#5DFDCB', '#33e3ad', '#15b487', '#22cf9c', '#129472',
  '#F5B942', '#e0962a', '#b06d14',
  '#7CC6FE', '#3f8fd4',
  '#10B981', '#a7f3d0', '#fee2e2',
]);
export function needsDark(bg) { return DARK_TEXT.has(bg); }
export function textColor(bg) { return DARK_TEXT.has(bg) ? '#08090A' : '#e8eaf2'; }
