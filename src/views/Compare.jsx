import React, { useState, useEffect, useMemo, useRef } from 'react';
import { formatReign, seasonLabel } from '../utils/format';
import { fuzzySearch } from '../utils/fuzzySearch';
import { useJSON, useAllSeasons } from '../hooks/useData';
import { PlayerCrest } from '../components/PlayerArt';
import { PercentileBars } from '../components/PlayerCharts';
import { reignBg, offBg, defBg, needsDark } from '../utils/heatmap';
import Loading, { LoadError } from '../components/Loading';
import './Compare.css';

/* ═══ HELPERS ═══ */
function fS(v) { return v == null ? '—' : Number(v).toFixed(1); }
function fP(v) { if (v == null) return '—'; return v <= 1 ? (v * 100).toFixed(1) : Number(v).toFixed(1); }

const PLAYER_COLORS = ['#10B981', '#D97706', '#3b82f6'];
const PLAYER_COLORS_LIGHT = ['#5DFDCB', '#F59E0B', '#7CC6FE'];
const PLAYER_COLORS_DARK = ['#065f46', '#92400e', '#1e40af'];

const POPULAR_COMPARISONS = [
  ['Michael Jordan', 'LeBron James'],
  ['Stephen Curry', 'Magic Johnson'],
  ['Nikola Jokić', 'Hakeem Olajuwon'],
  ['Kevin Durant', 'Larry Bird'],
  ['Kobe Bryant', 'Dwyane Wade'],
  ['Shai Gilgeous-Alexander', 'Michael Jordan'],
  ['Giannis Antetokounmpo', 'Tim Duncan'],
  ['Wilt Chamberlain', 'Shaquille O\'Neal'],
  ['Luka Dončić', 'LeBron James'],
];

/* ═══ HEATMAP COLORS (from existing pages — REIGN green / OFF amber / DEF blue) ═══ */

