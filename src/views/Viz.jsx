import { useState, useRef, useMemo } from 'react';
import Loading from '../components/Loading';
import { formatReign } from '../utils/format';
import { useJSON } from '../hooks/useData';
import { PlayerCrest } from '../components/PlayerArt';
import './Viz.css';

const EC = { Pioneer: '#8789C0', Legacy: '#D97706', Classic: '#2563EB', Modern: '#10B981' };
const ERAS = ['Pioneer', 'Legacy', 'Classic', 'Modern'];
const ERA_DESC = { Pioneer: 'The birth of basketball', Legacy: 'The golden age of individual greatness', Classic: 'The dead-ball ISO era', Modern: 'Analytics & positionless basketball' };
const MINT = '#5DFDCB', GOLD = '#F5B942';

const ecGlow = (hex, a) => { const n = parseInt(hex.slice(1), 16); return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`; };

// Map a pointer event to viewBox coordinates for a scaled SVG.
function vbPoint(e, vbW, vbH) {
  const r = e.currentTarget.getBoundingClientRect();
  return { x: ((e.clientX - r.left) / r.width) * vbW, y: ((e.clientY - r.top) / r.height) * vbH, px: e.clientX - r.left, py: e.clientY - r.top };
}

function Card({ title, desc, span = 'wide', children }) {
  return (
    <div className={`vcard ${span}`}>
      <h2 className="vc-t">{title}</h2>
      {desc && <p className="vc-d">{desc}</p>}
      <div className="vc-body">{children}</div>
    </div>
  );
}

function Tip({ pos, children }) {
  if (!pos) return null;
  return <div className="vtip" style={{ left: pos.px + 14, top: pos.py + 14 }}>{children}</div>;
}

export default function Visualizations() {
  const { data: viz, loading } = useJSON('/data/viz.json');
  const [seasonType, setSeasonType] = useState('RS');
  const [eraFilter, setEraFilter] = useState('All');

  if (loading || !viz) return <Loading message="Loading visualizations..." />;

  return (
    <div className="viz">
      <div className="viz-wrap">
        <div className="viz-header">
          <h1 className="viz-title">Visualizations</h1>
          <p className="viz-desc">Eighty years of NBA impact, drawn from the ground up.</p>
        </div>

        <div className="era-cards">
          {viz.eraCards[seasonType].map(c => (
            <div key={c.era} className="era-card" style={{ '--ec': EC[c.era], '--ecg': ecGlow(EC[c.era], 0.5) }}>
              <div className="ec-top">
                <div>
                  <div className="ec-era">{c.era}</div>
                  <div className="ec-years">{c.years[0]}–{c.years[1]}</div>
                </div>
                {c.best && (
                  <div className="ec-reign">
                    <span className="ec-reign-val">{formatReign(c.best.reign)}</span>
                    <span className="ec-reign-lbl">Peak REIGN</span>
                  </div>
                )}
              </div>
              <div className="ec-desc">{ERA_DESC[c.era]}</div>
              {c.best && (
                <div className="ec-best">
                  <PlayerCrest name={c.best.name} team={c.best.team} off={c.best.off} def={c.best.def} peak={c.best.reign} size={46} className="ec-crest" />
                  <div className="ec-best-info">
                    <span className="ec-best-label">Era's Finest</span>
                    <span className="ec-best-name">{c.best.name}</span>
                    <span className="ec-best-sub">{c.best.team} · '{String(c.best.year + 1).slice(-2)}</span>
                  </div>
                </div>
              )}
              <div className="ec-meta"><span>{c.players} players</span><span>Avg TS {c.avgTS}%</span></div>
            </div>
          ))}
        </div>

        <div className="viz-controls">
          <div className="vc-toggle">
            <button className={`vc-btn${seasonType === 'RS' ? ' on' : ''}`} onClick={() => setSeasonType('RS')}>Regular Season</button>
            <button className={`vc-btn${seasonType === 'PO' ? ' on' : ''}`} onClick={() => setSeasonType('PO')}>Playoffs</button>
          </div>
          <div className="vc-eras">
            {['All', ...ERAS].map(e => (
              <button key={e} className={`vc-erabtn${eraFilter === e ? ' on' : ''}`}
                style={e !== 'All' && eraFilter === e ? { background: EC[e], borderColor: EC[e], color: '#08090A' } : {}}
                onClick={() => setEraFilter(e)}>{e}</button>
            ))}
          </div>
        </div>

        <div className="viz-grid">
          <LeagueEvolution data={viz.timeline[seasonType]} />
          <OffDefScatter data={viz.scatter[seasonType]} eraFilter={eraFilter} />
          <YearlyTop3 data={viz.yearlyTop3[seasonType]} />
          <PeakAge data={viz.peakAge[seasonType][eraFilter]} />
          <ClutchTop25 data={viz.clutchTop25} />
        </div>
      </div>
    </div>
  );
}

/* ═══ League Evolution — dual line with era bands ═══ */
function LeagueEvolution({ data }) {
  const [hi, setHi] = useState(null);
  const W = 1000, H = 360, P = { t: 24, r: 52, b: 38, l: 48 };
  const y0 = data[0].year, y1 = data[data.length - 1].year;
  const xs = yr => P.l + ((yr - y0) / (y1 - y0 || 1)) * (W - P.l - P.r);
  // Data-driven y-domains (padded) so neither line ever clips off the plot.
  const padRange = arr => { const mn = Math.min(...arr), mx = Math.max(...arr), r = (mx - mn) || 1; return [mn - r * 0.1, mx + r * 0.1]; };
  const [tsLo, tsHi] = padRange(data.map(d => d.avgTS));
  const [ppLo, ppHi] = padRange(data.map(d => d.avgPPG));
  const tsY = v => P.t + (1 - (v - tsLo) / (tsHi - tsLo)) * (H - P.t - P.b);
  const ppY = v => P.t + (1 - (v - ppLo) / (ppHi - ppLo)) * (H - P.t - P.b);
  const mkTicks = (lo, hi, step) => { const o = []; for (let v = Math.ceil(lo / step) * step; v <= hi; v += step) o.push(v); return o; };
  const tsTicks = mkTicks(tsLo, tsHi, (tsHi - tsLo) > 22 ? 10 : 5);
  const ppTicks = mkTicks(ppLo, ppHi, 2);
  const tsPath = data.map(d => `${xs(d.year).toFixed(1)},${tsY(d.avgTS).toFixed(1)}`).join(' ');
  const ppPath = data.map(d => `${xs(d.year).toFixed(1)},${ppY(d.avgPPG).toFixed(1)}`).join(' ');
  const bands = [['Pioneer', 1946, 1962], ['Legacy', 1963, 1995], ['Classic', 1996, 2012], ['Modern', 2013, 2026]];
  const onMove = e => {
    const { x, px, py } = vbPoint(e, W, H);
    const yr = Math.round(y0 + ((x - P.l) / (W - P.l - P.r)) * (y1 - y0));
    const idx = data.findIndex(d => d.year === Math.max(y0, Math.min(y1, yr)));
    if (idx >= 0) setHi({ d: data[idx], px, py });
  };
  return (
    <Card span="wide" title="League Evolution" desc="Scoring (gold) and shooting efficiency (mint) across 80 years — era bands mark the regime changes.">
      <div className="vchart" onMouseMove={onMove} onMouseLeave={() => setHi(null)}>
        <svg viewBox={`0 0 ${W} ${H}`} className="vsvg">
          {bands.map(([era, a, b]) => <rect key={era} x={xs(Math.max(a, y0))} y={P.t} width={xs(Math.min(b, y1)) - xs(Math.max(a, y0))} height={H - P.t - P.b} fill={EC[era]} opacity={0.07} />)}
          {tsTicks.map(v => <g key={v}><line x1={P.l} y1={tsY(v)} x2={W - P.r} y2={tsY(v)} stroke="rgba(135,137,192,0.1)" /><text x={P.l - 8} y={tsY(v) + 4} textAnchor="end" className="vaxis" fill={MINT}>{v}</text></g>)}
          {ppTicks.map(v => <text key={v} x={W - P.r + 8} y={ppY(v) + 4} className="vaxis" fill={GOLD}>{v}</text>)}
          {bands.map(([era, a]) => a >= y0 && a <= y1 && <text key={era} x={xs(a) + 4} y={P.t + 13} className="vband">{era}</text>)}
          <polyline points={ppPath} fill="none" stroke={GOLD} strokeWidth="3" strokeLinejoin="round" />
          <polyline points={tsPath} fill="none" stroke={MINT} strokeWidth="3" strokeLinejoin="round" />
          {data.filter((_, i) => i % 6 === 0).map(d => <text key={d.year} x={xs(d.year)} y={H - 14} textAnchor="middle" className="vaxis">'{String(d.year + 1).slice(-2)}</text>)}
          {hi && <g pointerEvents="none"><line x1={xs(hi.d.year)} y1={P.t} x2={xs(hi.d.year)} y2={H - P.b} stroke="rgba(255,255,255,0.25)" /><circle cx={xs(hi.d.year)} cy={tsY(hi.d.avgTS)} r="5" fill={MINT} /><circle cx={xs(hi.d.year)} cy={ppY(hi.d.avgPPG)} r="5" fill={GOLD} /></g>}
        </svg>
        <div className="vlegend"><span><i style={{ background: MINT }} />Avg TS%</span><span><i style={{ background: GOLD }} />Avg PPG</span></div>
        {hi && <Tip pos={hi}><b>'{String(hi.d.year + 1).slice(-2)} Season</b><span style={{ color: MINT }}>{hi.d.avgTS}% TS</span><span style={{ color: GOLD }}>{hi.d.avgPPG} PPG</span></Tip>}
      </div>
    </Card>
  );
}

/* ═══ OFF vs DEF quadrant scatter ═══ */
function OffDefScatter({ data, eraFilter }) {
  const [hi, setHi] = useState(null);
  const pts = useMemo(() => eraFilter === 'All' ? data : data.filter(d => d.era === eraFilter), [data, eraFilter]);
  const W = 1000, H = 460, P = { t: 20, r: 24, b: 40, l: 46 };
  const xMax = 22, yMin = -2, yMax = 12;
  const xs = v => P.l + (v / xMax) * (W - P.l - P.r);
  const ys = v => P.t + (1 - (v - yMin) / (yMax - yMin)) * (H - P.t - P.b);
  return (
    <Card span="wide" title="Offense vs Defense" desc="Every elite season (REIGN ≥ 10) placed by its two-way profile. Top-right = complete superstars.">
      <div className="vchart" onMouseLeave={() => setHi(null)}>
        <svg viewBox={`0 0 ${W} ${H}`} className="vsvg">
          <rect x={xs(12)} y={ys(yMax)} width={xs(xMax) - xs(12)} height={ys(3) - ys(yMax)} fill={MINT} opacity={0.05} />
          <line x1={xs(12)} y1={P.t} x2={xs(12)} y2={H - P.b} stroke="rgba(135,137,192,0.25)" strokeDasharray="4 4" />
          <line x1={P.l} y1={ys(3)} x2={W - P.r} y2={ys(3)} stroke="rgba(135,137,192,0.25)" strokeDasharray="4 4" />
          {[0, 6, 12, 18].map(v => <text key={v} x={xs(v)} y={H - 14} textAnchor="middle" className="vaxis">{v}</text>)}
          {[0, 4, 8].map(v => <text key={v} x={P.l - 8} y={ys(v) + 4} textAnchor="end" className="vaxis">{v}</text>)}
          <text x={W - P.r} y={H - 14} textAnchor="end" className="vaxislbl">OFF REIGN →</text>
          <text x={P.l - 8} y={P.t + 4} className="vaxislbl">DEF ↑</text>
          {pts.map((d, i) => <circle key={i} cx={xs(d.off)} cy={ys(d.def)} r={hi?.d === d ? 7 : 4.2} fill={EC[d.era]} opacity={hi && hi.d !== d ? 0.3 : 0.78} onMouseEnter={e => setHi({ d, ...vbPoint(e, W, H) })} onMouseLeave={() => setHi(null)} style={{ transition: 'r .1s' }} />)}
          <text x={xs(17)} y={ys(9)} className="vquad">ELITE TWO-WAY</text>
          <text x={xs(17)} y={ys(0.5)} className="vquad">OFFENSIVE STAR</text>
          <text x={xs(2)} y={ys(9)} className="vquad">DEFENSIVE ANCHOR</text>
        </svg>
        {hi && <Tip pos={hi}><b>{hi.d.name} '{String(hi.d.year + 1).slice(-2)}</b><span>OFF +{hi.d.off} · DEF +{hi.d.def}</span><span style={{ color: MINT }}>REIGN +{hi.d.reign}</span></Tip>}
      </div>
    </Card>
  );
}

/* ═══ Top 3 REIGN by Year — stacked bars ═══ */
function YearlyTop3({ data }) {
  const [hi, setHi] = useState(null);
  const W = 1000, H = 360, P = { t: 18, r: 16, b: 36, l: 36 };
  const max = Math.max(...data.map(d => (d.top[0]?.reign || 0) + (d.top[1]?.reign || 0) + (d.top[2]?.reign || 0)));
  const n = data.length, bw = (W - P.l - P.r) / n;
  const ys = v => P.t + (1 - v / max) * (H - P.t - P.b);
  const shades = ['#065f46', '#10B981', '#a7f3d0'];
  return (
    <Card span="wide" title="Top 3 REIGN by Year" desc="The three best players of every season, stacked — taller years had deeper greatness at the top.">
      <div className="vchart" onMouseLeave={() => setHi(null)}>
        <svg viewBox={`0 0 ${W} ${H}`} className="vsvg">
          {[0.25, 0.5, 0.75, 1].map(f => <line key={f} x1={P.l} y1={ys(max * f)} x2={W - P.r} y2={ys(max * f)} stroke="rgba(135,137,192,0.08)" />)}
          {data.map((d, i) => {
            const x = P.l + i * bw; let acc = 0;
            return (
              <g key={d.year} onMouseEnter={e => setHi({ d, ...vbPoint(e, W, H) })}>
                <rect x={x} y={P.t} width={bw} height={H - P.t - P.b} fill="transparent" />
                {d.top.map((t, j) => { const h = (t.reign / max) * (H - P.t - P.b); const yy = ys(acc + t.reign); acc += t.reign; return <rect key={j} x={x + bw * 0.12} y={yy} width={bw * 0.76} height={h} fill={shades[j]} opacity={hi && hi.d !== d ? 0.4 : 1} />; })}
              </g>
            );
          })}
          {data.filter((_, i) => i % 6 === 0).map((d, i) => <text key={d.year} x={P.l + data.indexOf(d) * bw + bw / 2} y={H - 14} textAnchor="middle" className="vaxis">'{String(d.year + 1).slice(-2)}</text>)}
        </svg>
        {hi && <Tip pos={hi}><b>'{String(hi.d.year + 1).slice(-2)} Season</b>{hi.d.top.map((t, j) => <span key={j} style={{ color: shades[j] === '#a7f3d0' ? '#a7f3d0' : shades[j] === '#10B981' ? '#10B981' : MINT }}>#{j + 1} {t.name} · +{t.reign}</span>)}</Tip>}
      </div>
    </Card>
  );
}

/* ═══ Peak Age histogram ═══ */
function PeakAge({ data }) {
  const [hi, setHi] = useState(null);
  const W = 480, H = 360, P = { t: 18, r: 12, b: 40, l: 34 };
  if (!data?.length) return <Card span="half" title="Peak Age" desc="No data for this filter."><div className="vchart" /></Card>;
  const max = Math.max(...data.map(d => d.count));
  const bw = (W - P.l - P.r) / data.length;
  const ys = v => P.t + (1 - v / max) * (H - P.t - P.b);
  return (
    <Card span="half" title="Peak Age" desc="The age each player hit their REIGN peak — the prime window glows.">
      <div className="vchart" onMouseLeave={() => setHi(null)}>
        <svg viewBox={`0 0 ${W} ${H}`} className="vsvg">
          {data.map((d, i) => {
            const x = P.l + i * bw, h = (d.count / max) * (H - P.t - P.b);
            const prime = d.age >= 25 && d.age <= 30, near = d.age >= 23 && d.age <= 32;
            return (
              <g key={d.age} onMouseEnter={e => setHi({ d, ...vbPoint(e, W, H) })}>
                <rect x={x} y={P.t} width={bw} height={H - P.t - P.b} fill="transparent" />
                <rect x={x + bw * 0.14} y={ys(d.count)} width={bw * 0.72} height={h} rx={2} fill={prime ? MINT : near ? '#3a8d75' : '#2a3340'} opacity={hi && hi.d !== d ? 0.5 : 1} />
                {d.age % 2 === 1 && <text x={x + bw / 2} y={H - 16} textAnchor="middle" className="vaxis">{d.age}</text>}
              </g>
            );
          })}
          <text x={W / 2} y={H - 2} textAnchor="middle" className="vaxislbl">Age at peak</text>
        </svg>
        {hi && <Tip pos={hi}><b>Age {hi.d.age}</b><span>{hi.d.count} players peaked here</span></Tip>}
      </div>
    </Card>
  );
}

/* ═══ Clutch Top 25 — horizontal bars ═══ */
function ClutchTop25({ data }) {
  const [hi, setHi] = useState(null);
  const W = 480, rowH = 22, P = { t: 8, r: 16, b: 8, l: 122 };
  const H = P.t + P.b + data.length * rowH;
  const max = Math.max(...data.map(d => d.tot_pts));
  const xs = v => P.l + (v / max) * (W - P.l - P.r);
  return (
    <Card span="half" title="Clutch Careers — Top 25" desc="Most total clutch points (last 5 min, ≤5 pt game). Bar = total points, sorted by clutch PPG.">
      <div className="vchart" onMouseLeave={() => setHi(null)}>
        <svg viewBox={`0 0 ${W} ${H}`} className="vsvg" style={{ maxHeight: 'none' }}>
          {data.map((d, i) => {
            const y = P.t + i * rowH;
            return (
              <g key={d.name} onMouseEnter={e => setHi({ d, ...vbPoint(e, W, H) })}>
                <rect x={0} y={y} width={W} height={rowH} fill={hi?.d === d ? 'rgba(255,255,255,0.04)' : 'transparent'} />
                <text x={P.l - 8} y={y + rowH / 2 + 4} textAnchor="end" className="vname">{d.name}</text>
                <rect x={P.l} y={y + 3} width={Math.max(2, xs(d.tot_pts) - P.l)} height={rowH - 6} rx={3} fill={GOLD} opacity={hi && hi.d !== d ? 0.5 : 0.92} />
                <text x={xs(d.tot_pts) + 5} y={y + rowH / 2 + 4} className="vbarval">{d.avg_ppg}</text>
              </g>
            );
          })}
        </svg>
        {hi && <Tip pos={hi}><b>{hi.d.name}</b><span style={{ color: GOLD }}>{hi.d.tot_pts} total clutch pts</span><span>{hi.d.avg_ppg} PPG · +{hi.d.tot_pm} +/− · {hi.d.gp} GP</span></Tip>}
      </div>
    </Card>
  );
}
