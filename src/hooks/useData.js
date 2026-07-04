import { useState, useEffect } from 'react';

const cache = {};

export function useJSON(path) {
  const [data, setData] = useState(cache[path] || null);
  const [loading, setLoading] = useState(!!path && !cache[path]);
  const [error, setError] = useState(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!path) { setData(null); setLoading(false); setError(null); return; }
    if (cache[path]) { setData(cache[path]); setLoading(false); setError(null); return; }
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch(path)
      .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
      .then(d => { cache[path] = d; if (!cancelled) { setData(d); setLoading(false); } })
      .catch(e => {
        console.error('Failed to load', path, e);
        if (!cancelled) { setError(e); setLoading(false); }
      });
    return () => { cancelled = true; };
  }, [path, attempt]);

  // retry() re-runs the fetch after a failure (e.g. flaky connection).
  return { data, loading, error, retry: () => setAttempt(a => a + 1) };
}

/**
 * Load all seasons by fetching 4 era files in parallel.
 * Much faster than one 18MB file — each era file is 1-6MB (0.2-1.2MB gzipped).
 */
const ERA_FILES = [
  '/data/seasons_pioneer.json',
  '/data/seasons_legacy.json',
  '/data/seasons_classic.json',
  '/data/seasons_modern.json',
];

let allSeasonsCache = null;
let allSeasonsPromise = null;

// One row per player-season: mid-season-traded players carry BOTH a combined
// ('2TM'/'3TM') row and per-team split rows in the historical era files, which
// double-counts those seasons in career averages, trajectories, and season
// logs. Keep only the combined row. Groups without a combined row are distinct
// same-named players (e.g. the 1970s George Johnsons) — kept as-is.
// (Mirrors dedupe_seasons in scripts/build_derived.py.)
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

function fetchAllSeasons() {
  if (allSeasonsCache) return Promise.resolve(allSeasonsCache);
  if (allSeasonsPromise) return allSeasonsPromise;
  allSeasonsPromise = Promise.all(ERA_FILES.map(f => {
    if (cache[f]) return Promise.resolve(cache[f]);
    return fetch(f).then(r => r.json()).then(d => { cache[f] = d; return d; });
  })).then(arrays => {
    const merged = dedupeSeasons(arrays.flat());
    allSeasonsCache = merged;
    cache['/data/seasons.json'] = merged; // Also populate legacy cache key
    return merged;
  });
  return allSeasonsPromise;
}

// `enabled` lets callers defer the (large) era-file fetch until it's needed —
// e.g. Rankings only loads full seasons when the Clutch single-season view is
// active, since the Standard view uses the slim /data/rankings.json index.
export function useAllSeasons(enabled = true) {
  const [data, setData] = useState(allSeasonsCache);
  const [loading, setLoading] = useState(enabled && !allSeasonsCache);
  const [error, setError] = useState(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!enabled) return;
    if (allSeasonsCache) { setData(allSeasonsCache); setLoading(false); return; }
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchAllSeasons()
      .then(d => { if (!cancelled) { setData(d); setLoading(false); } })
      .catch(e => {
        console.error('Failed to load season data', e);
        allSeasonsPromise = null; // allow a retry to refetch
        if (!cancelled) { setError(e); setLoading(false); }
      });
    return () => { cancelled = true; };
  }, [enabled, attempt]);

  return { data, loading, error, retry: () => setAttempt(a => a + 1) };
}

export function useSeasons() { return useAllSeasons(); }
export function useStretches(type, n) {
  return useJSON(`/data/stretches_${type}${n}.json`);
}
