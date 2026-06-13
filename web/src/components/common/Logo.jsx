// Bhumi brand mark — a gradient "earth + leaf + orbiting twin" glyph. Earth/land (Bhumi) with a
// growing leaf and a small orbiting satellite dot (the digital twin watching from above).
export default function Logo({ size = 30, className = '' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" className={className} aria-label="Bhumi">
      <defs>
        <linearGradient id="bhumi-bg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#0ea5b7" />
          <stop offset="0.5" stopColor="#2bbf8f" />
          <stop offset="1" stopColor="#6e8a63" />
        </linearGradient>
        <linearGradient id="bhumi-leaf" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset="1" stopColor="#eaf3e6" />
        </linearGradient>
      </defs>

      {/* rounded badge */}
      <rect x="0.5" y="0.5" width="31" height="31" rx="9" fill="url(#bhumi-bg)" />
      {/* glossy top light */}
      <rect x="0.5" y="0.5" width="31" height="15" rx="9" fill="#ffffff" opacity="0.12" />

      {/* leaf */}
      <path
        d="M16 6.5c-5 2-6.5 8.2-2.8 13.6 0.9 1.3 2 2.4 2.8 3.1 0.8-0.7 1.9-1.8 2.8-3.1 3.7-5.4 2.2-11.6-2.8-13.6Z"
        fill="url(#bhumi-leaf)"
      />
      {/* leaf vein */}
      <path d="M16 9.2v12.4" stroke="#2bbf8f" strokeWidth="1.1" strokeLinecap="round" />
      <path d="M16 13.5l2.6-2 M16 16.6l-2.6-2 M16 19.4l2.4-1.9" stroke="#2bbf8f" strokeWidth="0.9" strokeLinecap="round" />

      {/* orbiting twin / satellite dot */}
      <circle cx="24.5" cy="8" r="2.1" fill="#f4c430" stroke="#ffffff" strokeWidth="0.8" />
    </svg>
  )
}
