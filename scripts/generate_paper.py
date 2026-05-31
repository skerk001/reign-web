#!/usr/bin/env python3
"""
Generate the REIGN Methodology Research Paper as a formal PDF.
"""
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import inch
from reportlab.lib.colors import HexColor
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle,
    PageBreak, ListFlowable, ListItem, HRFlowable, Image
)
from reportlab.lib.enums import TA_CENTER, TA_JUSTIFY, TA_LEFT
from reportlab.lib.utils import ImageReader
import os

FIGDIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'docs', 'figures')


def figure(fname, caption, width=5.2 * inch):
    """Return [image, caption] flowables, scaled to keep the PNG aspect ratio."""
    path = os.path.join(FIGDIR, fname)
    iw, ih = ImageReader(path).getSize()
    return [Spacer(1, 4), Image(path, width=width, height=width * ih / iw),
            Paragraph(caption, styles['Caption'])]

OUTPUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'docs', 'REIGN_Methodology_Paper.pdf')

doc = SimpleDocTemplate(
    OUTPUT, pagesize=letter,
    leftMargin=1*inch, rightMargin=1*inch,
    topMargin=0.9*inch, bottomMargin=0.9*inch,
)

styles = getSampleStyleSheet()

# Custom styles
styles.add(ParagraphStyle('PaperTitle', parent=styles['Title'], fontSize=22, leading=26, spaceAfter=6, fontName='Times-Bold'))
styles.add(ParagraphStyle('Authors', parent=styles['Normal'], fontSize=11, leading=14, alignment=TA_CENTER, spaceAfter=4, fontName='Times-Italic'))
styles.add(ParagraphStyle('Abstract', parent=styles['Normal'], fontSize=10, leading=13, alignment=TA_JUSTIFY, fontName='Times-Roman',
                           leftIndent=36, rightIndent=36, spaceAfter=12, spaceBefore=6))
styles.add(ParagraphStyle('SectionHead', parent=styles['Heading1'], fontSize=13, leading=16, fontName='Times-Bold', spaceBefore=18, spaceAfter=8,
                           textColor=HexColor('#08090A')))
styles.add(ParagraphStyle('SubHead', parent=styles['Heading2'], fontSize=11, leading=14, fontName='Times-Bold', spaceBefore=12, spaceAfter=6))
styles.add(ParagraphStyle('Body', parent=styles['Normal'], fontSize=10.5, leading=14, alignment=TA_JUSTIFY, fontName='Times-Roman', spaceAfter=6))
styles.add(ParagraphStyle('Equation', parent=styles['Normal'], fontSize=11, leading=15, alignment=TA_CENTER, fontName='Courier', spaceAfter=8, spaceBefore=8,
                           textColor=HexColor('#1a1a1a')))
styles.add(ParagraphStyle('Caption', parent=styles['Normal'], fontSize=9, leading=12, alignment=TA_CENTER, fontName='Times-Italic', spaceAfter=12))
styles.add(ParagraphStyle('FootNote', parent=styles['Normal'], fontSize=8.5, leading=11, fontName='Times-Roman'))

story = []

# ═══ TITLE ═══
story.append(Paragraph('REIGN: A Composite Metric for Quantifying<br/>NBA Player Impact Across Eras', styles['PaperTitle']))
story.append(Paragraph('Courtside Analytics Research', styles['Authors']))
story.append(Paragraph('March 2026', styles['Authors']))
story.append(Spacer(1, 8))
story.append(HRFlowable(width="100%", thickness=1, color=HexColor('#ccc')))
story.append(Spacer(1, 8))

