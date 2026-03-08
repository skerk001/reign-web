import React, { useState, useEffect, useMemo } from 'react';
import { ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  BarChart, Bar, Cell, LineChart, Line, Legend, ReferenceLine, ReferenceArea } from 'recharts';
import Loading from '../components/Loading';
import { formatReign } from '../utils/format';
import { useJSON, useAllSeasons } from '../hooks/useData';
import './Viz.css';

const EC = { Pioneer: '#8789C0', Legacy: '#D97706', Classic: '#2563EB', Modern: '#10B981' };
const ERAS = ['Pioneer', 'Legacy', 'Classic', 'Modern'];
const ERA_YEARS = { Pioneer: [1946,1962], Legacy: [1963,1995], Classic: [1996,2012], Modern: [2013,2026] };
const ERA_DESC = { Pioneer: 'The birth of basketball', Legacy: 'The golden age of individual greatness', Classic: 'The dead-ball ISO era', Modern: 'Analytics & positionless basketball' };

export default function Visualizations() {
  const { data: seasons, loading } = useAllSeasons();
  const { data: careerClutch } = useJSON('/data/career_clutch.json');
  const [eraFilter, setEraFilter] = useState('All');
  const [seasonType, setSeasonType] = useState('RS');

  const filtered = useMemo(() => {
    if (!seasons) return [];
    let list = seasons.filter(r => r.type === seasonType && (r.min || 0) > 15);
    if (eraFilter !== 'All') list = list.filter(r => r.era === eraFilter);
    return list;
  }, [seasons, eraFilter, seasonType]);

  // Era summary stats — responds to seasonType
  const eraCards = useMemo(() => {
    if (!seasons) return [];
    return ERAS.map(era => {
      const erData = seasons.filter(r => r.type === seasonType && r.era === era && (r.min||0) > 15);
      const best = [...erData].sort((a,b) => b.reign - a.reign)[0];
      const tsVals = erData.map(r => r.tsp||0).filter(v => v > 0);
      const avgTS = tsVals.length ? tsVals.reduce((a,b)=>a+b,0)/tsVals.length : 0;
      return {
        era, color: EC[era], years: ERA_YEARS[era], desc: ERA_DESC[era],
        best: best ? { name: best.name, reign: best.reign, year: best.year } : null,
        avgTS: (avgTS <= 1 ? avgTS * 100 : avgTS).toFixed(1),
        players: new Set(erData.map(r=>r.name)).size,
        seasons: erData.length,
      };
    });
  }, [seasons, seasonType]);

  if (loading || !seasons) return <Loading message="Loading visualization data..." />;

  return (
    <div className="viz">
      <div className="viz-wrap">
        <div className="viz-header">
          <h1 className="viz-title">Visualizations</h1>
          <p className="viz-desc">Interactive analytics dashboard across 80 years of NBA history</p>
        </div>

        {/* Era Summary Cards */}
        <div className="era-cards">
          {eraCards.map(c => (
            <div key={c.era} className="era-card" style={{borderTopColor: c.color}}>
              <div className="ec-era" style={{color: c.color}}>{c.era}</div>
              <div className="ec-years">{c.years[0]}–{c.years[1]}</div>
              <div className="ec-desc">{c.desc}</div>
              {c.best && (
                <div className="ec-best">
                  <div className="ec-best-label">Best Season</div>
                  <div className="ec-best-name">{c.best.name} '{String(c.best.year+1).slice(-2)}</div>
                  <div className="ec-best-reign">{formatReign(c.best.reign)}</div>
                </div>
              )}
              <div className="ec-meta">
                <span>{c.players} players</span>
                <span>Avg TS: {c.avgTS}%</span>
              </div>
            </div>
          ))}
        </div>

        <div className="viz-era-filter">
          <div className="vc-toggle" style={{marginRight: 12}}>
            <button className={`vc-btn${seasonType==='RS'?' on':''}`} onClick={()=>setSeasonType('RS')}>Regular Season</button>
            <button className={`vc-btn${seasonType==='PO'?' on':''}`} onClick={()=>setSeasonType('PO')}>Playoffs</button>
          </div>
          <span className="viz-filter-label">Era:</span>
          {['All', ...ERAS].map(e => (
            <button key={e} className={`viz-era-btn${eraFilter === e ? ' on' : ''}`}
              style={e !== 'All' && eraFilter === e ? {background: EC[e], color: '#fff', borderColor: EC[e]} : {}}
              onClick={() => setEraFilter(e)}>{e}</button>
          ))}
        </div>

        <div className="bento">
          <div className="bento-item bento-wide"><YearlyTop3 data={seasons} seasonType={seasonType} /></div>
          <div className="bento-item bento-wide"><OffVsDefScatter data={filtered} /></div>
          <div className="bento-item bento-half"><ClutchCareerBars data={careerClutch} /></div>
          <div className="bento-item bento-half"><PeakAgeChart data={filtered} /></div>
          <div className="bento-item bento-wide"><EraTimeline data={seasons} seasonType={seasonType} /></div>
          <div className="bento-item bento-half"><EraDistribution data={seasons} seasonType={seasonType} /></div>
          <div className="bento-item bento-half"><ReignVsPPG data={filtered} /></div>
        </div>
      </div>
    </div>
  );
}

