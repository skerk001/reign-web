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

// One row per player-season: traded seasons carry a combined ('2TM') row plus
// per-team splits — keep only the combined row so yearly top-3, timelines and
// scatter don't count the same season twice. Groups without a combined row are
// distinct same-named players — kept as-is. (Mirrors scripts/build_derived.py.)
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

const all = dedupeSeasons(['pioneer', 'legacy', 'classic', 'modern']
  .flatMap(e => JSON.parse(readFileSync(join(DATA_DIR, `seasons_${e}.json`), 'utf8'))));

const round = (v, d = 1) => Math.round(v * 10 ** d) / 10 ** d;
const pct = v => (v <= 1 ? v * 100 : v);

function eraCards(type) {
  return ERAS.map(era => {
    const d = all.filter(r => r.type === type && r.era === era && (r.min || 0) > 15);
    const best = d.reduce((a, b) => (!a || b.reign > a.reign ? b : a), null);
    const ts = d.map(r => r.tsp || 0).filter(v => v > 0);
    return {
      era, years: ERA_YEARS[era],
      best: best ? { name: best.name, reign: round(best.reign, 2), year: best.year, team: best.team, off: round(best.reign_off, 2), def: round(best.reign_def, 2) } : null,
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

function dynasties() {
  // Dynasty Tracker: each franchise's best consecutive 5-season run, scored by
  // the summed REIGN of its qualified players (RS, >15 MPG, positive REIGN
  // only — a bad twelfth man shouldn't subtract from a dynasty). Top 12 runs.
  const rs = all.filter(r => r.type === 'RS' && (r.min || 0) > 15 && r.team && !/^\dTM$/.test(r.team) && r.team !== 'TOT');
  const teamYear = new Map(); // team -> year -> {total, players:[{name,reign}]}
  for (const r of rs) {
    if (!teamYear.has(r.team)) teamYear.set(r.team, new Map());
    const yr = teamYear.get(r.team);
    if (!yr.has(r.year)) yr.set(r.year, { total: 0, players: [] });
    const e = yr.get(r.year);
    e.total += Math.max(0, r.reign);
    e.players.push({ name: r.name, reign: r.reign });
  }
  const best = new Map(); // team -> best window
  for (const [team, years] of teamYear) {
    for (const y0 of years.keys()) {
      let total = 0, ok = true;
      const tally = new Map();
      for (let y = y0; y < y0 + 5; y++) {
        const e = years.get(y);
        if (!e) { ok = false; break; }
        total += e.total;
        for (const p of e.players) tally.set(p.name, (tally.get(p.name) || 0) + Math.max(0, p.reign));
      }
      if (!ok) continue;
      if (!best.has(team) || total > best.get(team).total) {
        const top = [...tally.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3)
          .map(([name, sum]) => ({ name, reign: round(sum, 0) }));
        best.set(team, { team, ys: y0, ye: y0 + 4, total, top });
      }
    }
  }
  return [...best.values()].sort((a, b) => b.total - a.total).slice(0, 12)
    .map(w => ({ ...w, total: Math.round(w.total) }));
}

function clutchTop25() {
  // Top 25 by TOTAL clutch points (matches the chart, whose bar length is
  // tot_pts). tot_pm is reported as-is — a negative career clutch +/- is
  // real information, not something to clamp to 0.
  const cc = JSON.parse(readFileSync(join(DATA_DIR, 'career_clutch.json'), 'utf8'));
  return cc.filter(r => r.rs_gp >= 50).sort((a, b) => b.rs_tot_pts - a.rs_tot_pts).slice(0, 25)
    .map(r => ({ name: r.name, avg_ppg: round(r.rs_avg_pts), tot_pts: Math.round(r.rs_tot_pts), tot_pm: Math.round(r.rs_tot_pm), gp: r.rs_gp }));
}

const out = {
  eraCards: { RS: eraCards('RS'), PO: eraCards('PO') },
  yearlyTop3: { RS: yearlyTop3('RS'), PO: yearlyTop3('PO') },
  timeline: { RS: timeline('RS'), PO: timeline('PO') },
  peakAge: Object.fromEntries(['RS', 'PO'].map(t => [t, Object.fromEntries(['All', ...ERAS].map(e => [e, peakAge(t, e)]))])),
  scatter: { RS: scatter('RS'), PO: scatter('PO') },
  clutchTop25: clutchTop25(),
  dynasties: dynasties(),
};

const dest = join(DATA_DIR, 'viz.json');
writeFileSync(dest, JSON.stringify(out));
console.log(`Wrote viz.json — scatter RS=${out.scatter.RS.length} PO=${out.scatter.PO.length}`);
