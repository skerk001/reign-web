export function formatReign(v) {
  if (v == null) return '—';
  const sign = v >= 0 ? '+' : '';
  return `${sign}${v.toFixed(1)}`;
}

export function formatStat(v, decimals = 1) {
  if (v == null) return '—';
  return Number(v).toFixed(decimals);
}

export function formatPct(v) {
  if (v == null) return '—';
  if (v > 1) return v.toFixed(1) + '%';
  return (v * 100).toFixed(1) + '%';
}

export function seasonLabel(year) {
  return `${year}-${String(year + 1).slice(-2)}`;
}

export const SORT_METHODS = [
  { key: 'rp', label: 'Peak RS', desc: 'Best single regular season REIGN score' },
  { key: 'pp', label: 'Peak Playoffs', desc: 'Best single playoff REIGN score' },
  { key: 'r3', label: 'Avg Best 3', desc: 'Average of 3 best regular seasons' },
  { key: 'r5', label: 'Avg Best 5', desc: 'Average of 5 best regular seasons' },
  { key: 'rc', label: 'Career Total', desc: 'Sum of all REIGN scores (rewards longevity)' },
];

export const ERA_RANGES = {
  Pioneer: [1946, 1962],
  Legacy: [1963, 1995],
  Classic: [1996, 2012],
  Modern: [2013, 2026],
};