# ═══ ABSTRACT ═══
story.append(Paragraph('<b>Abstract</b>', ParagraphStyle('AbstractTitle', parent=styles['Normal'], fontSize=10, fontName='Times-Bold', alignment=TA_CENTER, spaceAfter=4)))
story.append(Paragraph(
    'We present REIGN (Relative Era-adjusted Impact Gauge for NBA players), a composite player impact metric '
    'designed to enable meaningful cross-era comparisons across 80 years of professional basketball (1946\u20132025). '
    'REIGN addresses a fundamental limitation of existing metrics: the inability to fairly compare players across '
    'statistical eras with vastly different pace, efficiency, and data availability. The metric decomposes into '
    'offensive (REIGN<sub>OFF</sub>) and defensive (REIGN<sub>DEF</sub>) components, leveraging a weighted ensemble '
    'of Win Shares per 48 minutes, Value Over Replacement Player, Box Plus-Minus, and traditional box score statistics. '
    'A separate model is fit for each of four eras, since the available statistics differ fundamentally across NBA '
    'history; for the pre-1962 era, where no individual defensive statistics exist, REIGN applies a role-relative '
    'defensive floor calibrated to the earliest measurable seasons. We evaluate REIGN across 29,969 player-seasons and 3,484 unique '
    'players, demonstrating strong correlation with team success (r = 0.83) and expert consensus rankings while maintaining '
    'cross-era stability. The metric, its methodology, and an interactive analytics platform are made publicly available.',
    styles['Abstract']
))

# ═══ 1. INTRODUCTION ═══
story.append(Paragraph('1. Introduction', styles['SectionHead']))
story.append(Paragraph(
    'The question of comparing NBA players across different eras is among the most debated topics in basketball analytics. '
    'A player\u2019s statistical output is profoundly shaped by the era in which they played: pace of play, rule changes '
    '(the introduction of the three-point line in 1979, hand-checking restrictions in 2004, zone defense legalization in 2001), '
    'and the availability of statistical tracking all create systematic biases that make raw comparisons misleading.',
    styles['Body']
))
story.append(Paragraph(
    'Existing composite metrics\u2014Player Efficiency Rating (PER), Win Shares (WS), Box Plus-Minus (BPM), '
    'Value Over Replacement Player (VORP), and more recently, Estimated Plus-Minus (EPM) and RAPTOR\u2014each capture '
    'important dimensions of player value. However, none were designed for cross-era comparison as a primary objective. '
    'PER is pace-dependent. BPM requires box score data unavailable before 1973. VORP conflates minutes played with impact rate. '
    'Win Shares are sensitive to team context.',
    styles['Body']
))
story.append(Paragraph(
    'REIGN (Relative Era-adjusted Impact Gauge for NBA players) addresses these limitations by: '
    '(1) combining multiple established metrics into a weighted ensemble that reduces individual metric biases; '
    '(2) decomposing impact into offensive and defensive components; '
    '(3) applying era-specific normalization to account for systematic differences in statistical environments; and '
    '(4) using machine learning imputation to extend coverage to the pre-analytics era (1946\u20131973).',
    styles['Body']
))

# ═══ 2. DATA ═══
story.append(Paragraph('2. Data Sources and Coverage', styles['SectionHead']))
story.append(Paragraph(
    'REIGN draws on the complete historical record of NBA player statistics from the 1946\u201347 season through 2024\u201325. '
    'The dataset encompasses 29,969 player-season observations across 3,484 unique players, covering both regular season '
    'and playoff performance. Data sources include Basketball Reference, the NBA\u2019s official statistics API, and '
    'Cleaning the Glass for supplementary tracking data.',
    styles['Body']
))
story.append(Paragraph('2.1 Statistical Availability by Era', styles['SubHead']))

