"use client";

import { Globe } from "lucide-react";
import { cn } from "@/lib/cn";
import type { ComponentProps } from "react";
import { ThemeToggle } from "./theme-toggle";

type SvgProps = ComponentProps<"svg">;

const GithubGlyph = (p: SvgProps) => (
  <svg viewBox="0 0 24 24" fill="currentColor" {...p}>
    <path d="M12 .5C5.648.5.5 5.648.5 12c0 5.082 3.292 9.386 7.863 10.907.575.105.786-.25.786-.556 0-.274-.01-1.001-.016-1.966-3.2.695-3.878-1.541-3.878-1.541-.522-1.327-1.275-1.68-1.275-1.68-1.043-.713.079-.698.079-.698 1.153.082 1.76 1.185 1.76 1.185 1.025 1.757 2.69 1.25 3.346.956.104-.743.401-1.25.73-1.538-2.554-.29-5.239-1.277-5.239-5.684 0-1.256.45-2.283 1.187-3.088-.12-.29-.515-1.462.111-3.048 0 0 .966-.309 3.165 1.179a11.026 11.026 0 012.88-.387c.977.005 1.96.132 2.88.387 2.197-1.488 3.163-1.179 3.163-1.179.627 1.586.233 2.758.114 3.048.74.805 1.186 1.832 1.186 3.088 0 4.418-2.69 5.39-5.252 5.675.413.355.78 1.056.78 2.132 0 1.54-.014 2.78-.014 3.158 0 .308.207.666.793.553C20.212 21.383 23.5 17.08 23.5 12 23.5 5.648 18.352.5 12 .5z" />
  </svg>
);

const BrandMark = ({
  letter,
  color,
  ...p
}: SvgProps & { letter: string; color: string }) => (
  <svg viewBox="0 0 24 24" {...p}>
    <rect x="2" y="2" width="20" height="20" rx="5" fill={color} />
    <text
      x="12"
      y="16"
      textAnchor="middle"
      fontSize="12"
      fontWeight="700"
      fill="#fff"
      fontFamily="Inter, system-ui, sans-serif"
    >
      {letter}
    </text>
  </svg>
);

type Link = {
  label: string;
  href: string;
  render: (p: { size: number }) => React.ReactNode;
};

const LINKS: Link[] = [
  {
    label: "GitHub",
    href: "https://github.com/opentensor/bittensor",
    render: ({ size }) => <GithubGlyph width={size} height={size} />,
  },
  {
    label: "Bittensor",
    href: "https://bittensor.com",
    render: ({ size }) => <Globe size={size} strokeWidth={1.9} />,
  },
  {
    label: "TaoMarketCap",
    href: "https://taomarketcap.com",
    render: ({ size }) => (
      <BrandMark width={size} height={size} letter="M" color="#ed2939" />
    ),
  },
  {
    label: "TaoStats",
    href: "https://taostats.io",
    render: ({ size }) => (
      <BrandMark width={size} height={size} letter="τ" color="#0ea5e9" />
    ),
  },
];

export function IconBar() {
  return (
    <div
      className="flex items-center gap-1 rounded-md border p-1"
      style={{
        background: "var(--surface-2)",
        borderColor: "var(--border)",
      }}
    >
      {LINKS.map((l) => (
        <IconLink key={l.label} {...l} />
      ))}
      <div
        style={{
          width: 1,
          height: 18,
          background: "var(--border)",
          margin: "0 2px",
        }}
      />
      <ThemeToggle />
    </div>
  );
}

function IconLink({ label, href, render }: Link) {
  const isBrand = label === "TaoMarketCap" || label === "TaoStats";
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      title={label}
      aria-label={label}
      className={cn(
        "group relative flex h-7 w-7 items-center justify-center rounded transition-colors",
      )}
      style={{ color: "var(--text-dim)" }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLElement).style.background = "var(--surface)";
        if (!isBrand) (e.currentTarget as HTMLElement).style.color = "var(--text)";
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLElement).style.background = "transparent";
        if (!isBrand) (e.currentTarget as HTMLElement).style.color = "var(--text-dim)";
      }}
    >
      {render({ size: isBrand ? 22 : 16 })}
      <span
        className="pointer-events-none absolute top-full left-1/2 z-50 mt-1.5 -translate-x-1/2 whitespace-nowrap rounded border px-1.5 py-0.5 text-[10px] font-medium opacity-0 transition-opacity group-hover:opacity-100"
        style={{
          background: "var(--surface)",
          borderColor: "var(--border)",
          color: "var(--text)",
        }}
      >
        {label}
      </span>
    </a>
  );
}
