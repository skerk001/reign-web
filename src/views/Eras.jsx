import React, { useState, useMemo } from 'react';
import { formatReign } from '../utils/format';
import { useJSON, useAllSeasons } from '../hooks/useData';
import { PlayerCrest } from '../components/PlayerArt';
import EraBadge from '../components/EraBadge';
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
function EvolutionChart({ seasons, stat, label, unit, color, seasonType, minYear }) {
  const [hover, setHover] = useState(null);
  const { yearData, leaders } = useMemo(() => {
    const norm = v => (stat === 'tsp' && v <= 1) ? v * 100 : v;
    const byYear = {}, eraPeak = {};
    for (const s of seasons) {
      if (s.type !== (seasonType || 'RS') || (s.min || 0) < 15) continue;
      if (minYear && s.year < minYear) continue; // stat not recorded yet — zeros would fake a flat line
      const val = norm(s[stat] || 0);
      (byYear[s.year] ||= []).push(val);
      if (val > 0 && (!eraPeak[s.era] || val > eraPeak[s.era].val)) eraPeak[s.era] = { val, name: s.name, year: s.year };
    }
    const yearData = Object.entries(byYear).map(([yr, vals]) => ({ year: +yr, avg: vals.reduce((a, b) => a + b, 0) / vals.length })).sort((a, b) => a.year - b.year);
    const leaders = ERAS.map(e => eraPeak[e.id] ? { ...eraPeak[e.id], color: e.color } : null).filter(Boolean);
    return { yearData, leaders };
  }, [seasons, stat, seasonType, minYear]);

  if (yearData.length < 3) return null;
  const W = 620, H = 252, PAD = { t: 58, r: 18, b: 36, l: 50 };
  const plotW = W - PAD.l - PAD.r, plotH = H - PAD.t - PAD.b;
  const vals = yearData.map(d => d.avg);
  const minV = Math.min(...vals) * 0.92, maxV = Math.max(...vals) * 1.06, range = maxV - minV || 1;
  const y0 = yearData[0].year, y1 = yearData[yearData.length - 1].year;
  const x = yr => PAD.l + ((yr - y0) / (y1 - y0 || 1)) * plotW;
  const y = v => PAD.t + plotH - ((v - minV) / range) * plotH;
  const dec = stat === 'tsp' ? 0 : 1;

  const path = yearData.map(d => `${x(d.year)},${y(d.avg)}`).join(' ');
  const areaPath = `${x(y0)},${y(minV)} ${path} ${x(y1)},${y(minV)}`;
  const bands = ERAS.map(e => ({ x1: x(Math.max(e.years[0], y0)), x2: x(Math.min(e.years[1], y1)), color: e.color })).filter(b => b.x2 > b.x1);

  const onMove = e => {
    const r = e.currentTarget.getBoundingClientRect();
    const vx = ((e.clientX - r.left) / r.width) * W;
    const yr = Math.max(y0, Math.min(y1, Math.round(y0 + ((vx - PAD.l) / plotW) * (y1 - y0))));
    const d = yearData.find(p => p.year === yr);
    if (d) setHover({ d, px: e.clientX - r.left, py: e.clientY - r.top });
  };

  return (
    <div className="era-evo-chart">
      <div className="era-evo-label">{label}</div>
      <div className="era-evo-plot" onMouseMove={onMove} onMouseLeave={() => setHover(null)}>
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid meet">
          <defs>
            <linearGradient id={`evoFill_${stat}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity="0.3" /><stop offset="100%" stopColor={color} stopOpacity="0.02" />
            </linearGradient>
            <filter id={`evoGlow_${stat}`}><feGaussianBlur stdDeviation="2.5" result="b" /><feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge></filter>
          </defs>
          {bands.map((b, i) => <rect key={i} x={b.x1} y={PAD.t} width={b.x2 - b.x1} height={plotH} fill={b.color} opacity="0.06" />)}
          {[0.25, 0.5, 0.75].map(pct => <line key={pct} x1={PAD.l} y1={y(minV + range * pct)} x2={W - PAD.r} y2={y(minV + range * pct)} stroke="rgba(135,137,192,0.1)" />)}
          <polygon points={areaPath} fill={`url(#evoFill_${stat})`} />
          <polyline points={path} fill="none" stroke={color} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
          {/* axis */}
          <text x={PAD.l - 6} y={PAD.t + 6} textAnchor="end" fill="#8789C0" fontSize="12" fontWeight="800" fontFamily="var(--font-mono)">{maxV.toFixed(dec)}{unit}</text>
          <text x={PAD.l - 6} y={H - PAD.b} textAnchor="end" fill="#8789C0" fontSize="12" fontWeight="800" fontFamily="var(--font-mono)">{minV.toFixed(dec)}{unit}</text>
          {yearData.filter(d => d.year % 10 === 0).map(d => <text key={d.year} x={x(d.year)} y={H - 8} textAnchor="middle" fill="#8789C0" fontSize="12" fontWeight="800" fontFamily="var(--font-mono)">{d.year}</text>)}
          {/* Era record-holders (top lane), with label collision-spreading */}
          {(() => {
            let lastX = -Infinity; const minGap = 98;
            return [...leaders].sort((a, b) => a.year - b.year).map(L => {
              let lx = Math.max(40, Math.min(W - 40, x(L.year)));
              if (lx - lastX < minGap) lx = lastX + minGap;
              lx = Math.min(W - 40, lx); lastX = lx;
              return (
                <g key={L.name + L.year}>
                  <line x1={x(L.year)} y1={PAD.t} x2={lx} y2="44" stroke={L.color} strokeWidth="1" strokeDasharray="2 3" opacity="0.5" />
                  <circle cx={lx} cy="44" r="3.5" fill={L.color} filter={`url(#evoGlow_${stat})`} />
                  <text x={lx} y="18" textAnchor="middle" fontFamily="var(--font-mono)" fontSize="14" fontWeight="900" fill={L.color}>{L.val.toFixed(dec)}{unit}</text>
                  <text x={lx} y="31" textAnchor="middle" fontFamily="var(--font-body)" fontSize="10.5" fontWeight="800" fill="#c9cdec">{L.name.split(' ').pop()} ’{String(L.year + 1).slice(-2)}</text>
                </g>
              );
            });
          })()}
          {/* hover guide */}
          {hover && <g pointerEvents="none"><line x1={x(hover.d.year)} y1={PAD.t} x2={x(hover.d.year)} y2={H - PAD.b} stroke="rgba(255,255,255,0.25)" /><circle cx={x(hover.d.year)} cy={y(hover.d.avg)} r="4" fill={color} stroke="#08090A" strokeWidth="1.5" /></g>}
        </svg>
        {hover && <div className="era-evo-tip" style={{ left: hover.px + 12, top: hover.py + 12 }}><b>{hover.d.year}-{String(hover.d.year + 1).slice(-2)}</b><span>league avg {hover.d.avg.toFixed(dec)}{unit}</span></div>}
      </div>
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
                <EraBadge era={era.id} size={34} />
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
          <p className="era-evo-sub">The line is the <b>league average</b> each year · the colored markers up top are <b>each era's single best season</b> for that stat. Hover the line to read any year.</p>
          <div className="era-evo-grid">
            <EvolutionChart seasons={seasons} seasonType={seasonType} stat="pts" label="Scoring (PPG)" unit="" color="#D97706" />
            <EvolutionChart seasons={seasons} seasonType={seasonType} stat="tsp" label="True Shooting %" unit="%" color="#10B981" />
            <EvolutionChart seasons={seasons} seasonType={seasonType} stat="fg3m" label="3-Pointers Made · since '79-80" unit="" color="#2563EB" minYear={1979} />
            <EvolutionChart seasons={seasons} seasonType={seasonType} stat="ast" label="Assists (APG)" unit="" color="#8789C0" />
            <EvolutionChart seasons={seasons} seasonType={seasonType} stat="reb" label="Rebounds (RPG)" unit="" color="#92400e" />
            <EvolutionChart seasons={seasons} seasonType={seasonType} stat="stl" label="Steals (SPG) · tracked since '73-74" unit="" color="#06b6d4" minYear={1973} />
            <EvolutionChart seasons={seasons} seasonType={seasonType} stat="blk" label="Blocks (BPG) · tracked since '73-74" unit="" color="#a78bfa" minYear={1973} />
            <EvolutionChart seasons={seasons} seasonType={seasonType} stat="reign" label="Avg REIGN Score" unit="" color="#065f46" />
          </div>
        </div>
      </div>
    </div>
  );
}