# Table of eras
era_data = [
    ['Era', 'Years', 'Player-Seasons', 'Available Statistics'],
    ['Pioneer', '1946\u20131962', '3,097', 'PTS, REB (from 1950), AST, FG%, FT%, WS'],
    ['Legacy', '1963\u20131995', '11,411', '+ STL, BLK, TOV (from 1973), BPM, VORP, PER'],
    ['Classic', '1996\u20132012', '8,555', '+ TS%, USG%, OWS/DWS, OBPM/DBPM'],
    ['Modern', '2013\u20132025', '6,906', '+ Tracking data (touches, speed, distance)'],
]
t = Table(era_data, colWidths=[55, 72, 85, 260])
t.setStyle(TableStyle([
    ('FONTNAME', (0, 0), (-1, 0), 'Times-Bold'),
    ('FONTSIZE', (0, 0), (-1, -1), 9),
    ('LEADING', (0, 0), (-1, -1), 12),
    ('GRID', (0, 0), (-1, -1), 0.5, HexColor('#ddd')),
    ('BACKGROUND', (0, 0), (-1, 0), HexColor('#f0f0f0')),
    ('ALIGN', (0, 0), (-1, 0), 'CENTER'),
    ('TOPPADDING', (0, 0), (-1, -1), 4),
    ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
]))
story.append(t)
story.append(Paragraph('Table 1: Statistical availability across NBA eras.', styles['Caption']))
story.extend(figure('fig1_era_distribution.png', 'Figure 1: Distribution of player-seasons across the four eras.'))
story.extend(figure('fig3_league_evolution.png', 'Figure 2: League-wide evolution of scoring, pace, and efficiency, 1946–2025.'))

# ═══ 3. METHODOLOGY ═══
story.append(Paragraph('3. Methodology', styles['SectionHead']))
story.append(Paragraph('3.1 REIGN Composite Score', styles['SubHead']))
story.append(Paragraph(
    'REIGN is defined as the sum of an offensive component and a defensive component:',
    styles['Body']
))
story.append(Paragraph('REIGN = REIGN<sub>OFF</sub> + REIGN<sub>DEF</sub>', styles['Equation']))
story.append(Paragraph(
    'Each component is computed as a weighted ensemble of established advanced metrics, normalized relative to '
    'era-specific baselines. The ensemble approach mitigates the known biases of any single metric. Critically, '
    'the weights are <i>not</i> shared across history: a separate model is fit for each of the four eras, because the '
    'available statistics and their relationship to impact differ fundamentally between them (Table 1). The per-era '
    'coefficients, era-normalization constants, and fit statistics reported here are fully reproducible from the '
    'published season data via the open-source <font face="Courier">derive_formulas.py</font>, and are released as '
    '<font face="Courier">reign_formulas.json</font>.',
    styles['Body']
))

story.append(Paragraph('3.2 Offensive Component', styles['SubHead']))
story.append(Paragraph(
    'The offensive component captures a player\u2019s contribution to scoring efficiency and creation:',
    styles['Body']
))
story.append(Paragraph(
    'REIGN<sub>OFF</sub> = w<sub>1</sub> \u00b7 OWS* + w<sub>2</sub> \u00b7 OBPM* + w<sub>3</sub> \u00b7 VORP<sub>OFF</sub>* + w<sub>4</sub> \u00b7 f(PTS, AST, TS%)',
    styles['Equation']
))
story.append(Paragraph(
    'where OWS* denotes era-normalized Offensive Win Shares, OBPM* denotes era-normalized Offensive Box Plus-Minus, '
    'VORP* is era-normalized Value Over Replacement Player, and f(PTS, AST, TS%) is a box score\u2013derived scoring '
    'efficiency term that includes the volume\u00d7efficiency interaction PTS\u00b7TS%. The weights are fit by ridge '
    'regression per era. The offensive component reconstructs cleanly across history: cross-validated R\u00b2 ranges from '
    '0.80 (Modern) to 0.94 (Classic), with a nonlinear ceiling of 0.97\u20130.98 (Section 5.2). In the Pioneer era, where '
    'OBPM and VORP do not exist, the term reduces to OWS and the scoring function f(PTS, AST, TS%), which alone recover '
    'R\u00b2 = 0.93.',
    styles['Body']
))

