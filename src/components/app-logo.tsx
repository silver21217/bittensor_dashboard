"use client";

type Props = { size?: number };

/**
 * AAA Live Subnets logo: a rounded square tile with three ascending
 * chevrons evoking "AAA" / upward trend, plus a pulse dot in the top-
 * right corner as a "live" indicator. Uses the brand red → orange
 * gradient so it matches the rest of the dashboard.
 */
export function AppLogo({ size = 28 }: Props) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      xmlns="http://www.w3.org/2000/svg"
      aria-label="AAA Live Subnets"
      suppressHydrationWarning
    >
      <defs>
        <linearGradient id="app-grad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#ed2939" />
          <stop offset="100%" stopColor="#ff8b1a" />
        </linearGradient>
      </defs>
      <rect width="32" height="32" rx="7" fill="url(#app-grad)" />
      {/* Three ascending chevrons = "AAA" + uptrend. Drawn as open
          polylines with rounded joins so they read as crisp peaks. */}
      <polyline
        points="8,21 12,17 16,21"
        fill="none"
        stroke="#ffffff"
        strokeOpacity="0.55"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <polyline
        points="11,17 16,12 21,17"
        fill="none"
        stroke="#ffffff"
        strokeOpacity="0.8"
        strokeWidth="1.9"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <polyline
        points="14,13 19,8 24,13"
        fill="none"
        stroke="#ffffff"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Live pulse dot in the corner */}
      <circle cx="25" cy="7" r="2.4" fill="#ffffff" />
      <circle cx="25" cy="7" r="1.2" fill="#22c55e" />
    </svg>
  );
}
