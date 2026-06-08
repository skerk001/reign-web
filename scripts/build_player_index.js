// Builds public/data/player_index.json — the lightweight search/autocomplete
// index for the Players and Compare pages (loaded by src/hooks/useData.js).
//
// It is a straight projection of careers.json (the source of truth): one entry
// per player with name, up to the first three teams, eras, season span, and
// peak REIGN (careers.rp). Keeping it derived means a nightly refresh that adds
// a new season — and any new rookies — keeps player search current instead of
// leaving fresh players unsearchable.
//
// Re-run after regenerating careers:  node scripts/build_player_index.js
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const DATA_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'data');
const careers = JSON.parse(readFileSync(join(DATA_DIR, 'careers.json'), 'utf8'));

// careers.json is already sorted by peak REIGN (rp) descending; preserve order.
const index = careers.map(c => ({
  name: c.name,
  teams: c.teams.slice(0, 3),
  eras: c.eras,
  ys: c.ys,
  ye: c.ye,
  peak: c.rp,
}));

const dest = join(DATA_DIR, 'player_index.json');
writeFileSync(dest, JSON.stringify(index));
console.log(`Wrote ${index.length} players to ${dest}`);