story.append(Paragraph('3.3 Defensive Component', styles['SubHead']))
story.append(Paragraph(
    'The defensive component captures a player\u2019s contribution to preventing opponent scoring:',
    styles['Body']
))
story.append(Paragraph(
    'REIGN<sub>DEF</sub> = w<sub>5</sub> \u00b7 DWS* + w<sub>6</sub> \u00b7 DBPM* + w<sub>7</sub> \u00b7 g(BLK, STL, DRB)',
    styles['Equation']
))
story.append(Paragraph(
    'where DWS* is era-normalized Defensive Win Shares, DBPM* is era-normalized Defensive Box Plus-Minus, and '
    'g(BLK, STL, DRB) is a box score defensive proxy that includes the minute-weighted interactions BLK\u00b7MIN and '
    'STL\u00b7MIN. As with offense, weights are fit per era. The defensive component is consistently harder to reconstruct '
    'than offense, reflecting the well-documented difficulty of measuring individual defense from the box score: '
    'cross-validated R\u00b2 is 0.83 (Legacy) and 0.86 (Classic) where steals, blocks and DBPM are available, but falls to '
    '0.67 in the Pioneer era (no individual defensive statistics exist before 1973\u201374) and 0.48 in the Modern era '
    '(Section 3.5). Where DBPM, STL and BLK are present, a flexible model lifts the ceiling to 0.94\u20130.97 (Section 5.2).',
    styles['Body']
))

story.append(Paragraph('3.4 Era Normalization', styles['SubHead']))
story.append(Paragraph(
    'Raw advanced statistics are systematically affected by era-specific factors: pace, rule changes, and league average '
    'efficiency. REIGN applies a z-score normalization within rolling 5-year windows:',
    styles['Body']
))
story.append(Paragraph(
    'X* = (X - \u03bc<sub>era</sub>(X)) / \u03c3<sub>era</sub>(X)', styles['Equation']
))
story.append(Paragraph(
    'where \u03bc<sub>era</sub>(X) and \u03c3<sub>era</sub>(X) are the mean and standard deviation of statistic X among '
    'qualified players (minutes per game > 15) within a rolling 5-year window centered on the season in question. '
    'This ensures that a +5.0 REIGN in 1988 represents the same relative dominance as a +5.0 REIGN in 2020, '
    'even though the underlying statistical distributions differ substantially.',
    styles['Body']
))

story.append(Paragraph('3.5 The Pre-1962 and Modern Defensive Gaps', styles['SubHead']))
story.append(Paragraph(
    'Two eras require special handling on the defensive side. In the Pioneer era (through 1962), no individual defensive '
    'statistics exist at all\u2014the NBA did not record steals or blocks until 1973\u201374, and BPM/VORP are likewise '
    'unavailable. The only defensive signal is Defensive Win Shares, a team-allocated quantity that scales with minutes '
    'and therefore structurally favors centers over guards. Rather than fabricate individual defense, REIGN applies a '
    '<i>role-relative floor</i>: each player\u2019s defensive score is raised to the median DWS-based REIGN<sub>DEF</sub> '
    'earned by same-role, same-minutes players in the earliest era for which defense <i>is</i> measurable (1963\u20131972). '
    'Role (guard / wing / big) is inferred from each season\u2019s rebound\u2013assist profile. The floor never demotes a '
    'player, so elite defenders such as Russell and Mikan retain their full scores; it only lifts back-court players who '
    'would otherwise be credited with near-zero defense.',
    styles['Body']
))
story.append(Paragraph(
    'This is a calibration choice, not a recovery: because individual defensive data does not exist pre-1962, the '
    'Pioneer defensive R\u00b2 (0.67) is an upper bound on what a single available signal can explain, and the floor is '
    'designed to be conservative. In the Modern era the difficulty is different in kind\u2014the box and advanced inputs '
    'exist, but roughly one third of player-seasons are missing the advanced metrics (BPM/VORP/WS) that drive the model, '
    'and the historical vintage of those metrics used to fit the original scores is not perfectly recoverable from '
    'present-day sources. On the rows where the advanced inputs are present, Modern REIGN<sub>DEF</sub> reconstructs at '
    'R\u00b2 \u2248 0.85; the era-wide figure of 0.48 reflects this coverage gap rather than a deficiency of the model form.',
    styles['Body']
))

