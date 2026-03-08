import React, { useState, useEffect, useMemo } from 'react';
import { formatReign } from '../utils/format';
import { fuzzySearch } from '../utils/fuzzySearch';
import { useJSON, useAllSeasons } from '../hooks/useData';
import Loading from '../components/Loading';
import './Players.css';

// Warm-toned cell color for clutch heatmap (subtle, site-matching)
function clutchHeat(pct) {
  if (pct == null) return 'transparent';
  if (pct >= 90) return '#92400e'; // deep amber
  if (pct >= 80) return '#D97706'; // amber
  if (pct >= 70) return '#fbbf24'; // gold
  if (pct >= 60) return '#fde68a'; // light gold
  if (pct >= 40) return '#fef9c3'; // cream
  if (pct >= 20) return '#f0f4f8'; // neutral
  return '#fee2e2'; // light red (cold)
}
function clutchTextColor(pct) {
  if (pct == null) return '#b0b4d0';
  if (pct >= 80) return '#fff';
  if (pct >= 60) return '#08090A';
  return '#4a4d60';
}

function ClutchCell({ v, pct, fmt, suffix = '' }) {
  if (v == null) return <td className="cf-cell cf-na">—</td>;
  const bg = clutchHeat(pct);
  const color = clutchTextColor(pct);
  let display = v;
  if (fmt === 'pm') display = (v >= 0 ? '+' : '') + Number(v).toFixed(1);
  else if (fmt === '1') display = Number(v).toFixed(1);
  else if (fmt === '0') display = v;
  return (
    <td className="cf-cell" style={{ background: bg, color }}>
      {display}{suffix}
    </td>
  );
}

function TsDiffCell({ v }) {
  if (v == null) return <td className="cf-cell cf-na">—</td>;
  const num = Number(v);
  const bg = num >= 10 ? '#065f46' : num >= 5 ? '#10B981' : num >= 2 ? '#5DFDCB' : num >= 0 ? '#a7f3d0' : num >= -3 ? '#fee2e2' : '#fca5a5';
  const color = (bg === '#5DFDCB' || bg === '#a7f3d0' || bg === '#fee2e2' || bg === '#fca5a5') ? '#08090A' : '#fff';
  return (
    <td className="cf-cell" style={{ background: bg, color, fontWeight: 900 }}>
      {num > 0 ? '+' : ''}{v}
    </td>
  );
}


const FEATURED = [
  'LeBron James', 'Michael Jordan', 'Stephen Curry', 'Nikola Jokić',
  'Shai Gilgeous-Alexander', 'Kevin Durant', 'Joel Embiid', 'Giannis Antetokounmpo',
  'Kobe Bryant', 'Tim Duncan', 'Hakeem Olajuwon', "Shaquille O'Neal",
  'Dwyane Wade', 'Chris Paul', 'Larry Bird', 'Magic Johnson',
  'Kareem Abdul-Jabbar', 'Wilt Chamberlain', 'David Robinson', 'Kawhi Leonard',
  'Luka Dončić', 'Charles Barkley', 'Kevin Garnett', 'James Harden',
];

function fS(v) { return v == null ? '—' : Number(v).toFixed(1); }
function fP(v) { if (v == null) return '—'; return v <= 1 ? (v*100).toFixed(1) : Number(v).toFixed(1); }

function Sparkline({ values, w = 100, h = 28, color = '#5DFDCB' }) {
  if (!values || values.length < 2) return null;
  const max = Math.max(...values, 1); const min = Math.min(...values, 0);
  const range = max - min || 1;
  const pts = values.map((v, i) => `${(i / (values.length - 1)) * w},${h - ((v - min) / range) * (h - 4) - 2}`).join(' ');
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="sparkline">
      <polyline points={pts} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={w} cy={h - ((values[values.length-1] - min) / range) * (h - 4) - 2} r="3" fill={color} />
    </svg>
  );
}

