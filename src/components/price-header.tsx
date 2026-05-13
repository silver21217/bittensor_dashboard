"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { fmtPct, fmtUsd } from "@/lib/format";
import { cn } from "@/lib/cn";
import { useStickyHeight } from "@/lib/use-sticky-height";
import { ThemeToggle } from "./theme-toggle";
import { AppLogo } from "./app-logo";
import { UserMenu } from "./user-menu";
import type { ChartTarget } from "./price-chart-modal";
import type { PublicUser } from "@/lib/auth/store";

type Props = {
  taoPriceUsd: number;
  taoChange1h: number;
  taoChange24h: number;
  taoChange7d: number;
  btcPriceUsd: number;
  btcChange1h: number;
  btcChange24h: number;
  btcChange7d: number;
  blockNumber: number;
  lastUpdated: number;
  status: "idle" | "ok" | "error";
  totalSubnets: number;
  onOpenChart: (t: ChartTarget) => void;
  me: PublicUser | null;
  onOpenProfile: () => void;
};

export function PriceHeader(p: Props) {
  const [taoInput, setTaoInput] = useState("1");
  const [usdInput, setUsdInput] = useState("");

  const derivedUsd = useMemo(() => {
    const t = Number(taoInput);
    if (!Number.isFinite(t)) return "";
    return (t * p.taoPriceUsd).toFixed(2);
  }, [taoInput, p.taoPriceUsd]);

  const derivedTao = useMemo(() => {
    const u = Number(usdInput);
    if (!Number.isFinite(u) || p.taoPriceUsd === 0) return "";
    return (u / p.taoPriceUsd).toFixed(4);
  }, [usdInput, p.taoPriceUsd]);

  const ref = useStickyHeight<HTMLDivElement>("--sticky-top-1");

  return (
    <div
      ref={ref}
      id="app-price-header"
      className="sticky top-0 z-30"
      style={{ background: "var(--page)" }}
    >
      <div className="flex items-center gap-3 px-4 py-3">
        <button
          type="button"
          onClick={() => {
            if (typeof window !== "undefined") window.location.reload();
          }}
          className="flex items-center gap-3 rounded-md p-1 -m-1 transition-colors"
          style={{ background: "transparent" }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLElement).style.background =
              "var(--surface-hover)";
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLElement).style.background = "transparent";
          }}
          title="Reload dashboard"
          aria-label="Reload dashboard"
        >
          <AppLogo size={32} />
          <div className="flex flex-col items-start">
            <span
              className="text-[15px] font-semibold tracking-tight"
              style={{ color: "var(--text)" }}
            >
              AAA Live Subnets
            </span>
            <span
              className="text-[11px]"
              style={{ color: "var(--text-dim)" }}
            >
              Live alpha prices, emission & risk · Bittensor
            </span>
          </div>
        </button>

        <div className="ml-auto flex items-center gap-1.5">
          <div
            className="flex h-7 items-center overflow-hidden rounded-md border"
            style={{
              background: "var(--surface)",
              borderColor: "var(--border)",
            }}
          >
            <ConvSlot
              leftVal={taoInput}
              onLeftChange={(v) => { setTaoInput(v); setUsdInput(""); }}
              leftUnit="τ"
              rightText={
                usdInput === ""
                  ? `$${derivedUsd}`
                  : `$${(Number(usdInput) || 0).toFixed(2)}`
              }
            />
            <div
              className="h-4 w-px"
              style={{ background: "var(--border)" }}
            />
            <ConvSlot
              leftVal={usdInput}
              onLeftChange={(v) => { setUsdInput(v); setTaoInput(""); }}
              leftUnit="$"
              rightText={
                taoInput === ""
                  ? `${derivedTao} τ`
                  : `${(Number(taoInput) || 0).toFixed(4)} τ`
              }
            />
          </div>
          <ThemeToggle />
          <UtcClock />
          <StatusChip status={p.status} lastUpdated={p.lastUpdated} />
          {p.me && <UserMenu user={p.me} onOpenProfile={p.onOpenProfile} />}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 px-4 pb-3 md:grid-cols-4">
        <KpiTile
          label="TAO / USD"
          value={fmtUsd(p.taoPriceUsd)}
          accent="var(--brand)"
          changes={[
            { l: "1H", v: p.taoChange1h },
            { l: "24H", v: p.taoChange24h },
            { l: "7D", v: p.taoChange7d },
          ]}
          chart={<KpiSpark asset="tao" changePct={p.taoChange24h} />}
          onClick={() => p.onOpenChart({ kind: "tao" })}
        />
        <KpiTile
          label="BTC / USD"
          value={fmtUsd(p.btcPriceUsd)}
          accent="var(--amber)"
          changes={[
            { l: "1H", v: p.btcChange1h },
            { l: "24H", v: p.btcChange24h },
            { l: "7D", v: p.btcChange7d },
          ]}
          chart={<KpiSpark asset="btc" changePct={p.btcChange24h} />}
          onClick={() => p.onOpenChart({ kind: "btc" })}
        />
        <KpiTile
          label="Current Block"
          value={p.blockNumber.toLocaleString()}
          accent="var(--orange)"
          subNode={<NextBlockSub blockNumber={p.blockNumber} />}
          chart={<BlockTicker blockNumber={p.blockNumber} />}
        />
        <KpiTile
          label="Subnets"
          value={String(p.totalSubnets)}
          accent="#0ea5e9"
          sub="Live on dTAO"
          chart={<SubnetConstellation count={p.totalSubnets} />}
        />
      </div>
    </div>
  );
}

