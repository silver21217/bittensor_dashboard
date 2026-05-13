"use client";

import { BrandLogo } from "./brand-logo";

type Props = {
  /** Overall spinner diameter in pixels. Logo scales proportionally. */
  size?: number;
  /** Minimum container height for centring within its parent. */
  minHeight?: number | string;
  /** className for the outer wrapper. */
  className?: string;
};

/**
 * Shared brand spinner used across initial load, tab switches, and async
 * sub-panel loads. A pulsing BrandLogo inside an orbiting-dot ring with a
 * counter-rotating brand-red arc. All keyframes (`spin`, `breath`) are
 * declared in globals.css.
 */
export function BrandSpinner({
  size = 96,
  minHeight,
  className = "",
}: Props) {
  const logo = Math.round(size * 0.38);
  const inner = Math.round(size * 0.12);
  return (
    <div
      className={`flex items-center justify-center ${className}`.trim()}
      style={minHeight !== undefined ? { minHeight } : undefined}
    >
      <div
        className="relative"
        style={{ width: size, height: size }}
      >
        <div
          className="absolute inset-0 rounded-full"
          style={{ border: "1px solid var(--border)" }}
        />
        <div className="absolute inset-0 animate-[spin_2.4s_linear_infinite]">
          <span
            className="absolute inline-block h-2 w-2 rounded-full"
            style={{
              top: 0,
              left: "calc(50% - 4px)",
              background: "var(--brand)",
              boxShadow: "0 0 8px 0 var(--brand)",
            }}
          />
          <span
            className="absolute inline-block h-2 w-2 rounded-full"
            style={{
              top: "calc(50% - 4px)",
              left: "calc(100% - 8px)",
              background: "#ff8b1a",
              boxShadow: "0 0 8px 0 #ff8b1a",
            }}
          />
          <span
            className="absolute inline-block h-2 w-2 rounded-full"
            style={{
              top: "calc(100% - 8px)",
              left: "calc(50% - 4px)",
              background: "#0ea5e9",
              boxShadow: "0 0 8px 0 #0ea5e9",
            }}
          />
        </div>
        <div
          className="absolute rounded-full animate-[spin_1.6s_linear_infinite_reverse]"
          style={{
            inset: inner,
            borderTop: "2px solid var(--brand)",
            borderRight: "2px solid transparent",
            borderBottom: "2px solid transparent",
            borderLeft: "2px solid transparent",
          }}
        />
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="animate-[breath_1.8s_ease-in-out_infinite]">
            <BrandLogo size={logo} />
          </div>
        </div>
      </div>
    </div>
  );
}
