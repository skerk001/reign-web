// Percentile bars — the profile/compare "skill profile" as small labeled bars,
// one per category. Replaces the old radial "StatBloom": bar length maps
// linearly to percentile (petal area didn't), and the 50th-percentile tick
// gives every row a common reference line.

const tierColor = v => (v >= 90 ? '#5DFDCB' : v >= 70 ? '#7CC6FE' : v >= 40 ? '#8789C0' : '#565a7c');

export function PercentileBars({ data, accent }) {
  if (!data?.length) return null;
  return (
    <div className="pbars">
      {data.map(d => {
        const v = Math.max(0, Math.min(100, d.value));
        const color = accent || tierColor(d.value);
        return (
          <div className="pbar-row" key={d.label}>
            <span className="pbar-label">{d.label}</span>
            <div className="pbar-track">
              <span className="pbar-median" />
              <div className="pbar-fill" style={{ width: `${Math.max(1.5, v)}%`, background: color }} />
            </div>
            <span className="pbar-pct" style={{ color }}>{d.value >= 100 ? '99+' : d.value}th</span>
            <span className="pbar-raw">{d.raw}</span>
          </div>
        );
      })}
      <div className="pbar-foot">percentile vs all qualifying seasons · | = league median</div>
    </div>
  );
}
