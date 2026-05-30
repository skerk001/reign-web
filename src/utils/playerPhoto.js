// Map a player NAME to a Basketball-Reference headshot URL.
//
// The season data has no player IDs — only names — so we reconstruct B-Ref's
// player-slug convention: first 5 letters of the surname + first 2 of the given
// name + a "01" disambiguator, all lowercased and stripped of accents/punctuation.
//   LeBron James          -> jamesle01
//   Kareem Abdul-Jabbar   -> abdulka01
//   Shai Gilgeous-Alexander -> gilgesh01
//   Nikola Jokic          -> jokicni01
//
// The "01" suffix increments for name collisions on B-Ref (02, 03...). For the
// famous players who dominate the leaderboard this is virtually always "01";
// rarer collisions are corrected via OVERRIDES, and anything that still 404s
// falls back to the generated crest at the component layer.

const HEADSHOT_BASE =
  'https://www.basketball-reference.com/req/202106291/images/headshots';

// Hand-corrections for known slug collisions / irregular B-Ref ids. Keyed by the
// exact `name` string as it appears in the data. Extend as screenshots reveal
// wrong faces.
const OVERRIDES = {
  // 'Player Name': 'brefslug',
};

const SUFFIX = /\b(jr|sr|ii|iii|iv|v)\.?$/i;

function deaccent(s) {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '');
}

function alpha(s) {
  return deaccent(s).toLowerCase().replace(/[^a-z]/g, '');
}

/** Reconstruct a player's Basketball-Reference slug from their display name. */
export function brefSlug(name) {
  if (!name) return null;
  if (OVERRIDES[name]) return OVERRIDES[name];

  let n = deaccent(name).trim();
  n = n.replace(SUFFIX, '').trim(); // drop Jr./III/etc.

  const parts = n.split(/\s+/).filter(Boolean);
  if (parts.length < 2) return null;

  const first = alpha(parts[0]);
  const last = alpha(parts[parts.length - 1]);
  if (!first || !last) return null;

  return `${last.slice(0, 5)}${first.slice(0, 2)}01`;
}

/** Full headshot URL for a player name, or null if a slug can't be derived. */
export function photoURL(name) {
  const slug = brefSlug(name);
  return slug ? `${HEADSHOT_BASE}/${slug}.jpg` : null;
}