function CareerChart({ rs, po }) {
  const [hoveredPt, setHoveredPt] = useState(null);
  const allYears = [...new Set([...rs, ...po].map(r => r.year))].sort();
  if (allYears.length < 2) return null;
  const W = 960, H = 340, PAD = { t: 28, r: 36, b: 48, l: 56 };
  const plotW = W - PAD.l - PAD.r, plotH = H - PAD.t - PAD.b;
  const allVals = [...rs.map(r => r.reign), ...po.map(r => r.reign)];
  const maxV = Math.max(...allVals, 5), minV = Math.min(...allVals, -2), range = maxV - minV || 1;
  const x = yr => PAD.l + ((yr - allYears[0]) / (allYears[allYears.length-1] - allYears[0] || 1)) * plotW;
  const y = v => PAD.t + plotH - ((v - minV) / range) * plotH;
  const rsPath = rs.map(r => `${x(r.year)},${y(r.reign)}`).join(' ');
  const poPath = po.map(r => `${x(r.year)},${y(r.reign)}`).join(' ');
  const step = range > 25 ? 10 : range > 12 ? 5 : 2;
  const gridLines = [];
  for (let v = Math.ceil(minV / step) * step; v <= maxV; v += step) gridLines.push(v);
  const rsPeak = rs.length ? rs.reduce((a,b) => a.reign > b.reign ? a : b) : null;
  const poPeak = po.length ? po.reduce((a,b) => a.reign > b.reign ? a : b) : null;

  return (
    <div className="chart-wrap">
      <svg viewBox={`0 0 ${W} ${H}`} className="career-chart" preserveAspectRatio="xMidYMid meet">
        <defs>
          <linearGradient id="rsFill2" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#5DFDCB" stopOpacity="0.35"/><stop offset="100%" stopColor="#5DFDCB" stopOpacity="0.02"/></linearGradient>
          <linearGradient id="poFill2" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#F59E0B" stopOpacity="0.2"/><stop offset="100%" stopColor="#F59E0B" stopOpacity="0.02"/></linearGradient>
        </defs>
        {gridLines.map(v => (
          <g key={v}>
            <line x1={PAD.l} y1={y(v)} x2={W-PAD.r} y2={y(v)} stroke={v===0?'rgba(135,137,192,0.35)':'rgba(135,137,192,0.1)'} strokeWidth={v===0?1.5:1} strokeDasharray={v===0?'5,4':'none'} />
            <text x={PAD.l-10} y={y(v)+5} textAnchor="end" fill="#8789C0" fontSize="13" fontWeight="800" fontFamily="var(--font-mono)">{v>=0?'+':''}{v}</text>
          </g>
        ))}
        {rs.length > 1 && <polygon points={`${x(rs[0].year)},${y(Math.max(minV,0))} ${rsPath} ${x(rs[rs.length-1].year)},${y(Math.max(minV,0))}`} fill="url(#rsFill2)" />}
        {po.length > 1 && <polygon points={`${x(po[0].year)},${y(Math.max(minV,0))} ${poPath} ${x(po[po.length-1].year)},${y(Math.max(minV,0))}`} fill="url(#poFill2)" />}
        {rs.length > 1 && <polyline points={rsPath} fill="none" stroke="#5DFDCB" strokeWidth="3.5" strokeLinejoin="round" strokeLinecap="round" />}
        {po.length > 1 && <polyline points={poPath} fill="none" stroke="#F59E0B" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" strokeDasharray="8,4" />}

        {/* Interactive RS dots */}
        {rs.map((r,idx) => (
          <g key={`rs${r.year}`} onMouseEnter={()=>setHoveredPt({type:'RS',r})} onMouseLeave={()=>setHoveredPt(null)} style={{cursor:'pointer'}}>
            <circle cx={x(r.year)} cy={y(r.reign)} r="16" fill="transparent" />
            <circle cx={x(r.year)} cy={y(r.reign)} r={hoveredPt?.r?.year===r.year&&hoveredPt?.type==='RS'?7:5} fill="#5DFDCB" stroke="#08090A" strokeWidth="2" style={{transition:'r 0.1s'}} />
          </g>
        ))}
        {po.map(r => (
          <g key={`po${r.year}`} onMouseEnter={()=>setHoveredPt({type:'PO',r})} onMouseLeave={()=>setHoveredPt(null)} style={{cursor:'pointer'}}>
            <circle cx={x(r.year)} cy={y(r.reign)} r="16" fill="transparent" />
            <circle cx={x(r.year)} cy={y(r.reign)} r={hoveredPt?.r?.year===r.year&&hoveredPt?.type==='PO'?7:4.5} fill="#F59E0B" stroke="#08090A" strokeWidth="2" style={{transition:'r 0.1s'}} />
          </g>
        ))}

        {/* Peak labels */}
        {/* Hover tooltip */}
        {hoveredPt && (() => {
          const r = hoveredPt.r;
          const tx = Math.max(140, Math.min(W-140, x(r.year)));
          const ty = y(r.reign) < H/2 ? y(r.reign)+24 : y(r.reign)-62;
          const col = hoveredPt.type==='RS'?'#5DFDCB':'#F59E0B';
          const ts = (r.tsp||0) <= 1 ? ((r.tsp||0)*100).toFixed(0) : (r.tsp||0).toFixed(0);
          return (
            <g>
              <rect x={tx-130} y={ty} width="260" height="54" rx="8" fill="#08090A" opacity="0.96" />
              <text x={tx} y={ty+20} textAnchor="middle" fill={col} fontSize="17" fontWeight="900" fontFamily="var(--font-mono)">
                {r.year}-{String(r.year+1).slice(-2)} {hoveredPt.type} — {r.reign>=0?'+':''}{r.reign.toFixed(1)}
              </text>
              <text x={tx} y={ty+42} textAnchor="middle" fill="#8789C0" fontSize="15" fontWeight="800" fontFamily="var(--font-mono)">
                {(r.pts||0).toFixed(1)}p / {(r.reb||0).toFixed(1)}r / {(r.ast||0).toFixed(1)}a  {ts}% TS
              </text>
            </g>
          );
        })()}

        {/* Year labels */}
        {allYears.filter((_,i) => i % Math.max(1, Math.floor(allYears.length/14))===0 || i===allYears.length-1).map(yr => (
          <text key={yr} x={x(yr)} y={H-10} textAnchor="middle" fill="#8789C0" fontSize="13" fontWeight="800" fontFamily="var(--font-mono)">{"'" + String(yr+1).slice(-2)}</text>
        ))}

        {/* Legend */}
        <rect x={W-PAD.r-210} y={6} width="204" height="32" rx="8" fill="rgba(255,255,255,0.92)" stroke="rgba(135,137,192,0.2)" strokeWidth="1" />
        <circle cx={W-PAD.r-192} cy={22} r="5.5" fill="#5DFDCB" stroke="#08090A" strokeWidth="1" />
        <text x={W-PAD.r-182} y={27} fill="#08090A" fontSize="13" fontWeight="800">Reg Season</text>
        <line x1={W-PAD.r-84} y1={22} x2={W-PAD.r-70} y2={22} stroke="#F59E0B" strokeWidth="2.5" strokeDasharray="4,2" />
        <circle cx={W-PAD.r-62} cy={22} r="5" fill="#F59E0B" stroke="#08090A" strokeWidth="1" />
        <text x={W-PAD.r-52} y={27} fill="#08090A" fontSize="13" fontWeight="800">Playoffs</text>
      </svg>
    </div>
  );
}

/* ═══ Skill Radar Chart — Interactive ═══ */
function SkillRadar({ data, label }) {
  const [hovered, setHovered] = useState(null);
  const SIZE = 520, CX = SIZE/2, CY = SIZE/2 + 8, R = 145;
  const N = data.length;
  const angles = data.map((_, i) => (Math.PI * 2 * i / N) - Math.PI / 2);
  const point = (angle, pct) => ({ x: CX + Math.cos(angle) * R * (pct / 100), y: CY + Math.sin(angle) * R * (pct / 100) });
  const rings = [25, 50, 75, 100];
  const polyPts = data.map((d, i) => { const p = point(angles[i], Math.max(d.value, 5)); return `${p.x},${p.y}`; }).join(' ');

  const tierColor = v => { if(v>=95)return'#065f46';if(v>=85)return'#10B981';if(v>=70)return'#0e7452';if(v>=50)return'#8789C0';return'#b0b4d0'; };
  const dotColor = v => { if(v>=90)return'#5DFDCB';if(v>=75)return'#7CC6FE';if(v>=50)return'#8789C0';return'#b0b4d0'; };

  return (
    <div className="radar-container">
      <svg viewBox={`0 0 ${SIZE} ${SIZE}`} className="radar-svg">
        <defs>
          <radialGradient id="rf" cx="50%" cy="50%" r="50%"><stop offset="0%" stopColor="#5DFDCB" stopOpacity="0.3"/><stop offset="100%" stopColor="#5DFDCB" stopOpacity="0.05"/></radialGradient>
          <filter id="gl"><feGaussianBlur stdDeviation="4" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
        </defs>

        <polygon points={angles.map(a=>{const p=point(a,100);return`${p.x},${p.y}`;}).join(' ')} fill="rgba(135,137,192,0.03)" />
        {rings.map(pct => (
          <polygon key={pct} points={angles.map(a=>{const p=point(a,pct);return`${p.x},${p.y}`;}).join(' ')}
            fill="none" stroke={pct===50?'rgba(135,137,192,0.35)':'rgba(135,137,192,0.12)'}
            strokeWidth={pct===50?1.5:1} strokeDasharray={pct===50?'5,4':'none'} />
        ))}
        {[50,75,100].map(pct => (
          <text key={pct} x={CX+5} y={CY-R*pct/100+15} fill="#b0b4d0" fontSize="11" fontWeight="700" fontFamily="var(--font-mono)">{pct}th</text>
        ))}
        {angles.map((a,i) => { const p=point(a,100); return <line key={i} x1={CX} y1={CY} x2={p.x} y2={p.y} stroke="rgba(135,137,192,0.08)" strokeWidth="1" />; })}

        <polygon points={polyPts} fill="url(#rf)" stroke="#5DFDCB" strokeWidth="3" strokeLinejoin="round" filter="url(#gl)" />

        {data.map((d,i) => {
          const p = point(angles[i], Math.max(d.value, 5));
          const isHov = hovered === i;
          return (
            <g key={i} onMouseEnter={()=>setHovered(i)} onMouseLeave={()=>setHovered(null)} style={{cursor:'pointer'}}>
              <circle cx={p.x} cy={p.y} r="28" fill="transparent" />
              {(d.value>=90||isHov) && <circle cx={p.x} cy={p.y} r={isHov?18:13} fill="rgba(93,253,203,0.2)" />}
              <circle cx={p.x} cy={p.y} r={isHov?9:6.5} fill={dotColor(d.value)} stroke="#08090A" strokeWidth="2" style={{transition:'all 0.12s'}} />
            </g>
          );
        })}

        {data.map((d,i) => {
          const labelR = R + 52;
          const lx = CX + Math.cos(angles[i]) * labelR;
          const ly = CY + Math.sin(angles[i]) * labelR;
          const isTop = Math.abs(angles[i]+Math.PI/2)<0.3;
          const isBottom = Math.abs(angles[i]-Math.PI/2)<0.3;
          const isLeft = angles[i]>Math.PI/2||angles[i]<-Math.PI/2;
          const anchor = isTop||isBottom?'middle':isLeft?'end':'start';
          const isHov = hovered === i;
          return (
            <g key={`l${i}`} opacity={hovered===null||isHov?1:0.4} style={{transition:'opacity 0.15s'}}>
              <text x={lx} y={ly-10} textAnchor={anchor} fill="#08090A" fontSize="16" fontWeight="900">{d.label}</text>
              <text x={lx} y={ly+10} textAnchor={anchor} fill={tierColor(d.value)} fontSize="18" fontWeight="900" fontFamily="var(--font-mono)">{d.value>=100?'99th+':d.value+'th'}</text>
              <text x={lx} y={ly+28} textAnchor={anchor} fill="#8789C0" fontSize="13" fontWeight="800" fontFamily="var(--font-mono)">{d.raw}</text>
            </g>
          );
        })}

        {hovered!==null && (()=>{
          const d=data[hovered]; const p=point(angles[hovered],Math.max(d.value,5));
          const tx=Math.max(110,Math.min(SIZE-110,p.x));
          const ty=p.y<CY?p.y+38:p.y-56;
          return (
            <g>
              <rect x={tx-100} y={ty-16} width="200" height="44" rx="8" fill="#08090A" opacity="0.96" />
              <text x={tx} y={ty+2} textAnchor="middle" fill="#fff" fontSize="16" fontWeight="900">{d.label}</text>
              <text x={tx} y={ty+20} textAnchor="middle" fill="#5DFDCB" fontSize="16" fontWeight="900" fontFamily="var(--font-mono)">{d.value >= 100 ? '99th+' : d.value + 'th'} — {d.raw}</text>
            </g>
          );
        })()}
      </svg>
    </div>
  );
}

export default function Players({ initialPlayer, onCompare }) {
  const { data: seasons, loading } = useAllSeasons();
  const [selected, setSelected] = useState(initialPlayer || null);
  const [search, setSearch] = useState('');
  useEffect(() => { if (initialPlayer) setSelected(initialPlayer); }, [initialPlayer]);

  const allNames = useMemo(() => {
    if (!seasons) return [];
    return [...new Set(seasons.filter(r => r.type === 'RS').map(r => r.name))].sort();
  }, [seasons]);

  const searchResults = useMemo(() => {
    if (!search.trim() || !allNames.length) return [];
    return fuzzySearch(search, allNames, 10);
  }, [search, allNames]);

  // Compute all-player peak rankings from seasons.json for rank badges
  const playerPeaks = useMemo(() => {
    if (!seasons) return {};
    const peaks = {};
    for (const s of seasons) {
      if (s.type !== 'RS') continue;
      if (!peaks[s.name] || s.reign > peaks[s.name]) peaks[s.name] = s.reign;
    }
    const sorted = Object.entries(peaks).sort((a, b) => b[1] - a[1]);
    const ranks = {};
    sorted.forEach(([name], i) => { ranks[name] = i + 1; });
    return ranks;
  }, [seasons]);

  const featuredData = useMemo(() => {
    if (!seasons) return [];
    return FEATURED.map(name => {
      const rs = seasons.filter(r => r.name === name && r.type === 'RS').sort((a, b) => a.year - b.year);
      if (!rs.length) return null;
      const peak = rs.reduce((a, b) => a.reign > b.reign ? a : b);
      const teams = [...new Set(rs.map(r => r.team))];
      const eras = [...new Set(rs.map(r => r.era))];
      const n = rs.length;
      return {
        name,
        teams,
        eras,
        ys: rs[0].year,
        ye: rs[rs.length - 1].year,
        rp: peak.reign,
        rpo: peak.reign_off,
        rpd: peak.reign_def,
        ap: (rs.reduce((s, r) => s + (r.pts || 0), 0) / n).toFixed(1),
        ar: (rs.reduce((s, r) => s + (r.reb || 0), 0) / n).toFixed(1),
        aa: (rs.reduce((s, r) => s + (r.ast || 0), 0) / n).toFixed(1),
        rank: playerPeaks[name] || '—',
        _spark: rs.map(r => r.reign),
      };
    }).filter(Boolean);
  }, [seasons, playerPeaks]);

  if (loading) return <Loading message="Loading player data..." />;
  if (selected) return <PlayerProfile name={selected} seasons={seasons} onBack={() => setSelected(null)} onCompare={onCompare} />;

  return (
    <div className="pl">
      <div className="pl-wrap">
        <div className="pl-header">
          <h1 className="pl-title">Player Profiles</h1>
          <p className="pl-desc">Career arcs, peak seasons, and REIGN breakdowns for 3,484 players across 80 years</p>
        </div>
        <div className="pl-search-area">
          <div className="pl-search-wrap">
            <svg className="pl-search-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.35-4.35"/></svg>
            <input className="pl-search" type="text" placeholder="Search any player..." value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          {searchResults.length > 0 && (
            <div className="pl-results">
              {searchResults.map(name => (
                <button key={name} className="pl-result" onClick={() => { setSelected(name); setSearch(''); }}>{name}</button>
              ))}
            </div>
          )}
        </div>
        <div className="pl-featured">
          <h2 className="pl-section-title">Featured Players</h2>
          <div className="pl-grid">
            {featuredData.map(c => {
              const eraColor = c.eras?.[0] === 'Modern' ? '#10B981' : c.eras?.[0] === 'Classic' ? '#2563EB' : c.eras?.[0] === 'Legacy' ? '#D97706' : '#8789C0';
              const tier = c.rp >= 25 ? 'S' : c.rp >= 20 ? 'A' : c.rp >= 15 ? 'B' : c.rp >= 10 ? 'C' : 'D';
              const tierColor = tier === 'S' ? '#065f46' : tier === 'A' ? '#10B981' : tier === 'B' ? '#D97706' : tier === 'C' ? '#2563EB' : '#8789C0';
              return (
              <button key={c.name} className="pl-card" onClick={() => setSelected(c.name)} style={{borderTopColor: eraColor}}>
                <div className="pc-top">
                  <div className="pc-initials" style={{background: eraColor}}>
                    {c.name.split(' ').map(w => w[0]).join('').slice(0, 2)}
                  </div>
                  <div className="pc-info">
                    <div className="pc-name">{c.name}</div>
                    <div className="pc-meta">{c.teams?.slice(0,3).join(' · ')} · {c.ys}–{String(c.ye+1).slice(-2)}</div>
                  </div>
                  <div className="pc-tier" style={{background: tierColor}}>{tier}</div>
                </div>
                <div className="pc-body">
                  <div className="pc-numbers">
                    <div className="pc-reign"><span className="pc-val">{formatReign(c.rp)}</span><span className="pc-label">Peak REIGN</span></div>
                    <div className="pc-split">
                      <div><span className="pc-off">{formatReign(c.rpo)}</span><span className="pc-sub">OFF</span></div>
                      <div><span className="pc-def">{formatReign(c.rpd)}</span><span className="pc-sub">DEF</span></div>
                    </div>
                  </div>
                  <Sparkline values={c._spark} w={110} h={36} />
                </div>
                <div className="pc-foot">
                  <div className="pc-box-stats">
                    {c.ap && <span>{c.ap}p</span>}{c.ar && <span>{c.ar}r</span>}{c.aa && <span>{c.aa}a</span>}
                  </div>
                  <div className="pc-rank-badge">#{c.rank}</div>
                </div>
              </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

function PlayerProfile({ name, seasons, onBack, onCompare }) {
  const [tableMode, setTableMode] = useState('rs'); // rs | po | rs-clutch | po-clutch
  const [radarMode, setRadarMode] = useState('peak'); // peak or career
  const { data: awards } = useJSON('/data/awards.json');
  const playerAwards = useMemo(() => awards?.find(a => a.name === name) || null, [awards, name]);
  const rs = useMemo(() => seasons?.filter(r => r.name === name && r.type === 'RS').sort((a,b) => a.year - b.year) || [], [name, seasons]);
  const po = useMemo(() => seasons?.filter(r => r.name === name && r.type === 'PO').sort((a,b) => a.year - b.year) || [], [name, seasons]);
  if (!rs.length) return <div className="pl"><div className="pl-wrap"><p>No data for {name}</p></div></div>;

  const peak = rs.reduce((a,b) => a.reign > b.reign ? a : b);
  const peakPO = po.length ? po.reduce((a,b) => a.reign > b.reign ? a : b) : null;
  const avgReign = rs.reduce((s,r) => s + r.reign, 0) / rs.length;
  const teams = [...new Set(rs.map(r => r.team))];
  const eras = [...new Set(rs.map(r => r.era))];
  const years = `${rs[0].year}–${String(rs[rs.length-1].year+1).slice(-2)}`;
  const heatRows = [...new Set([...rs, ...po].map(r => r.year))].sort().map(y => ({ year: y, rs: rs.find(r => r.year === y), po: po.find(r => r.year === y) }));

  // Compute skill profile for radar chart
  const allRS = useMemo(() => seasons?.filter(r => r.type === 'RS' && (r.min || 0) > 15) || [], [seasons]);
  const radarData = useMemo(() => {
    if (!allRS.length) return null;
    const src = radarMode === 'peak' ? peak : {
      pts: rs.reduce((s,r) => s + (r.pts||0), 0) / rs.length,
      tsp: rs.reduce((s,r) => s + (r.tsp||0), 0) / rs.length,
      ast: rs.reduce((s,r) => s + (r.ast||0), 0) / rs.length,
      reb: rs.reduce((s,r) => s + (r.reb||0), 0) / rs.length,
      reign_def: rs.reduce((s,r) => s + r.reign_def, 0) / rs.length,
      reign: rs.reduce((s,r) => s + r.reign, 0) / rs.length,
      era: rs[0]?.era,
    };

    const pctile = (val, key) => {
      const vals = allRS.map(r => r[key] || 0).filter(v => v !== 0).sort((a,b) => a - b);
      if (!vals.length || val == null) return 50;
      const below = vals.filter(v => v <= val).length;
      return Math.min(99, Math.round((below / vals.length) * 100));
    };

    const scoring = pctile(src.pts, 'pts');
    let tsp = src.tsp || 0;
    const efficiency = pctile(tsp, 'tsp');
    const playmaking = pctile(src.ast, 'ast');
    const rebounding = pctile(src.reb, 'reb');
    const defense = pctile(src.reign_def, 'reign_def');

    const categories = [
      { label: 'Scoring', value: scoring, raw: fS(src.pts) + ' PPG' },
      { label: 'Efficiency', value: efficiency, raw: fP(tsp) + '% TS' },
      { label: 'Playmaking', value: playmaking, raw: fS(src.ast) + ' APG' },
      { label: 'Rebounding', value: rebounding, raw: fS(src.reb) + ' RPG' },
      { label: 'Defense', value: defense, raw: (src.reign_def >= 0 ? '+' : '') + src.reign_def?.toFixed?.(1) + ' DEF' },
    ];

    return categories;
  }, [allRS, peak, rs, radarMode]);

  // Clutch heatmap data — year by year RS + PO
  const clutchHeatmap = useMemo(() => {
    const rsWithClutch = rs.filter(r => r.clutch_pm != null);
    const poWithClutch = po.filter(r => r.po_clutch_pm != null);
    if (!rsWithClutch.length && !poWithClutch.length) return null;

    const allYears = [...new Set([...rsWithClutch.map(r=>r.year), ...poWithClutch.map(r=>r.year)])].sort();
    
    // Compute percentiles from all RS seasons with clutch data
    const allClutchRS = allRS.filter(r => r.clutch_pm != null);
    const pctile = (val, arr) => {
      if (val == null || !arr.length) return null;
      return Math.min(99, Math.round(arr.filter(v => v <= val).length / arr.length * 100));
    };
    const pmAll = allClutchRS.map(r=>r.clutch_pm).sort((a,b)=>a-b);
    const ptsAll = allClutchRS.map(r=>r.clutch_pts).filter(v=>v>0).sort((a,b)=>a-b);
    const wpctAll = allClutchRS.map(r=>r.clutch_wpct).filter(v=>v!=null).sort((a,b)=>a-b);

    const rows = allYears.map(yr => {
      const rsSeason = rsWithClutch.find(r => r.year === yr);
      const poSeason = poWithClutch.find(r => r.year === yr);
      // Get this player's regular TS% for comparison
      const regSeason = rs.find(r => r.year === yr);
      const regTS = regSeason?.tsp || 0;
      const regTSdisplay = regTS <= 1 ? regTS * 100 : regTS;
      
      return {
        year: yr,
        rs: rsSeason ? {
          ppg: rsSeason.clutch_pts,
          pm: rsSeason.clutch_pm,
          ts: rsSeason.clutch_ts ? (rsSeason.clutch_ts * 100).toFixed(0) : null,
          tsDiff: rsSeason.clutch_ts_vs_lg != null ? rsSeason.clutch_ts_vs_lg.toFixed(0) : null,
          wpct: rsSeason.clutch_wpct ? (rsSeason.clutch_wpct * 100).toFixed(0) : null,
          gp: rsSeason.clutch_gp,
          pm_pct: pctile(rsSeason.clutch_pm, pmAll),
          pts_pct: pctile(rsSeason.clutch_pts, ptsAll),
          wpct_pct: pctile(rsSeason.clutch_wpct, wpctAll),
        } : null,
        po: poSeason ? {
          ppg: poSeason.po_clutch_pts,
          pm: poSeason.po_clutch_pm,
          ts: poSeason.po_clutch_ts ? (poSeason.po_clutch_ts * 100).toFixed(0) : null,
          tsDiff: poSeason.po_clutch_ts_vs_lg != null ? poSeason.po_clutch_ts_vs_lg.toFixed(0) : null,
          wpct: poSeason.po_clutch_wpct ? (poSeason.po_clutch_wpct * 100).toFixed(0) : null,
          gp: poSeason.po_clutch_gp,
          pm_pct: pctile(poSeason.po_clutch_pm, pmAll),
          pts_pct: pctile(poSeason.po_clutch_pts, ptsAll),
          wpct_pct: pctile(poSeason.po_clutch_wpct, wpctAll),
        } : null,
      };
    });

    // Career averages
    const avgRS = rsWithClutch.length ? {
      ppg: (rsWithClutch.reduce((s,r)=>s+(r.clutch_pts||0),0)/rsWithClutch.length).toFixed(1),
      pm: (rsWithClutch.reduce((s,r)=>s+(r.clutch_pm||0),0)/rsWithClutch.length).toFixed(1),
      wpct: rsWithClutch.filter(r=>r.clutch_wpct).length ? ((rsWithClutch.reduce((s,r)=>s+(r.clutch_wpct||0),0)/rsWithClutch.filter(r=>r.clutch_wpct).length)*100).toFixed(0) : null,
      n: rsWithClutch.length,
    } : null;
    const avgPO = poWithClutch.length ? {
      ppg: (poWithClutch.reduce((s,r)=>s+(r.po_clutch_pts||0),0)/poWithClutch.length).toFixed(1),
      pm: (poWithClutch.reduce((s,r)=>s+(r.po_clutch_pm||0),0)/poWithClutch.length).toFixed(1),
      wpct: poWithClutch.filter(r=>r.po_clutch_wpct).length ? ((poWithClutch.reduce((s,r)=>s+(r.po_clutch_wpct||0),0)/poWithClutch.filter(r=>r.po_clutch_wpct).length)*100).toFixed(0) : null,
      n: poWithClutch.length,
    } : null;

    return { rows, avgRS, avgPO };
  }, [rs, po, allRS]);

  return (
    <div className="pl">
      <div className="pl-wrap">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <button className="prof-back" onClick={onBack}>← All Players</button>
          {onCompare && (
            <button className="prof-compare-btn" onClick={() => onCompare(name)}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M16 3h5v5M8 3H3v5M16 21h5v-5M8 21H3v-5"/></svg>
              Compare
            </button>
          )}
        </div>
        <div className="prof-hero">
          <div className="prof-info">
            <h1 className="prof-name">{name}</h1>
            <div className="prof-meta">
              {teams.join(' · ')} · {years} · {rs.length} RS{po.length > 0 && ` + ${po.length} PO`} seasons
              <span className="prof-eras">{eras.map(e => <span key={e} className={`et e-${e[0].toLowerCase()}`}>{e}</span>)}</span>
            </div>
          </div>
          <div className="prof-stats">
            <div className="prof-stat hero-stat">
              <span className="ps-val ps-reign">{formatReign(peak.reign)}</span>
              <span className="ps-label">Peak REIGN</span>
              <span className="ps-sub">{peak.year}-{String(peak.year+1).slice(-2)}</span>
            </div>
            <div className="prof-stat"><span className="ps-val ps-off">{formatReign(peak.reign_off)}</span><span className="ps-label">Peak OFF</span></div>
            <div className="prof-stat"><span className="ps-val ps-def">{formatReign(peak.reign_def)}</span><span className="ps-label">Peak DEF</span></div>
            <div className="prof-stat"><span className="ps-val ps-avg">{formatReign(avgReign)}</span><span className="ps-label">Career Avg</span></div>
            {peakPO && <div className="prof-stat"><span className="ps-val ps-po">{formatReign(peakPO.reign)}</span><span className="ps-label">Peak PO</span><span className="ps-sub">{peakPO.year}-{String(peakPO.year+1).slice(-2)}</span></div>}
          </div>
        </div>

        {/* Trophy Shelf */}
        {playerAwards && (playerAwards.mvp > 0 || playerAwards.fmvp > 0 || playerAwards.dpoy > 0 || playerAwards.all_nba_total > 0 || playerAwards.all_star > 0) && (
          <div className="prof-awards">
            {playerAwards.mvp > 0 && <div className="prof-award"><span className="prof-award-icon">🏆</span><span className="prof-award-count">{playerAwards.mvp}×</span><span className="prof-award-label">MVP</span></div>}
            {playerAwards.fmvp > 0 && <div className="prof-award"><span className="prof-award-icon">🏆</span><span className="prof-award-count">{playerAwards.fmvp}×</span><span className="prof-award-label">Finals MVP</span></div>}
            {playerAwards.dpoy > 0 && <div className="prof-award"><span className="prof-award-icon">🛡️</span><span className="prof-award-count">{playerAwards.dpoy}×</span><span className="prof-award-label">DPOY</span></div>}
            {playerAwards.roy > 0 && <div className="prof-award"><span className="prof-award-icon">🌟</span><span className="prof-award-count">1×</span><span className="prof-award-label">ROY</span></div>}
            {playerAwards.all_nba_total > 0 && <div className="prof-award"><span className="prof-award-icon">⭐</span><span className="prof-award-count">{playerAwards.all_nba_total}×</span><span className="prof-award-label">All-NBA</span></div>}
            {playerAwards.all_def_total > 0 && <div className="prof-award"><span className="prof-award-icon">🛡️</span><span className="prof-award-count">{playerAwards.all_def_total}×</span><span className="prof-award-label">All-Def</span></div>}
            {playerAwards.all_star > 0 && <div className="prof-award"><span className="prof-award-icon">⭐</span><span className="prof-award-count">{playerAwards.all_star}×</span><span className="prof-award-label">All-Star</span></div>}
            {playerAwards.mvp_share_peak > 0 && <div className="prof-award"><span className="prof-award-icon">📊</span><span className="prof-award-count">{playerAwards.mvp_share_peak.toFixed(3)}</span><span className="prof-award-label">Peak MVP Share</span></div>}
          </div>
        )}

        {/* Skill Profile Radar */}
        {radarData && (
          <div className="prof-section">
            <div className="prof-section-header">
              <h2 className="prof-section-title">Skill Profile</h2>
              <div className="st-toggle">
                <button className={`st-btn${radarMode==='peak'?' on':''}`} onClick={()=>setRadarMode('peak')}>Peak Season</button>
                <button className={`st-btn${radarMode==='career'?' on':''}`} onClick={()=>setRadarMode('career')}>Career Avg</button>
              </div>
            </div>
            <SkillRadar data={radarData} label={radarMode === 'peak' ? `${peak.year}-${String(peak.year+1).slice(-2)}` : 'Career'} />
          </div>
        )}

        <div className="prof-section"><h2 className="prof-section-title">Career Arc</h2><CareerChart rs={rs} po={po} /></div>

        <div className="prof-section">
          <h2 className="prof-section-title">Season Heatmap</h2>
          <div className="heatmap-scroll">
            <table className="heatmap">
              <thead><tr>
                <th className="hm-yr">Season</th><th className="hm-era">Era</th>
                <th className="hm-cell">RS REIGN</th><th className="hm-cell">RS OFF</th><th className="hm-cell">RS DEF</th>
                <th className="hm-div"></th>
                <th className="hm-cell">PO REIGN</th><th className="hm-cell">PO OFF</th><th className="hm-cell">PO DEF</th>
              </tr></thead>
              <tbody>{heatRows.map(({ year, rs: r, po: p }) => (
                <tr key={year}>
                  <td className="hm-yr">{year}-{String(year+1).slice(-2)}</td>
                  <td className="hm-era"><span className={`et e-${((r||p)?.era||'')[0]?.toLowerCase()}`}>{((r||p)?.era||'')[0]}</span></td>
                  <HeatCell v={r?.reign} /><HeatCell v={r?.reign_off} type="off" /><HeatCell v={r?.reign_def} type="def" />
                  <td className="hm-div"></td>
                  <HeatCell v={p?.reign} /><HeatCell v={p?.reign_off} type="off" /><HeatCell v={p?.reign_def} type="def" />
                </tr>
              ))}</tbody>
            </table>
          </div>
        </div>

        <div className="prof-section">
          <div className="prof-section-header">
            <h2 className="prof-section-title">Season Stats</h2>
          </div>
          <div className="st-toggles">
            <div className="st-toggle">
              <button className={`st-btn${tableMode==='rs'||tableMode==='rs-clutch'?' on':''}`} onClick={()=>setTableMode(tableMode.includes('clutch')?'rs-clutch':'rs')}>Regular Season</button>
              {po.length > 0 && <button className={`st-btn${tableMode==='po'||tableMode==='po-clutch'?' on':''}`} onClick={()=>setTableMode(tableMode.includes('clutch')?'po-clutch':'po')}>Playoffs</button>}
            </div>
            <div className="st-toggle">
              <button className={`st-btn${!tableMode.includes('clutch')?' on':''}`} onClick={()=>setTableMode(tableMode.includes('po')?'po':'rs')}>Standard Stats</button>
              {rs.some(r=>r.clutch_pm!=null) && <button className={`st-btn${tableMode.includes('clutch')?' on':''}`} onClick={()=>setTableMode(tableMode.includes('po')?'po-clutch':'rs-clutch')}>Clutch Stats</button>}
            </div>
          </div>
          {tableMode === 'rs-clutch' || tableMode === 'po-clutch' ? (
            <ClutchTable rows={tableMode === 'po-clutch' ? po : rs} isPO={tableMode === 'po-clutch'} />
          ) : (
            <SeasonTable rows={tableMode === 'po' ? po : rs} />
          )}
        </div>
      </div>
    </div>
  );
}

function HeatCell({ v, type }) {
  if (v == null) return <td className="hm-cell hm-na">—</td>;
  const bg = type === 'off' ? offBg(v) : type === 'def' ? defBg(v) : reignBg(v);
  const color = needsDark(bg) ? '#08090A' : '#fff';
  return <td className="hm-cell" style={{ background: bg, color }}><span className="hm-val">{v >= 0 ? '+' : ''}{v.toFixed(1)}</span></td>;
}
function reignBg(v) { if(v>=25)return'#065f46';if(v>=20)return'#10B981';if(v>=15)return'#5DFDCB';if(v>=10)return'#a7f3d0';if(v>=5)return'#d1fae5';if(v>=0)return'#f0fdf4';return'#fee2e2'; }
function offBg(v) { if(v>=18)return'#92400e';if(v>=14)return'#D97706';if(v>=10)return'#fbbf24';if(v>=6)return'#fde68a';if(v>=0)return'#fef9c3';return'#fee2e2'; }
function defBg(v) { if(v>=8)return'#1e40af';if(v>=5)return'#3b82f6';if(v>=3)return'#7CC6FE';if(v>=0)return'#dbeafe';return'#fee2e2'; }
function needsDark(bg) { return['#5DFDCB','#a7f3d0','#d1fae5','#f0fdf4','#fde68a','#fef9c3','#fbbf24','#dbeafe','#7CC6FE','#fee2e2'].includes(bg); }

function ClutchTable({ rows, isPO }) {
  const [sortKey, setSortKey] = useState(null);
  const [sortDir, setSortDir] = useState('desc');
  const filtered = isPO
    ? rows.filter(r => r.po_clutch_pm != null).sort((a,b) => a.year - b.year)
    : rows.filter(r => r.clutch_pm != null).sort((a,b) => a.year - b.year);
  
  if (!filtered.length) return <p style={{color:'#8789C0',padding:'16px 0'}}>No clutch data available for this view</p>;

  const g = (r, field) => isPO ? r[`po_clutch_${field}`] : r[`clutch_${field}`];
  const handleSort = (key) => { if (sortKey===key) setSortDir(d=>d==='desc'?'asc':'desc'); else { setSortKey(key); setSortDir('desc'); } };
  const sorted = sortKey ? [...filtered].sort((a,b) => { let av=sortKey==='year'?a.year:g(a,sortKey)??-999, bv=sortKey==='year'?b.year:g(b,sortKey)??-999; return sortDir==='desc'?(bv>av?1:-1):(av>bv?1:-1); }) : filtered;
  const SH = ({label,k,cls}) => <th className={cls||''} onClick={()=>handleSort(k)} style={{cursor:'pointer',userSelect:'none'}}>{label}{sortKey===k?(sortDir==='desc'?' ▼':' ▲'):''}</th>;

  return (
    <div className="st-scroll"><table className="st">
      <thead><tr>
        <SH label="Season" k="year" /><SH label="Team" k="team" />
        <SH label="PPG" k="pts" cls="st-r" /><SH label="+/−" k="pm" cls="st-r" />
        <SH label="RPG" k="reb" cls="st-r" /><SH label="APG" k="ast" cls="st-r" />
        <SH label="SPG" k="stl" cls="st-r" /><SH label="BPG" k="blk" cls="st-r" />
        <SH label="FG%" k="fgp" cls="st-r" /><SH label="3P%" k="fg3p" cls="st-r" /><SH label="FT%" k="ftp" cls="st-r" />
        <SH label="TS%" k="ts" cls="st-r" /><th className="st-r st-lg">Lg Avg</th><SH label="Rel TS%" k="ts_vs_lg" cls="st-r st-clutch-diff" />
        <SH label="W%" k="wpct" cls="st-r" /><SH label="GP" k="gp" cls="st-r" />
      </tr></thead>
      <tbody>{sorted.map((r, i) => {
        const pm = g(r,'pm');
        const pts = g(r,'pts');
        const ts = g(r,'ts');
        const lgTs = g(r,'lg_ts');
        const vLg = g(r,'ts_vs_lg');
        const wpct = g(r,'wpct');
        const gp = g(r,'gp');
        const ast = g(r,'ast');
        const reb = g(r,'reb');
        const stl = g(r,'stl');
        const blk = g(r,'blk');
        const fgp = g(r,'fgp');
        const fg3p = g(r,'fg3p');
        const ftp = g(r,'ftp');
        return (
          <tr key={i} className="st-row">
            <td className="st-yr">{r.year}-{String(r.year+1).slice(-2)}</td>
            <td className="st-tm">{r.team}</td>
            <td className="st-r">{fS(pts)}</td>
            <ClutchPMCell v={pm} />
            <td className="st-r">{fS(reb)}</td>
            <td className="st-r">{fS(ast)}</td>
            <td className="st-r">{fS(stl)}</td>
            <td className="st-r">{fS(blk)}</td>
            <td className="st-r">{fgp != null ? (fgp * 100).toFixed(1) : '—'}</td>
            <td className="st-r">{fg3p != null ? (fg3p * 100).toFixed(1) : '—'}</td>
            <td className="st-r">{ftp != null ? (ftp * 100).toFixed(1) : '—'}</td>
            <td className="st-r">{ts ? (ts * 100).toFixed(0) + '%' : '—'}</td>
            <td className="st-r st-lg-val">{lgTs ? lgTs.toFixed(0) + '%' : '—'}</td>
            <TsDiffCell v={vLg != null ? vLg.toFixed(0) : null} />
            <td className="st-r">{wpct ? (wpct * 100).toFixed(0) + '%' : '—'}</td>
            <td className="st-r">{gp ?? '—'}</td>
          </tr>
        );
      })}</tbody>
    </table></div>
  );
}

function ClutchPMCell({ v }) {
  if (v == null) return <td className="st-r">—</td>;
  const bg = v >= 4 ? '#065f46' : v >= 2.5 ? '#10B981' : v >= 1 ? '#5DFDCB' : v >= 0 ? '#a7f3d0' : v >= -1 ? '#fee2e2' : '#fca5a5';
  const color = (bg === '#5DFDCB' || bg === '#a7f3d0' || bg === '#fee2e2' || bg === '#fca5a5') ? '#08090A' : '#fff';
  return <td className="st-r" style={{background: bg, color, fontWeight: 900}}>{v >= 0 ? '+' : ''}{Number(v).toFixed(1)}</td>;
}

function SeasonTable({ rows }) {
  const [sortKey, setSortKey] = useState(null);
  const [sortDir, setSortDir] = useState('desc');
  
  if (!rows.length) return <p style={{color:'#8789C0',padding:'16px 0'}}>No seasons available</p>;

  const handleSort = (key) => {
    if (sortKey === key) { setSortDir(d => d === 'desc' ? 'asc' : 'desc'); }
    else { setSortKey(key); setSortDir('desc'); }
  };

  const sorted = sortKey ? [...rows].sort((a, b) => {
    let av = a[sortKey] ?? -999, bv = b[sortKey] ?? -999;
    if (typeof av === 'string') av = av.toLowerCase();
    if (typeof bv === 'string') bv = bv.toLowerCase();
    return sortDir === 'desc' ? (bv > av ? 1 : -1) : (av > bv ? 1 : -1);
  }) : rows;

  const SH = ({ label, k, cls }) => (
    <th className={cls || ''} onClick={() => handleSort(k)} style={{cursor:'pointer',userSelect:'none'}}>
      {label}{sortKey === k ? (sortDir === 'desc' ? ' ▼' : ' ▲') : ''}
    </th>
  );

  return (
    <div className="st-scroll"><table className="st">
      <thead><tr>
        <SH label="Season" k="year" /><SH label="Team" k="team" /><th>Era</th>
        <SH label="REIGN" k="reign" cls="st-r" /><SH label="OFF" k="reign_off" cls="st-r st-off" /><SH label="DEF" k="reign_def" cls="st-r st-def" />
        <SH label="PPG" k="pts" cls="st-r" /><SH label="RPG" k="reb" cls="st-r" /><SH label="APG" k="ast" cls="st-r" />
        <SH label="SPG" k="stl" cls="st-r" /><SH label="BPG" k="blk" cls="st-r" />
        <SH label="FG%" k="fgp" cls="st-r" /><SH label="3P%" k="fg3p" cls="st-r" /><SH label="TS%" k="tsp" cls="st-r" />
        <SH label="GP" k="gp" cls="st-r" /><SH label="MIN" k="min" cls="st-r" />
      </tr></thead>
      <tbody>{sorted.map((r, i) => {
        const rBg = reignBg(r.reign); const rClr = needsDark(rBg) ? '#08090A' : '#fff';
        const oBg = offBg(r.reign_off); const oClr = needsDark(oBg) ? '#08090A' : '#fff';
        const dBg = defBg(r.reign_def); const dClr = needsDark(dBg) ? '#08090A' : '#fff';
        return (
        <tr key={i} className="st-row">
          <td className="st-yr">{r.year}-{String(r.year+1).slice(-2)}</td>
          <td className="st-tm">{r.team}</td>
          <td><span className={`et e-${(r.era||'')[0]?.toLowerCase()}`}>{(r.era||'')[0]}</span></td>
          <td className="st-r st-reign" style={{background: rBg, color: rClr}}>{formatReign(r.reign)}</td>
          <td className="st-r st-off-v" style={{background: oBg, color: oClr}}>{formatReign(r.reign_off)}</td>
          <td className="st-r st-def-v" style={{background: dBg, color: dClr}}>{formatReign(r.reign_def)}</td>
          <td className="st-r">{fS(r.pts)}</td><td className="st-r">{fS(r.reb)}</td><td className="st-r">{fS(r.ast)}</td>
          <td className="st-r">{fS(r.stl)}</td><td className="st-r">{fS(r.blk)}</td>
          <td className="st-r">{fP(r.fgp)}</td><td className="st-r">{fP(r.fg3p)}</td><td className="st-r">{fP(r.tsp)}</td>
          <td className="st-r">{r.gp ?? '—'}</td><td className="st-r">{fS(r.min)}</td>
        </tr>
        );
      })}</tbody>
    </table></div>
  );
}