/* ═══ PLAYER SEARCH SLOT ═══ */
function PlayerSlot({ index, selectedName, allNames, allPlayerPeaks, onSelect, onClear }) {
  const [search, setSearch] = useState('');
  const [focused, setFocused] = useState(false);
  const inputRef = useRef(null);

  const results = useMemo(() => {
    if (!search.trim() || !allNames.length) return [];
    return fuzzySearch(search, allNames, 12);
  }, [search, allNames]);

  return (
    <div className="cmp-slot">
      <div className="cmp-slot-label">Player {index + 1}</div>
      <div className="cmp-search-wrap">
        <svg className="cmp-search-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.35-4.35"/></svg>
        <input
          ref={inputRef}
          className={`cmp-search${selectedName ? ' has-player' : ''}`}
          type="text"
          placeholder={selectedName || 'Search player...'}
          value={search}
          onChange={e => setSearch(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setTimeout(() => setFocused(false), 200)}
        />
        {selectedName && (
          <button className="cmp-clear-btn" onClick={() => { onClear(); setSearch(''); }}>×</button>
        )}
        {focused && results.length > 0 && (
          <div className="cmp-results">
            {results.map(name => {
              const peak = allPlayerPeaks?.[name];
              return (
                <button key={name} className="cmp-result" onClick={() => { onSelect(name); setSearch(''); }}>
                  <span>{name}</span>
                  <span className="cmp-result-meta">
                    {peak != null ? `Peak ${formatReign(peak)}` : ''}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

/* ═══ STAT CELL with heatmap coloring ═══ */
function StatCell({ v, best, stat }) {
  const isWinner = v != null && v === best;
  const isLoser = v != null && !isWinner;
  const heatFn = stat.heatFn;

  if (heatFn && v != null) {
    const bg = heatFn(v);
    const color = needsDark(bg) ? '#08090A' : '#fff';
    return (
      <div className={`cmp-stat-val heat${isWinner ? ' winner' : ''}`}
        style={{ background: bg, color, borderBottom: isWinner ? '3px solid ' + bg : undefined }}>
        {stat.fmt(v)}
      </div>
    );
  }

  return (
    <div className={`cmp-stat-val ${isWinner ? 'winner' : isLoser ? 'loser' : ''}`}
      style={isWinner ? { background: 'rgba(93,253,203,0.1)' } : undefined}>
      {stat.fmt(v)}
    </div>
  );
}

/* ═══ STAT TABLE (Hero Section) ═══ */
function StatTable({ players, seasons, allPlayerRanks, stretches3, stretches5, seasonType, awards, useOppAdj }) {
  const playerData = useMemo(() => {
    return players.map(name => {
      const playerSeasons = seasons?.filter(r => r.name === name && r.type === seasonType) || [];
      const allRS = seasons?.filter(r => r.name === name && r.type === 'RS').sort((a, b) => a.year - b.year) || [];
      
      // Use adjusted REIGN for playoffs when enabled
      const getReign = (s) => (useOppAdj && seasonType === 'PO' && s.reign_adj != null) ? s.reign_adj : s.reign;

      const peak = playerSeasons.length ? playerSeasons.reduce((a, b) => getReign(a) > getReign(b) ? a : b) : null;
      const avgReign = playerSeasons.length ? playerSeasons.reduce((s, r) => s + getReign(r), 0) / playerSeasons.length : null;
      const avgPts = playerSeasons.length ? playerSeasons.reduce((s, r) => s + (r.pts || 0), 0) / playerSeasons.length : null;
      const avgReb = playerSeasons.length ? playerSeasons.reduce((s, r) => s + (r.reb || 0), 0) / playerSeasons.length : null;
      const avgAst = playerSeasons.length ? playerSeasons.reduce((s, r) => s + (r.ast || 0), 0) / playerSeasons.length : null;
      const avgStl = playerSeasons.length ? playerSeasons.reduce((s, r) => s + (r.stl || 0), 0) / playerSeasons.length : null;
      const avgBlk = playerSeasons.length ? playerSeasons.reduce((s, r) => s + (r.blk || 0), 0) / playerSeasons.length : null;
      const avgTs = playerSeasons.length ? playerSeasons.reduce((s, r) => s + (r.tsp || 0), 0) / playerSeasons.length : null;
      const avgFgp = playerSeasons.length ? playerSeasons.reduce((s, r) => s + (r.fgp || 0), 0) / playerSeasons.length : null;
      const avgFg3p = playerSeasons.filter(r => r.fg3p > 0).length
        ? playerSeasons.filter(r => r.fg3p > 0).reduce((s, r) => s + r.fg3p, 0) / playerSeasons.filter(r => r.fg3p > 0).length
        : null;

      const teams = [...new Set(allRS.map(r => r.team))].slice(0, 3).join(' · ');
      const years = allRS.length ? `${allRS[0].year}–${String(allRS[allRS.length - 1].year + 1).slice(-2)}` : '';
      const playerAwards = awards?.find(a => a.name === name) || null;

      return {
        name, peak, seasons: playerSeasons,
        n: playerSeasons.length,
        avgReign, avgPts, avgReb, avgAst, avgStl, avgBlk, avgTs, avgFgp, avgFg3p,
        peakOff: peak?.reign_off, peakDef: peak?.reign_def,
        teams, years,
        rank: allPlayerRanks?.[name] ?? null,
        awards: playerAwards,
      };
    });
  }, [players, seasons, allPlayerRanks, seasonType, awards]);

  const n = playerData.length;

  const statGroups = [
    {
      label: 'REIGN',
      stats: [
        { label: 'Peak REIGN', key: 'peakReign', get: d => d.peak ? (useOppAdj && seasonType === 'PO' && d.peak.reign_adj != null ? d.peak.reign_adj : d.peak.reign) : null, fmt: formatReign, higher: true, heatFn: reignBg },
        { label: 'Peak OFF', key: 'peakOff', get: d => d.peak ? (useOppAdj && seasonType === 'PO' && d.peak.reign_off_adj != null ? d.peak.reign_off_adj : d.peak.reign_off) : null, fmt: formatReign, higher: true, heatFn: offBg },
        { label: 'Peak DEF', key: 'peakDef', get: d => d.peak ? (useOppAdj && seasonType === 'PO' && d.peak.reign_def_adj != null ? d.peak.reign_def_adj : d.peak.reign_def) : null, fmt: formatReign, higher: true, heatFn: defBg },
        { label: 'Career Avg', key: 'avgReign', get: d => d.avgReign, fmt: formatReign, higher: true, heatFn: reignBg },
        { label: 'Best 3yr Avg', key: 'r3', get: d => {
          const s = stretches3?.find(r => r.name === d.name);
          return s?.avg_reign ?? null;
        }, fmt: formatReign, higher: true, heatFn: reignBg },
        { label: 'Best 5yr Avg', key: 'r5', get: d => {
          const s = stretches5?.find(r => r.name === d.name);
          return s?.avg_reign ?? null;
        }, fmt: formatReign, higher: true, heatFn: reignBg },
        { label: 'Career Total', key: 'rc', get: d => {
          if (!d.seasons.length) return null;
          return d.seasons.reduce((s, r) => {
            const v = (useOppAdj && seasonType === 'PO' && r.reign_adj != null) ? r.reign_adj : r.reign;
            return s + v;
          }, 0);
        }, fmt: v => v == null ? '—' : v.toFixed(0), higher: true },
      ],
    },
    {
      label: 'Box Score Averages',
      stats: [
        { label: 'PPG', key: 'avgPts', get: d => d.avgPts, fmt: fS, higher: true },
        { label: 'RPG', key: 'avgReb', get: d => d.avgReb, fmt: fS, higher: true },
        { label: 'APG', key: 'avgAst', get: d => d.avgAst, fmt: fS, higher: true },
        { label: 'SPG', key: 'avgStl', get: d => d.avgStl, fmt: fS, higher: true },
        { label: 'BPG', key: 'avgBlk', get: d => d.avgBlk, fmt: fS, higher: true },
      ],
    },
    {
      label: 'Efficiency',
      stats: [
        { label: 'TS%', key: 'avgTs', get: d => d.avgTs, fmt: fP, higher: true },
        { label: 'FG%', key: 'avgFgp', get: d => d.avgFgp, fmt: fP, higher: true },
        { label: '3P%', key: 'avgFg3p', get: d => d.avgFg3p, fmt: fP, higher: true },
      ],
    },
    {
      label: 'Longevity',
      stats: [
        { label: 'Seasons', key: 'n', get: d => d.n, fmt: v => v ?? '—', higher: true },
      ],
    },
    {
      label: 'Career Totals',
      stats: [
        { label: 'Points', key: 'carPts', get: d => d.seasons.length ? Math.round(d.seasons.reduce((s, r) => s + (r.pts || 0) * (r.gp || 0), 0)) : null, fmt: v => v == null ? '—' : Number(v).toLocaleString(), higher: true },
        { label: 'Rebounds', key: 'carReb', get: d => d.seasons.length ? Math.round(d.seasons.reduce((s, r) => s + (r.reb || 0) * (r.gp || 0), 0)) : null, fmt: v => v == null ? '—' : Number(v).toLocaleString(), higher: true },
        { label: 'Assists', key: 'carAst', get: d => d.seasons.length ? Math.round(d.seasons.reduce((s, r) => s + (r.ast || 0) * (r.gp || 0), 0)) : null, fmt: v => v == null ? '—' : Number(v).toLocaleString(), higher: true },
        { label: 'Steals', key: 'carStl', get: d => d.seasons.length ? Math.round(d.seasons.reduce((s, r) => s + (r.stl || 0) * (r.gp || 0), 0)) : null, fmt: v => v == null ? '—' : Number(v).toLocaleString(), higher: true },
        { label: 'Blocks', key: 'carBlk', get: d => d.seasons.length ? Math.round(d.seasons.reduce((s, r) => s + (r.blk || 0) * (r.gp || 0), 0)) : null, fmt: v => v == null ? '—' : Number(v).toLocaleString(), higher: true },
        { label: 'Games', key: 'carGP', get: d => d.seasons.length ? Math.round(d.seasons.reduce((s, r) => s + (r.gp || 0), 0)) : null, fmt: v => v == null ? '—' : Number(v).toLocaleString(), higher: true },
      ],
    },
    {
      label: 'Awards',
      stats: [
        { label: 'MVP', key: 'mvp', get: d => d.awards?.mvp || 0, fmt: v => v === 0 ? '—' : `${v}×`, higher: true },
        { label: 'Finals MVP', key: 'fmvp', get: d => d.awards?.fmvp || 0, fmt: v => v === 0 ? '—' : `${v}×`, higher: true },
        { label: 'DPOY', key: 'dpoy', get: d => d.awards?.dpoy || 0, fmt: v => v === 0 ? '—' : `${v}×`, higher: true },
        { label: 'All-NBA', key: 'allnba', get: d => d.awards?.all_nba_total || 0, fmt: v => v === 0 ? '—' : `${v}×`, higher: true },
        { label: 'All-Def', key: 'alldef', get: d => d.awards?.all_def_total || 0, fmt: v => v === 0 ? '—' : `${v}×`, higher: true },
        { label: 'All-Star', key: 'allstar', get: d => d.awards?.all_star || 0, fmt: v => v === 0 ? '—' : `${v}×`, higher: true },
        { label: 'MVP Share', key: 'mvpshare', get: d => d.awards?.mvp_share_total || 0, fmt: v => v === 0 ? '—' : v.toFixed(2), higher: true },
        { label: 'Peak Share', key: 'mvppeak', get: d => d.awards?.mvp_share_peak || 0, fmt: v => v === 0 ? '—' : v.toFixed(3), higher: true },
      ],
    },
  ];

  // Compute win tally
  const tally = useMemo(() => {
    const scores = playerData.map(() => 0);
    statGroups.forEach(group => {
      group.stats.forEach(stat => {
        const vals = playerData.map(d => stat.get(d));
        if (vals.every(v => v == null)) return;
        const validVals = vals.filter(v => v != null);
        if (!validVals.length) return;
        const best = stat.higher ? Math.max(...validVals) : Math.min(...validVals);
        vals.forEach((v, i) => { if (v === best && v != null) scores[i]++; });
      });
    });
    return scores;
  }, [playerData, statGroups]);

  const crestData = useMemo(() => playerData.map(d => {
    const ps = seasons?.filter(r => r.name === d.name && r.type === seasonType) || [];
    if (!ps.length) return null;
    const pk = ps.reduce((a, b) => (b.reign > a.reign ? b : a));
    return { team: pk.team, off: pk.reign_off, def: pk.reign_def, peak: pk.reign };
  }), [playerData, seasons, seasonType]);

  return (
    <div>
      {/* Tally bar */}
      <div className="cmp-tally">
        {playerData.map((d, i) => (
          <React.Fragment key={i}>
            {i > 0 && <span className="cmp-tally-dash">—</span>}
            <div className="cmp-tally-player">
              <div className="cmp-tally-name">{d.name.split(' ').pop()}</div>
              <div className={`cmp-tally-score cmp-tally-${i}`}>{tally[i]}</div>
            </div>
          </React.Fragment>
        ))}
      </div>

      <div className="cmp-hero-card">
        {/* Header */}
        <div className="cmp-hero-header">
          <div className="cmp-hero-col">
            {crestData[0] && <PlayerCrest name={playerData[0].name} team={crestData[0].team} off={crestData[0].off} def={crestData[0].def} peak={crestData[0].peak} size={50} className="cmp-hero-crest" />}
            <div className="cmp-hero-player-name" style={{ color: PLAYER_COLORS_LIGHT[0] }}>{playerData[0].name}</div>
            <div className="cmp-hero-player-meta">{playerData[0].teams} · {playerData[0].years} · {playerData[0].n} {seasonType} szn</div>
          </div>
          <div className="cmp-hero-vs">VS</div>
          <div className="cmp-hero-col">
            {crestData[1] && <PlayerCrest name={playerData[1].name} team={crestData[1].team} off={crestData[1].off} def={crestData[1].def} peak={crestData[1].peak} size={50} className="cmp-hero-crest" />}
            <div className="cmp-hero-player-name" style={{ color: PLAYER_COLORS_LIGHT[1] }}>{playerData[1].name}</div>
            <div className="cmp-hero-player-meta">{playerData[1].teams} · {playerData[1].years} · {playerData[1].n} {seasonType} szn</div>
          </div>
          {n >= 3 && playerData[2] && (
            <>
              <div className="cmp-hero-vs">VS</div>
              <div className="cmp-hero-col">
                {crestData[2] && <PlayerCrest name={playerData[2].name} team={crestData[2].team} off={crestData[2].off} def={crestData[2].def} peak={crestData[2].peak} size={50} className="cmp-hero-crest" />}
                <div className="cmp-hero-player-name" style={{ color: PLAYER_COLORS_LIGHT[2] }}>{playerData[2].name}</div>
                <div className="cmp-hero-player-meta">{playerData[2].teams} · {playerData[2].years} · {playerData[2].n} {seasonType} szn</div>
              </div>
            </>
          )}
        </div>

        {/* Stat rows */}
        {statGroups.map(group => (
          <React.Fragment key={group.label}>
            <div className="cmp-cat-row">
              <div className="cmp-cat-label" style={{ flex: 1 }}>{group.label}</div>
            </div>
            {group.stats.map(stat => {
              const vals = playerData.map(d => stat.get(d));
              const validVals = vals.filter(v => v != null);
              const best = validVals.length ? (stat.higher ? Math.max(...validVals) : Math.min(...validVals)) : null;
              return (
                <div className="cmp-stat-row" key={stat.key}>
                  {vals.map((v, i) => {
                    if (i > 0 && i === 1) {
                      // Insert label between player 1 and 2
                      return (
                        <React.Fragment key={`p${i}`}>
                          <div className="cmp-stat-label-center">{stat.label}</div>
                          <StatCell v={v} best={best} stat={stat} />
                        </React.Fragment>
                      );
                    }
                    if (i >= n) return null;
                    return <StatCell key={`p${i}`} v={v} best={best} stat={stat} />;
                  })}
                </div>
              );
            })}
          </React.Fragment>
        ))}
      </div>
    </div>
  );
}

/* ═══ PEAK WINDOW BARS ═══ */
function PeakBars({ players, seasons, stretches3, stretches5, seasonType, useOppAdj }) {
  const getR = (s) => (useOppAdj && seasonType === 'PO' && s.reign_adj != null) ? s.reign_adj : s.reign;
  const maxReign = useMemo(() => {
    let max = 0;
    players.forEach(name => {
      const ps = seasons?.filter(r => r.name === name && r.type === seasonType) || [];
      if (ps.length) {
        const peak = ps.reduce((a, b) => getR(a) > getR(b) ? a : b);
        max = Math.max(max, getR(peak) || 0);
      }
    });
    if (stretches3) {
      players.forEach(name => {
        const s = stretches3.find(r => r.name === name);
        if (s) max = Math.max(max, s.avg_reign || 0);
      });
    }
    if (stretches5) {
      players.forEach(name => {
        const s = stretches5.find(r => r.name === name);
        if (s) max = Math.max(max, s.avg_reign || 0);
      });
    }
    return max * 1.1 || 30;
  }, [players, seasons, stretches3, stretches5, seasonType]);

  const windows = [
    {
      title: '1-Year Peak',
      sub: 'Best single season REIGN',
      getData: (name) => {
        const ps = seasons?.filter(r => r.name === name && r.type === seasonType) || [];
        if (!ps.length) return null;
        const peak = ps.reduce((a, b) => getR(a) > getR(b) ? a : b);
        return { val: getR(peak), years: seasonLabel(peak.year) };
      },
    },
    {
      title: '3-Year Peak',
      sub: 'Best 3-season avg REIGN',
      getData: (name) => {
        const s = stretches3?.find(r => r.name === name);
        if (!s) return null;
        return { val: s.avg_reign, years: s.yr_label || '—' };
      },
    },
    {
      title: '5-Year Peak',
      sub: 'Best 5-season avg REIGN',
      getData: (name) => {
        const s = stretches5?.find(r => r.name === name);
        if (!s) return null;
        return { val: s.avg_reign, years: s.yr_label || '—' };
      },
    },
  ];

  return (
    <div className="cmp-bars-card">
      {windows.map(w => {
        const allData = players.map(name => w.getData(name));
        const allVals = allData.map(d => d?.val || 0);
        const bestVal = Math.max(...allVals);
        return (
        <div className="cmp-bar-group" key={w.title}>
          <div className="cmp-bar-group-title">{w.title}<span className="cmp-bar-group-sub">{w.sub}</span></div>
          {players.map((name, i) => {
            const d = allData[i];
            const val = d?.val || 0;
            const pct = Math.max(2, (val / maxReign) * 100);
            const lightBar = val < maxReign * 0.3;
            const isWinner = val === bestVal && val > 0;
            return (
              <div className={`cmp-bar-row${isWinner ? ' bar-winner' : ''}`} key={name}>
                <div className="cmp-bar-name">{name.split(' ').pop()}</div>
                <div className="cmp-bar-track">
                  <div className={`cmp-bar-fill cmp-color-${i}`} style={{ width: `${pct}%` }}>
                    <span className={`cmp-bar-val${lightBar ? ' dark' : ''}`}>
                      {d ? formatReign(val) : '—'}
                    </span>
                  </div>
                </div>
                <div className="cmp-bar-years">{d?.years || '—'}</div>
              </div>
            );
          })}
        </div>
        );
      })}
    </div>
  );
}

/* ═══ CAREER TRAJECTORY OVERLAY ═══ */
function TrajectoryChart({ players, seasons, seasonType, useOppAdj }) {
  const [hoveredPt, setHoveredPt] = useState(null);
  const getR = (s) => (useOppAdj && seasonType === 'PO' && s.reign_adj != null) ? s.reign_adj : s.reign;

  const playerSeasons = useMemo(() => {
    return players.map(name =>
      (seasons?.filter(r => r.name === name && r.type === seasonType) || []).sort((a, b) => a.year - b.year)
    );
  }, [players, seasons, seasonType]);

  const allYears = useMemo(() => {
    const ys = new Set();
    playerSeasons.forEach(ps => ps.forEach(r => ys.add(r.year)));
    return [...ys].sort();
  }, [playerSeasons]);

  if (allYears.length < 2) return null;

  const W = 1100, H = 460, PAD = { t: 36, r: 44, b: 56, l: 70 };
  const plotW = W - PAD.l - PAD.r, plotH = H - PAD.t - PAD.b;
  const allVals = playerSeasons.flat().map(r => getR(r));
  const maxV = Math.max(...allVals, 5), minV = Math.min(...allVals, -2), range = maxV - minV || 1;
  const x = yr => PAD.l + ((yr - allYears[0]) / (allYears[allYears.length - 1] - allYears[0] || 1)) * plotW;
  const y = v => PAD.t + plotH - ((v - minV) / range) * plotH;

  const step = range > 25 ? 10 : range > 12 ? 5 : 2;
  const gridLines = [];
  for (let v = Math.ceil(minV / step) * step; v <= maxV; v += step) gridLines.push(v);

  return (
    <div className="cmp-trajectory-card">
      <svg viewBox={`0 0 ${W} ${H}`} className="cmp-trajectory-svg" preserveAspectRatio="xMidYMid meet">
        <defs>
          {players.map((_, i) => (
            <linearGradient key={i} id={`cf${i}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={PLAYER_COLORS_LIGHT[i]} stopOpacity="0.2" />
              <stop offset="100%" stopColor={PLAYER_COLORS_LIGHT[i]} stopOpacity="0.02" />
            </linearGradient>
          ))}
        </defs>

        {/* Grid */}
        {gridLines.map(v => (
          <g key={v}>
            <line x1={PAD.l} y1={y(v)} x2={W - PAD.r} y2={y(v)}
              stroke={v === 0 ? 'rgba(135,137,192,0.35)' : 'rgba(135,137,192,0.1)'}
              strokeWidth={v === 0 ? 1.5 : 1} strokeDasharray={v === 0 ? '5,4' : 'none'} />
            <text x={PAD.l - 12} y={y(v) + 5} textAnchor="end" fill="#8789C0" fontSize="15" fontWeight="900" fontFamily="var(--font-mono)">{v >= 0 ? '+' : ''}{v}</text>
          </g>
        ))}

        {/* Player lines */}
        {playerSeasons.map((ps, i) => {
          if (ps.length < 2) return null;
          const path = ps.map(r => `${x(r.year)},${y(getR(r))}`).join(' ');
          const area = `${x(ps[0].year)},${y(Math.max(minV, 0))} ${path} ${x(ps[ps.length - 1].year)},${y(Math.max(minV, 0))}`;
          return (
            <g key={i}>
              <polygon points={area} fill={`url(#cf${i})`} />
              <polyline points={path} fill="none" stroke={PLAYER_COLORS_LIGHT[i]} strokeWidth="4" strokeLinejoin="round" strokeLinecap="round" />
            </g>
          );
        })}

        {/* Dots */}
        {playerSeasons.map((ps, i) =>
          ps.map(r => (
            <g key={`${i}-${r.year}`}
              onMouseEnter={() => setHoveredPt({ pi: i, r })}
              onMouseLeave={() => setHoveredPt(null)}
              style={{ cursor: 'pointer' }}>
              <circle cx={x(r.year)} cy={y(getR(r))} r="16" fill="transparent" />
              <circle cx={x(r.year)} cy={y(getR(r))}
                r={hoveredPt?.pi === i && hoveredPt?.r?.year === r.year ? 8 : 5.5}
                fill={PLAYER_COLORS_LIGHT[i]} stroke="#08090A" strokeWidth="2.5"
                style={{ transition: 'r 0.1s' }} />
            </g>
          ))
        )}

        {/* Hover tooltip */}
        {hoveredPt && (() => {
          const { pi, r } = hoveredPt;
          const tx = Math.max(170, Math.min(W - 170, x(r.year)));
          const ty = y(getR(r)) < H / 2 ? y(getR(r)) + 28 : y(getR(r)) - 74;
          const ts = (r.tsp || 0) <= 1 ? ((r.tsp || 0) * 100).toFixed(0) : (r.tsp || 0).toFixed(0);
          return (
            <g>
              <rect x={tx - 165} y={ty} width="330" height="66" rx="10" fill="#08090A" opacity="0.97" stroke="rgba(135,137,192,0.3)" />
              <text x={tx} y={ty + 25} textAnchor="middle" fill={PLAYER_COLORS_LIGHT[pi]} fontSize="20" fontWeight="900" fontFamily="var(--font-mono)">
                {players[pi].split(' ').pop()} {seasonLabel(r.year)} — {formatReign(getR(r))}
              </text>
              <text x={tx} y={ty + 52} textAnchor="middle" fill="#8789C0" fontSize="17" fontWeight="900" fontFamily="var(--font-mono)">
                {fS(r.pts)}p / {fS(r.reb)}r / {fS(r.ast)}a  {ts}% TS
              </text>
            </g>
          );
        })()}

        {/* Year labels */}
        {allYears.filter((_, i) => i % Math.max(1, Math.floor(allYears.length / 14)) === 0 || i === allYears.length - 1).map(yr => (
          <text key={yr} x={x(yr)} y={H - 10} textAnchor="middle" fill="#8789C0" fontSize="15" fontWeight="900" fontFamily="var(--font-mono)">{"'" + String(yr + 1).slice(-2)}</text>
        ))}
      </svg>
      <div className="cmp-trajectory-legend">
        {players.map((name, i) => (
          <div className="cmp-legend-item" key={name}>
            <div className="cmp-legend-dot" style={{ background: PLAYER_COLORS_LIGHT[i] }} />
            {name}
          </div>
        ))}
      </div>
    </div>
  );
}

/* ═══ RADAR OVERLAY ═══ */
function RadarOverlay({ players, seasons, seasonType, stretches3, stretches5, useOppAdj }) {
  const [radarWindow, setRadarWindow] = useState('peak');
  const getR = (s) => (useOppAdj && seasonType === 'PO' && s.reign_adj != null) ? s.reign_adj : s.reign;
  const getDef = (s) => (useOppAdj && seasonType === 'PO' && s.reign_def_adj != null) ? s.reign_def_adj : (s.reign_def || 0); // peak | 3yr | 5yr | career

  const allFiltered = useMemo(() => seasons?.filter(r => r.type === seasonType && (r.min || 0) > 15) || [], [seasons, seasonType]);

  const playerRadars = useMemo(() => {
    return players.map(name => {
      const ps = seasons?.filter(r => r.name === name && r.type === seasonType) || [];
      if (!ps.length) return null;

      let src;
      let windowLabel;
      if (radarWindow === 'peak') {
        src = ps.reduce((a, b) => getR(a) > getR(b) ? a : b);
        windowLabel = seasonLabel(src.year);
      } else if (radarWindow === '3yr') {
        const s = stretches3?.find(r => r.name === name);
        if (s) {
          src = { pts: s.avg_pts, tsp: s.avg_tsp, ast: s.avg_ast, reb: s.avg_reb,
                  reign_def: s.avg_reign_def, reign: s.avg_reign };
          windowLabel = s.yr_label;
        } else {
          src = ps.reduce((a, b) => getR(a) > getR(b) ? a : b);
          windowLabel = 'N/A';
        }
      } else if (radarWindow === '5yr') {
        const s = stretches5?.find(r => r.name === name);
        if (s) {
          src = { pts: s.avg_pts, tsp: s.avg_tsp, ast: s.avg_ast, reb: s.avg_reb,
                  reign_def: s.avg_reign_def, reign: s.avg_reign };
          windowLabel = s.yr_label;
        } else {
          src = ps.reduce((a, b) => getR(a) > getR(b) ? a : b);
          windowLabel = 'N/A';
        }
      } else {
        const n = ps.length;
        src = {
          pts: ps.reduce((s, r) => s + (r.pts || 0), 0) / n,
          tsp: ps.reduce((s, r) => s + (r.tsp || 0), 0) / n,
          ast: ps.reduce((s, r) => s + (r.ast || 0), 0) / n,
          reb: ps.reduce((s, r) => s + (r.reb || 0), 0) / n,
          reign_def: ps.reduce((s, r) => s + getDef(r), 0) / n,
          reign: ps.reduce((s, r) => s + getR(r), 0) / n,
        };
        windowLabel = 'Career';
      }

      const pctile = (val, key) => {
        const vals = allFiltered.map(r => r[key] || 0).filter(v => v !== 0).sort((a, b) => a - b);
        if (!vals.length || val == null) return 50;
        return Math.min(99, Math.round(vals.filter(v => v <= val).length / vals.length * 100));
      };

      return {
        windowLabel,
        cats: [
          { label: 'Scoring', value: pctile(src.pts, 'pts'), raw: fS(src.pts) + ' PPG' },
          { label: 'Efficiency', value: pctile(src.tsp, 'tsp'), raw: fP(src.tsp) + '% TS' },
          { label: 'Playmaking', value: pctile(src.ast, 'ast'), raw: fS(src.ast) + ' APG' },
          { label: 'Rebounding', value: pctile(src.reb, 'reb'), raw: fS(src.reb) + ' RPG' },
          { label: 'Defense', value: pctile(src.reign_def, 'reign_def'), raw: formatReign(src.reign_def) + ' DEF' },
        ],
      };
    });
  }, [players, seasons, allFiltered, seasonType, radarWindow, stretches3, stretches5]);

  if (playerRadars.some(r => r === null)) return null;

  return (
    <div className="cmp-radar-card">
      {/* Window toggle */}
      <div className="cmp-toggles" style={{ marginBottom: 16 }}>
        <div className="cmp-toggle">
          {['peak', '3yr', '5yr', 'career'].map(w => (
            <button key={w} className={`cmp-toggle-btn${radarWindow === w ? ' on' : ''}`}
              onClick={() => setRadarWindow(w)}>
              {w === 'peak' ? '1yr Peak' : w === '3yr' ? '3yr Peak' : w === '5yr' ? '5yr Peak' : 'Career Avg'}
            </button>
          ))}
        </div>
      </div>

      <div className="cmp-blooms">
        {playerRadars.map((pr, pi) => (
          <div className="cmp-bloom-col" key={pi}>
            <div className="cmp-bloom-name" style={{ color: PLAYER_COLORS_LIGHT[pi] }}>
              {players[pi]}<span className="cmp-bloom-win"> · {pr.windowLabel}</span>
            </div>
            <PercentileBars data={pr.cats} accent={PLAYER_COLORS_LIGHT[pi]} />
          </div>
        ))}
      </div>
    </div>
  );
}


/* ═══ MAIN COMPARE PAGE ═══ */
export default function Compare({ initialPlayer, initialCompare, onClearInitial, onPlayersChange }) {
  const { data: seasons, loading: loadSeasons, error: seasonsError, retry: retrySeasons } = useAllSeasons();
  const { data: awards } = useJSON('/data/awards.json');

  const [seasonType, setSeasonType] = useState('RS');
  const [useOppAdj, setUseOppAdj] = useState(false);
  const [selectedPlayers, setSelectedPlayers] = useState(() => {
    if (initialCompare?.length >= 2) return [initialCompare[0], initialCompare[1], initialCompare[2] || null].slice(0, 3);
    return [initialPlayer || null, null];
  });
  const [showThird, setShowThird] = useState(() => initialCompare?.length >= 3);

  // Handle initialPlayer changes from outside
  useEffect(() => {
    if (initialPlayer) {
      setSelectedPlayers(prev => {
        if (prev.includes(initialPlayer)) return prev;
        return [initialPlayer, prev[1] || null];
      });
      if (onClearInitial) onClearInitial();
    }
  }, [initialPlayer]);

  // Sync selected players to URL
  useEffect(() => {
    const active = selectedPlayers.filter(Boolean);
    if (active.length >= 1 && onPlayersChange) {
      onPlayersChange(active);
    }
  }, [selectedPlayers]);

  // Stretch data paths
  const s3Path = `/data/stretches_${seasonType.toLowerCase()}3.json`;
  const s5Path = `/data/stretches_${seasonType.toLowerCase()}5.json`;
  const { data: stretches3 } = useJSON(s3Path);
  const { data: stretches5 } = useJSON(s5Path);

  const allNames = useMemo(() => {
    if (!seasons) return [];
    return [...new Set(seasons.filter(r => r.type === 'RS').map(r => r.name))].sort();
  }, [seasons]);

  // Compute peak REIGN and ranks from seasons.json (single source of truth)
  const { allPlayerPeaks, allPlayerRanks } = useMemo(() => {
    if (!seasons) return { allPlayerPeaks: {}, allPlayerRanks: {} };
    const peaks = {};
    for (const s of seasons) {
      if (s.type !== 'RS') continue;
      if (!peaks[s.name] || s.reign > peaks[s.name]) peaks[s.name] = s.reign;
    }
    const sorted = Object.entries(peaks).sort((a, b) => b[1] - a[1]);
    const ranks = {};
    sorted.forEach(([name], i) => { ranks[name] = i + 1; });
    return { allPlayerPeaks: peaks, allPlayerRanks: ranks };
  }, [seasons]);

  const activePlayers = useMemo(() => selectedPlayers.filter(Boolean), [selectedPlayers]);

  const handleSelect = (index, name) => {
    setSelectedPlayers(prev => {
      const next = [...prev];
      next[index] = name;
      return next;
    });
  };

  const handleClear = (index) => {
    setSelectedPlayers(prev => {
      const next = [...prev];
      next[index] = null;
      return next;
    });
  };

  const handlePopular = (names) => {
    setSelectedPlayers(names.length >= 3 ? [names[0], names[1], names[2]] : [names[0], names[1]]);
    setShowThird(names.length >= 3);
  };

  const handleAddThird = () => {
    if (!showThird) {
      setShowThird(true);
      setSelectedPlayers(prev => prev.length < 3 ? [...prev, null] : prev);
    }
  };

  const handleRemoveThird = () => {
    setShowThird(false);
    setSelectedPlayers(prev => prev.slice(0, 2));
  };

  if (seasonsError) return <LoadError message="Couldn't load the comparison data." onRetry={retrySeasons} />;
  if (loadSeasons) return <Loading message="Loading comparison data..." />;

  const slots = showThird ? 3 : 2;
  const slotsArr = selectedPlayers.slice(0, slots);
  // Pad to correct length
  while (slotsArr.length < slots) slotsArr.push(null);

  const hasComparison = activePlayers.length >= 2;

  return (
    <div className="cmp">
      <div className="cmp-wrap">
        <div className="cmp-header">
          <h1 className="cmp-title">Head-to-Head Compare</h1>
          <p className="cmp-desc">Side-by-side REIGN breakdowns, peak windows, career trajectories, and skill profiles</p>
        </div>

        {/* Player selectors */}
        <div className="cmp-selectors">
          {slotsArr.map((name, i) => (
            <PlayerSlot
              key={i}
              index={i}
              selectedName={name}
              allNames={allNames}
              allPlayerPeaks={allPlayerPeaks}
              onSelect={(n) => handleSelect(i, n)}
              onClear={() => handleClear(i)}
            />
          ))}
          {!showThird && (
            <button className="cmp-add-slot" onClick={handleAddThird}>+ Add 3rd Player</button>
          )}
          {showThird && (
            <button className="cmp-add-slot" onClick={handleRemoveThird} style={{ borderColor: '#fca5a5', color: '#c03030' }}>
              − Remove 3rd
            </button>
          )}
        </div>

        {/* RS / PO toggle + Opponent Adj + Share button */}
        {hasComparison && (
          <div className="cmp-toggles" style={{ padding: '8px 0 0', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
              <div className="cmp-toggle">
                <button className={`cmp-toggle-btn${seasonType === 'RS' ? ' on' : ''}`} onClick={() => setSeasonType('RS')}>Regular Season</button>
                <button className={`cmp-toggle-btn${seasonType === 'PO' ? ' on' : ''}`} onClick={() => setSeasonType('PO')}>Playoffs</button>
              </div>
              {seasonType === 'PO' && (
                <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem', fontWeight: 800, color: '#8789C0', cursor: 'pointer' }}>
                  <input type="checkbox" checked={useOppAdj} onChange={e => setUseOppAdj(e.target.checked)}
                    style={{ accentColor: '#10B981', width: 16, height: 16 }} />
                  Opponent-adjusted
                </label>
              )}
            </div>
            <button className="cmp-share-btn" onClick={async () => {
              const el = document.getElementById('cmp-export-zone');
              if (!el) return;
              try {
                const html2canvas = (await import('html2canvas')).default;
                const canvas = await html2canvas(el, { backgroundColor: '#F4FAFF', scale: 2, useCORS: true });
                const link = document.createElement('a');
                link.download = `REIGN_${activePlayers.join('_vs_')}.png`;
                link.href = canvas.toDataURL('image/png');
                link.click();
              } catch (e) { console.error('Export failed:', e); }
            }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
              Export PNG
            </button>
          </div>
        )}

        {/* Popular comparisons */}
        {!hasComparison && (
          <div className="cmp-popular">
            <div className="cmp-popular-title">Popular Comparisons</div>
            <div className="cmp-popular-grid">
              {POPULAR_COMPARISONS.map((pair, i) => (
                <button key={i} className="cmp-popular-btn" onClick={() => handlePopular(pair)}>
                  {pair[0].split(' ').pop()} <span className="cmp-popular-vs">vs</span> {pair[1].split(' ').pop()}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Empty state */}
        {!hasComparison && (
          <div className="cmp-empty">
            <div className="cmp-empty-icon">⚔️</div>
            <div className="cmp-empty-title">Select two players to compare</div>
            <div className="cmp-empty-desc">Choose from the search above or pick a popular comparison to get started</div>
          </div>
        )}

        {/* ═══ COMPARISON CONTENT ═══ */}
        {hasComparison && (
          <div className="cmp-content">
            {/* Export zone — this gets captured as PNG */}
            <div id="cmp-export-zone">
            {/* Section 1: Stat Table Hero */}
            <div className="cmp-section">
              <div className="cmp-section-header">
                <h2 className="cmp-section-title">Statistical Comparison</h2>
              </div>
              <StatTable players={activePlayers} seasons={seasons} allPlayerRanks={allPlayerRanks} stretches3={stretches3} stretches5={stretches5} seasonType={seasonType} awards={awards} useOppAdj={useOppAdj} />
            </div>

            {/* Section 2: Peak Window Bars */}
            <div className="cmp-section">
              <h2 className="cmp-section-title">Peak Windows <span style={{fontSize:'0.7em',color:'#8789C0',fontWeight:700}}>{seasonType === 'PO' ? '(Playoffs)' : '(Regular Season)'}</span></h2>
              <PeakBars
                players={activePlayers}
                seasons={seasons}
                stretches3={stretches3}
                stretches5={stretches5}
                seasonType={seasonType}
                useOppAdj={useOppAdj}
              />
            </div>
            </div>
            {/* End export zone */}

            {/* Section 3: Career Trajectory */}
            <div className="cmp-section">
              <h2 className="cmp-section-title">Career Trajectory <span style={{fontSize:'0.7em',color:'#8789C0',fontWeight:700}}>{seasonType === 'PO' ? (useOppAdj ? '(Playoffs · Opp-Adjusted)' : '(Playoffs)') : '(Regular Season)'}</span></h2>
              <TrajectoryChart players={activePlayers} seasons={seasons} seasonType={seasonType} useOppAdj={useOppAdj} />
            </div>

            {/* Section 4: Radar Overlay */}
            <div className="cmp-section">
              <h2 className="cmp-section-title">Skill Profile Overlay <span style={{fontSize:'0.7em',color:'#8789C0',fontWeight:700}}>{seasonType === 'PO' ? (useOppAdj ? '(Playoffs · Opp-Adjusted)' : '(Playoffs)') : '(Regular Season)'}</span></h2>
              <RadarOverlay players={activePlayers} seasons={seasons} seasonType={seasonType} stretches3={stretches3} stretches5={stretches5} useOppAdj={useOppAdj} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
