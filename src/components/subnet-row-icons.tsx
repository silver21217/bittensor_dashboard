"use client";

import { memo, type ComponentProps } from "react";
import { Globe, Search } from "lucide-react";
import { cn } from "@/lib/cn";

type SvgProps = ComponentProps<"svg">;

const GithubGlyph = (p: SvgProps) => (
  <svg viewBox="0 0 24 24" fill="currentColor" {...p}>
    <path d="M12 .5C5.648.5.5 5.648.5 12c0 5.082 3.292 9.386 7.863 10.907.575.105.786-.25.786-.556 0-.274-.01-1.001-.016-1.966-3.2.695-3.878-1.541-3.878-1.541-.522-1.327-1.275-1.68-1.275-1.68-1.043-.713.079-.698.079-.698 1.153.082 1.76 1.185 1.76 1.185 1.025 1.757 2.69 1.25 3.346.956.104-.743.401-1.25.73-1.538-2.554-.29-5.239-1.277-5.239-5.684 0-1.256.45-2.283 1.187-3.088-.12-.29-.515-1.462.111-3.048 0 0 .966-.309 3.165 1.179a11.026 11.026 0 012.88-.387c.977.005 1.96.132 2.88.387 2.197-1.488 3.163-1.179 3.163-1.179.627 1.586.233 2.758.114 3.048.74.805 1.186 1.832 1.186 3.088 0 4.418-2.69 5.39-5.252 5.675.413.355.78 1.056.78 2.132 0 1.54-.014 2.78-.014 3.158 0 .308.207.666.793.553C20.212 21.383 23.5 17.08 23.5 12 23.5 5.648 18.352.5 12 .5z" />
  </svg>
);

const BrandTile = ({
  letter,
  bg,
  ...p
}: SvgProps & { letter: string; bg: string }) => (
  <svg viewBox="0 0 20 20" {...p}>
    <rect x="1" y="1" width="18" height="18" rx="4" fill={bg} />
    <text
      x="10"
      y="14"
      textAnchor="middle"
      fontSize="11"
      fontWeight="700"
      fill="#fff"
      fontFamily="Inter, system-ui, sans-serif"
    >
      {letter}
    </text>
  </svg>
);

type Props = {
  netuid: number;
  name: string;
  githubUrl?: string | null;
  websiteUrl?: string | null;
};

export const SubnetRowIcons = memo(function SubnetRowIcons({
  netuid,
  name,
  githubUrl,
  websiteUrl,
}: Props) {
  const q = encodeURIComponent(`bittensor subnet ${netuid} ${name}`);
  const gh = githubUrl && githubUrl.trim() !== "" ? githubUrl : null;
  const site = websiteUrl && websiteUrl.trim() !== "" ? websiteUrl : null;

  return (
    <div className="flex items-center gap-1">
      {gh ? (
        <IconLink
          href={gh}
          label={`GitHub · ${stripProtocol(gh)}`}
          tone="real"
        >
          <GithubGlyph width={18} height={18} />
        </IconLink>
      ) : (
        <IconLink
          href={`https://github.com/search?q=${q}&type=repositories`}
          label={`Search GitHub for ${name}`}
          tone="search"
        >
          <SearchOverGithub />
        </IconLink>
      )}

      {site ? (
        <IconLink
          href={site}
          label={`Website · ${stripProtocol(site)}`}
          tone="real"
          color="#0ea5e9"
        >
          <Globe size={18} strokeWidth={2} />
        </IconLink>
      ) : (
        <IconLink
          href={`https://www.google.com/search?q=${q}`}
          label={`Web search for ${name}`}
          tone="search"
        >
          <Search size={16} strokeWidth={1.8} />
        </IconLink>
      )}

      <IconLink
        href={`https://taomarketcap.com/subnets/${netuid}/miners?sort=usd_per_day&ordering=desc`}
        label="TaoMarketCap miners"
        tone="brand"
      >
        <BrandTile width={22} height={22} letter="M" bg="#ed2939" />
      </IconLink>
      <IconLink
        href={`https://taostats.io/subnets/${netuid}/metagraph?order=daily_reward%3Adesc`}
        label="TaoStats metagraph"
        tone="brand"
      >
        <BrandTile width={22} height={22} letter="τ" bg="#0ea5e9" />
      </IconLink>
    </div>
  );
});

function SearchOverGithub() {
  // Compact composition: faded GitHub mark with a crisp search glass overlay
  return (
    <span className="relative inline-flex h-[18px] w-[18px] items-center justify-center">
      <GithubGlyph
        width={14}
        height={14}
        style={{ opacity: 0.35, position: "absolute" }}
      />
      <Search
        size={12}
        strokeWidth={2.3}
        style={{ position: "absolute", right: -3, bottom: -3 }}
      />
    </span>
  );
}

function stripProtocol(u: string): string {
  return u.replace(/^https?:\/\//, "").replace(/\/$/, "");
}

type Tone = "real" | "search" | "brand";

function IconLink({
  href,
  label,
  tone,
  color,
  children,
}: {
  href: string;
  label: string;
  tone: Tone;
  color?: string;
  children: React.ReactNode;
}) {
  const base: React.CSSProperties =
    tone === "real"
      ? {
          color: color ?? "var(--text)",
          background: "transparent",
          border: "1px solid transparent",
        }
      : tone === "search"
        ? {
            color: "var(--text-faint)",
            background: "transparent",
            border: "1px dashed var(--border-strong)",
          }
        : { color: "var(--text-dim)", background: "transparent" };

  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      title={label}
      aria-label={label}
      onClick={(e) => e.stopPropagation()}
      className={cn(
        "flex h-8 w-8 items-center justify-center rounded-md transition-colors",
      )}
      style={base}
      onMouseEnter={(e) => {
        const el = e.currentTarget as HTMLElement;
        if (tone === "search") {
          el.style.background = "var(--surface-hover)";
          el.style.borderColor = "var(--text-dim)";
          el.style.color = "var(--text-dim)";
        } else if (tone === "real") {
          el.style.background = "var(--surface-hover)";
        } else {
          el.style.background = "var(--surface-hover)";
        }
      }}
      onMouseLeave={(e) => {
        const el = e.currentTarget as HTMLElement;
        el.style.background = "transparent";
        if (tone === "search") {
          el.style.borderColor = "var(--border-strong)";
          el.style.color = "var(--text-faint)";
        }
      }}
    >
      {children}
    </a>
  );
}