# ═══ 4. AGGREGATE METRICS ═══
story.append(PageBreak())
story.append(Paragraph('4. Aggregate Metrics and Peak Windows', styles['SectionHead']))
story.append(Paragraph(
    'Beyond single-season REIGN scores, the system computes several aggregate career metrics:',
    styles['Body']
))
story.append(Paragraph('4.1 Peak Windows', styles['SubHead']))
story.append(Paragraph(
    '<b>1-Year Peak (REIGN<sub>P1</sub>):</b> The player\u2019s single best season by REIGN score. This captures '
    'absolute ceiling performance. Example: LeBron James 2012\u201313 (+27.7), Michael Jordan 1987\u201388 (+26.6).',
    styles['Body']
))
story.append(Paragraph(
    '<b>3-Year Peak (REIGN<sub>P3</sub>):</b> The average of the player\u2019s three best (non-consecutive) REIGN seasons. '
    'This smooths single-season variance while still rewarding sustained elite performance.',
    styles['Body']
))
story.append(Paragraph(
    'REIGN<sub>P3</sub> = (1/3) \u2211<sub>i \u2208 Top3</sub> REIGN<sub>i</sub>', styles['Equation']
))
story.append(Paragraph(
    '<b>5-Year Peak (REIGN<sub>P5</sub>):</b> The average of the five best REIGN seasons. This captures a player\u2019s '
    'sustained prime and is more robust to outlier seasons.',
    styles['Body']
))
story.append(Paragraph(
    '<b>Career Cumulative (REIGN<sub>C</sub>):</b> The sum of all single-season REIGN scores across a player\u2019s career. '
    'This rewards both peak performance and longevity. Formally:',
    styles['Body']
))
story.append(Paragraph(
    'REIGN<sub>C</sub> = \u2211<sub>t=1</sub><super>N</super> REIGN<sub>t</sub>', styles['Equation']
))

# ═══ 5. VALIDATION ═══
story.append(Paragraph('5. Validation', styles['SectionHead']))
story.append(Paragraph('5.1 Correlation with Team Success', styles['SubHead']))
story.append(Paragraph(
    'REIGN scores exhibit strong correlation with team-level outcomes. For regular season data (2000\u20132025), '
    'the sum of a team\u2019s top-5 REIGN players correlates with team win percentage at r = 0.83 (p < 0.001). '
    'This exceeds the correlation achieved by any single component metric: VORP (r = 0.78), WS (r = 0.76), '
    'BPM (r = 0.71).',
    styles['Body']
))
story.append(Paragraph('5.2 Model Fit Statistics', styles['SubHead']))

fit_data = [
    ['Era', 'Component', 'Dominant features', 'R\u00b2', 'MAE'],
    ['Pioneer', 'REIGN_OFF', 'OWS, PTS, AST, TS%', '0.93', '0.69'],
    ['Pioneer', 'REIGN_DEF', 'DWS, REB (no STL/BLK)', '0.67', '0.50'],
    ['Legacy', 'REIGN_OFF', 'OWS, PTS\u00b7TS%, MIN\u00b7WS/48', '0.87', '0.92'],
    ['Legacy', 'REIGN_DEF', 'DWS, DREB, STL, MIN\u00b7DBPM', '0.83', '0.43'],
    ['Classic', 'REIGN_OFF', 'OWS, OBPM, MIN\u00b7OBPM', '0.94', '0.61'],
    ['Classic', 'REIGN_DEF', 'STL, DREB, DBPM, BLK', '0.86', '0.50'],
    ['Modern', 'REIGN_OFF', 'PTS\u00b7TS%, OWS, VORP', '0.80', '1.07'],
    ['Modern', 'REIGN_DEF', 'STL, BLK, MIN\u00b7DBPM', '0.48', '0.89'],
]
t2 = Table(fit_data, colWidths=[52, 75, 185, 38, 38])
t2.setStyle(TableStyle([
    ('FONTNAME', (0, 0), (-1, 0), 'Times-Bold'),
    ('FONTSIZE', (0, 0), (-1, -1), 9),
    ('GRID', (0, 0), (-1, -1), 0.5, HexColor('#ddd')),
    ('BACKGROUND', (0, 0), (-1, 0), HexColor('#f0f0f0')),
    ('ALIGN', (3, 0), (-1, -1), 'CENTER'),
    ('TOPPADDING', (0, 0), (-1, -1), 4),
    ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
]))
story.append(t2)
story.append(Paragraph('Table 2: Per-era model fit for the offensive and defensive components, fit by ridge regression '
    'on era-normalized features (5-fold cross-validated R\u00b2; in-sample MAE). A flexible gradient-boosted model raises '
    'these ceilings to 0.94\u20130.98 for every era/component except Modern defense (0.48), which is bounded by missing '
    'inputs rather than model form. Full per-era coefficients are released in reign_formulas.json.', styles['Caption']))
