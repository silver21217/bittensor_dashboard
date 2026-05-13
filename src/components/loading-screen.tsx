"use client";

import { BrandSpinner } from "./brand-spinner";

/**
 * Full-screen initial loader. A τ brand mark pulses at the center of an
 * orbiting ring of three dots. Below, a "Loading subnets…" label with an
 * animated progress bar. Colors follow the theme tokens.
 */
export function LoadingScreen() {
  return (
    <div
      className="flex h-screen w-full flex-col items-center justify-center gap-5"
      style={{ background: "var(--page)" }}
    >
      <BrandSpinner size={112} />

      <div className="flex flex-col items-center gap-2">
        <span
          className="text-[13px] font-semibold"
          style={{ color: "var(--text)" }}
        >
          Loading live subnet data
        </span>
        <span
          className="text-[11px]"
          style={{ color: "var(--text-dim)" }}
        >
          Connecting to TaoStats + Binance…
        </span>
        <div
          className="mt-2 h-[3px] w-40 overflow-hidden rounded-full"
          style={{ background: "var(--divider)" }}
        >
          <div
            className="h-full animate-[shimmer_1.4s_ease-in-out_infinite]"
            style={{
              width: "40%",
              background:
                "linear-gradient(90deg, transparent 0%, var(--brand) 50%, transparent 100%)",
            }}
            suppressHydrationWarning
          />
        </div>
      </div>

      <style>{`
        @keyframes shimmer {
          0%   { transform: translateX(-100%); }
          100% { transform: translateX(350%); }
        }
      `}</style>
    </div>
  );
}