/* ═══ Yearly Top 3 REIGN ═══ */
function YearlyTop3({ data, seasonType }) {
  const chartData = useMemo(() => {
    const filtered = data.filter(r => r.type === seasonType);
    const years = [...new Set(filtered.map(r => r.year))].sort();
    return years.map(yr => {
      const top = filtered.filter(r => r.year === yr).sort((a,b) => b.reign - a.reign).slice(0, 3);
      return {
        year: yr, label: "'" + String(yr+1).slice(-2),
        r1: top[0]?.reign || 0, n1: top[0]?.name || '', e1: top[0]?.era || '',
        r2: top[1]?.reign || 0, n2: top[1]?.name || '', e2: top[1]?.era || '',
        r3: top[2]?.reign || 0, n3: top[2]?.name || '', e3: top[2]?.era || '',
      };
    });
  }, [data, seasonType]);

  return (
    <div className="vc">
      <div className="vc-header">
        <div>
          <h2 className="vc-t">Top 3 REIGN by Year</h2>
          <p className="vc-d">The three best players every season — who dominated each year?</p>
        </div>
      </div>
      <ResponsiveContainer width="100%" height={500}>
        <BarChart data={chartData} margin={{top: 10, right: 10, bottom: 36, left: 10}}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(135,137,192,0.08)" vertical={false} />
          <XAxis dataKey="label" tick={{fontSize: 14, fontWeight: 900, fill: '#08090A'}} interval={2} angle={-45} textAnchor="end" height={56} />
          <YAxis tick={{fontSize: 15, fontWeight: 900, fill: '#08090A'}} domain={[0, 'auto']} />
          <Tooltip content={<Top3Tip />} />
          <Legend wrapperStyle={{fontSize: 15, fontWeight: 900}} />
          <Bar dataKey="r1" name="#1 REIGN" fill="#065f46" radius={[4,4,0,0]} barSize={10} />
          <Bar dataKey="r2" name="#2 REIGN" fill="#10B981" radius={[4,4,0,0]} barSize={10} />
          <Bar dataKey="r3" name="#3 REIGN" fill="#a7f3d0" radius={[4,4,0,0]} barSize={10} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/* ═══ OFF vs DEF with Quadrants ═══ */
function OffVsDefScatter({ data }) {
  const pts = useMemo(() => data.filter(r => r.reign >= 10).map(r => ({
    x: r.reign_off, y: r.reign_def, name: r.name, year: r.year, reign: r.reign, era: r.era,
  })), [data]);
  return (
    <div className="vc">
      <h2 className="vc-t">Offense vs Defense</h2>
      <p className="vc-d">Top-right = elite two-way · Bottom-right = pure scorer · Top-left = defensive anchor</p>
      <ResponsiveContainer width="100%" height={540}>
        <ScatterChart margin={{top: 20, right: 20, bottom: 36, left: 20}}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(135,137,192,0.1)" />
          <XAxis dataKey="x" type="number" tick={{fontSize: 15, fontWeight: 900, fill: '#08090A'}} label={{value: 'OFF REIGN →', position: 'bottom', offset: 10, fontSize: 16, fontWeight: 900, fill: '#4a4d60'}} />
          <YAxis dataKey="y" type="number" tick={{fontSize: 15, fontWeight: 900, fill: '#08090A'}} label={{value: '← DEF REIGN', angle: -90, position: 'left', offset: 0, fontSize: 16, fontWeight: 900, fill: '#4a4d60'}} />
          <ReferenceLine x={12} stroke="rgba(135,137,192,0.2)" strokeDasharray="4 4" />
          <ReferenceLine y={3} stroke="rgba(135,137,192,0.2)" strokeDasharray="4 4" />
          <ReferenceArea x1={12} x2={22} y1={3} y2={12} fill="rgba(93,253,203,0.04)" />
          <ReferenceArea x1={0} x2={12} y1={3} y2={12} fill="rgba(37,99,235,0.03)" />
          <ReferenceArea x1={12} x2={22} y1={-2} y2={3} fill="rgba(217,119,6,0.03)" />
          <Tooltip content={<ScatterTip />} />
          {ERAS.map(era => <Scatter key={era} name={era} data={pts.filter(r => r.era === era)} fill={EC[era]} opacity={0.7} r={5} />)}
        </ScatterChart>
      </ResponsiveContainer>
      <div className="quad-labels">
        <span className="ql ql-tl">Defensive Anchor</span><span className="ql ql-tr">Elite Two-Way</span>
        <span className="ql ql-bl">Role Player</span><span className="ql ql-br">Offensive Star</span>
      </div>
    </div>
  );
}

/* ═══ Clutch Career Dual Bars ═══ */
function ClutchCareerBars({ data }) {
  const top25 = useMemo(() => {
    if (!data) return [];
    return [...data].filter(r => r.rs_gp >= 50).sort((a,b) => b.rs_avg_pts - a.rs_avg_pts).slice(0, 25)
      .map(r => ({ name: r.name, avg_ppg: r.rs_avg_pts, tot_pts: r.rs_tot_pts, tot_pm: Math.max(r.rs_tot_pm, 0), gp: r.rs_gp }));
  }, [data]);
  if (!top25.length) return <div className="vc"><p className="vc-d">Loading clutch data...</p></div>;
  return (
    <div className="vc">
      <h2 className="vc-t">Clutch Careers — Top 25</h2>
      <p className="vc-d">Sorted by clutch PPG · Gold = total points · Green = total +/−</p>
      <ResponsiveContainer width="100%" height={620}>
        <BarChart data={top25} layout="vertical" margin={{top: 5, right: 20, bottom: 5, left: 140}}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(135,137,192,0.06)" horizontal={false} />
          <XAxis type="number" tick={{fontSize: 14, fontWeight: 900, fill: '#08090A'}} />
          <YAxis dataKey="name" type="category" tick={{fontSize: 13, fontWeight: 900, fill: '#08090A'}} width={135} interval={0} />
          <Tooltip content={<ClutchBarTip />} />
          <Legend wrapperStyle={{fontSize: 15, fontWeight: 900}} />
          <Bar dataKey="tot_pts" name="Total Clutch PTS" fill="#D97706" radius={[0,4,4,0]} barSize={11} />
          <Bar dataKey="tot_pm" name="Total Clutch +/−" fill="#10B981" radius={[0,4,4,0]} barSize={11} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/* ═══ Peak Age ═══ */
function PeakAgeChart({ data }) {
  const ageDist = useMemo(() => {
    const players = {};
    data.forEach(r => { if (!r.age) return; if (!players[r.name] || r.reign > players[r.name].reign) players[r.name] = { age: Math.round(r.age), reign: r.reign }; });
    const counts = {};
    Object.values(players).forEach(p => { const a = p.age; if (a >= 19 && a <= 39) counts[a] = (counts[a] || 0) + 1; });
    return Object.entries(counts).map(([age, count]) => ({ age: Number(age), count })).sort((a,b) => a.age - b.age);
  }, [data]);
  return (
    <div className="vc">
      <h2 className="vc-t">Peak Age Distribution</h2>
      <p className="vc-d">At what age do players hit their REIGN peak?</p>
      <ResponsiveContainer width="100%" height={400}>
        <BarChart data={ageDist} margin={{top: 10, right: 10, bottom: 36, left: 10}}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(135,137,192,0.06)" vertical={false} />
          <XAxis dataKey="age" tick={{fontSize: 15, fontWeight: 900, fill: '#08090A'}} label={{value: 'Age at Peak', position: 'bottom', offset: 10, fontSize: 16, fontWeight: 900, fill: '#4a4d60'}} />
          <YAxis tick={{fontSize: 14, fontWeight: 900, fill: '#08090A'}} />
          <Tooltip content={<AgeTip />} />
          <Bar dataKey="count" radius={[5,5,0,0]} barSize={32}>
            {ageDist.map((r, i) => <Cell key={i} fill={r.age >= 25 && r.age <= 30 ? '#5DFDCB' : r.age >= 23 && r.age <= 32 ? '#a7f3d0' : '#e2eaf2'} />)}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/* ═══ Era Timeline with shading ═══ */
function EraTimeline({ data, seasonType }) {
  const timeline = useMemo(() => {
    const rs = data.filter(r => r.type === seasonType && (r.pts || 0) > 0);
    return [...new Set(rs.map(r => r.year))].sort().map(yr => {
      const season = rs.filter(r => r.year === yr);
      const tsVals = season.map(r => r.tsp || 0).filter(v => v > 0);
      const avgTS = tsVals.length ? tsVals.reduce((a,b) => a+b, 0) / tsVals.length : 0;
      const avgPTS = season.reduce((s,r) => s + (r.pts||0), 0) / season.length;
      return { year: yr, label: "'" + String(yr+1).slice(-2), avgTS: Math.round((avgTS <= 1 ? avgTS * 100 : avgTS) * 10) / 10, avgPTS: Math.round(avgPTS * 10) / 10 };
    });
  }, [data, seasonType]);
  return (
    <div className="vc">
      <h2 className="vc-t">League Evolution</h2>
      <p className="vc-d">Scoring (gold) and efficiency (mint) across 80 years · Era bands show regime changes</p>
      <ResponsiveContainer width="100%" height={420}>
        <LineChart data={timeline} margin={{top: 10, right: 20, bottom: 36, left: 15}}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(135,137,192,0.06)" />
          {ERAS.map(era => {
            const [s, e] = ERA_YEARS[era];
            return <ReferenceArea key={era} x1={"'" + String(s+1).slice(-2)} x2={"'" + String(Math.min(e,2025)+1).slice(-2)} fill={EC[era]} fillOpacity={0.06} />;
          })}
          <XAxis dataKey="label" tick={{fontSize: 14, fontWeight: 900, fill: '#08090A'}} interval={4} />
          <YAxis yAxisId="ts" domain={[44, 60]} tick={{fontSize: 15, fontWeight: 900, fill: '#08090A'}} />
          <YAxis yAxisId="pts" orientation="right" domain={[6, 14]} tick={{fontSize: 15, fontWeight: 900, fill: '#08090A'}} />
          <Tooltip content={<TimelineTip />} />
          <Legend wrapperStyle={{fontSize: 15, fontWeight: 900}} />
          <Line yAxisId="ts" type="monotone" dataKey="avgTS" name="Avg TS%" stroke="#5DFDCB" strokeWidth={3.5} dot={false} />
          <Line yAxisId="pts" type="monotone" dataKey="avgPTS" name="Avg PPG" stroke="#F59E0B" strokeWidth={3.5} dot={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

/* ═══ Era Distribution ═══ */
function EraDistribution({ data, seasonType }) {
  const dist = useMemo(() => {
    const rs = data.filter(r => r.type === seasonType && (r.min || 0) > 15);
    const buckets = [];
    for (let v = -5; v <= 28; v += 2.5) {
      const row = { range: `${v >= 0 ? '+' : ''}${v}` };
      ERAS.forEach(era => { row[era] = rs.filter(r => r.era === era && r.reign >= v && r.reign < v + 2.5).length; });
      buckets.push(row);
    }
    return buckets;
  }, [data, seasonType]);
  return (
    <div className="vc">
      <h2 className="vc-t">REIGN Distribution by Era</h2>
      <p className="vc-d">How scores spread — stacked by era</p>
      <ResponsiveContainer width="100%" height={400}>
        <BarChart data={dist} margin={{top: 10, right: 10, bottom: 36, left: 10}}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(135,137,192,0.06)" vertical={false} />
          <XAxis dataKey="range" tick={{fontSize: 14, fontWeight: 900, fill: '#08090A'}} label={{value: 'REIGN Score', position: 'bottom', offset: 10, fontSize: 16, fontWeight: 900, fill: '#4a4d60'}} />
          <YAxis tick={{fontSize: 14, fontWeight: 900, fill: '#08090A'}} />
          <Tooltip />
          <Legend wrapperStyle={{fontSize: 15, fontWeight: 900}} />
          {ERAS.map(era => <Bar key={era} dataKey={era} stackId="a" fill={EC[era]} opacity={0.85} />)}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/* ═══ REIGN vs PPG with trend ═══ */
function ReignVsPPG({ data }) {
  const pts = useMemo(() => data.filter(r => r.reign >= 5 && (r.pts || 0) > 0).map(r => ({
    x: r.pts, y: r.reign, name: r.name, year: r.year, era: r.era,
  })), [data]);
  const n = pts.length; const sx = pts.reduce((s,p) => s+p.x, 0); const sy = pts.reduce((s,p) => s+p.y, 0);
  const sxy = pts.reduce((s,p) => s+p.x*p.y, 0); const sxx = pts.reduce((s,p) => s+p.x*p.x, 0);
  const slope = n > 1 ? (n*sxy - sx*sy) / (n*sxx - sx*sx) : 0;
  const intercept = n > 1 ? (sy - slope*sx) / n : 0;
  const trendData = [{ x: 5, y: slope*5+intercept }, { x: 35, y: slope*35+intercept }];
  return (
    <div className="vc">
      <h2 className="vc-t">REIGN vs Scoring</h2>
      <p className="vc-d">More points ≠ more impact — dashed line = trend</p>
      <ResponsiveContainer width="100%" height={440}>
        <ScatterChart margin={{top: 10, right: 10, bottom: 36, left: 15}}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(135,137,192,0.1)" />
          <XAxis dataKey="x" type="number" tick={{fontSize: 15, fontWeight: 900, fill: '#08090A'}} label={{value: 'PPG →', position: 'bottom', offset: 10, fontSize: 16, fontWeight: 900, fill: '#4a4d60'}} />
          <YAxis dataKey="y" type="number" tick={{fontSize: 15, fontWeight: 900, fill: '#08090A'}} label={{value: 'REIGN', angle: -90, position: 'left', fontSize: 16, fontWeight: 900, fill: '#4a4d60'}} />
          <Tooltip content={<PPGTip />} />
          {ERAS.map(era => <Scatter key={era} name={era} data={pts.filter(r => r.era === era)} fill={EC[era]} opacity={0.5} r={4} />)}
          <Scatter name="trend" data={trendData} fill="none" line={{stroke: '#08090A', strokeWidth: 2, strokeDasharray: '8 4'}} legendType="none" r={0} />
        </ScatterChart>
      </ResponsiveContainer>
    </div>
  );
}

/* ═══ Tooltips ═══ */
const Tip = ({children}) => <div className="vt">{children}</div>;
const TN = ({children}) => <div className="vt-n">{children}</div>;
const TS = ({children}) => <div className="vt-s">{children}</div>;

function ScatterTip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return <Tip><TN>{d.name} '{String((d.year||0)+1).slice(-2)}</TN><TS>OFF: +{d.x?.toFixed(1)} · DEF: +{d.y?.toFixed(1)} · REIGN: +{d.reign?.toFixed(1)}</TS></Tip>;
}
function Top3Tip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  const d = payload[0]?.payload;
  if (!d) return null;
  return <Tip>
    <TN>Season {label}</TN>
    <TS>
      {d.n1 && <div>#1 {d.n1}: +{d.r1?.toFixed(1)}</div>}
      {d.n2 && <div>#2 {d.n2}: +{d.r2?.toFixed(1)}</div>}
      {d.n3 && <div>#3 {d.n3}: +{d.r3?.toFixed(1)}</div>}
    </TS>
  </Tip>;
}
function ClutchBarTip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return <Tip><TN>{d.name}</TN><TS>Clutch PPG: {d.avg_ppg} · Total PTS: {d.tot_pts?.toFixed(0)} · Total +/−: +{d.tot_pm?.toFixed(0)} · GP: {d.gp}</TS></Tip>;
}
function TimelineTip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return <Tip><TN>Season {label}</TN><TS>{payload.map(p => <div key={p.name}>{p.name}: {p.value}</div>)}</TS></Tip>;
}
function AgeTip({ active, payload }) {
  if (!active || !payload?.length) return null;
  return <Tip><TN>Age {payload[0].payload.age}</TN><TS>{payload[0].payload.count} players peaked here</TS></Tip>;
}
function PPGTip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  if (!d.name) return null;
  return <Tip><TN>{d.name} '{String((d.year||0)+1).slice(-2)}</TN><TS>PPG: {d.x?.toFixed(1)} · REIGN: +{d.y?.toFixed(1)}</TS></Tip>;
}