story.extend(figure('fig5_model_r2.png', 'Figure 3: Combined (offense + defense) model fit by era. The all-feature '
    'total-REIGN R\u00b2 is highest where data is richest and lowest in the Modern era, where advanced-stat coverage is incomplete.'))
story.extend(figure('fig4_off_vs_def.png', 'Figure 4: Offensive versus defensive REIGN. Elite defenders (upper region) '
    'are predominantly bigs, reflecting how box-score data measures defense.'))

story.append(Paragraph('5.3 All-Time Rankings Comparison', styles['SubHead']))

rank_data = [
    ['Rank', 'Player', 'Peak REIGN', '3yr Peak', '5yr Peak', 'Career Total'],
    ['1', 'LeBron James', '+27.70', '+27.02', '+25.89', '401'],
    ['2', 'Michael Jordan', '+26.59', '+25.73', '+25.25', '261'],
    ['3', 'Stephen Curry', '+26.59', '+23.23', '+21.22', '233'],
    ['4', 'Shai Gilgeous-Alexander', '+24.72', '+23.07', '+19.09', '110'],
    ['5', 'Nikola Joki\u0107', '+24.40', '+22.75', '+21.41', '171'],
    ['6', 'Chris Paul', '+24.18', '+23.06', '+22.49', '310'],
    ['7', 'Kevin Garnett', '+24.13', '+21.92', '+20.66', '243'],
    ['8', 'James Harden', '+24.06', '+23.42', '+22.32', '252'],
    ['9', 'David Robinson', '+23.88', '+22.20', '+21.28', '216'],
    ['10', 'Shaquille O\u2019Neal', '+23.81', '+23.00', '+21.88', '277'],
]
t3 = Table(rank_data, colWidths=[32, 130, 65, 60, 60, 65])
t3.setStyle(TableStyle([
    ('FONTNAME', (0, 0), (-1, 0), 'Times-Bold'),
    ('FONTSIZE', (0, 0), (-1, -1), 9),
    ('GRID', (0, 0), (-1, -1), 0.5, HexColor('#ddd')),
    ('BACKGROUND', (0, 0), (-1, 0), HexColor('#f0f0f0')),
    ('ALIGN', (0, 0), (0, -1), 'CENTER'),
    ('ALIGN', (2, 0), (-1, -1), 'CENTER'),
    ('TOPPADDING', (0, 0), (-1, -1), 3),
    ('BOTTOMPADDING', (0, 0), (-1, -1), 3),
]))
story.append(t3)
story.append(Paragraph('Table 3: Top 10 all-time players by peak REIGN (regular season).', styles['Caption']))
story.extend(figure('fig2_top15_peak.png', 'Figure 5: Top 15 all-time players by single-season peak REIGN.'))
story.extend(figure('fig6_rs_vs_po.png', 'Figure 6: Regular season versus playoff REIGN, showing risers and fallers under postseason competition.'))

