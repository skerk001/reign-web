import { reignBg, offBg, defBg, textColor } from '../utils/heatmap';
import './Methodology.css';

const ERA_MODELS = [
  { id: 'Pioneer', color: '#8789C0', years: '1946–62', model: 'TS%-dominant', features: '11 features',
    note: 'No steals, blocks, or BPM existed yet — the early box score. Shooting efficiency carries the model.' },
  { id: 'Legacy', color: '#D97706', years: '1963–95', model: 'WS/48-dominant', features: '18 features',
    note: 'The richest classic data. Win Shares per 48 anchor impact through the golden age of individual greatness.' },
  { id: 'Classic', color: '#2563EB', years: '1996–2012', model: 'WS/48 + VORP', features: '19 features',
    note: 'Adds VORP and 3P% as the three-point era and advanced tracking arrive.' },
  { id: 'Modern', color: '#10B981', years: '2013–25', model: 'WS/48-dominant', features: '19 features',
    note: 'Recomputed with a 60/40 dampened blend over scraped advanced stats for stability.' },
];

const TIERS = [
  { v: 26, label: 'All-time great', ex: 'LeBron ’13 · Jordan ’88' },
  { v: 22, label: 'MVP-caliber season', ex: '' },
  { v: 16, label: 'All-NBA level', ex: '' },
  { v: 11, label: 'All-Star level', ex: '' },
  { v: 6, label: 'Solid starter', ex: '' },
  { v: 1, label: 'Rotation player', ex: '' },
  { v: -3, label: 'Below replacement', ex: '' },
];

export default function Methodology() {
  return (
    <div className="mth">
      <div className="mth-wrap">
        <div className="mth-header">
          <h1 className="mth-title">Methodology</h1>
          <p className="mth-desc">What the REIGN metric measures, and how it's computed across 80 years of basketball.</p>
        </div>

        {/* What is REIGN */}
        <section className="mth-section">
          <h2 className="mth-h2">What is REIGN?</h2>
          <p className="mth-lead">
            <b>REIGN</b> is a single composite number that captures a player's total on-court impact in a season — how much
            better they made their team, expressed on one scale that's comparable across every era of NBA history.
          </p>
          <div className="mth-eq">
            <span className="mth-eq-term mth-reign">REIGN</span>
            <span className="mth-eq-op">=</span>
            <span className="mth-eq-term mth-off">OFF</span>
            <span className="mth-eq-op">+</span>
            <span className="mth-eq-term mth-def">DEF</span>
          </div>
          <div className="mth-split">
            <div className="mth-split-card mth-card-off">
              <span className="mth-split-label">OFF — Offensive Impact</span>
              <p>Scoring, efficiency, playmaking, and floor-spacing — everything a player adds on the offensive end.</p>
            </div>
            <div className="mth-split-card mth-card-def">
              <span className="mth-split-label">DEF — Defensive Impact</span>
              <p>Rim protection, steals, defensive rebounding, and overall stopping power on the other end.</p>
            </div>
          </div>
        </section>

        {/* Core idea */}
        <section className="mth-section">
          <h2 className="mth-h2">The core idea: era-normalized z-scores</h2>
          <p className="mth-body">
            Basketball in 1960 barely resembles basketball in 2024 — pace, three-pointers, and even which stats were
            recorded all changed. So REIGN doesn't compare raw numbers across time. Instead, every season is scored as a
            <b> z-score within a rolling 5-year window</b> — i.e., relative to its own moment in history.
          </p>
          <div className="mth-callout">
            A <b className="mth-reign">+20 REIGN</b> means the same level of relative dominance whether it was earned in
            <b> 1988</b> or <b>2024</b>. The number is anchored to the league around the player, not to a fixed yardstick.
          </div>
        </section>

        {/* Era models */}
        <section className="mth-section">
          <h2 className="mth-h2">Four era-specific models</h2>
          <p className="mth-body">
            Because the available statistics differ fundamentally across NBA history, REIGN uses a <b>separate regression
            model for each era</b> — each trained on the richest data available for its years.
          </p>
          <div className="mth-eras">
            {ERA_MODELS.map(e => (
              <div key={e.id} className="mth-era-card" style={{ '--ec': e.color }}>
                <div className="mth-era-top">
                  <span className="mth-era-name">{e.id}</span>
                  <span className="mth-era-years">{e.years}</span>
                </div>
                <div className="mth-era-model">{e.model} · {e.features}</div>
                <p className="mth-era-note">{e.note}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Scale */}
        <section className="mth-section">
          <h2 className="mth-h2">How to read the number</h2>
          <p className="mth-body">REIGN typically ranges from below 0 (below a replacement-level player) up to the high 20s for the greatest seasons ever. As a rough guide:</p>
          <div className="mth-scale">
            {TIERS.map(t => {
              const bg = reignBg(t.v);
              return (
                <div className="mth-tier" key={t.label}>
                  <span className="mth-tier-chip" style={{ background: bg, color: textColor(bg) }}>{t.v >= 0 ? '+' : ''}{t.v}</span>
                  <span className="mth-tier-label">{t.label}</span>
                  {t.ex && <span className="mth-tier-ex">{t.ex}</span>}
                </div>
              );
            })}
          </div>
        </section>

        {/* Playoffs + clutch */}
        <section className="mth-section">
          <h2 className="mth-h2">Playoffs & clutch</h2>
          <div className="mth-twocol">
            <div className="mth-mini">
              <h3 className="mth-h3">Opponent-adjusted playoffs</h3>
              <p>Playoff REIGN can be scaled by the quality of the opposing team — rewarding production against elite
              competition and discounting it against weaker opponents.</p>
            </div>
            <div className="mth-mini">
              <h3 className="mth-h3">Clutch</h3>
              <p>Clutch metrics isolate the final five minutes of games within five points — scoring, plus-minus, and win
              rate when it matters most, separate from the season-long REIGN.</p>
            </div>
          </div>
        </section>

        {/* Footer / paper */}
        <section className="mth-section mth-paper">
          <div className="mth-paper-inner">
            <div>
              <h2 className="mth-h2" style={{ marginBottom: 6 }}>The full paper</h2>
              <p className="mth-body" style={{ marginBottom: 0 }}>
                Read the formal write-up: <i>REIGN: A Composite Metric for Quantifying NBA Player Impact Across Eras</i>
                — Samir Kerkar, Courtside Analytics.
              </p>
            </div>
            <a className="mth-paper-btn" href="/REIGN_Methodology_Paper.pdf" target="_blank" rel="noopener noreferrer">Read the paper →</a>
          </div>
          <div className="mth-stats">
            <span><b>29,969</b> player-seasons</span>
            <span><b>3,484</b> players</span>
            <span><b>1946–2025</b></span>
            <span><b>4</b> era models</span>
          </div>
        </section>
      </div>
    </div>
  );
}
