import './Backdrop.css';

// Cosmic Court — a global artistic backdrop behind every view.
// Layers (back → front): deep base + drifting gold/mint aurora, a tiled
// twinkling starfield, a few basketball "orb" stars, and one giant faint
// three-point arc anchoring the bottom. Purely decorative + non-interactive.
export default function Backdrop() {
  return (
    <div className="backdrop" aria-hidden="true">
      <div className="bd-aurora" />
      <div className="bd-stars bd-stars-1" />
      <div className="bd-stars bd-stars-2" />

      {/* Basketball "orb" stars — orange glow + seams */}
      <svg className="bd-orbs" viewBox="0 0 1000 1000" preserveAspectRatio="xMidYMid slice">
        <defs>
          <radialGradient id="bdBall" cx="38%" cy="34%" r="72%">
            <stop offset="0%" stopColor="#ffb866" />
            <stop offset="45%" stopColor="#e07a10" />
            <stop offset="100%" stopColor="#8a3d04" />
          </radialGradient>
          <filter id="bdGlow" x="-120%" y="-120%" width="340%" height="340%">
            <feGaussianBlur stdDeviation="6" result="b" />
            <feMerge>
              <feMergeNode in="b" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
        {/* Reusable basketball at unit scale (r=12), drawn via <use> + transforms */}
        <symbol id="bdBall12" viewBox="-14 -14 28 28">
          <circle r="12" fill="url(#bdBall)" />
          <g fill="none" stroke="#5a2702" strokeWidth="1" opacity="0.65">
            <line x1="0" y1="-12" x2="0" y2="12" />
            <line x1="-12" y1="0" x2="12" y2="0" />
            <path d="M -9 -8 Q 0 0 -9 8" />
            <path d="M 9 -8 Q 0 0 9 8" />
          </g>
        </symbol>
        <g className="bd-orb" filter="url(#bdGlow)">
          <use href="#bdBall12" x="-14" y="-14" width="28" height="28"
               transform="translate(180 220) scale(1.1)" />
        </g>
        <g className="bd-orb bd-orb-b" filter="url(#bdGlow)">
          <use href="#bdBall12" x="-14" y="-14" width="28" height="28"
               transform="translate(760 160) scale(0.75)" />
        </g>
        <g className="bd-orb bd-orb-c" filter="url(#bdGlow)">
          <use href="#bdBall12" x="-14" y="-14" width="28" height="28"
               transform="translate(620 520) scale(0.55)" />
        </g>
        <g className="bd-orb bd-orb-d" filter="url(#bdGlow)">
          <use href="#bdBall12" x="-14" y="-14" width="28" height="28"
               transform="translate(120 640) scale(0.5)" />
        </g>
      </svg>

      {/* Constellation of legends — faint stars wired into a crown (REIGN) */}
      <svg className="bd-crown" viewBox="0 0 400 230" preserveAspectRatio="xMidYMid meet">
        <g stroke="var(--gold)" strokeWidth="1" fill="none"
           strokeLinejoin="round" strokeLinecap="round" opacity="0.22">
          <path d="M40 190 L52 58 L130 128 L200 26 L270 128 L348 58 L360 190 Z" />
          <path d="M40 190 L360 190" />
        </g>
        <g className="bd-crown-stars" fill="var(--ink)">
          {/* peak tips — brighter */}
          <circle cx="52" cy="58" r="2.6" className="bd-twk" />
          <circle cx="200" cy="26" r="3.2" fill="var(--mint)" className="bd-twk" />
          <circle cx="348" cy="58" r="2.6" className="bd-twk" />
          {/* valleys + base corners */}
          <circle cx="130" cy="128" r="1.8" className="bd-twk" />
          <circle cx="270" cy="128" r="1.8" className="bd-twk" />
          <circle cx="40" cy="190" r="2.1" fill="var(--gold)" className="bd-twk" />
          <circle cx="360" cy="190" r="2.1" fill="var(--gold)" className="bd-twk" />
          {/* band gems */}
          <circle cx="200" cy="190" r="1.6" className="bd-twk" />
          <circle cx="120" cy="190" r="1.3" className="bd-twk" />
          <circle cx="280" cy="190" r="1.3" className="bd-twk" />
        </g>
      </svg>

      {/* Giant faint three-point arc + center circle, anchored bottom-center */}
      <svg className="bd-court" viewBox="0 0 1200 600" preserveAspectRatio="xMidYMax slice">
        <g fill="none" stroke="var(--mint)" strokeWidth="1.5" opacity="0.10">
          <path d="M 140 620 L 140 360 A 460 460 0 0 1 1060 360 L 1060 620" />
          <circle cx="600" cy="620" r="120" />
          <line x1="430" y1="620" x2="770" y2="620" />
        </g>
        <g fill="none" stroke="var(--gold)" strokeWidth="1" opacity="0.08">
          <circle cx="600" cy="620" r="220" />
        </g>
      </svg>

      <div className="bd-vignette" />
    </div>
  );
}