function KpiTile({
  label,
  value,
  accent,
  sub,
  subNode,
  changes,
  chart,
  onClick,
}: {
  label: string;
  value: string;
  accent: string;
  sub?: string;
  subNode?: React.ReactNode;
  changes?: { l: string; v: number }[];
  chart?: React.ReactNode;
  onClick?: () => void;
}) {
  const interactive = !!onClick;
  return (
    <div
      className="m-card relative overflow-hidden"
      role={interactive ? "button" : undefined}
      tabIndex={interactive ? 0 : undefined}
      onClick={onClick}
      onKeyDown={
        interactive
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onClick?.();
              }
            }
          : undefined
      }
      style={{
        height: 88,
        transition:
          "background 160ms ease, box-shadow 160ms ease, border-color 160ms ease",
      }}
      onMouseEnter={(e) => {
        if (!interactive) return;
        const el = e.currentTarget as HTMLElement;
        el.style.boxShadow = `0 0 0 1px color-mix(in srgb, ${accent} 55%, var(--border)), 0 1px 3px 0 rgba(0,0,0,0.06)`;
      }}
      onMouseLeave={(e) => {
        if (!interactive) return;
        const el = e.currentTarget as HTMLElement;
        el.style.boxShadow = "";
      }}
    >
      {/* Ambient 1-day sparkline in the right portion of the card. The
          text content (label / value / change pills) occupies the left
          ~45%. A CSS mask fades the chart's left edge into the card
          background so it doesn't start abruptly. `pointer-events: none`
          keeps the card's own onClick firing when hovering the chart. */}
      {chart && (
        <div
          className="pointer-events-none absolute inset-y-0 right-0 z-0"
          style={{
            width: "58%",
            WebkitMaskImage:
              "linear-gradient(to right, transparent 0%, #000 22%, #000 100%)",
            maskImage:
              "linear-gradient(to right, transparent 0%, #000 22%, #000 100%)",
          }}
        >
          {chart}
        </div>
      )}
      <div className="relative z-10 flex h-full flex-col justify-between px-4 py-3">
        <div className="flex items-center gap-1.5">
          <span
            className="inline-block h-1.5 w-1.5 rounded-full"
            style={{ background: accent }}
            aria-hidden
          />
          <span
            className="font-semibold uppercase"
            style={{
              color: "var(--text-dim)",
              fontSize: 10,
              letterSpacing: "0.08em",
            }}
          >
            {label}
          </span>
        </div>
        <div
          className="tnum font-semibold leading-none"
          style={{
            color: "var(--text)",
            fontSize: 22,
            letterSpacing: "-0.01em",
          }}
        >
          {value}
        </div>
        {changes ? (
          <div className="flex items-center gap-2.5 text-[10.5px]">
            {changes.map((c) => (
              <ChangePill key={c.l} label={c.l} v={c.v} />
            ))}
          </div>
        ) : subNode ? (
          <div className="text-[10.5px]" style={{ color: "var(--text-dim)" }}>
            {subNode}
          </div>
        ) : sub ? (
          <div className="text-[10.5px]" style={{ color: "var(--text-dim)" }}>
            {sub}
          </div>
        ) : (
          <div className="h-[14px]" />
        )}
      </div>
    </div>
  );
}

