# REIGN 2.0 — Design Proposal

**Status:** proposal for review · **Author:** codebase review follow-up · **Scope:** full model respecification

---

## Why change the model at all

REIGN 1.x works, but it carries three structural debts that no amount of data
repair can fix:

1. **The generating model is lost.** The original scoring pipeline was never
   committed. What ships today is a linear *recovery* of its outputs
   (`derive_formulas.py`), which reconstructs offense well (R² 0.84–0.94) but
   modern defense poorly (R² 0.51). We now know — after fully backfilling the
   advanced stats — that this ceiling is the recovery, not data coverage.
   The site publishes ~29,000 numbers whose exact provenance cannot be
   reproduced. REIGN 2.0's first job is: **every number regenerable from
   committed code + committed inputs.**

2. **Era-pooled normalization penalizes the edges of each era.** Stats are
   z-scored against a whole era's pooled mean. Pioneer spans 17 seasons over
   which league TS% climbed ~10 points, so 1947–50 players are punished for
   playing before the pool average. Legacy is worse: **33 years** (1963–95)
   pooled together — a 1964 season is normalized against the 1988 league.

3. **The weights are regression artifacts.** Recovered coefficients include
   things like negative PER weights that offset other terms. They fit, but
   they can't be explained, defended, or sensibly extended.

## Design principles

- **Era-relative means year-relative.** A season is compared to the league
  the player actually faced, not to an era-sized pool.
- **Specified, not fitted-to-lost-outputs.** Components and weights are
  declared, justified, and sensitivity-tested — the model is the spec.
- **Same product surface.** The score keeps its familiar scale (+1 rotation
  player … +22 MVP … +26+ all-time), `REIGN = OFF + DEF` stays, and the
  site's tiers/heatmaps keep their meaning.
- **Reproducible end-to-end.** One committed script rebuilds every score
  from the season files. No frozen outputs, ever again.

---

## The model

### 1. Standardization: centered 5-year rolling window

Every input stat is standardized against the **league distribution of
qualified players (≥15 MPG) in a centered 5-season window** (±2 seasons,
clamped at dataset edges):

```
z5(x, year) = (x − μ_window(year)) / σ_window(year)
```

This is what the current Methodology page already *claims* the model does.
It fixes the Pioneer TS% drift and the Legacy 33-year pool in one move, and
it smooths single-season league shocks (lockouts, COVID, merger) better than
per-year z-scores would.

### 2. Components and weights

**OFF** (weights are the v2.0 starting spec — see §4 for how they get set):

| component | definition | weight |
|---|---|---|
| Scoring volume | z5(PTS/G) | 0.40 |
| Scoring efficiency | z5(TS% − lgTS%) | 0.20 |
| Volume×efficiency interaction | z5(PTS/G × rTS multiplier) | 0.15 |
| Playmaking | z5(AST/G) | 0.15 |
| Offensive impact | z5(OBPM) *(1974+)* or z5(OWS/G) *(pre-1974)* | 0.10 |

**DEF**, by feature tier:

| tier | years | definition |
|---|---|---|
| A | 1996+ | 0.35·z5(DBPM) + 0.25·z5(DWS/G) + 0.15·z5(STL) + 0.15·z5(BLK) + 0.10·z5(DREB) |
| B | 1974–95 | same as A (all inputs exist from 1973-74) |
| C | 1952–73 | 0.60·z5(DWS/G) + 0.25·z5(REB) + **role prior** (see below) |
| D | 1947–51 | 0.70·z5(DWS/G) + **role prior** (REB untracked before 1950-51) |

**Role prior** formalizes what `adjust_pioneer_defense.py` already does as a
patch: infer role (guard/wing/big) from the rebound/assist profile, and blend
in the median DEF earned by same-role, same-minutes players in the first
measurable window (1974–78). It becomes part of the spec — additive with a
cap, not a floor bolted on afterwards — and applies to tiers C **and** D
(the current patch only covers Pioneer, leaving 1963–73 with the same
problem).

