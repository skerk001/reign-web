// Builds public/data/viz.json — a small, precomputed payload for the
// Visualizations page. Instead of shipping 3.3 MB of raw season records and
// aggregating in the browser, we precompute every chart's data here:
//   - era summary cards, yearly top-3, league-evolution timeline (per RS/PO)
//   - peak-age histograms (per RS/PO x era filter)
//   - OFF-vs-DEF scatter points (reign >= 10 subset)
//   - clutch career top-25 (from career_clutch.json)
//
// Re-run after regenerating season data:  node scripts/build_viz.js
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const DATA_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'data');
const ERAS = ['Pioneer', 'Legacy', 'Classic', 'Modern'];
const ERA_YEARS = { Pioneer: [1946, 1962], Legacy: [1963, 1995], Classic: [1996, 2012], Modern: [2013, 2026] };

const all = ['pioneer', 'legacy', 'classic', 'modern']
  .flatMap(e => JSON.parse(readFileSync(join(DATA_DIR, `seasons_${e}.json`), 'utf8')));

const round = (v, d = 1) => Math.round(v * 10 ** d) / 10 ** d;
const pct = v => (v <= 1 ? v * 100 : v);

function eraCards(type) {
  return ERAS.map(era => {
    const d = all.filter(r => r.type === type && r.era === era && (r.min || 0) > 15);
    const best = d.reduce((a, b) => (!a || b.reign > a.reign ? b : a), null);
    const ts = d.map(r => r.tsp || 0).filter(v => v > 0);
    return {
      era, years: ERA_YEARS[era],
      best: best ? { name: best.name, reign: round(best.reign, 2), year: best.year } : null,
      avgTS: round(ts.length ? pct(ts.reduce((a, b) => a + b, 0) / ts.length) : 0),
      players: new Set(d.map(r => r.name)).size,
      seasons: d.length,
    };
  });
}

function yearlyTop3(type) {
  const d = all.filter(r => r.type === type);
  return [...new Set(d.map(r => r.year))].sort((a, b) => a - b).map(year => {
    const top = d.filter(r => r.year === year).sort((a, b) => b.reign - a.reign).slice(0, 3);
    return { year, top: top.map(t => ({ name: t.name, reign: round(t.reign, 2), era: t.era })) };
  });
}

function timeline(type) {
  const d = all.filter(r => r.type === type && (r.pts || 0) > 0);
  return [...new Set(d.map(r => r.year))].sort((a, b) => a - b).map(year => {
    const s = d.filter(r => r.year === year);
    const ts = s.map(r => r.tsp || 0).filter(v => v > 0);
    return {
      year,
      avgTS: round(ts.length ? pct(ts.reduce((a, b) => a + b, 0) / ts.length) : 0),
      avgPPG: round(s.reduce((a, r) => a + (r.pts || 0), 0) / s.length),
    };
  });
}

function peakAge(type, era) {
  const d = all.filter(r => r.type === type && (r.min || 0) > 15 && (era === 'All' || r.era === era));
  const players = {};
  for (const r of d) { if (!r.age) continue; if (!players[r.name] || r.reign > players[r.name].reign) players[r.name] = Math.round(r.age); }
  const counts = {};
  for (const a of Object.values(players)) if (a >= 19 && a <= 39) counts[a] = (counts[a] || 0) + 1;
  return Object.entries(counts).map(([age, count]) => ({ age: +age, count })).sort((a, b) => a.age - b.age);
}

function scatter(type) {
  return all.filter(r => r.type === type && (r.min || 0) > 15 && r.reign >= 10)
    .map(r => ({ off: round(r.reign_off, 2), def: round(r.reign_def, 2), reign: round(r.reign, 2), name: r.name, year: r.year, era: r.era }));
}

function clutchTop25() {
  const cc = JSON.parse(readFileSync(join(DATA_DIR, 'career_clutch.json'), 'utf8'));
  return cc.filter(r => r.rs_gp >= 50).sort((a, b) => b.rs_avg_pts - a.rs_avg_pts).slice(0, 25)
    .map(r => ({ name: r.name, avg_ppg: round(r.rs_avg_pts), tot_pts: Math.round(r.rs_tot_pts), tot_pm: Math.max(Math.round(r.rs_tot_pm), 0), gp: r.rs_gp }));
}

const out = {
  eraCards: { RS: eraCards('RS'), PO: eraCards('PO') },
  yearlyTop3: { RS: yearlyTop3('RS'), PO: yearlyTop3('PO') },
  timeline: { RS: timeline('RS'), PO: timeline('PO') },
  peakAge: Object.fromEntries(['RS', 'PO'].map(t => [t, Object.fromEntries(['All', ...ERAS].map(e => [e, peakAge(t, e)]))])),
  scatter: { RS: scatter('RS'), PO: scatter('PO') },
  clutchTop25: clutchTop25(),
};

const dest = join(DATA_DIR, 'viz.json');
writeFileSync(dest, JSON.stringify(out));
console.log(`Wrote viz.json — scatter RS=${out.scatter.RS.length} PO=${out.scatter.PO.length}`);
