import React, { useState, useMemo } from 'react';
import { formatReign } from '../utils/format';
import { useJSON, useAllSeasons } from '../hooks/useData';
import { PlayerCrest } from '../components/PlayerArt';
import Loading from '../components/Loading';
import './Eras.css';

const ERAS = [
  { id: 'Pioneer', name: 'Pioneer Era', years: [1946, 1962], color: '#8789C0', dark: '#5a5c8a', light: '#b8b9dc',
    tagline: 'Where It All Began',
    desc: 'The birth of professional basketball. Set shots, no three-point line, limited stats, and the game\'s first dynasties. George Mikan and the Minneapolis Lakers dominated. Wilt and Russell emerged at the end to change everything.' },
  { id: 'Legacy', name: 'Legacy Era', years: [1963, 1995], color: '#D97706', dark: '#92400e', light: '#fbbf24',
    tagline: 'The Golden Age',
    desc: 'The greatest era of individual dominance. Jordan, Magic, Bird, Kareem, Wilt, Russell, Oscar. The ABA merger, the three-point line (1979), and the rise of modern defense. Physical play and isolation scoring defined the game.' },
  { id: 'Classic', name: 'Classic Era', years: [1996, 2012], color: '#2563EB', dark: '#1e40af', light: '#7CC6FE',
    tagline: 'Peak Isolation Ball',
    desc: 'The dead-ball era. ISO-heavy offenses, zone defense legalized (2001), hand-checking banned (2004). Kobe, Duncan, Shaq, LeBron\'s rise, KG, Nash\'s Suns. The lowest scoring era in modern history gave way to the analytics revolution.' },
  { id: 'Modern', name: 'Modern Era', years: [2013, 2026], color: '#10B981', dark: '#065f46', light: '#5DFDCB',
    tagline: 'The Analytics Revolution',
    desc: 'Three-point explosion, pace-and-space, positionless basketball. Curry changed the game. The mid-range died (then came back). Load management, superteams, and the most efficient offenses in history.' },
];

function fS(v) { return v == null ? '—' : Number(v).toFixed(1); }
function fP(v) { if (v == null) return '—'; return v <= 1 ? (v * 100).toFixed(1) : Number(v).toFixed(1); }

/* ═══ MINI SPARKLINE BAR ═══ */
function StatBar({ value, max, color }) {
  const pct = max > 0 ? Math.max(3, (value / max) * 100) : 0;
  return (
    <div className="era-stat-bar-track">
      <div className="era-stat-bar-fill" style={{ width: `${pct}%`, background: color }} />
    </div>
  );
}

/* ═══ TOP PLAYERS PODIUM ═══ */
function TopPlayers({ players, eraColor }) {
  if (!players.length) return null;
  return (
    <div className="era-top-players">
      {players.slice(0, 10).map((p, i) => (
        <div key={p.name + p.year} className={`era-tp-row${i < 3 ? ' era-tp-top3' : ''}`}>
          <span className="era-tp-rank" style={i < 3 ? { color: eraColor } : undefined}>
            {i === 0 ? '👑' : `#${i + 1}`}
          </span>
          <span className="era-tp-name">{p.name}</span>
          <span className="era-tp-year">{p.year}-{String(p.year + 1).slice(-2)}</span>
          <span className="era-tp-reign" style={{ color: eraColor }}>{formatReign(p.reign)}</span>
          <span className="era-tp-stats">{fS(p.pts)}p {fS(p.reb)}r {fS(p.ast)}a</span>
        </div>
      ))}
    </div>
  );
}