function KpiSpark({
  asset,
  changePct,
}: {
  asset: "tao" | "btc";
  changePct?: number;
}) {
  const [points, setPoints] = useState<number[]>([]);
  useEffect(() => {
    let cancelled = false;
    const q = new URLSearchParams({ asset, range: "24h" });
    fetch(`/api/history?${q.toString()}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { points?: { t: number; p: number }[] } | null) => {
        if (cancelled || !j?.points) return;
        setPoints(j.points.map((pt) => pt.p).filter(Number.isFinite));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [asset]);

  if (points.length < 2) return null;

  const up =
    typeof changePct === "number"
      ? changePct >= 0
      : points[points.length - 1] >= points[0];
  const color = up ? "var(--success)" : "var(--danger)";
  return <MiniSpark data={points} color={color} />;
}

function MiniSpark({
  data,
  color,
}: {
  data: number[];
  color: string;
}) {
  // React's useId() returns ":r0:"-style values with colons, which some
  // SVG renderers refuse to resolve as fragment identifiers. Strip the
  // colons so `url(#…)` references match cleanly.
  const rawId = useId();
  const gradId = `kpi-grad-${rawId.replace(/[^a-zA-Z0-9]/g, "")}`;
  // Render into a fixed viewBox and let the SVG scale via
  // preserveAspectRatio="none" so the card's full width is filled
  // regardless of the actual card size. 200×100 gives the <path> enough
  // resolution to stay smooth at any card width.
  const W = 200;
  const H = 100;
  const { line, area } = useMemo(() => {
    const min = Math.min(...data);
    const max = Math.max(...data);
    const range = max - min || 1;
    const n = data.length;
    const step = W / (n - 1);
    const pad = 6;
    const innerH = H - pad * 2;
    const y = (v: number) => pad + innerH - ((v - min) / range) * innerH;
    const pts = data.map((v, i) => `${i * step},${y(v)}`);
    const line = `M ${pts.join(" L ")}`;
    const area = `${line} L ${W},${H} L 0,${H} Z`;
    return { line, area };
  }, [data]);

  return (
    <svg
      width="100%"
      height="100%"
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="none"
      style={{ display: "block", color }}
      aria-hidden
    >
      <defs>
        {/* `currentColor` lets the SVG inherit the `color` set on the
            <svg> element's style, which DOES resolve CSS custom
            properties — unlike stroke="var(--success)" on the path,
            where SVG attributes don't evaluate CSS vars. */}
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="currentColor" stopOpacity="0.22" />
          <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#${gradId})`} />
      <path
        d={line}
        stroke="currentColor"
        strokeWidth="1"
        fill="none"
        strokeOpacity="0.9"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

/**
 * Ambient visualisation for the Current Block tile: a row of stacked
 * "blocks" progressing left → right, with the rightmost (latest) block
 * rendered brightest and a subtle connection line suggesting a chain.
 * The latest block's offset shifts subtly as `blockNumber` changes so
 * there's a living sense of progression.
 */
function BlockTicker({ blockNumber }: { blockNumber: number }) {
  const color = "var(--orange)";
  const W = 200;
  const H = 100;
  const blockCount = 10;
  const gap = 4;
  const blockW = (W - gap * (blockCount - 1)) / blockCount;
  const blocks = Array.from({ length: blockCount }, (_, i) => {
    const opacity = 0.1 + (i / (blockCount - 1)) * 0.6;
    const h = 30 + ((blockNumber + i) % 7) * 6;
    return { x: i * (blockW + gap), opacity, h };
  });
  return (
    <svg
      width="100%"
      height="100%"
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="none"
      style={{ display: "block", color }}
      aria-hidden
    >
      {/* Chain connector line through block midpoints */}
      <line
        x1="0"
        y1={H / 2}
        x2={W}
        y2={H / 2}
        stroke="currentColor"
        strokeOpacity="0.18"
        strokeWidth="1"
        vectorEffect="non-scaling-stroke"
      />
      {blocks.map((b, i) => (
        <rect
          key={i}
          x={b.x}
          y={(H - b.h) / 2}
          width={blockW}
          height={b.h}
          rx="2"
          fill="currentColor"
          opacity={b.opacity}
        />
      ))}
    </svg>
  );
}

/**
 * Ambient visualisation for the Subnets tile: a grid of dots (one per
 * subnet) with a deterministic pseudo-random pattern of brighter accent
 * dots so it reads as a live network of nodes.
 */
function SubnetConstellation({ count }: { count: number }) {
  const color = "#0ea5e9";
  const W = 200;
  const H = 100;
  const cols = 18;
  const rows = 8;
  const cellW = W / cols;
  const cellH = H / rows;
  const dots: { cx: number; cy: number; r: number; opacity: number }[] = [];
  for (let i = 0; i < cols * rows; i++) {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const seed = (i * 2654435761) % 100;
    const present = i < count;
    const bright = present && seed < 18;
    dots.push({
      cx: cellW * (col + 0.5),
      cy: cellH * (row + 0.5),
      r: bright ? 1.6 : 1.1,
      opacity: !present ? 0.08 : bright ? 0.9 : 0.28,
    });
  }
  return (
    <svg
      width="100%"
      height="100%"
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="none"
      style={{ display: "block", color }}
      aria-hidden
    >
      {dots.map((d, i) => (
        <circle
          key={i}
          cx={d.cx}
          cy={d.cy}
          r={d.r}
          fill="currentColor"
          opacity={d.opacity}
        />
      ))}
    </svg>
  );
}

const BLOCK_TIME_SEC = 12;

/**
 * Countdown to the next Bittensor block (~12 s). We anchor the timer to the
 * moment we first observe a new `blockNumber` on the client, then tick down
 * from 12 to 0. When a new block lands on the next poll the anchor resets.
 */
function NextBlockSub({ blockNumber }: { blockNumber: number }) {
  const anchorRef = useRef({ block: blockNumber, ts: Date.now() });
  const [, setTick] = useState(0);
  if (anchorRef.current.block !== blockNumber) {
    anchorRef.current = { block: blockNumber, ts: Date.now() };
  }
  useEffect(() => {
    const id = window.setInterval(() => setTick((t) => t + 1), 1000);
    return () => window.clearInterval(id);
  }, []);
  const elapsed = Math.floor((Date.now() - anchorRef.current.ts) / 1000);
  const remaining = Math.max(0, BLOCK_TIME_SEC - elapsed);
  // Pre-fire window: last 10 s of the 12 s block interval get the brand
  // pulse treatment so the user has a clear warning before the tick.
  const firing = remaining <= 10;
  return (
    <>
      Next block in{" "}
      {firing ? (
        <span
          className="tnum inline-flex items-center gap-1 font-semibold"
          style={{ color: "var(--brand)" }}
        >
          {remaining}s
          <span
            className="live-dot inline-block h-1.5 w-1.5 rounded-full"
            style={{ background: "var(--brand)" }}
            aria-hidden
          />
          <span style={{ fontSize: 10, fontWeight: 500 }}>firing…</span>
        </span>
      ) : (
        <span
          className="tnum font-semibold"
          style={{ color: "var(--text)" }}
        >
          {remaining}s
        </span>
      )}
    </>
  );
}


function ChangePill({ label, v }: { label: string; v: number }) {
  const bad = !Number.isFinite(v);
  const pos = v >= 0;
  const color = bad
    ? "var(--text-faint)"
    : pos
      ? "var(--success)"
      : "var(--danger)";
  return (
    <span
      className="tnum inline-flex items-center gap-1 text-[10.5px] font-semibold"
      title={`${label} change`}
    >
      <span style={{ color: "var(--text-faint)", fontWeight: 500 }}>
        {label}
      </span>
      <span style={{ color }}>{bad ? "—" : fmtPct(v)}</span>
    </span>
  );
}

function UtcClock() {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);
  const d = new Date(now);
  const hh = String(d.getUTCHours()).padStart(2, "0");
  const mm = String(d.getUTCMinutes()).padStart(2, "0");
  const ss = String(d.getUTCSeconds()).padStart(2, "0");
  return (
    <div
      className="tnum flex h-7 items-center gap-1.5 rounded-md border px-2.5 text-[11.5px] font-semibold"
      style={{
        background: "var(--surface)",
        borderColor: "var(--border)",
        color: "var(--text)",
      }}
      title="Current UTC time"
    >
      <span
        style={{
          color: "var(--text-faint)",
          fontWeight: 500,
          fontSize: 10,
          letterSpacing: "0.04em",
        }}
      >
        UTC
      </span>
      <span>
        {hh}:{mm}:{ss}
      </span>
    </div>
  );
}

function StatusChip({
  status,
  lastUpdated,
}: {
  status: "idle" | "ok" | "error";
  lastUpdated: number;
}) {
  // Self-ticking age so the "Xs" display keeps advancing even while the
  // parent Dashboard is stuck in an ERROR state (setStatus with the
  // same value is a no-op for React, so PriceHeader wouldn't otherwise
  // re-render).
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);
  const ageSec = Math.max(
    0,
    Math.floor((now - lastUpdated) / 1000),
  );
  const isOk = status === "ok";
  const isErr = status === "error";
  const dotColor = isOk
    ? "var(--success)"
    : isErr
      ? "var(--brand)"
      : "var(--text-faint)";
  return (
    <div
      className="tnum flex h-7 items-center gap-1.5 rounded-md border px-2.5 text-[11.5px]"
      style={{
        background: "var(--surface)",
        borderColor: "var(--border)",
        color: "var(--text)",
      }}
      title={`Last update ${ageSec}s ago`}
    >
      <span
        className={cn("inline-block h-1.5 w-1.5 rounded-full", isOk && "live-dot")}
        style={{ background: dotColor }}
      />
      <span style={{ fontWeight: 600, letterSpacing: "0.02em" }}>
        {isErr ? "ERROR" : "LIVE"}
      </span>
      <span
        style={{ color: "var(--text-faint)", fontWeight: 500, fontSize: 10.5 }}
      >
        {ageSec}s
      </span>
    </div>
  );
}

function ConvSlot({
  leftVal,
  onLeftChange,
  leftUnit,
  rightText,
}: {
  leftVal: string;
  onLeftChange: (v: string) => void;
  leftUnit: string;
  rightText: string;
}) {
  return (
    <div className="flex h-full items-center gap-1.5 px-2.5 text-[11.5px]">
      <span
        style={{
          color: "var(--text-faint)",
          fontWeight: 500,
          fontSize: 10.5,
        }}
      >
        {leftUnit}
      </span>
      <input
        value={leftVal}
        onChange={(e) => onLeftChange(e.target.value)}
        className="tnum w-12 bg-transparent text-right outline-none"
        style={{ color: "var(--text)", fontWeight: 600 }}
        inputMode="decimal"
      />
      <span style={{ color: "var(--text-faint)" }}>=</span>
      <span
        className="tnum"
        style={{ color: "var(--text)", fontWeight: 600 }}
      >
        {rightText}
      </span>
    </div>
  );
}
