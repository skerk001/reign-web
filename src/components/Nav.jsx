import CrownLogo from './CrownLogo';
import './Nav.css';

const VIEWS = [
  { id: 'rankings', label: 'Leaderboard' },
  { id: 'player', label: 'Players' },
  { id: 'compare', label: 'Compare' },
  { id: 'eras', label: 'Era Explorer' },
  { id: 'viz', label: 'Visualizations' },
  { id: 'methodology', label: 'Methodology' },
];

export default function Nav({ view, setView }) {
  return (
    <nav className="nav">
      <div className="nav-inner">
        <button className="nav-brand" onClick={() => setView('rankings')}>
          <CrownLogo className="crown" />
          <span className="brand-text">REIGN</span>
          <span className="brand-sub">NBA Analytics</span>
        </button>

        <div className="nav-tabs">
          {VIEWS.map(v => (
            <button
              key={v.id}
              className={`nav-tab${view === v.id ? ' active' : ''}`}
              onClick={() => setView(v.id)}
            >
              {v.label}
            </button>
          ))}
        </div>
      </div>
    </nav>
  );
}
