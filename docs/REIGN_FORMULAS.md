# Re-derived REIGN formulas (per era)

The original REIGN scoring pipeline was never committed to this repo. This
document reconstructs it from the frozen season data, where every row carries
both the model **inputs** (`ows`, `obpm`, `vorp`, `dws`, `dbpm`, `stl`, `blk`,
`dreb`, ...) and the model **outputs** (`reign_off`, `reign_def`, `reign`).

Reproduce everything with:

```bash
python3 scripts/derive_formulas.py    # writes public/data/reign_formulas.json
```

## 1. The exact identity

```
reign = reign_off + reign_def        (R² = 1.000000 in every era)
```

`|reign_off + reign_def − reign|` is 0 to full precision in pioneer/classic/
legacy and ≤ 0.01 in modern (2-dp rounding). So only the two **component**
formulas need to be recovered.

## 2. How well each component is recoverable

Two fits per era/component:

* **Linear (interpretable)** — OLS on z-scored, era-appropriate features plus a
  few readable engineered terms (volume×efficiency products, `min×advanced`).
  In-sample R² from `scripts/derive_formulas.py`; ≈ the 5-fold CV value because
  n ≫ #features.
* **Ceiling (gradient boosting)** — 5-fold cross-validated R² from a flexible
  tree ensemble. This is the *honest* upper bound on how much of the target the
  available columns can explain. Where ceiling ≫ linear, the gap is recoverable
  nonlinearity. Where ceiling ≈ linear and still low, the gap is **missing
  inputs**, not model form.

| Era | `reign_off` linear | `reign_off` ceiling | `reign_def` linear | `reign_def` ceiling |
|-----|:---:|:---:|:---:|:---:|
| pioneer (1946–1962) | 0.93 | 0.98 | **0.64** | 0.94 |
| legacy  (1963–1995) | 0.87 | 0.98 | 0.83 | 0.97 |
| classic (1996–2012) | 0.94 | 0.97 | 0.86 | 0.95 |
| modern  (2013–2025) | 0.80 | 0.84 | **0.48** | **0.48** |

The exact weights, intercepts, and per-feature (mean, std) used for z-scoring
live in [`public/data/reign_formulas.json`](../public/data/reign_formulas.json).
Each contribution is `weight × (x − mean) / std`.

## 3. Two structural data facts (read this before "fixing" anything)

These explain the long-standing ranking complaint — that pre-modern guards
(West ≈ 14.3, Oscar ≈ 14.8) get almost no defensive credit and are capped below
Mikan/Pettit — and they cap how close to R² = 1 any *honest* formula can get.

### Pioneer defense is DWS-only by historical necessity
In the pioneer era (ends 1962), these columns are **100% empty**:

```
stl, blk, dreb, oreb, tov, obpm, dbpm, vorp, fg3a
```

The NBA did not record steals or blocks until 1973-74. The *only* defensive
signal that exists before then is `dws` — a team-defense metric allocated
largely by minutes, which structurally favors high-minute centers over guards.
So pioneer-era guards cannot earn individual defensive REIGN: **there is no
individual defensive data to earn it from.** This is a data-availability fact,
not a weighting bug, and it is why `reign_def` there tops out at ~0.64 linear /
0.94 ceiling on a single feature.

### Modern advanced stats are ~1/3 missing every season
In the modern era the metrics that *drive* REIGN (`dbpm`, `obpm`, `vorp`,
`dws`) are present for only ~62–69% of players in **every** season, and 0% in
2025 (the in-progress season is not yet populated):

```
2013: 64%   2016: 62%   2019: 65%   2022: 67%   2025:  0%
2014: 66%   2017: 66%   2020: 66%   2023: 67%
2015: 64%   2018: 64%   2021: 67%   2024: 69%
```

Because linear ≈ ceiling for modern (0.80≈0.84 off, 0.48≈0.48 def), the gap to
1.0 is **not** something a better formula can close — it is missing inputs.
Forcing modern `reign_def` toward R² = 1 would only memorize noise on the rows
that happen to have data and would distort, not improve, the rankings.

## 4. Recommendation

* For **pioneer / legacy / classic**, the formulas in `reign_formulas.json`
  reconstruct REIGN well (component R² 0.83–0.94 linear, 0.94–0.98 ceiling);
  these are safe to document and use.
* The pioneer guard-defense ceiling is inherent to pre-1973 data. If guards
  should rank higher there, that is a **methodology** decision (e.g. a defensive
  floor, a position adjustment, or excluding defense pre-1973) — not a fit to
  improve.
* For **modern**, populate the missing `bpm`/`vorp`/`ws` coverage (and the 2025
  season) at the data-source step before trusting any modern defensive formula.
