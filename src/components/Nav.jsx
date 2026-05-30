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
          <svg className="crown" viewBox="0 0 24 20" fill="none">
            <path d="M1.5 16L4.5 4.5L9 10.5L12 1L15 10.5L19.5 4.5L22.5 16H1.5Z"
                  fill="currentColor" opacity="0.15" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
            <rect x="1.5" y="16" width="21" height="2.5" rx="1" fill="currentColor" opacity="0.4"/>
          </svg>
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
