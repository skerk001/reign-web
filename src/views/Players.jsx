import React, { useState, useEffect, useMemo } from 'react';
import { formatReign } from '../utils/format';
import { fuzzySearch } from '../utils/fuzzySearch';
import { useJSON, useAllSeasons } from '../hooks/useData';
import { PlayerCrest, CareerSkyline } from '../components/PlayerArt';
import { Constellation, StatBloom } from '../components/PlayerCharts';
import { reignBg, offBg, defBg, relTsBg, clutchBg, textColor } from '../utils/heatmap';
import EraBadge from '../components/EraBadge';
import Loading from '../components/Loading';
import './Players.css';

function TsDiffCell({ v }) {
  if (v == null) return <td className="cf-cell cf-na">—</td>;
  const num = Number(v);
  const bg = relTsBg(num);
  const color = textColor(bg);
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
        peakTeam: peak.team,
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
          <p className="pl-desc">Career arcs, peak seasons, and REIGN breakdowns for {allNames.length ? allNames.length.toLocaleString() : '3,600+'} players across 80 years</p>
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
                  <PlayerCrest name={c.name} team={c.peakTeam} off={c.rpo} def={c.rpd} peak={c.rp} size={42} className="pc-crest" />
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
            <PlayerCrest name={name} team={peak.team} off={peak.reign_off} def={peak.reign_def} peak={peak.reign} size={60} className="prof-crest" />
            <div className="prof-idtext">
              <h1 className="prof-name">{name}</h1>
              <div className="prof-meta">
                {teams.join(' · ')} · {years} · {rs.length} RS{po.length > 0 && ` + ${po.length} PO`} seasons
                <span className="prof-eras">{eras.map(e => <EraBadge key={e} era={e} size={20} />)}</span>
              </div>
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

        <div className="prof-skyline-wrap">
          <CareerSkyline name={name} seasons={rs.map(r => ({ year: r.year, reign: r.reign, team: r.team }))} />
          <span className="prof-skyline-cap">Career Skyline · each tower a season, height = REIGN, color = team</span>
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
            <StatBloom data={radarData} />
          </div>
        )}

        <div className="prof-section"><h2 className="prof-section-title">Career Constellation</h2><Constellation rs={rs} po={po} /></div>

        <div className="prof-section">
          <div className="prof-section-header">
            <h2 className="prof-section-title">Season Log</h2>
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
            <SeasonLog rs={rs} po={po} isPO={tableMode === 'po'} />
          )}
        </div>
      </div>
    </div>
  );
}

function ClutchTable({ rows, isPO }) {
  const [sortKey, setSortKey] = useState(null);
  const [sortDir, setSortDir] = useState('desc');
  const filtered = isPO
    ? rows.filter(r => r.po_clutch_pm != null).sort((a,b) => a.year - b.year)
    : rows.filter(r => r.clutch_pm != null).sort((a,b) => a.year - b.year);
  
  if (!filtered.length) return <p style={{color:'#8789C0',padding:'16px 0'}}>No clutch data available for this view</p>;

  const g = (r, field) => isPO ? r[`po_clutch_${field}`] : r[`clutch_${field}`];
  const handleSort = (key) => { if (sortKey===key) setSortDir(d=>d==='desc'?'asc':'desc'); else { setSortKey(key); setSortDir('desc'); } };
  // year/team live on the row itself, not under the clutch_ prefix.
  const sortVal = (r) => sortKey === 'year' ? r.year : sortKey === 'team' ? (r.team || '') : (g(r, sortKey) ?? -999);
  const sorted = sortKey ? [...filtered].sort((a, b) => {
    const av = sortVal(a), bv = sortVal(b);
    if (av === bv) return 0;
    const cmp = (typeof av === 'string' || typeof bv === 'string') ? String(av).localeCompare(String(bv)) : av - bv;
    return sortDir === 'desc' ? -cmp : cmp;
  }) : filtered;
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
            <td className="st-r">{ts != null ? (ts * 100).toFixed(0) + '%' : '—'}</td>
            <td className="st-r st-lg-val">{lgTs != null ? lgTs.toFixed(0) + '%' : '—'}</td>
            <TsDiffCell v={vLg != null ? vLg.toFixed(0) : null} />
            <td className="st-r">{wpct != null ? (wpct * 100).toFixed(0) + '%' : '—'}</td>
            <td className="st-r">{gp ?? '—'}</td>
          </tr>
        );
      })}</tbody>
    </table></div>
  );
}

