"use client";

type Props = { size?: number };

/**
 * Dashboard logo: a circular mark built from an orbital ring and a centered τ.
 * The ring echoes the "subnet network" concept, the τ cements the Bittensor
 * brand. Works in both light and dark themes — currentColor is the τ glyph,
 * the ring uses the brand accent.
 */
export function BrandLogo({ size = 28 }: Props) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      xmlns="http://www.w3.org/2000/svg"
      aria-label="Bittensor subnets terminal"
      suppressHydrationWarning
    >
      <defs>
        <linearGradient id="brand-grad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#ed2939" />
          <stop offset="100%" stopColor="#ff8b1a" />
        </linearGradient>
      </defs>
      <rect width="32" height="32" rx="7" fill="url(#brand-grad)" />
      {/* orbit ring */}
      <circle
        cx="16"
        cy="16"
        r="9"
        stroke="#ffffff"
        strokeOpacity="0.55"
        strokeWidth="1.25"
        fill="none"
      />
      <circle cx="25" cy="16" r="1.6" fill="#ffffff" />
      {/* τ monogram */}
      <text
        x="16"
        y="21.25"
        textAnchor="middle"
        fontFamily="ui-sans-serif, Inter, system-ui, sans-serif"
        fontSize="15"
        fontWeight="700"
        fill="#ffffff"
      >
        τ
      </text>
    </svg>
  );
}
