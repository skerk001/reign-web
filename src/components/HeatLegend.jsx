// Small legend decoding the heatmap cell colors. Swatches are inline gradients
// sampled from src/utils/heatmap.js, so it needs no external CSS to render colors.
const ITEMS = [
  ['REIGN', ['#143029', '#0f8061', '#33e3ad', '#5DFDCB']],
  ['OFF', ['#352712', '#b06d14', '#e0962a', '#F5B942']],
  ['DEF', ['#183353', '#2a5f9c', '#3f8fd4', '#7CC6FE']],
];

export default function HeatLegend() {
  return (
    <div className="heat-legend">
      <span className="hl-cap">How to read:</span>
      {ITEMS.map(([label, cols]) => (
        <span className="hl-item" key={label}>
          <span className="hl-label">{label}</span>
          <span className="hl-bar" style={{ background: `linear-gradient(90deg, ${cols.join(',')})` }} />
        </span>
      ))}
      <span className="hl-note">low → high · <span className="hl-neg" /> below 0</span>
    </div>
  );
}