/* ═══ ERA EVOLUTION CHART (SVG) ═══ */
function EvolutionChart({ seasons, stat, label, unit, color, seasonType }) {
  const yearData = useMemo(() => {
    const byYear = {};
    for (const s of seasons) {
      if (s.type !== (seasonType || 'RS') || (s.min || 0) < 15) continue;
      const yr = s.year;
      if (!byYear[yr]) byYear[yr] = [];
      let val = s[stat] || 0;
      if (stat === 'tsp' && val <= 1) val *= 100;
      byYear[yr].push(val);
    }
    return Object.entries(byYear).map(([yr, vals]) => ({
      year: Number(yr),
      avg: vals.reduce((a, b) => a + b, 0) / vals.length,
    })).sort((a, b) => a.year - b.year);
  }, [seasons, stat, seasonType]);

  if (yearData.length < 3) return null;
  const W = 620, H = 210, PAD = { t: 22, r: 18, b: 36, l: 54 };
  const plotW = W - PAD.l - PAD.r, plotH = H - PAD.t - PAD.b;
  const vals = yearData.map(d => d.avg);
  const minV = Math.min(...vals) * 0.9, maxV = Math.max(...vals) * 1.05;
  const range = maxV - minV || 1;
  const x = (yr) => PAD.l + ((yr - yearData[0].year) / (yearData[yearData.length - 1].year - yearData[0].year || 1)) * plotW;
  const y = (v) => PAD.t + plotH - ((v - minV) / range) * plotH;

  const path = yearData.map(d => `${x(d.year)},${y(d.avg)}`).join(' ');
  const areaPath = `${x(yearData[0].year)},${y(minV)} ${path} ${x(yearData[yearData.length - 1].year)},${y(minV)}`;

  // Era background bands
  const eraBands = ERAS.map(era => ({
    x1: x(Math.max(era.years[0], yearData[0].year)),
    x2: x(Math.min(era.years[1], yearData[yearData.length - 1].year)),
    color: era.color,
  })).filter(b => b.x2 > b.x1);

  return (
    <div className="era-evo-chart">
      <div className="era-evo-label">{label}</div>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid meet">
        <defs>
          <linearGradient id={`evoFill_${stat}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.25" />
            <stop offset="100%" stopColor={color} stopOpacity="0.02" />
          </linearGradient>
        </defs>
        {/* Era bands */}
        {eraBands.map((b, i) => (
          <rect key={i} x={b.x1} y={PAD.t} width={b.x2 - b.x1} height={plotH} fill={b.color} opacity="0.06" />
        ))}
        {/* Grid lines */}
        {[0.25, 0.5, 0.75].map(pct => {
          const v = minV + range * pct;
          return <line key={pct} x1={PAD.l} y1={y(v)} x2={W - PAD.r} y2={y(v)} stroke="rgba(135,137,192,0.1)" strokeWidth="1" />;
        })}
        {/* Area + line */}
        <polygon points={areaPath} fill={`url(#evoFill_${stat})`} />
        <polyline points={path} fill="none" stroke={color} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
        {/* Y axis labels */}
        <text x={PAD.l - 6} y={PAD.t + 6} textAnchor="end" fill="#8789C0" fontSize="13" fontWeight="900" fontFamily="var(--font-mono)">{(maxV).toFixed(stat === 'tsp' ? 0 : 1)}{unit}</text>
        <text x={PAD.l - 6} y={H - PAD.b} textAnchor="end" fill="#8789C0" fontSize="13" fontWeight="900" fontFamily="var(--font-mono)">{(minV).toFixed(stat === 'tsp' ? 0 : 1)}{unit}</text>
        {/* Decade labels */}
        {yearData.filter(d => d.year % 10 === 0).map(d => (
          <text key={d.year} x={x(d.year)} y={H - 8} textAnchor="middle" fill="#8789C0" fontSize="13" fontWeight="900" fontFamily="var(--font-mono)">{d.year}</text>
        ))}
      </svg>
    </div>
  );
}

/* ═══ ERA COMPARISON TABLE ═══ */
function EraComparisonTable({ eraStats }) {
  const stats = [
    { label: 'Avg PPG', key: 'avgPts', fmt: fS },
    { label: 'Avg RPG', key: 'avgReb', fmt: fS },
    { label: 'Avg APG', key: 'avgAst', fmt: fS },
    { label: 'Avg TS%', key: 'avgTs', fmt: v => fP(v) + '%' },
    { label: 'Avg 3PM', key: 'avg3pm', fmt: fS },
    { label: 'Avg MIN', key: 'avgMin', fmt: fS },
    { label: 'Avg REIGN', key: 'avgReign', fmt: formatReign },
    { label: 'Peak REIGN', key: 'peakReign', fmt: formatReign },
    { label: 'Players', key: 'players', fmt: v => v },
  ];

  return (
    <div className="era-comp-table-wrap">
      <table className="era-comp-table">
        <thead>
          <tr>
            <th className="era-ct-label"></th>
            {ERAS.map(era => (
              <th key={era.id} className="era-ct-header" style={{ borderBottom: `4px solid ${era.color}` }}>
                <span style={{ color: era.color }}>{era.id}</span>
                <span className="era-ct-years">{era.years[0]}–{String(era.years[1]).slice(-2)}</span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {stats.map(stat => {
            const vals = ERAS.map(era => eraStats[era.id]?.[stat.key]);
            const validVals = vals.filter(v => v != null && typeof v === 'number');
            const best = validVals.length ? Math.max(...validVals) : null;
            return (
              <tr key={stat.key}>
                <td className="era-ct-label">{stat.label}</td>
                {ERAS.map((era, i) => {
                  const v = vals[i];
                  const isMax = v != null && typeof v === 'number' && v === best;
                  return (
                    <td key={era.id} className={`era-ct-val${isMax ? ' era-ct-best' : ''}`}
                      style={isMax ? { color: era.color } : undefined}>
                      {v != null ? stat.fmt(v) : '—'}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/* ═══ MAIN ERA EXPLORER ═══ */
export default function EraExplorer() {
  const { data: seasons, loading } = useAllSeasons();
  const { data: awards } = useJSON('/data/awards.json');
  const [selectedEra, setSelectedEra] = useState(null);
  const [seasonType, setSeasonType] = useState('RS');

  // Compute era stats
  const eraStats = useMemo(() => {
    if (!seasons) return {};
    const stats = {};
    for (const era of ERAS) {
      const filtered = seasons.filter(s => s.type === seasonType && s.era === era.id && (s.min || 0) > 15);
      if (!filtered.length) continue;
      const n = filtered.length;
      const peak = filtered.reduce((a, b) => a.reign > b.reign ? a : b);
      stats[era.id] = {
        avgPts: filtered.reduce((s, r) => s + (r.pts || 0), 0) / n,
        avgReb: filtered.reduce((s, r) => s + (r.reb || 0), 0) / n,
        avgAst: filtered.reduce((s, r) => s + (r.ast || 0), 0) / n,
        avgTs: filtered.reduce((s, r) => s + (r.tsp || 0), 0) / n,
        avg3pm: filtered.reduce((s, r) => s + (r.fg3m || 0), 0) / n,
        avgMin: filtered.reduce((s, r) => s + (r.min || 0), 0) / n,
        avgReign: filtered.reduce((s, r) => s + r.reign, 0) / n,
        peakReign: peak.reign,
        peakPlayer: peak.name,
        peakYear: peak.year,
        peakTeam: peak.team,
        peakOff: peak.reign_off,
        peakDef: peak.reign_def,
        players: new Set(filtered.map(r => r.name)).size,
        seasonCount: n,
      };
    }
    return stats;
  }, [seasons, seasonType]);

  // Top players per era
  const eraTopPlayers = useMemo(() => {
    if (!seasons) return {};
    const tops = {};
    for (const era of ERAS) {
      const filtered = seasons.filter(s => s.type === seasonType && s.era === era.id);
      const playerBest = {};
      for (const s of filtered) {
        if (!playerBest[s.name] || s.reign > playerBest[s.name].reign) {
          playerBest[s.name] = s;
        }
      }
      tops[era.id] = Object.values(playerBest).sort((a, b) => b.reign - a.reign);
    }
    return tops;
  }, [seasons, seasonType]);

  if (loading) return <Loading message="Loading era data..." />;

  const activeEra = selectedEra ? ERAS.find(e => e.id === selectedEra) : null;

  return (
    <div className="eras">
      <div className="eras-wrap">
        <div className="eras-header">
          <h1 className="eras-title">Era Explorer</h1>
          <p className="eras-desc">How the game evolved across 80 years — from set shots to analytics revolution</p>
          <div className="vc-toggle" style={{marginTop: 12}}>
            <button className={`vc-btn${seasonType==='RS'?' on':''}`} onClick={()=>setSeasonType('RS')}>Regular Season</button>
            <button className={`vc-btn${seasonType==='PO'?' on':''}`} onClick={()=>setSeasonType('PO')}>Playoffs</button>
          </div>
        </div>

        {/* Era timeline navigation */}
        <div className="era-timeline">
          {ERAS.map(era => {
            const isActive = selectedEra === era.id;
            const stats = eraStats[era.id];
            return (
              <button key={era.id}
                className={`era-card${isActive ? ' era-card-active' : ''}`}
                onClick={() => setSelectedEra(isActive ? null : era.id)}
                style={{ '--ec': era.color }}>
                <div className="era-card-badge" style={{ background: era.color }}>{era.id[0]}</div>
                <div className="era-card-info">
                  <div className="era-card-name" style={{ color: isActive ? era.color : 'var(--ink)' }}>{era.name}</div>
                  <div className="era-card-years">{era.years[0]}–{era.years[1]}</div>
                  <div className="era-card-tagline">{era.tagline}</div>
                </div>
                {stats && (
                  <div className="era-card-stats">
                    <span className="era-card-stat"><strong style={{ color: era.color }}>{formatReign(stats.peakReign)}</strong> peak</span>
                    <span className="era-card-stat">{stats.players} players</span>
                  </div>
                )}
              </button>
            );
          })}
        </div>

        {/* Era detail view */}
        {activeEra && (
          <div className="era-detail" style={{ borderLeftColor: activeEra.color }}>
            <div className="era-detail-header">
              <div>
                <h2 className="era-detail-title" style={{ color: activeEra.color }}>{activeEra.name}</h2>
                <p className="era-detail-desc">{activeEra.desc}</p>
              </div>
              <div className="era-detail-peak">
                <div className="era-peak-label">Era's Greatest Season</div>
                {eraStats[activeEra.id]?.peakTeam && (
                  <PlayerCrest name={eraStats[activeEra.id].peakPlayer} team={eraStats[activeEra.id].peakTeam}
                    off={eraStats[activeEra.id].peakOff} def={eraStats[activeEra.id].peakDef} peak={eraStats[activeEra.id].peakReign}
                    size={52} className="era-peak-crest" />
                )}
                <div className="era-peak-name">{eraStats[activeEra.id]?.peakPlayer}</div>
                <div className="era-peak-reign" style={{ color: activeEra.color }}>
                  {formatReign(eraStats[activeEra.id]?.peakReign)}
                </div>
                <div className="era-peak-year">{eraStats[activeEra.id]?.peakYear}-{String((eraStats[activeEra.id]?.peakYear || 0) + 1).slice(-2)}</div>
              </div>
            </div>

            {/* Top 10 players in this era */}
            <div className="era-section">
              <h3 className="era-section-title">Top 10 Peak Seasons</h3>
              <TopPlayers players={eraTopPlayers[activeEra.id] || []} eraColor={activeEra.color} />
            </div>
          </div>
        )}

        {/* Cross-era comparison table */}
        <div className="era-section" style={{ paddingTop: 32 }}>
          <h2 className="era-section-title" style={{ fontSize: '1.5rem' }}>Era-by-Era Comparison</h2>
          <EraComparisonTable eraStats={eraStats} />
        </div>

        {/* Evolution charts */}
        <div className="era-section">
          <h2 className="era-section-title" style={{ fontSize: '1.5rem' }}>How the Game Evolved</h2>
          <div className="era-evo-grid">
            <EvolutionChart seasons={seasons} seasonType={seasonType} stat="pts" label="Scoring (PPG)" unit="" color="#D97706" />
            <EvolutionChart seasons={seasons} seasonType={seasonType} stat="tsp" label="True Shooting %" unit="%" color="#10B981" />
            <EvolutionChart seasons={seasons} seasonType={seasonType} stat="fg3m" label="3-Pointers Made" unit="" color="#2563EB" />
            <EvolutionChart seasons={seasons} seasonType={seasonType} stat="ast" label="Assists (APG)" unit="" color="#8789C0" />
            <EvolutionChart seasons={seasons} seasonType={seasonType} stat="reb" label="Rebounds (RPG)" unit="" color="#92400e" />
            <EvolutionChart seasons={seasons} seasonType={seasonType} stat="reign" label="Avg REIGN Score" unit="" color="#065f46" />
          </div>
        </div>
      </div>
    </div>
  );
}
