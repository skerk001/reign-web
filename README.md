# REIGN — NBA Analytics

> Quantifying NBA player impact across 80 years of basketball using era-specific composite models.

![Top 15 All-Time](docs/figures/fig2_top15_peak.png)

## Research Paper

The full methodology is documented in our formal research paper:

**[REIGN: A Composite Metric for Quantifying NBA Player Impact Across Eras](docs/REIGN_Methodology_Paper.pdf)**

*Samir Kerkar — Courtside Analytics, March 2026*

Key contributions:
- Four era-specific regression models (Pioneer, Legacy, Classic, Modern)
- 60/40 dampened blend for Modern era recomputation using scraped advanced stats
- Playoff opponent strength adjustment based on opposing team quality
- 29,969 player-seasons, 3,484 players, 1946–2025

## All-Time Top 10 by Peak REIGN

| # | Player | Year | Peak REIGN |
|---|--------|------|------------|
| 1 | LeBron James | 2012 | +27.70 |
| 2 | Michael Jordan | 1987 | +26.59 |
| 3 | Stephen Curry | 2015 | +26.59 |
| 4 | Shai Gilgeous-Alexander | 2024 | +24.72 |
| 5 | Nikola Jokic | 2024 | +24.40 |
| 6 | Chris Paul | 2008 | +24.18 |
| 7 | Kevin Garnett | 2003 | +24.13 |
| 8 | James Harden | 2018 | +24.06 |
| 9 | David Robinson | 1993 | +23.88 |
| 10 | Shaquille O'Neal | 1999 | +23.81 |

## How REIGN Works

REIGN uses **different models for different eras** because the available statistics differ fundamentally across NBA history:

![Model Fit](docs/figures/fig5_model_r2.png)

- **Pioneer (1946-62):** TS%-dominant model, 11 features, no steals/blocks/BPM
- **Legacy (1963-95):** WS/48-dominant, 18 features, richest data
- **Classic (1996-2012):** WS/48 + VORP, 19 features including 3P%
- **Modern (2013-25):** WS/48-dominant after enrichment, 19 features

All scores are era-normalized via z-score within rolling 5-year windows, ensuring +20 REIGN means the same relative dominance whether it's 1988 or 2024.

![Era Distribution](docs/figures/fig1_era_distribution.png)

![Offense vs Defense](docs/figures/fig4_off_vs_def.png)

## Features

- **Leaderboard** — Sortable rankings with era filtering, 1yr/3yr/5yr peak views, clutch stats
- **Player Profiles** — Career arcs, skill radar, season heatmaps, award shelf for 3,484 players
- **Head-to-Head Compare** — Side-by-side stats, peak bars, trajectory overlay, radar, PNG export
- **Era Explorer** — Deep-dive into each era with evolution charts and cross-era tables
- **Visualizations** — League trends, OFF vs DEF scatter, age distribution, REIGN distribution
- **RS/PO Toggle** — Every page supports Regular Season and Playoff modes
- **Opponent-Adjusted Playoffs** — Scale playoff REIGN by opposing team quality
- **URL-Shareable Comparisons** — `?v=compare&p1=LeBron+James&p2=Michael+Jordan`

![League Evolution](docs/figures/fig3_league_evolution.png)

## Tech Stack

- React 19 + Vite 7
- Custom SVG charts + Recharts
- IBM Plex Sans + Source Serif 4 typography
- Service worker for data caching (stale-while-revalidate)
- Fuzzy player search (accent-tolerant, typo-friendly)
- html2canvas for PNG export (lazy-loaded)

## Development

```bash
npm install
npm run dev
```

## Build and Deploy

```bash
npm run build
```

Output goes to `dist/`. Works with Vercel, Netlify, or any static hosting.

**Vercel (recommended):** Push to GitHub, import in Vercel, deploy. No config needed.

## Data

Split into parallel-loaded era files for fast initial load:

| File | Size | Gzipped |
|------|------|---------|
| `seasons_pioneer.json` | 1.4 MB | 0.2 MB |
| `seasons_legacy.json` | 5.3 MB | 1.1 MB |
| `seasons_classic.json` | 6.5 MB | 1.2 MB |
| `seasons_modern.json` | 5.1 MB | 0.8 MB |

Additional: `awards.json`, `stretches_rs3/rs5/po3/po5.json`, `career_avg_rs/po.json`, `career_clutch.json`

## Scripts

- `scripts/regenerate_careers.py` — Rebuild careers.json from seasons.json
- `scripts/generate_paper.py` — Generate the methodology PDF

## License

Research and data for non-commercial use.
