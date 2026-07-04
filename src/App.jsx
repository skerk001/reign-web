import { useState, useEffect, useCallback, lazy, Suspense } from 'react';
import Nav from './components/Nav';
import Loading from './components/Loading';
import Rankings from './views/Rankings';
import './index.css';

// Lazy-load non-landing views so the initial bundle ships only Rankings + React.
// The large Compare/Players/Viz views load on demand per tab.
const Players = lazy(() => import('./views/Players'));
const Compare = lazy(() => import('./views/Compare'));
const EraExplorer = lazy(() => import('./views/Eras'));
const Visualizations = lazy(() => import('./views/Viz'));
const Methodology = lazy(() => import('./views/Methodology'));

function parseURL() {
  const params = new URLSearchParams(window.location.search);
  const view = params.get('v');
  const p1 = params.get('p1');
  const p2 = params.get('p2');
  const p3 = params.get('p3');
  if (view === 'compare' && (p1 || p2)) {
    return { view: 'compare', players: [p1 || null, p2 || null, p3 || null].filter(Boolean) };
  }
  if (view === 'player' && params.get('p')) {
    return { view: 'player', player: params.get('p'), players: [] };
  }
  if (view) return { view, players: [] };
  return null;
}

export default function App() {
  const [view, setView] = useState(() => parseURL()?.view || 'rankings');
  const [player, setPlayer] = useState(() => parseURL()?.player || null);
  const [comparePlayer, setComparePlayer] = useState(null);
  const [initialCompare, setInitialCompare] = useState(() => parseURL()?.players || null);

  const updateURL = useCallback((players) => {
    const params = new URLSearchParams();
    params.set('v', 'compare');
    if (players?.[0]) params.set('p1', players[0]);
    if (players?.[1]) params.set('p2', players[1]);
    if (players?.[2]) params.set('p3', players[2]);
    window.history.replaceState(null, '', '?' + params.toString());
  }, []);

  // Keep the URL shareable for every view: ?v=player&p=Name deep-links a
  // profile; Compare writes its own p1/p2/p3 params via updateURL.
  useEffect(() => {
    if (view === 'compare' || view === 'rankings') return; // these views manage their own params
    const params = new URLSearchParams();
    if (view !== 'rankings') params.set('v', view);
    if (view === 'player' && player) params.set('p', player);
    const qs = params.toString();
    window.history.replaceState(null, '', qs ? '?' + qs : window.location.pathname);
  }, [view, player]);

  return (
    <>
      <Nav view={view} setView={setView} />
      <main>
        <Suspense fallback={<Loading />}>
          {view === 'rankings' && <Rankings onPlayerClick={n => { setPlayer(n); setView('player'); }} />}
          {view === 'player' && <Players initialPlayer={player} onPlayerChange={setPlayer} onCompare={n => { setComparePlayer(n); setView('compare'); }} />}
          {view === 'compare' && <Compare initialPlayer={comparePlayer} initialCompare={initialCompare} onClearInitial={() => { setComparePlayer(null); setInitialCompare(null); }} onPlayersChange={updateURL} />}
          {view === 'eras' && <EraExplorer />}
          {view === 'viz' && <Visualizations />}
          {view === 'methodology' && <Methodology />}
        </Suspense>
      </main>
    </>
  );
}