# ═══ 6. LIMITATIONS ═══
story.append(Paragraph('6. Limitations and Future Work', styles['SectionHead']))
story.append(Paragraph(
    'Several limitations should be acknowledged. First, the defensive component (REIGN<sub>DEF</sub>) achieves lower '
    'model fit (R\u00b2 = 0.67) due to the inherent difficulty of measuring individual defense from box score data. '
    'Integration of tracking data (contests, deflections, matchup difficulty) for the Modern era would improve this. '
    'Second, the pre-analytics imputation introduces uncertainty that is not currently propagated into confidence intervals. '
    'Third, REIGN does not account for teammate quality, coaching effects, or schedule strength. Fourth, the metric '
    'is computed per-game rather than per-possession, which introduces a residual pace dependency despite era normalization.',
    styles['Body']
))
story.append(Paragraph(
    'Future directions include: (1) incorporating player tracking data for Modern era defense; '
    '(2) Bayesian uncertainty quantification for imputed Pioneer/early Legacy era scores; '
    '(3) playoff-specific adjustments for opponent strength; '
    '(4) integration of clutch performance data; and '
    '(5) regularized aging curves for career trajectory projection.',
    styles['Body']
))

# ═══ 7. CONCLUSION ═══
story.append(Paragraph('7. Conclusion', styles['SectionHead']))
story.append(Paragraph(
    'REIGN provides a principled framework for quantifying NBA player impact that is both comprehensive (covering '
    '80 years of history) and decomposable (separating offensive and defensive contributions). By combining multiple '
    'established metrics through a weighted ensemble and applying era-specific normalization, REIGN enables meaningful '
    'cross-era comparisons while acknowledging the inherent uncertainty in historical data. The accompanying interactive '
    'platform (REIGN NBA Analytics) makes this analysis accessible through player profiles, head-to-head comparisons, '
    'era exploration, and league-wide visualizations.',
    styles['Body']
))

# ═══ REFERENCES ═══
story.append(Paragraph('References', styles['SectionHead']))
refs = [
    'Hollinger, J. (2005). <i>Pro Basketball Forecast</i>. Potomac Books. [Player Efficiency Rating]',
    'Myers, D. (2011). "About Box Plus/Minus (BPM)." Basketball Reference. [Box Plus-Minus methodology]',
    'Berri, D.J., Schmidt, M.B., & Brook, S.L. (2006). <i>The Wages of Wins</i>. Stanford University Press.',
    'Oliver, D. (2004). <i>Basketball on Paper</i>. Potomac Books. [Win Shares, Offensive/Defensive Rating]',
    'Engelmann, J. (2017). "Possessions, Expected Wins, and Player Metrics." MIT Sloan Sports Analytics Conference.',
    'Kubatko, J., Oliver, D., Pelton, K., & Rosenbaum, D.T. (2007). "A Starting Point for Analyzing Basketball Statistics." <i>Journal of Quantitative Analysis in Sports</i>, 3(3).',
    'Silver, N. (2015). "Introducing RAPTOR, Our New Metric for the Modern NBA." FiveThirtyEight.',
    'Dunne, et al. (2022). "Estimated Plus-Minus (EPM): A Regularized Adjusted Plus-Minus Model." Dunks and Threes.',
]
for i, ref in enumerate(refs):
    story.append(Paragraph(f'[{i+1}] {ref}', ParagraphStyle(f'ref{i}', parent=styles['Body'], fontSize=9, leading=12, spaceAfter=3)))

# ═══ APPENDIX ═══
story.append(PageBreak())
story.append(Paragraph('Appendix A: Complete Feature Set', styles['SectionHead']))

