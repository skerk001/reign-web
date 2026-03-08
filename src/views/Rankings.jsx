import { useState, useEffect, useMemo } from 'react';
import { formatReign } from '../utils/format';
import { useJSON } from '../hooks/useData';
import Loading from '../components/Loading';
import './Rankings.css';

const ERA_OPTIONS = ['All', 'Pioneer', 'Legacy', 'Classic', 'Modern'];

const Arrow = ({ active, dir }) => (
  <span className={`sort-arrow${active ? ' on' : ''}`}>{active ? (dir === 'desc' ? '▼' : '▲') : '▼'}</span>
);

function fmtPct(v) { if (v == null) return '—'; if (v <= 1) return (v * 100).toFixed(1); return Number(v).toFixed(1); }
function fmtStat(v) { if (v == null) return '—'; return Number(v).toFixed(1); }

// Heatmap color functions
function reignBg(v) { if(v==null)return'transparent';if(v>=25)return'#065f46';if(v>=20)return'#10B981';if(v>=15)return'#5DFDCB';if(v>=10)return'#a7f3d0';if(v>=5)return'#d1fae5';if(v>=0)return'#f0fdf4';return'#fee2e2'; }
function offBg(v) { if(v==null)return'transparent';if(v>=18)return'#92400e';if(v>=14)return'#D97706';if(v>=10)return'#fbbf24';if(v>=6)return'#fde68a';if(v>=0)return'#fef9c3';return'#fee2e2'; }
function defBg(v) { if(v==null)return'transparent';if(v>=8)return'#1e40af';if(v>=5)return'#3b82f6';if(v>=3)return'#7CC6FE';if(v>=0)return'#dbeafe';return'#fee2e2'; }
function clutchPMBg(v) { if(v==null)return'transparent';if(v>=4)return'#065f46';if(v>=2.5)return'#10B981';if(v>=1)return'#5DFDCB';if(v>=0)return'#a7f3d0';if(v>=-1)return'#fee2e2';return'#fca5a5'; }
function relTsBg(v) { if(v==null)return'transparent';if(v>=10)return'#065f46';if(v>=5)return'#10B981';if(v>=2)return'#5DFDCB';if(v>=0)return'#a7f3d0';if(v>=-3)return'#fee2e2';return'#fca5a5'; }
function needsDark(bg) { return['#5DFDCB','#a7f3d0','#d1fae5','#f0fdf4','#fde68a','#fef9c3','#fbbf24','#dbeafe','#7CC6FE','#fee2e2','#fca5a5','transparent'].includes(bg); }

function HeatTd({ v, bgFn, children, cls }) {
  const bg = bgFn(v);
  const color = needsDark(bg) ? '#08090A' : '#fff';
  return <td className={cls || ''} style={{background: bg, color}}>{children}</td>;
}