### 3. Scale: quantile anchoring

Raw composites are quantile-mapped, per season, onto a **fixed reference
distribution**: the pooled 1997–2025 distribution of REIGN 1.x qualified
scores. Concretely, the 99th-percentile player in 1955 gets the same score
as the 99th-percentile player in 2024, and both land where a 99th-percentile
score lands today (~+17). Consequences:

- +20 means exactly the same relative dominance in every season — the
  cross-era promise becomes a mathematical property instead of an
  approximation.
- The site's tier labels, heatmap thresholds, and users' intuitions carry
  over unchanged.
- Season-count effects are explicit: being the best of 96 players (1955) vs
  450 (2024) maps to different percentiles automatically.

### 4. Setting the weights honestly

The table above is a defensible hand-set start. Before shipping, run the
**team-attribution calibration**: regress team offensive/defensive rating on
the minutes-weighted sum of players' OFF/DEF components (modern era, where
data is richest). Weights that make player scores *add up to team results*
are the empirical anchor; carry the same structural weights to earlier tiers
with the substitutions above. Guardrails: no negative weights, no component
above 0.5, and a published sensitivity table (top-50 rank stability under
±25% weight perturbation).

Validation gates before cutover (all scripted, all committed):

1. **Sanity:** consensus GOATs populate the top (Jordan/LeBron/Kareem-class
   peaks in the top 20 peak seasons).
2. **External correlation (not fitting):** rank-correlation of yearly top-10
   vs MVP voting shares ≥ v1's correlation.
3. **The bug it exists to fix:** 1947–50 offensive scores no longer
   systematically below their 1958–62 within-era peers at equal relative
   production.
4. **Continuity:** Spearman correlation vs v1 across all seasons reported
   (expect high overall; divergences listed and explained — early Pioneer
   and 1960s–70s defense should move, most of history should not).

### 5. Playoffs

Same pipeline, standardized against that year's playoff field, with the
existing opponent-quality adjustment kept as the optional view it is today.
Playoff advanced inputs are now fully backfilled, so tiers apply cleanly.

---

## What I recommend NOT doing (yet)

- **League-strength / era-strength adjustment** (deflating 1950s scores
  because the talent pool was shallower). It's a philosophical change —
  REIGN's premise is *relative dominance*, and quantile anchoring already
  handles pool size mechanically. If wanted later, it should be a separate
  toggle ("era-strength adjusted"), not baked into the headline number.
- **Plus-minus / tracking data.** Real upgrade for modern DEF, but only
  2013+ (or 1997+ for raw +/-), and mixing impact metrics into some eras but
  not others breaks cross-era comparability. Future work, clearly labeled.
- **Machine-learned weights.** The interpretability of a declared linear
  spec *is the product* for a reference site.

## Rollout plan

| phase | deliverable |
|---|---|
| 1 | `scripts/reign2/compute.py` — windows, components, quantile map; writes `reign2`, `reign2_off`, `reign2_def` alongside v1 fields |
| 2 | Calibration + validation harness; publish the report (gates in §4) |
| 3 | UI: "REIGN 2.0 (beta)" toggle on the leaderboard + a comparison page showing biggest movers, so the change is visible and reviewable before it's the default |
| 4 | Cutover: v2 becomes `reign`, v1 archived as `reign_v1` in the season files; Methodology + paper regenerated; nightly refresh scores new seasons with the v2 spec directly (no recovered formulas anywhere) |

No new data is required — every input already sits in the season files, and
league-window aggregates are computed from them. Each phase lands as its own
PR; nothing touches the live numbers until phase 4.

## Decision points

1. **Weights:** empirical team-attribution calibration with hand-set
   guardrails *(recommended)*, or pure hand-set.
2. **Reference distribution:** anchor to pooled 1997–2025 v1 scale
   *(recommended — preserves user intuition)*, or a clean-slate scale.
3. **Rollout:** side-by-side beta toggle for one cycle *(recommended)*, or
   hard cutover.