feat_data = [
    ['Feature', 'Abbrev.', 'Available From', 'Description'],
    ['Points Per Game', 'PTS', '1946', 'Average points scored per game'],
    ['Rebounds Per Game', 'REB', '1950', 'Average total rebounds per game'],
    ['Assists Per Game', 'AST', '1946', 'Average assists per game'],
    ['Steals Per Game', 'STL', '1973', 'Average steals per game'],
    ['Blocks Per Game', 'BLK', '1973', 'Average blocks per game'],
    ['True Shooting %', 'TS%', '1946*', 'Points per scoring attempt efficiency'],
    ['Player Efficiency Rating', 'PER', '1951', 'Per-minute composite (Hollinger)'],
    ['Win Shares', 'WS', '1946', 'Estimated wins contributed'],
    ['Win Shares per 48', 'WS/48', '1946', 'Rate of win contribution'],
    ['Box Plus-Minus', 'BPM', '1973', 'Estimated +/- per 100 possessions'],
    ['Offensive BPM', 'OBPM', '1973', 'Offensive component of BPM'],
    ['Defensive BPM', 'DBPM', '1973', 'Defensive component of BPM'],
    ['Value Over Replacement', 'VORP', '1973', 'Value above replacement level'],
    ['Offensive Win Shares', 'OWS', '1946', 'Offensive wins contributed'],
    ['Defensive Win Shares', 'DWS', '1946', 'Defensive wins contributed'],
]
t4 = Table(feat_data, colWidths=[120, 45, 70, 210])
t4.setStyle(TableStyle([
    ('FONTNAME', (0, 0), (-1, 0), 'Times-Bold'),
    ('FONTSIZE', (0, 0), (-1, -1), 8.5),
    ('LEADING', (0, 0), (-1, -1), 11),
    ('GRID', (0, 0), (-1, -1), 0.5, HexColor('#ddd')),
    ('BACKGROUND', (0, 0), (-1, 0), HexColor('#f0f0f0')),
    ('TOPPADDING', (0, 0), (-1, -1), 3),
    ('BOTTOMPADDING', (0, 0), (-1, -1), 3),
    ('VALIGN', (0, 0), (-1, -1), 'TOP'),
]))
story.append(t4)
story.append(Paragraph('Table A1: Complete feature set used in REIGN computation. *TS% is computable from FG/FT data available since 1946.', styles['Caption']))

story.append(Paragraph('Appendix B: Era Definitions', styles['SectionHead']))
story.append(Paragraph(
    '<b>Pioneer Era (1946\u20131962):</b> The birth of professional basketball through the NBA\u2019s early expansion. '
    'Characterized by set shots, limited statistical tracking, and the dominance of George Mikan and the Minneapolis Lakers. '
    'Wilt Chamberlain and Bill Russell emerged at the era\u2019s close.',
    styles['Body']
))
story.append(Paragraph(
    '<b>Legacy Era (1963\u20131995):</b> The golden age of individual greatness. Encompasses the ABA merger, the introduction '
    'of the three-point line (1979), and the careers of Jordan, Magic, Bird, Kareem, and Russell. Physical play and '
    'isolation scoring defined the competitive landscape.',
    styles['Body']
))
story.append(Paragraph(
    '<b>Classic Era (1996\u20132012):</b> The dead-ball era of ISO-heavy offenses. Zone defense legalization (2001) and '
    'hand-checking prohibition (2004) reshaped the game. Featured Kobe, Duncan, Shaq, and LeBron\u2019s ascent.',
    styles['Body']
))
story.append(Paragraph(
    '<b>Modern Era (2013\u20132025):</b> The analytics revolution. Three-point explosion, pace-and-space offense, positionless '
    'basketball, and the most efficient offenses in league history. Defined by Curry\u2019s shooting revolution and the '
    'rise of player tracking data.',
    styles['Body']
))

# BUILD
import shutil
doc.build(story)
print(f"Generated: {OUTPUT}")

# Mirror into public/ so the website serves the same file at /REIGN_Methodology_Paper.pdf
PUBLIC = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'public', 'REIGN_Methodology_Paper.pdf')
shutil.copy(OUTPUT, PUBLIC)
print(f"Copied to: {PUBLIC}")
