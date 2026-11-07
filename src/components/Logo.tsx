/**
 * TrendSignal mark: a rising trend line whose latest point emits signal arcs.
 * Tile and strokes use the theme tokens, so the mark inverts with the dark theme; the green
 * point stays fixed, as in the PWA icon. Decorative: the product name always sits beside it.
 * Source artwork for other uses: assets/logo/trendsignal-logo.svg (keep both in sync).
 */
export function Logo({ size = 40, className = '' }: { size?: number; className?: string }) {
  return (
    <svg
      data-logo
      viewBox="0 0 64 64"
      width={size}
      height={size}
      aria-hidden="true"
      focusable="false"
      className={className}
    >
      <rect width="64" height="64" rx="15" className="fill-primary" />
      <polyline
        points="11,47 23,36 31,41 42,26"
        fill="none"
        strokeWidth="5.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="stroke-on-primary"
      />
      <path
        d="M43.74 16.15 A10 10 0 0 1 51.85 24.26"
        fill="none"
        strokeOpacity="0.8"
        strokeWidth="3.6"
        strokeLinecap="round"
        className="stroke-on-primary"
      />
      <path
        d="M44.78 10.24 A16 16 0 0 1 57.76 23.22"
        fill="none"
        strokeOpacity="0.45"
        strokeWidth="3.6"
        strokeLinecap="round"
        className="stroke-on-primary"
      />
      <circle cx="42" cy="26" r="5" fill="#059669" />
    </svg>
  );
}
