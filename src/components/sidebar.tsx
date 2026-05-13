"use client";

import {
  LayoutGrid,
  Activity,
  BarChart3,
  Bell,
  BookOpen,
  Code2,
  Settings,
  Wallet,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/cn";

type Item = {
  icon: LucideIcon;
  label: string;
  href?: string;
  active?: boolean;
};

const TOP: Item[] = [
  { icon: LayoutGrid, label: "Subnets", active: true },
  { icon: Activity, label: "Live feed" },
  { icon: BarChart3, label: "Analytics" },
  { icon: Wallet, label: "Portfolio" },
  { icon: Bell, label: "Alerts" },
  { icon: Zap, label: "Auto-trade" },
];

const BOTTOM: Item[] = [
  { icon: BookOpen, label: "Docs", href: "https://docs.bittensor.com" },
  { icon: Code2, label: "Source", href: "https://github.com/opentensor/bittensor" },
  { icon: Settings, label: "Settings" },
];

export function Sidebar() {
  return (
    <aside
      className="fixed left-0 top-0 z-30 flex h-screen flex-col items-center border-r py-3"
      style={{
        width: 56,
        background: "var(--surface)",
        borderColor: "var(--border)",
      }}
    >
      <div
        className="flex h-10 w-10 items-center justify-center rounded-lg text-[17px] font-bold"
        style={{ background: "var(--brand)", color: "#fff" }}
        title="τ — Bittensor"
      >
        τ
      </div>

      <nav className="mt-4 flex flex-col gap-1.5">
        {TOP.map((it) => (
          <NavButton key={it.label} {...it} />
        ))}
      </nav>

      <div className="mt-auto flex flex-col gap-1.5">
        {BOTTOM.map((it) => (
          <NavButton key={it.label} {...it} />
        ))}
      </div>
    </aside>
  );
}

function NavButton({ icon: Icon, label, href, active }: Item) {
  const Tag: "a" | "button" = href ? "a" : "button";
  return (
    <Tag
      {...(href ? { href, target: "_blank", rel: "noreferrer" } : {})}
      title={label}
      aria-label={label}
      className={cn(
        "group relative flex h-9 w-9 items-center justify-center rounded-lg transition-colors",
      )}
      style={{
        background: active ? "var(--brand-soft)" : "transparent",
        color: active ? "var(--brand)" : "var(--text-dim)",
      }}
      onMouseEnter={(e) => {
        if (!active) {
          (e.currentTarget as HTMLElement).style.background = "var(--surface-hover)";
          (e.currentTarget as HTMLElement).style.color = "var(--text)";
        }
      }}
      onMouseLeave={(e) => {
        if (!active) {
          (e.currentTarget as HTMLElement).style.background = "transparent";
          (e.currentTarget as HTMLElement).style.color = "var(--text-dim)";
        }
      }}
    >
      {active && (
        <span
          className="absolute -left-3 top-1.5 bottom-1.5 w-0.5 rounded-r"
          style={{ background: "var(--brand)" }}
          aria-hidden
        />
      )}
      <Icon size={18} strokeWidth={1.75} />
      <span
        className="pointer-events-none absolute left-full top-1/2 z-50 ml-3 -translate-y-1/2 whitespace-nowrap rounded-md border px-2 py-1 text-[11px] font-medium opacity-0 shadow-sm transition-opacity group-hover:opacity-100"
        style={{
          background: "var(--surface)",
          borderColor: "var(--border)",
          color: "var(--text)",
        }}
      >
        {label}
      </span>
    </Tag>
  );
}
