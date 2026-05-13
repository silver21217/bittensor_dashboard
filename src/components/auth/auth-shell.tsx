"use client";

import { AppLogo } from "@/components/app-logo";

type Props = {
  title: string;
  subtitle: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
};

/**
 * Split-panel auth scaffold: a brand/marketing panel on the left
 * and the form on the right. Collapses to a single column on mobile.
 */
export function AuthShell({ title, subtitle, children, footer }: Props) {
  return (
    <div
      className="relative flex h-screen overflow-hidden"
      style={{ background: "var(--page)" }}
    >
      {/* Left brand panel — always full viewport height */}
      <div
        className="relative hidden w-5/12 flex-col justify-between overflow-hidden p-10 md:flex"
        style={{
          background:
            "linear-gradient(135deg, #1a0507 0%, #2a0f12 45%, #3a1a15 100%)",
          color: "#fff",
        }}
        suppressHydrationWarning
      >
        <GradientBackdrop />
        <div className="relative z-10 flex items-center gap-3">
          <AppLogo size={40} />
          <div className="flex flex-col">
            <span className="text-[17px] font-semibold tracking-tight">
              AAA Live Subnets
            </span>
            <span className="text-[11px]" style={{ color: "#ffdadd" }}>
              Live Bittensor intelligence
            </span>
          </div>
        </div>

        <div className="relative z-10 flex flex-col gap-6">
          <h1 className="text-[30px] font-bold leading-tight">
            All of Bittensor,
            <br />
            <span style={{ color: "#ffbf48" }}>updating every second.</span>
          </h1>
          <p
            className="max-w-md text-[13px] leading-relaxed"
            style={{ color: "#ffdadd" }}
          >
            129 subnets. Alpha prices, emission windows, burn rates and wallet
            portfolios — all live at one glance. Trade smarter by knowing the
            next epoch, next adjustment, next move.
          </p>
          <ul
            className="flex flex-col gap-2 text-[12px]"
            style={{ color: "#ffcfd3" }}
          >
            <Bullet>One-second polling across Binance + TaoStats</Bullet>
            <Bullet>Per-hotkey daily emissions and balance history</Bullet>
            <Bullet>At-Risk radar · registration budget · burn deltas</Bullet>
          </ul>
        </div>

        <div
          className="relative z-10 text-[11px]"
          style={{ color: "#ffbabf" }}
        >
          © {new Date().getFullYear()} AAA Live Subnets · not affiliated with Bittensor.
        </div>
      </div>

      {/* Right form panel — scrolls vertically if the form grows */}
      <div className="flex flex-1 items-center justify-center overflow-y-auto p-6 md:p-10">
        <div className="w-full max-w-sm">
          <div className="mb-6 flex items-center gap-2 md:hidden">
            <AppLogo size={28} />
            <span className="text-[15px] font-semibold">AAA Live Subnets</span>
          </div>
          <h2
            className="text-[22px] font-bold tracking-tight"
            style={{ color: "var(--text)" }}
          >
            {title}
          </h2>
          <p
            className="mt-1 text-[12.5px]"
            style={{ color: "var(--text-dim)" }}
          >
            {subtitle}
          </p>
          <div className="mt-6">{children}</div>
          {footer && (
            <div
              className="mt-6 text-[12px]"
              style={{ color: "var(--text-dim)" }}
            >
              {footer}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function GradientBackdrop() {
  return (
    <>
      <div
        className="pointer-events-none absolute -left-24 -top-24 h-72 w-72 rounded-full blur-3xl"
        style={{ background: "rgba(237,41,57,0.45)" }}
        aria-hidden
        suppressHydrationWarning
      />
      <div
        className="pointer-events-none absolute -bottom-16 left-1/4 h-60 w-60 rounded-full blur-3xl"
        style={{ background: "rgba(255,139,26,0.35)" }}
        aria-hidden
        suppressHydrationWarning
      />
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.08]"
        style={{
          backgroundImage:
            "linear-gradient(to right, rgba(255,255,255,0.5) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,0.5) 1px, transparent 1px)",
          backgroundSize: "42px 42px",
        }}
        aria-hidden
        suppressHydrationWarning
      />
    </>
  );
}

function Bullet({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex items-center gap-2">
      <span
        aria-hidden
        className="inline-flex h-4 w-4 items-center justify-center rounded-full"
        style={{ background: "rgba(255, 191, 72, 0.22)", color: "#ffbf48" }}
      >
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none">
          <path
            d="M5 12.5l4.5 4.5L19 7.5"
            stroke="currentColor"
            strokeWidth={3}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </span>
      {children}
    </li>
  );
}