export default function Rankings() {
  const [seasonType, setSeasonType] = useState('RS');
  const [window, setWindow] = useState('1yr');
  const [era, setEra] = useState('All');
  const [search, setSearch] = useState('');
  const [sortCol, setSortCol] = useState('reign');
  const [sortDir, setSortDir] = useState('desc');
  const [count, setCount] = useState(100);
  const [dataView, setDataView] = useState('standard'); // standard | clutch

  // Load data based on toggles
  const seasonPath = '/data/seasons.json';
  const careerClutchPath = '/data/career_clutch.json';
  const stretchPath = window === '3yr'
    ? `/data/stretches_${seasonType.toLowerCase()}3.json`
    : window === '5yr'
    ? `/data/stretches_${seasonType.toLowerCase()}5.json`
    : window === 'career'
    ? `/data/career_avg_${seasonType.toLowerCase()}.json`
    : null;

  const { data: seasons, loading: loadSeasons } = useJSON(seasonPath);
  const { data: stretches, loading: loadStretches } = useJSON(stretchPath);
  const { data: careerClutch, loading: loadCareerClutch } = useJSON(careerClutchPath);
  const [clutchWindow, setClutchWindow] = useState('season'); // season | career
  const [clutchSort, setClutchSort] = useState('totals'); // totals | averages

  const rows = useMemo(() => {
    // Clutch view
    if (dataView === 'clutch') {
      // Career clutch view
      if (clutchWindow === 'career') {
        if (!careerClutch) return [];
        let list = [...careerClutch];
        if (era !== 'All') list = list.filter(r => r.eras && r.eras.includes(era));
        if (search.trim()) { const q = search.toLowerCase(); list = list.filter(r => r.name.toLowerCase().includes(q)); }
        const isRS = seasonType === 'RS';
        return list.map(r => ({
          name: r.name, team: (r.teams||[]).slice(0,3).join(' · '), era: r.eras?.[0],
          eras: r.eras, yr_label: `${r.ys}-${String(r.ye+1).slice(-2)}`,
          // Totals
          clutch_tot_pts: isRS ? r.rs_tot_pts : r.po_tot_pts,
          clutch_tot_pm: isRS ? r.rs_tot_pm : r.po_tot_pm,
          clutch_tot_ast: isRS ? r.rs_tot_ast : r.po_tot_ast,
          clutch_gp: isRS ? r.rs_gp : r.po_gp,
          // Averages
          clutch_pts: isRS ? r.rs_avg_pts : r.po_avg_pts,
          clutch_pm: isRS ? r.rs_avg_pm : r.po_avg_pm,
          clutch_wpct: isRS ? r.rs_avg_wpct : r.po_avg_wpct,
          // Seasons
          seasons: isRS ? r.rs_seasons : r.po_seasons,
        })).filter(r => r.clutch_gp > 0);
      }
      
      // Single season clutch view
      if (!seasons) return [];
      const isRS = seasonType === 'RS';
      let list = seasons.filter(r => r.type === seasonType);
      list = list.filter(r => isRS ? r.clutch_pm != null : r.po_clutch_pm != null);
      if (era !== 'All') list = list.filter(r => r.era === era);
      if (search.trim()) { const q = search.toLowerCase(); list = list.filter(r => r.name.toLowerCase().includes(q)); }
      return list.map(r => {
        const pre = isRS ? 'clutch_' : 'po_clutch_';
        return {
          name: r.name, team: r.team, year: r.year, era: r.era,
          yr_label: `${r.year}-${String(r.year + 1).slice(-2)}`,
          clutch_pm: r[pre+'pm'], clutch_pts: r[pre+'pts'], clutch_wpct: r[pre+'wpct'],
          clutch_ts: r[pre+'ts'], clutch_lg_ts: r[pre+'lg_ts'], clutch_ts_vs_lg: r[pre+'ts_vs_lg'],
          clutch_gp: r[pre+'gp'],
          clutch_fgp: r[pre+'fgp'], clutch_fg3p: r[pre+'fg3p'], clutch_ftp: r[pre+'ftp'],
          clutch_ast: r[pre+'ast'], clutch_reb: r[pre+'reb'], clutch_stl: r[pre+'stl'], clutch_blk: r[pre+'blk'],
          clutch_tot_pts: r[pre+'tot_pts'] || ((r[pre+'pts']||0) * (r[pre+'gp']||0)),
          clutch_tot_pm: r[pre+'tot_pm'] || ((r[pre+'pm']||0) * (r[pre+'gp']||0)),
        };
      });
    }

    if (window === '1yr') {
      if (!seasons) return [];
      let list = seasons.filter(r => r.type === seasonType);
      if (era !== 'All') list = list.filter(r => r.era === era);
      if (search.trim()) {
        const q = search.toLowerCase();
        list = list.filter(r => r.name.toLowerCase().includes(q));
      }
      // Map to uniform row shape
      return list.map(r => ({
        name: r.name, team: r.team, year: r.year, era: r.era,
        yr_label: `${r.year}-${String(r.year + 1).slice(-2)}`,
        reign: r.reign, off: r.reign_off, def: r.reign_def,
        pts: r.pts, reb: r.reb, ast: r.ast, stl: r.stl, blk: r.blk,
        fgp: r.fgp, fg3p: r.fg3p, tsp: r.tsp,
      }));
    } else if (window === 'career') {
      // Career averages — one row per player
      if (!stretches) return [];
      let list = [...stretches];
      if (era !== 'All') list = list.filter(r => r.eras && r.eras.includes(era));
      if (search.trim()) {
        const q = search.toLowerCase();
        list = list.filter(r => r.name.toLowerCase().includes(q));
      }
      return list.map(r => ({
        name: r.name, teams: r.teams, eras: r.eras,
        yr_label: r.yr_label, era: r.eras?.[0] || 'Unknown',
        n: r.n,
        reign: r.avg_reign, off: r.avg_reign_off, def: r.avg_reign_def,
        pts: r.avg_pts, reb: r.avg_reb, ast: r.avg_ast, stl: r.avg_stl, blk: r.avg_blk,
        fgp: r.avg_fgp, fg3p: r.avg_fg3p, tsp: r.avg_tsp,
      }));
    } else {
      // 3yr or 5yr stretches
      if (!stretches) return [];
      let list = [...stretches];
      if (era !== 'All') list = list.filter(r => r.eras && r.eras.includes(era));
      if (search.trim()) {
        const q = search.toLowerCase();
        list = list.filter(r => r.name.toLowerCase().includes(q));
      }
      return list.map(r => ({
        name: r.name, teams: r.teams, eras: r.eras,
        yr_label: r.yr_label, era: r.eras?.[0] || 'Unknown',
        reign: r.avg_reign, off: r.avg_reign_off, def: r.avg_reign_def,
        pts: r.avg_pts, reb: r.avg_reb, ast: r.avg_ast, stl: r.avg_stl, blk: r.avg_blk,
        fgp: r.avg_fgp, fg3p: r.avg_fg3p, tsp: r.avg_tsp,
      }));
    }
  }, [seasons, stretches, careerClutch, seasonType, window, era, search, stretchPath, dataView, clutchWindow]);

  const handleSort = (col) => {
    if (sortCol === col) { setSortDir(d => d === 'desc' ? 'asc' : 'desc'); }
    else { setSortCol(col); setSortDir('desc'); }
  };

  const effectiveSortCol = dataView === 'clutch' && sortCol === 'reign' ? (clutchSort === 'totals' ? 'clutch_tot_pts' : 'clutch_pm') : sortCol;
  const sorted = useMemo(() => {
    const list = [...rows];
    list.sort((a, b) => {
      const av = a[effectiveSortCol] ?? -999, bv = b[effectiveSortCol] ?? -999;
      return sortDir === 'desc' ? bv - av : av - bv;
    });
    return list;
  }, [rows, effectiveSortCol, sortDir]);

  const loading = loadSeasons || (stretchPath && loadStretches) || (dataView === 'clutch' && clutchWindow === 'career' && loadCareerClutch);

  const shown = sorted.slice(0, count);
  const windowLabel = window === '1yr' ? 'Single Season' : window === '3yr' ? '3-Year Stretch' : window === '5yr' ? '5-Year Stretch' : 'Career Average';
  const typeLabel = seasonType === 'RS' ? 'Regular Season' : 'Playoffs';

  return (
    <div className="rk">
      <div className="rk-wrap">
        <div className="rk-header">
          <h1 className="rk-title">REIGN Leaderboard</h1>
          <p className="rk-desc">
            {sorted.length.toLocaleString()} entries · {typeLabel} · {windowLabel}
          </p>
        </div>

        <div className="rk-controls">
          <div className="ctrl-group">
            <span className="ctrl-label">Data</span>
            <div className="pills">
              <button className={`pill tp${dataView === 'standard' ? ' on' : ''}`}
                onClick={() => { setDataView('standard'); setSortCol('reign'); setSortDir('desc'); setCount(100); }}>Standard</button>
              <button className={`pill tp${dataView === 'clutch' ? ' on' : ''}`}
                onClick={() => { setDataView('clutch'); setWindow('1yr'); setSortCol('clutch_tot_pts'); setSortDir('desc'); setCount(100); }}>Clutch</button>
            </div>
          </div>
          <div className="ctrl-group">
            <span className="ctrl-label">Type</span>
            <div className="pills">
              <button className={`pill tp${seasonType === 'RS' ? ' on' : ''}`}
                onClick={() => { setSeasonType('RS'); setCount(100); }}>Reg Season</button>
              <button className={`pill tp${seasonType === 'PO' ? ' on' : ''}`}
                onClick={() => { setSeasonType('PO'); setCount(100); }}>Playoffs</button>
            </div>
          </div>
          {dataView === 'standard' && <div className="ctrl-group">
            <span className="ctrl-label">Window</span>
            <div className="pills">
              {[['1yr','1 Year'],['3yr','3 Year'],['5yr','5 Year'],['career','Career']].map(([k,l]) => (
                <button key={k} className={`pill${window === k ? ' on' : ''}`}
                  onClick={() => { setWindow(k); setCount(100); setSortCol('reign'); setSortDir('desc'); }}>{l}</button>
              ))}
            </div>
          </div>}
          {dataView === 'clutch' && <div className="ctrl-group">
            <span className="ctrl-label">Window</span>
            <div className="pills">
              <button className={`pill${clutchWindow === 'season' ? ' on' : ''}`}
                onClick={() => { setClutchWindow('season'); setCount(100); }}>Single Season</button>
              <button className={`pill${clutchWindow === 'career' ? ' on' : ''}`}
                onClick={() => { setClutchWindow('career'); setCount(100); }}>Career</button>
            </div>
          </div>}
          {dataView === 'clutch' && <div className="ctrl-group">
            <span className="ctrl-label">Sort By</span>
            <div className="pills">
              <button className={`pill${clutchSort === 'totals' ? ' on' : ''}`}
                onClick={() => { setClutchSort('totals'); setSortCol('clutch_tot_pts'); setSortDir('desc'); }}>Totals</button>
              <button className={`pill${clutchSort === 'averages' ? ' on' : ''}`}
                onClick={() => { setClutchSort('averages'); setSortCol('clutch_pm'); setSortDir('desc'); }}>Averages</button>
            </div>
          </div>}
          <div className="ctrl-group">
            <span className="ctrl-label">Era</span>
            <div className="pills">
              {ERA_OPTIONS.map(e => (
                <button key={e} className={`pill era-pill${era === e ? ' on' : ''}`}
                  onClick={() => setEra(e)}>{e}</button>
              ))}
            </div>
          </div>
          <div className="search-wrap">
            <svg className="search-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.35-4.35"/></svg>
            <input className="rk-search" type="text" placeholder="Search player..."
              value={search} onChange={e => setSearch(e.target.value)} />
          </div>
        </div>

        <div className="rk-table-scroll">
          {dataView === 'clutch' ? (
            <table className="t">
              <thead>
                <tr>
                  <th className="t-rk">#</th>
                  <th className="t-name">Player</th>
                  <th className="t-yrs">{clutchWindow === 'career' ? 'Career' : 'Season'}</th>
                  <th className="t-era">Era</th>
                  <th className="t-n t-reign-h sortable" onClick={() => handleSort('clutch_tot_pts')}>Tot PTS <Arrow active={effectiveSortCol === 'clutch_tot_pts'} dir={sortDir} /></th>
                  <th className="t-n t-reign-h sortable" onClick={() => handleSort('clutch_tot_pm')}>Tot +/− <Arrow active={effectiveSortCol === 'clutch_tot_pm'} dir={sortDir} /></th>
                  <th className="t-n sortable" onClick={() => handleSort('clutch_pts')}>PPG <Arrow active={effectiveSortCol === 'clutch_pts'} dir={sortDir} /></th>
                  <th className="t-n sortable" onClick={() => handleSort('clutch_pm')}>+/− <Arrow active={effectiveSortCol === 'clutch_pm'} dir={sortDir} /></th>
                  <th className="t-n sortable" onClick={() => handleSort('clutch_wpct')}>W% <Arrow active={effectiveSortCol === 'clutch_wpct'} dir={sortDir} /></th>
                  {clutchWindow === 'season' && <th className="t-n sortable" onClick={() => handleSort('clutch_ts_vs_lg')}>Rel TS% <Arrow active={effectiveSortCol === 'clutch_ts_vs_lg'} dir={sortDir} /></th>}
                  {clutchWindow === 'season' && <th className="t-n t-stat-h sortable" onClick={() => handleSort('clutch_ts')}>TS% <Arrow active={effectiveSortCol === 'clutch_ts'} dir={sortDir} /></th>}
                  {clutchWindow === 'season' && <th className="t-n t-stat-h">Lg Avg</th>}
                  <th className="t-n t-stat-h sortable" onClick={() => handleSort('clutch_gp')}>GP <Arrow active={effectiveSortCol === 'clutch_gp'} dir={sortDir} /></th>
                  {clutchWindow === 'career' && <th className="t-n t-stat-h">Seasons</th>}
                </tr>
              </thead>
              <tbody>
                {shown.map((r, i) => {
                  const rank = i + 1;
                  const cls = rank <= 10 ? ' elite' : rank <= 25 ? ' star' : '';
                  const totPtsBg = r.clutch_tot_pts >= 200 ? '#065f46' : r.clutch_tot_pts >= 100 ? '#10B981' : r.clutch_tot_pts >= 50 ? '#5DFDCB' : r.clutch_tot_pts >= 20 ? '#a7f3d0' : 'transparent';
                  const totPmBg = r.clutch_tot_pm >= 80 ? '#065f46' : r.clutch_tot_pm >= 40 ? '#10B981' : r.clutch_tot_pm >= 15 ? '#5DFDCB' : r.clutch_tot_pm >= 0 ? '#a7f3d0' : '#fee2e2';
                  return (
                    <tr key={`${r.name}-${r.yr_label}-${i}`} className={`row${cls}`}>
                      <td className="t-rk">
                        {rank <= 3 ? <span className={`badge b${rank}`}>{rank}</span>
                          : rank <= 10 ? <span className="badge">{rank}</span>
                          : <span className="rknum">{rank}</span>}
                      </td>
                      <td className="t-name">
                        <strong className="pn">{r.name}</strong>
                        <span className="pt">{r.team}</span>
                      </td>
                      <td className="t-yrs"><span className="yr-range">{r.yr_label}</span></td>
                      <td className="t-era">{(r.eras || [r.era]).map(e => <span key={e} className={`et e-${(e||'')[0]?.toLowerCase()}`}>{(e||'')[0]}</span>)}</td>
                      <td className="t-n t-reign-cell" style={{background: totPtsBg, color: needsDark(totPtsBg)?'#08090A':'#fff'}}>{r.clutch_tot_pts != null ? r.clutch_tot_pts.toFixed(0) : '—'}</td>
                      <td className="t-n" style={{background: totPmBg, color: needsDark(totPmBg)?'#08090A':'#fff'}}>{r.clutch_tot_pm != null ? (r.clutch_tot_pm >= 0 ? '+' : '') + r.clutch_tot_pm.toFixed(0) : '—'}</td>
                      <td className="t-n t-stat-v">{fmtStat(r.clutch_pts)}</td>
                      <HeatTd v={r.clutch_pm} bgFn={clutchPMBg} cls="t-n">{r.clutch_pm != null ? (r.clutch_pm >= 0 ? '+' : '') + r.clutch_pm.toFixed(1) : '—'}</HeatTd>
                      <td className="t-n t-stat-v">{r.clutch_wpct ? (r.clutch_wpct * 100).toFixed(0) + '%' : '—'}</td>
                      {clutchWindow === 'season' && <HeatTd v={r.clutch_ts_vs_lg} bgFn={relTsBg} cls="t-n">{r.clutch_ts_vs_lg != null ? (r.clutch_ts_vs_lg >= 0 ? '+' : '') + r.clutch_ts_vs_lg.toFixed(0) : '—'}</HeatTd>}
                      {clutchWindow === 'season' && <td className="t-n t-pct">{r.clutch_ts ? (r.clutch_ts * 100).toFixed(0) + '%' : '—'}</td>}
                      {clutchWindow === 'season' && <td className="t-n t-pct" style={{color:'#b0b4d0'}}>{r.clutch_lg_ts ? r.clutch_lg_ts.toFixed(0) + '%' : '—'}</td>}
                      <td className="t-n t-stat-v">{r.clutch_gp ?? '—'}</td>
                      {clutchWindow === 'career' && <td className="t-n t-stat-v">{r.seasons ?? '—'}</td>}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          ) : (
            <table className="t">
              <thead>
                <tr>
                  <th className="t-rk">#</th>
                  <th className="t-name">Player</th>
                  <th className="t-yrs">{window === '1yr' ? 'Season' : window === 'career' ? 'Career' : 'Stretch'}</th>
                  <th className="t-era">Era</th>
                  <th className="t-n t-reign-h sortable" onClick={() => handleSort('reign')}>
                    REIGN <Arrow active={sortCol === 'reign'} dir={sortDir} />
                  </th>
                  <th className="t-n t-off-h sortable" onClick={() => handleSort('off')}>
                    OFF <Arrow active={sortCol === 'off'} dir={sortDir} />
                  </th>
                  <th className="t-n t-def-h sortable" onClick={() => handleSort('def')}>
                    DEF <Arrow active={sortCol === 'def'} dir={sortDir} />
                  </th>
                  <th className="t-n t-stat-h sortable" onClick={() => handleSort('pts')}>PPG <Arrow active={sortCol === 'pts'} dir={sortDir} /></th>
                  <th className="t-n t-stat-h sortable" onClick={() => handleSort('reb')}>RPG <Arrow active={sortCol === 'reb'} dir={sortDir} /></th>
                  <th className="t-n t-stat-h sortable" onClick={() => handleSort('ast')}>APG <Arrow active={sortCol === 'ast'} dir={sortDir} /></th>
                  <th className="t-n t-stat-h sortable" onClick={() => handleSort('stl')}>SPG <Arrow active={sortCol === 'stl'} dir={sortDir} /></th>
                  <th className="t-n t-stat-h sortable" onClick={() => handleSort('blk')}>BPG <Arrow active={sortCol === 'blk'} dir={sortDir} /></th>
                  <th className="t-n t-stat-h sortable" onClick={() => handleSort('fgp')}>FG% <Arrow active={sortCol === 'fgp'} dir={sortDir} /></th>
                  <th className="t-n t-stat-h sortable" onClick={() => handleSort('fg3p')}>3P% <Arrow active={sortCol === 'fg3p'} dir={sortDir} /></th>
                  <th className="t-n t-stat-h sortable" onClick={() => handleSort('tsp')}>TS% <Arrow active={sortCol === 'tsp'} dir={sortDir} /></th>
                </tr>
              </thead>
              <tbody>
                {shown.map((r, i) => {
                  const rank = i + 1;
                  const cls = rank <= 10 ? ' elite' : rank <= 25 ? ' star' : '';
                  return (
                    <tr key={`${r.name}-${r.yr_label}-${i}`} className={`row${cls}`}>
                      <td className="t-rk">
                        {rank <= 3
                          ? <span className={`badge b${rank}`}>{rank}</span>
                          : rank <= 10
                          ? <span className="badge">{rank}</span>
                          : <span className="rknum">{rank}</span>}
                      </td>
                      <td className="t-name">
                        <strong className="pn">{r.name}</strong>
                        <span className="pt">{r.team || (r.teams || []).slice(0,3).join(' · ')}</span>
                      </td>
                      <td className="t-yrs"><span className="yr-range">{r.yr_label}</span></td>
                      <td className="t-era">
                        {(r.eras || [r.era]).map(e => (
                          <span key={e} className={`et e-${(e||'')[0]?.toLowerCase()}`}>{(e||'')[0]}</span>
                        ))}
                      </td>
                      <HeatTd v={r.reign} bgFn={reignBg} cls="t-n t-reign-cell"><span className="reign-score">{formatReign(r.reign)}</span></HeatTd>
                      <HeatTd v={r.off} bgFn={offBg} cls="t-n t-off">{formatReign(r.off)}</HeatTd>
                      <HeatTd v={r.def} bgFn={defBg} cls="t-n t-def">{formatReign(r.def)}</HeatTd>
                      <td className="t-n t-stat-v">{fmtStat(r.pts)}</td>
                      <td className="t-n t-stat-v">{fmtStat(r.reb)}</td>
                      <td className="t-n t-stat-v">{fmtStat(r.ast)}</td>
                      <td className="t-n t-stat-v">{fmtStat(r.stl)}</td>
                      <td className="t-n t-stat-v">{fmtStat(r.blk)}</td>
                      <td className="t-n t-pct">{fmtPct(r.fgp)}</td>
                      <td className="t-n t-pct">{fmtPct(r.fg3p)}</td>
                      <td className="t-n t-pct">{fmtPct(r.tsp)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {count < sorted.length && (
          <div className="rk-more">
            <button onClick={() => setCount(c => c + 100)}>
              Show more · {(sorted.length - count).toLocaleString()} remaining
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

