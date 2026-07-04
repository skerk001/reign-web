// Builds public/data/rankings.json — a slim index for the Standard leaderboard.
//
// The Standard leaderboard renders only ~15 of the 60 fields in each season
// record. Shipping the full era files to the landing page means downloading
// ~3.3 MB gzipped of mostly-unused clutch_*/advanced fields. This index keeps
// only the displayed columns (~1 MB gzipped, ~69% smaller). The full era files
// are still loaded on demand for the Clutch toggle, Players, and Compare.
//
// Re-run after regenerating season data:  node scripts/build_rankings_index.js
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const DATA_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'data');
const ERAS = ['pioneer', 'legacy', 'classic', 'modern'];

// Fields the Standard leaderboard filters, sorts, or displays.
const KEEP = [
  'name', 'team', 'year', 'type', 'era',
  'reign', 'reign_off', 'reign_def',
  'pts', 'reb', 'ast', 'stl', 'blk',
  'fgp', 'fg3p', 'tsp', 'min',
];

// Mid-season-traded players carry BOTH a combined ('2TM') row and per-team
// split rows in the historical era files. The leaderboard must list one entry
// per player-season, so keep only the combined row when one exists. Groups
// without a combined row are distinct same-named players — kept as-is.
// (Mirrors dedupe_seasons in scripts/build_derived.py and useData.js.)
function dedupeSeasons(rows) {
  const isCombined = r => /^\dTM$/.test(r.team || '') || r.team === 'TOT';
  const groups = new Map();
  for (const r of rows) {
    const k = `${r.name}|${r.year}|${r.type}`;
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(r);
  }
  const out = [];
  for (const g of groups.values()) {
    const combined = g.filter(isCombined);
    if (combined.length && g.length > 1) out.push(combined.reduce((a, b) => ((b.gp || 0) > (a.gp || 0) ? b : a)));
    else out.push(...g);
  }
  return out;
}

const all = [];
for (const era of ERAS) {
  all.push(...JSON.parse(readFileSync(join(DATA_DIR, `seasons_${era}.json`), 'utf8')));
}
const out = [];
for (const r of dedupeSeasons(all)) {
  const slim = {};
  for (const k of KEEP) if (r[k] !== undefined) slim[k] = r[k];
  out.push(slim);
}

const dest = join(DATA_DIR, 'rankings.json');
writeFileSync(dest, JSON.stringify(out));
console.log(`Wrote ${out.length} records to ${dest}`);
