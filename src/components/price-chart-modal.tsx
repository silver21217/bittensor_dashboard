"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Area,
  AreaChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { X } from "lucide-react";
import { fmtPct, fmtTao, fmtUsd } from "@/lib/format";
import { cn } from "@/lib/cn";

export type ChartTarget =
  | { kind: "tao" }
  | { kind: "btc" }
  | { kind: "subnet"; netuid: number; name: string; symbol: string }
  | { kind: "reg_cost"; netuid: number; name: string; symbol: string }
  | { kind: "burn"; netuid: number; name: string; symbol: string };

type Range = "24h" | "7d" | "30d";
type Point = { t: number; p: number };

type Props = {
  target: ChartTarget;
  taoPriceUsd: number;
  onClose: () => void;
};

export function PriceChartModal({ target, taoPriceUsd, onClose }: Props) {
  const [range, setRange] = useState<Range>("24h");
  const [points, setPoints] = useState<Point[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [onClose]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    const q = new URLSearchParams({ range });
    if (target.kind === "tao") q.set("asset", "tao");
    else if (target.kind === "btc") q.set("asset", "btc");
    else if (target.kind === "reg_cost") {
      q.set("asset", "reg_cost");
      q.set("netuid", String(target.netuid));
    } else if (target.kind === "burn") {
      q.set("asset", "burn");
      q.set("netuid", String(target.netuid));
    } else {
      q.set("asset", "subnet");
      q.set("netuid", String(target.netuid));
    }
    fetch(`/api/history?${q.toString()}`, { cache: "no-store" })
      .then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((j: { points: Point[] }) => {
        if (!cancelled) setPoints(j.points || []);
      })
      .catch((e) => {
        if (!cancelled) setError(String(e instanceof Error ? e.message : e));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [target, range]);

  const title =
    target.kind === "tao"
      ? "TAO / USD"
      : target.kind === "btc"
        ? "BTC / USD"
        : target.kind === "reg_cost"
          ? `${target.name} — Reg Cost`
          : target.kind === "burn"
            ? `${target.name} — Burn`
            : target.name;
  const subtitle =
    target.kind === "subnet"
      ? `SN ${target.netuid} · Alpha token`
      : target.kind === "tao"
        ? "Bittensor native token"
        : target.kind === "btc"
          ? "Bitcoin spot"
          : target.kind === "reg_cost"
            ? `SN ${target.netuid} · neuron registration cost`
            : `SN ${target.netuid} · incentive burn %`;

  const unit: "usd" | "tao" | "pct" =
    target.kind === "subnet" || target.kind === "reg_cost"
      ? "tao"
      : target.kind === "burn"
        ? "pct"
        : "usd";

  const stats = useMemo(() => {
    if (!points || points.length === 0) return null;
    const prices = points.map((p) => p.p);
    const first = prices[0];
    const last = prices[prices.length - 1];
    const hi = Math.max(...prices);
    const lo = Math.min(...prices);
    const change = first > 0 ? ((last - first) / first) * 100 : 0;
    return { first, last, hi, lo, change };
  }, [points]);

  const fmt = (n: number) =>
    unit === "usd"
      ? fmtUsd(n, n >= 1 ? 2 : 4)
      : unit === "pct"
        ? `${n.toFixed(2)}%`
        : fmtTao(n, 6);

  return (
    <div
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 backdrop-blur-sm"
      style={{ background: "rgba(8, 8, 12, 0.55)" }}
    >
      <div
        onMouseDown={(e) => e.stopPropagation()}
        className="relative w-full max-w-[min(1200px,92vw)] overflow-hidden rounded-xl"
        style={{
          background: "var(--surface)",
          boxShadow:
            "0 24px 48px -12px rgba(0, 0, 0, 0.45), 0 0 0 1px var(--border)",
        }}
      >
        {/* Header */}
        <div
          className="flex items-start justify-between border-b px-5 py-4"
          style={{ borderColor: "var(--divider)" }}
        >
          <div className="flex flex-col">
            <span
              className="text-[16px] font-semibold"
              style={{ color: "var(--text)" }}
            >
              {title}
            </span>
            <span className="text-[11px]" style={{ color: "var(--text-dim)" }}>
              {subtitle}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <RangeTabs value={range} onChange={setRange} />
            <button
              onClick={onClose}
              aria-label="Close"
              className="flex h-8 w-8 items-center justify-center rounded-md transition-colors"
              style={{ color: "var(--text-dim)" }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLElement).style.background =
                  "var(--surface-hover)";
                (e.currentTarget as HTMLElement).style.color = "var(--text)";
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLElement).style.background = "transparent";
                (e.currentTarget as HTMLElement).style.color = "var(--text-dim)";
              }}
            >
              <X size={18} strokeWidth={1.9} />
            </button>
          </div>
        </div>

        {/* Stats */}
        <div
          className="grid grid-cols-4 gap-0 border-b"
          style={{ borderColor: "var(--divider)" }}
        >
          <Stat
            label="Current"
            value={stats ? fmt(stats.last) : "—"}
            strong
            sub={
              unit === "tao" && stats && target.kind === "subnet"
                ? fmtUsd(stats.last * taoPriceUsd, 4)
                : undefined
            }
          />
          <Stat
            label={`${range.toUpperCase()} Change`}
            value={stats ? fmtPct(stats.change) : "—"}
            color={
              stats
                ? stats.change >= 0
                  ? "var(--success)"
                  : "var(--danger)"
                : undefined
            }
          />
          <Stat label={`${range.toUpperCase()} High`} value={stats ? fmt(stats.hi) : "—"} />
          <Stat label={`${range.toUpperCase()} Low`} value={stats ? fmt(stats.lo) : "—"} />
        </div>

        {/* Chart */}
        <div className="h-[min(560px,70vh)] w-full px-2 py-4">
          {loading && !points && (
            <div
              className="flex h-full items-center justify-center text-[12px]"
              style={{ color: "var(--text-dim)" }}
            >
              Loading history…
            </div>
          )}
          {error && (
            <div
              className="flex h-full items-center justify-center text-[12px]"
              style={{ color: "var(--danger)" }}
            >
              {error}
            </div>
          )}
          {points && points.length > 1 && (
            <Chart
              points={points}
              unit={unit}
              fmt={fmt}
              kind={target.kind}
            />
          )}
          {points && points.length <= 1 && !loading && !error && (
            <div
              className="flex h-full items-center justify-center text-[12px]"
              style={{ color: "var(--text-dim)" }}
            >
              Not enough history for this range yet.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Chart({
  points,
  unit,
  fmt,
  kind,
}: {
  points: Point[];
  unit: "usd" | "tao" | "pct";
  fmt: (n: number) => string;
  kind: ChartTarget["kind"];
}) {
  const up = points[points.length - 1].p >= points[0].p;
  const color = up ? "#16a34a" : "#ed2939";
  const data = points.map((p) => ({ t: p.t, p: p.p }));
  const isBar = kind === "reg_cost";

  const dataMin = data[0].t;
  const dataMax = data[data.length - 1].t;
  // Minimum zoom span: 10s (matches the sampling cadence — zooming tighter
  // just shows noise between samples).
  const MIN_SPAN_MS = 10_000;

  const [zoom, setZoom] = useState<[number, number] | null>(null);
  const [dragging, setDragging] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const dragStartRef = useRef<{
    x: number;
    vMin: number;
    vMax: number;
  } | null>(null);

  // Reset zoom whenever the underlying data range changes (e.g. user
  // switches range buttons).
  useEffect(() => {
    setZoom(null);
  }, [dataMin, dataMax]);

  const [vMin, vMax] = zoom ?? [dataMin, dataMax];

  const plotMetrics = () => {
    const el = containerRef.current;
    if (!el) return null;
    const rect = el.getBoundingClientRect();
    const leftPad = unit === "tao" ? 90 : unit === "pct" ? 60 : 72;
    const rightPad = 16;
    return {
      rect,
      leftPad,
      plotWidth: Math.max(1, rect.width - leftPad - rightPad),
    };
  };

  const onWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    e.preventDefault();
    const m = plotMetrics();
    if (!m) return;
    const plotLeft = m.rect.left + m.leftPad;
    const relX = Math.min(
      1,
      Math.max(0, (e.clientX - plotLeft) / m.plotWidth),
    );

    const focusT = vMin + relX * (vMax - vMin);
    const factor = e.deltaY < 0 ? 0.82 : 1.22;
    let newSpan = (vMax - vMin) * factor;
    newSpan = Math.max(MIN_SPAN_MS, Math.min(dataMax - dataMin, newSpan));
    let newMin = focusT - (focusT - vMin) * factor;
    let newMax = focusT + (vMax - focusT) * factor;
    if (newMin < dataMin) {
      newMin = dataMin;
      newMax = Math.min(dataMax, newMin + newSpan);
    }
    if (newMax > dataMax) {
      newMax = dataMax;
      newMin = Math.max(dataMin, newMax - newSpan);
    }
    if (Math.abs(newMin - dataMin) < 1 && Math.abs(newMax - dataMax) < 1) {
      setZoom(null);
      return;
    }
    setZoom([newMin, newMax]);
  };

  const zoomed = zoom !== null;
  const resetZoom = () => setZoom(null);

  const onMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!zoomed) return;
    // Only primary button initiates drag.
    if (e.button !== 0) return;
    dragStartRef.current = { x: e.clientX, vMin, vMax };
    setDragging(true);
  };

  const onMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!dragging || !dragStartRef.current) return;
    const m = plotMetrics();
    if (!m) return;
    const start = dragStartRef.current;
    const span = start.vMax - start.vMin;
    const dxT = -((e.clientX - start.x) / m.plotWidth) * span;
    let newMin = start.vMin + dxT;
    let newMax = start.vMax + dxT;
    if (newMin < dataMin) {
      newMax += dataMin - newMin;
      newMin = dataMin;
    }
    if (newMax > dataMax) {
      newMin -= newMax - dataMax;
      newMax = dataMax;
    }
    setZoom([newMin, newMax]);
  };

  const endDrag = () => {
    dragStartRef.current = null;
    setDragging(false);
  };

  return (
    <div
      ref={containerRef}
      onWheel={onWheel}
      onMouseDown={onMouseDown}
      onMouseMove={onMouseMove}
      onMouseUp={endDrag}
      onMouseLeave={endDrag}
      className="relative h-full w-full select-none"
      style={{
        overscrollBehavior: "contain",
        cursor: zoomed ? (dragging ? "grabbing" : "grab") : "default",
      }}
    >
      {zoomed && (
        <button
          type="button"
          onClick={resetZoom}
          className="absolute right-3 top-1 z-10 rounded border px-2 py-1 text-[10.5px] font-semibold"
          style={{
            background: "var(--surface)",
            borderColor: "var(--border)",
            color: "var(--text-dim)",
          }}
          title="Reset zoom"
        >
          ⤢ Reset zoom
        </button>
      )}
      <div
        className="pointer-events-none absolute right-3 top-1 z-10 text-[10px]"
        style={{ color: "var(--text-faint)" }}
      >
        {zoomed ? "scroll zooms · drag pans" : "scroll to zoom"}
      </div>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart
          data={data}
          margin={{ top: 8, right: 16, left: 0, bottom: 0 }}
        >
          <defs>
            <linearGradient id="chart-fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.28} />
              <stop offset="100%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <XAxis
            dataKey="t"
            type="number"
            domain={[vMin, vMax]}
            allowDataOverflow
            tickFormatter={(v: number) => fmtDate(v)}
            axisLine={false}
            tickLine={false}
            tick={{ fill: "var(--text-dim)", fontSize: 10 }}
            minTickGap={40}
          />
          <YAxis
            dataKey="p"
            domain={["auto", "auto"]}
            axisLine={false}
            tickLine={false}
            tick={{ fill: "var(--text-dim)", fontSize: 10 }}
            tickFormatter={(v: number) => fmt(v)}
            width={unit === "tao" ? 90 : unit === "pct" ? 60 : 72}
          />
          <Tooltip
            cursor={{
              stroke: "var(--text-dim)",
              strokeWidth: 1,
              strokeDasharray: "2 3",
              strokeOpacity: 0.35,
            }}
            contentStyle={{
              background: "var(--surface)",
              border: "1px solid var(--border)",
              borderRadius: 6,
              fontSize: 11,
            }}
            labelStyle={{ color: "var(--text-dim)" }}
            labelFormatter={((v: unknown) => fmtDateTime(Number(v))) as never}
            formatter={
              ((v: unknown) => [
                fmt(Number(v)),
                isBar ? "Reg cost" : "Price",
              ]) as never
            }
          />
          {/* Reg-cost = sawtooth: spikes on each registration, decays
              exponentially in between. `stepAfter` holds the value flat
              between samples and jumps on the next one — communicates
              the discrete-event nature of the cost much better than a
              smoothed `monotone` curve. Other charts (price/burn) keep
              the smoothed monotone style. */}
          <Area
            type={isBar ? "stepAfter" : "monotone"}
            dataKey="p"
            stroke={color}
            strokeWidth={1.75}
            fill="url(#chart-fill)"
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

function Stat({
  label,
  value,
  color,
  strong,
  sub,
}: {
  label: string;
  value: string;
  color?: string;
  strong?: boolean;
  sub?: string;
}) {
  return (
    <div className="px-5 py-3">
      <div className="m-label">{label}</div>
      <div
        className={cn("tnum mt-0.5", strong ? "text-[17px] font-bold" : "text-[13px] font-semibold")}
        style={{ color: color ?? "var(--text)" }}
      >
        {value}
      </div>
      {sub && (
        <div className="tnum mt-0.5 text-[10.5px]" style={{ color: "var(--text-dim)" }}>
          {sub}
        </div>
      )}
    </div>
  );
}

function RangeTabs({
  value,
  onChange,
}: {
  value: Range;
  onChange: (v: Range) => void;
}) {
  return (
    <div
      className="inline-flex items-center gap-1 rounded-md border p-[3px]"
      style={{
        background: "var(--surface-2)",
        borderColor: "var(--border)",
      }}
    >
      {(["24h", "7d", "30d"] as const).map((r) => {
        const active = value === r;
        return (
          <button
            key={r}
            onClick={() => onChange(r)}
            className="rounded px-2.5 py-1 text-[11px] font-semibold"
            style={{
              background: active ? "var(--brand)" : "transparent",
              color: active ? "#fff" : "var(--text-dim)",
              transition: "all 120ms",
            }}
          >
            {r.toUpperCase()}
          </button>
        );
      })}
    </div>
  );
}

function fmtDate(ms: number): string {
  const d = new Date(ms);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

function fmtDateTime(ms: number): string {
  const d = new Date(ms);
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}
