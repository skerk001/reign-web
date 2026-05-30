import { useState, useMemo } from 'react';

const MINT = '#5DFDCB', GOLD = '#F5B942';

// pointer position relative to the chart's <svg>, in CSS px
function svgPos(e) {
  const svg = e.currentTarget.ownerSVGElement || e.currentTarget;
  const r = svg.getBoundingClientRect();
  return { px: e.clientX - r.left, py: e.clientY - r.top };
}

function ChartTip({ tip }) {
  if (!tip) return null;
  return <div className="pchart-tip" style={{ left: tip.px + 14, top: tip.py + 14 }}>{tip.body}</div>;
}

/* ═══ Career Constellation — career arc as a star map ═══ */
export function Constellation({ rs = [], po = [] }) {
  const [tip, setTip] = useState(null);
  const W = 960, H = 380, P = { t: 30, r: 28, b: 38, l: 30 };
  const data = useMemo(() => {
    const years = [...new Set([...rs, ...po].map(r => r.year))].sort((a, b) => a - b);
    const reigns = [...rs, ...po].map(r => r.reign);
    const maxV = Math.max(...reigns, 5), minV = Math.min(...reigns, 0), range = maxV - minV || 1;
    const y0 = years[0], y1 = years[years.length - 1];
    const xs = yr => P.l + ((yr - y0) / (y1 - y0 || 1)) * (W - P.l - P.r);
    const ys = v => P.t + (1 - (v - minV) / range) * (H - P.t - P.b);
    const map = arr => arr.map(r => ({ x: xs(r.year), y: ys(r.reign), rr: 2.5 + ((r.reign - minV) / range) * 9, s: r }));
    const peak = rs.length ? rs.reduce((a, b) => (b.reign > a.reign ? b : a)) : null;
    return { years, xs, ys, rsPts: map(rs), poPts: map(po), peak, y0, y1 };
  }, [rs, po]);

  if (data.years.length < 2) return null;
  const yrTicks = data.years.filter((_, i) => i % Math.max(1, Math.ceil(data.years.length / 14)) === 0 || i === data.years.length - 1);
  const star = (p, color, peak) => {
    return (
      <g key={`${color}-${p.s.year}`} style={{ cursor: 'pointer' }}
        onMouseEnter={e => setTip({ ...svgPos(e), body: <><b>{p.s.year}-{String(p.s.year + 1).slice(-2)} · {color === MINT ? 'RS' : 'PO'}</b><span style={{ color }}>REIGN {p.s.reign >= 0 ? '+' : ''}{p.s.reign.toFixed(1)}</span><span>{(p.s.pts || 0).toFixed(1)}p · {(p.s.reb || 0).toFixed(1)}r · {(p.s.ast || 0).toFixed(1)}a</span></> })}
        onMouseLeave={() => setTip(null)}>
        <circle cx={p.x} cy={p.y} r={p.rr + 7} fill={color} opacity={0.12} />
        <circle cx={p.x} cy={p.y} r={p.rr} fill={peak ? GOLD : color} stroke="#08090A" strokeWidth="1.5" />
        <circle cx={p.x} cy={p.y} r="14" fill="transparent" />
      </g>
    );
  };
  const path = pts => pts.map((p, i) => `${i ? 'L' : 'M'}${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');

  return (
    <div className="pchart">
      <svg viewBox={`0 0 ${W} ${H}`} className="pchart-svg" onMouseLeave={() => setTip(null)}>
        {/* ambient background stars */}
        {Array.from({ length: 70 }).map((_, i) => { const a = (i * 9301 + 49297) % 233280 / 233280, b = (i * 12345 + 1103) % 233280 / 233280; return <circle key={i} cx={a * W} cy={b * (H - P.b)} r={(i % 11 === 0 ? 1.4 : 0.7)} fill="#fff" opacity={i % 11 === 0 ? 0.5 : 0.18} />; })}
        {/* zero / grid line */}
        <line x1={P.l} y1={data.ys(0)} x2={W - P.r} y2={data.ys(0)} stroke="rgba(135,137,192,0.18)" strokeDasharray="5 5" />
        {/* constellation paths */}
        {data.poPts.length > 1 && <path d={path(data.poPts)} fill="none" stroke={GOLD} strokeWidth="1" opacity="0.4" strokeDasharray="4 4" />}
        {data.rsPts.length > 1 && <path d={path(data.rsPts)} fill="none" stroke={MINT} strokeWidth="1.4" opacity="0.45" />}
        {/* PO stars (under RS) */}
        {data.poPts.map(p => star(p, GOLD, false))}
        {/* RS stars */}
        {data.rsPts.map(p => star(p, MINT, data.peak && p.s.year === data.peak.year))}
        {/* peak label */}
        {data.peak && <text x={data.xs(data.peak.year)} y={data.ys(data.peak.reign) - 16} textAnchor="middle" className="cst-peak">★ {data.peak.year}-{String(data.peak.year + 1).slice(-2)} · {data.peak.reign.toFixed(1)}</text>}
        {/* year labels */}
        {yrTicks.map(yr => <text key={yr} x={data.xs(yr)} y={H - 12} textAnchor="middle" className="pchart-ax">'{String(yr + 1).slice(-2)}</text>)}
      </svg>
      <div className="pchart-legend">
        <span><i style={{ background: MINT }} />Regular Season</span>
        {po.length > 0 && <span><i style={{ background: GOLD }} />Playoffs</span>}
        <span className="pchart-hint">bigger, higher star = bigger season</span>
      </div>
      <ChartTip tip={tip} />
    </div>
  );
}

/* ═══ Stat Bloom — skill profile as a radial flower ═══ */
export function StatBloom({ data, accent }) {
  const [hi, setHi] = useState(null);
  if (!data?.length) return null;
  const SIZE = 460, cx = SIZE / 2, cy = SIZE / 2, R = 150;
  const petals = data.map((d, i) => {
    const ang = (i / data.length) * Math.PI * 2 - Math.PI / 2;
    const v = Math.max(8, d.value) / 100;
    const len = 46 + v * R;
    const wob = 24 + v * 22;
    const px = cx + Math.cos(ang) * 44, py = cy + Math.sin(ang) * 44;
    const tx = cx + Math.cos(ang) * len, ty = cy + Math.sin(ang) * len;
    const c1x = px + Math.cos(ang + 0.55) * wob, c1y = py + Math.sin(ang + 0.55) * wob;
    const c2x = px + Math.cos(ang - 0.55) * wob, c2y = py + Math.sin(ang - 0.55) * wob;
    const lx = cx + Math.cos(ang) * (len + 30), ly = cy + Math.sin(ang) * (len + 30);
    const color = accent || (i % 2 ? MINT : GOLD);
    return { d, ang, color, i, lx, ly,
      path: `M${px.toFixed(1)} ${py.toFixed(1)} Q${c1x.toFixed(1)} ${c1y.toFixed(1)} ${tx.toFixed(1)} ${ty.toFixed(1)} Q${c2x.toFixed(1)} ${c2y.toFixed(1)} ${px.toFixed(1)} ${py.toFixed(1)} Z` };
  });
  return (
    <div className="bloom">
      <svg viewBox={`0 0 ${SIZE} ${SIZE}`} className="bloom-svg" onMouseLeave={() => setHi(null)}>
        <defs>
          <radialGradient id="bloomGlow" cx="50%" cy="50%" r="50%"><stop offset="0%" stopColor="#5DFDCB" stopOpacity="0.12" /><stop offset="100%" stopColor="#5DFDCB" stopOpacity="0" /></radialGradient>
        </defs>
        <circle cx={cx} cy={cy} r={R + 40} fill="url(#bloomGlow)" />
        {[0.4, 0.7, 1].map(f => <circle key={f} cx={cx} cy={cy} r={44 + f * R} fill="none" stroke="rgba(135,137,192,0.12)" />)}
        {petals.map(p => (
          <g key={p.i} style={{ cursor: 'pointer' }} onMouseEnter={() => setHi(p.i)} onMouseLeave={() => setHi(null)}>
            <path d={p.path} fill={p.color} opacity={hi === null ? 0.78 : hi === p.i ? 0.95 : 0.32} stroke={p.color} strokeWidth="1.5" style={{ transition: 'opacity .14s' }} />
          </g>
        ))}
        <circle cx={cx} cy={cy} r="42" fill="#0d0f13" stroke="rgba(135,137,192,0.3)" strokeWidth="1.5" />
        <text x={cx} y={cy - 4} textAnchor="middle" className="bloom-center-v" style={accent ? { fill: accent } : undefined}>{Math.round(data.reduce((s, d) => s + d.value, 0) / data.length)}</text>
        <text x={cx} y={cy + 13} textAnchor="middle" className="bloom-center-l">AVG %ILE</text>
        {petals.map(p => (
          <g key={`l${p.i}`} opacity={hi === null || hi === p.i ? 1 : 0.4} style={{ transition: 'opacity .14s' }}>
            <text x={p.lx} y={p.ly - 9} textAnchor="middle" className="bloom-lbl">{p.d.label}</text>
            <text x={p.lx} y={p.ly + 8} textAnchor="middle" className="bloom-val" fill={p.color}>{p.d.value >= 100 ? '99+' : p.d.value}th</text>
            <text x={p.lx} y={p.ly + 23} textAnchor="middle" className="bloom-raw">{p.d.raw}</text>
          </g>
        ))}
      </svg>
    </div>
  );
}
