// REIGN mark — an artistic crown whose center jewel is a basketball,
// tying the "reign" motif to the sport. Pure inline SVG so it scales
// crisply and inherits color from CSS. Gradient ids are namespaced to
// avoid collisions if the logo appears more than once on a page.
export default function CrownLogo({ className = '', size = 30 }) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 64 60"
      role="img"
      aria-label="REIGN crown"
      fill="none"
    >
      <defs>
        <linearGradient id="cl-gold" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#ffe39a" />
          <stop offset="42%" stopColor="#f5b942" />
          <stop offset="100%" stopColor="#b8860b" />
        </linearGradient>
        <linearGradient id="cl-band" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#f5b942" />
          <stop offset="100%" stopColor="#8b6508" />
        </linearGradient>
        <radialGradient id="cl-ball" cx="38%" cy="34%" r="72%">
          <stop offset="0%" stopColor="#ffb866" />
          <stop offset="48%" stopColor="#e07a10" />
          <stop offset="100%" stopColor="#8a3d04" />
        </radialGradient>
      </defs>

      {/* Crown body: three peaks with valleys */}
      <path
        d="M6 44 L8 18 L21 31 L32 12 L43 31 L56 18 L58 44 Z"
        fill="url(#cl-gold)"
        stroke="#7a5606"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
      {/* Inner facet highlight */}
      <path
        d="M32 12 L43 31 L32 39 L21 31 Z"
        fill="#ffffff"
        opacity="0.16"
      />

      {/* Pearls at the peak tips */}
      <circle cx="8" cy="18" r="3.4" fill="url(#cl-gold)" stroke="#7a5606" strokeWidth="1" />
      <circle cx="56" cy="18" r="3.4" fill="url(#cl-gold)" stroke="#7a5606" strokeWidth="1" />
      <circle cx="32" cy="9" r="4" fill="#5dfdcb" stroke="#1f8f74" strokeWidth="1" />

      {/* Base band */}
      <rect x="6" y="44" width="52" height="11" rx="3.5" fill="url(#cl-band)" stroke="#7a5606" strokeWidth="1.4" />

      {/* Center jewel = basketball */}
      <g transform="translate(32 49.5)">
        <circle r="6.2" fill="url(#cl-ball)" stroke="#5a2702" strokeWidth="0.8" />
        <g fill="none" stroke="#5a2702" strokeWidth="0.7" opacity="0.75">
          <line x1="0" y1="-6.2" x2="0" y2="6.2" />
          <line x1="-6.2" y1="0" x2="6.2" y2="0" />
          <path d="M -4.6 -4.1 Q 0 0 -4.6 4.1" />
          <path d="M 4.6 -4.1 Q 0 0 4.6 4.1" />
        </g>
      </g>

      {/* Side gems on the band */}
      <circle cx="16" cy="49.5" r="2.1" fill="#5dfdcb" opacity="0.9" />
      <circle cx="48" cy="49.5" r="2.1" fill="#5dfdcb" opacity="0.9" />
    </svg>
  );
}