function ClutchPMCell({ v }) {
  if (v == null) return <td className="st-r">—</td>;
  const bg = clutchBg(v);
  const color = textColor(bg);
  return <td className="st-r" style={{background: bg, color, fontWeight: 900}}>{v >= 0 ? '+' : ''}{Number(v).toFixed(1)}</td>;
}

// Combined "Season Log": RS + PO REIGN/OFF/DEF heat cells at a glance, plus the
// box scores for the toggled type (RS or PO).
function SeasonLog({ rs, po, isPO }) {
  const years = [...new Set([...rs, ...po].map(r => r.year))].sort((a, b) => a - b);
  const rsByYr = Object.fromEntries(rs.map(r => [r.year, r]));
  const poByYr = Object.fromEntries(po.map(r => [r.year, r]));
  const hasPreTracking = years[0] < 1973;
  const hasPioneer = rs.some(r => r.era === 'Pioneer');
  const Heat = ({ v, fn }) => {
    if (v == null) return <td className="st-r sl-heat sl-na">—</td>;
    const bg = fn(v);
    return <td className="st-r sl-heat" style={{ background: bg, color: textColor(bg) }}>{v >= 0 ? '+' : ''}{v.toFixed(1)}</td>;
  };
  return (
    <>
      <p className="sl-caption">Colored cells = REIGN / OFF / DEF for <b>RS</b> and <b>PO</b> at a glance · box scores show <b>{isPO ? 'Playoffs' : 'Regular Season'}</b></p>
      {hasPreTracking && (
        <p className="sl-caption" style={{ color: '#b0b4d0' }}>
          ⚠ The NBA didn't record steals or blocks until 1973-74 — earlier seasons show “—”, not zero.
          {hasPioneer && <> Pioneer-era (1946-62) DEF has no individual defensive stats behind it; it uses a role-relative floor (see Methodology).</>}
        </p>
      )}
      <div className="st-scroll"><table className="st">
        <thead><tr>
          <th>Season</th><th>Era</th>
          <th className="st-r sl-grp-rs">RS R</th><th className="st-r sl-grp-rs">RS O</th><th className="st-r sl-grp-rs">RS D</th>
          <th className="st-r sl-grp-po">PO R</th><th className="st-r sl-grp-po">PO O</th><th className="st-r sl-grp-po">PO D</th>
          <th className="st-r">PPG</th><th className="st-r">RPG</th><th className="st-r">APG</th><th className="st-r">SPG</th><th className="st-r">BPG</th>
          <th className="st-r">FG%</th><th className="st-r">3P%</th><th className="st-r">TS%</th><th className="st-r">GP</th>
        </tr></thead>
        <tbody>{years.map(y => {
          const r = rsByYr[y], p = poByYr[y], a = isPO ? p : r, era = (r || p)?.era || '';
          return (
            <tr key={y} className="st-row">
              <td className="st-yr">{y}-{String(y + 1).slice(-2)}</td>
              <td><EraBadge era={era} size={18} /></td>
              <Heat v={r?.reign} fn={reignBg} /><Heat v={r?.reign_off} fn={offBg} /><Heat v={r?.reign_def} fn={defBg} />
              <Heat v={p?.reign} fn={reignBg} /><Heat v={p?.reign_off} fn={offBg} /><Heat v={p?.reign_def} fn={defBg} />
              <td className="st-r">{fS(a?.pts)}</td>
              <td className="st-r" title={y < 1950 ? 'Rebounds not tracked until 1950-51' : undefined}>{y < 1950 ? '—' : fS(a?.reb)}</td>
              <td className="st-r">{fS(a?.ast)}</td>
              <td className="st-r" title={y < 1973 ? 'Steals not tracked until 1973-74' : undefined}>{y < 1973 ? '—' : fS(a?.stl)}</td>
              <td className="st-r" title={y < 1973 ? 'Blocks not tracked until 1973-74' : undefined}>{y < 1973 ? '—' : fS(a?.blk)}</td>
              <td className="st-r">{fP(a?.fgp)}</td>
              <td className="st-r" title={y < 1979 ? 'No 3-point line until 1979-80' : undefined}>{y < 1979 ? '—' : fP(a?.fg3p)}</td>
              <td className="st-r">{fP(a?.tsp)}</td>
              <td className="st-r">{a?.gp ?? '—'}</td>
            </tr>
          );
        })}</tbody>
      </table></div>
    </>
  );
}
