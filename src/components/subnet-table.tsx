"use client";

import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
  type SortingState,
  type ColumnDef,
  type Row,
} from "@tanstack/react-table";
import { Pin } from "lucide-react";
import type { SubnetRow, Tag } from "@/lib/types";
import { fmtCompact, fmtPct, fmtTao, fmtUsd } from "@/lib/format";
import { Sparkline } from "./sparkline";
import { SubnetIcon } from "./subnet-icon";
import { SubnetRowIcons } from "./subnet-row-icons";
import { cn } from "@/lib/cn";
import { useStickyHeight } from "@/lib/use-sticky-height";
import type { ChartTarget } from "./price-chart-modal";

const col = createColumnHelper<SubnetRow>();

const TAG_STYLES: Record<Exclude<Tag, null>, { fg: string; bg: string; label: string }> = {
  Immune: { fg: "#0369a1", bg: "#e0f2fe", label: "Immune" },
  "At Risk 1": { fg: "#fff", bg: "var(--brand)", label: "At Risk 1" },
  "At Risk 2": { fg: "#9a3412", bg: "var(--orange-soft)", label: "At Risk 2" },
  "At Risk 3": { fg: "#854d0e", bg: "var(--amber-soft)", label: "At Risk 3" },
};

const PctCell = memo(function PctCell({ v }: { v: number }) {
  if (v == null || !Number.isFinite(v))
    return <span style={{ color: "var(--text-faint)" }}>—</span>;
  const pos = v >= 0;
  return (
    <span
      className="tnum font-semibold"
      style={{ color: pos ? "var(--success)" : "var(--danger)" }}
    >
      {fmtPct(v)}
    </span>
  );
});

const TagCell = memo(function TagCell({ tag }: { tag: Tag }) {
  if (!tag) return null;
  const s = TAG_STYLES[tag];
  return (
    <span
      className="m-badge"
      style={{ color: s.fg, background: s.bg }}
    >
      {s.label}
    </span>
  );
});

const MemoSparkline = memo(
  function MemoSparkline({ data, up }: { data: number[]; up: boolean }) {
    return (
      <Sparkline data={data} color={up ? "#16a34a" : "#ed2939"} width={100} height={28} />
    );
  },
  (prev, next) => {
    if (prev.up !== next.up) return false;
    if (prev.data === next.data) return true;
    if (prev.data.length !== next.data.length) return false;
    if (prev.data.length === 0) return true;
    return (
      prev.data[0] === next.data[0] &&
      prev.data[prev.data.length - 1] === next.data[next.data.length - 1]
    );
  },
);

const tdBase: React.CSSProperties = {
  borderBottom: "1px solid var(--divider)",
  padding: "6px 10px",
  verticalAlign: "middle",
  whiteSpace: "nowrap",
  color: "var(--text)",
};

function flagToBorder(flag: SubnetRow["flag"]): string | null {
  switch (flag) {
    case "new":
      return "#0ea5e9"; // sky blue
    case "gained-links":
      return "var(--success)";
    case "lost-links":
      return "var(--warning)";
    case "big-up":
      return "var(--success)";
    case "big-down":
      return "var(--danger)";
    default:
      return null;
  }
}

function flagLabel(flag: SubnetRow["flag"]): string | null {
  switch (flag) {
    case "new":
      return "NEW";
    case "gained-links":
      return "+LINK";
    case "lost-links":
      return "-LINK";
    case "big-up":
      return "▲ 10m";
    case "big-down":
      return "▼ 10m";
    default:
      return null;
  }
}

function FlagBadge({ flag }: { flag: SubnetRow["flag"] }) {
  const label = flagLabel(flag ?? null);
  if (!label) return null;
  const color = flagToBorder(flag ?? null) ?? "var(--text-dim)";
  return (
    <span
      className="m-badge"
      style={{
        color: "#fff",
        background: color,
        fontSize: 9.5,
        letterSpacing: "0.04em",
      }}
    >
      {label}
    </span>
  );
}

function fmtDuration(sec: number): string {
  if (sec < 0) sec = 0;
  if (sec < 60) return `${sec}s`;
  if (sec < 3600) {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return s > 0 ? `${m}m ${s}s` : `${m}m`;
  }
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  const parts = [`${h}h`];
  if (m > 0) parts.push(`${m}m`);
  if (s > 0) parts.push(`${s}s`);
  return parts.join(" ");
}

/**
 * Monotonic countdown: only re-anchors when the underlying second value
 * actually changes (new block landed). In between polls the server keeps
 * returning the same `initialSec`, so we tick down purely from the client
 * clock — avoiding the 1s bounce that happens when re-anchoring to a fresher
 * server timestamp every poll.
 */
function Countdown({ initialSec }: { initialSec: number }) {
  const anchorRef = useRef({ sec: initialSec, ts: Date.now() });
  const [, setTick] = useState(0);

  if (anchorRef.current.sec !== initialSec) {
    anchorRef.current = { sec: initialSec, ts: Date.now() };
  }

  useEffect(() => {
    const id = window.setInterval(() => setTick((t) => t + 1), 1000);
    return () => window.clearInterval(id);
  }, []);

  const elapsed = Math.floor((Date.now() - anchorRef.current.ts) / 1000);
  const remaining = Math.max(0, anchorRef.current.sec - elapsed);
  // Last 10 seconds (including zero-state) render as "firing" with a
  // pulsing brand-colored dot. This gives the user a clear pre-fire
  // warning from 10s → 0s and also covers the overdue case where the
  // server hasn't yet returned a fresh countdown.
  if (remaining <= 10) {
    return (
      <span
        className="inline-flex items-center gap-1.5"
        style={{ color: "var(--brand)", fontWeight: 600 }}
      >
        <span className="tnum">{fmtDuration(remaining)}</span>
        <span
          className="live-dot inline-block h-1.5 w-1.5 rounded-full"
          style={{ background: "var(--brand)" }}
          aria-hidden
        />
        <span style={{ fontSize: 10.5, fontWeight: 500 }}>firing…</span>
      </span>
    );
  }
  return <>{fmtDuration(remaining)}</>;
}

function RegsAvailableCell({
  available,
  target,
}: {
  // `available` is really the count USED this interval; `target` is the
  // 3-interval budget. Kept the prop names to avoid a cascading rename.
  available: number;
  target: number;
}) {
  if (!target || target <= 0) {
    return <span style={{ color: "var(--text-faint)" }}>—</span>;
  }
  const used = available;
  const overBudget = used >= target;
  const segs = Math.max(1, Math.min(target, 10));
  const filled = Math.min(segs, Math.round((used / target) * segs));
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-1.5">
        {overBudget ? (
          <span
            aria-hidden
            className="inline-block h-3.5 w-3.5 rounded-full"
            style={{ background: "var(--danger-soft)" }}
            title="Budget used — next reg will escalate burn"
          />
        ) : (
          <span
            aria-hidden
            className="inline-flex h-3.5 w-3.5 items-center justify-center rounded-full"
            style={{ background: "var(--success)", color: "#fff" }}
            title={`${used} of ${target} regs used`}
          >
            <svg width="9" height="9" viewBox="0 0 24 24" fill="none">
              <path
                d="M5 12.5l4.5 4.5L19 7.5"
                stroke="currentColor"
                strokeWidth={3.5}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </span>
        )}
        <span
          className="tnum text-[11px] font-semibold"
          style={{ color: overBudget ? "var(--danger)" : "var(--text)" }}
        >
          {used}/{target}
        </span>
      </div>
      <div className="flex gap-[2px]">
        {Array.from({ length: segs }).map((_, i) => (
          <span
            key={i}
            className="h-[3px] flex-1 rounded-[1px]"
            style={{
              background:
                i < filled
                  ? overBudget
                    ? "var(--danger)"
                    : "var(--success)"
                  : "var(--divider)",
              minWidth: 6,
            }}
          />
        ))}
      </div>
    </div>
  );
}

function NextRegCell({
  seconds,
  allowed,
}: {
  seconds: number | null;
  allowed: boolean;
}) {
  if (!allowed) {
    return (
      <span
        className="m-badge"
        style={{ color: "var(--text-faint)", background: "var(--surface-2)" }}
      >
        Closed
      </span>
    );
  }
  if (seconds === null || seconds <= 0) {
    return (
      <span style={{ color: "var(--success)", fontWeight: 600 }}>Open now</span>
    );
  }
  return (
    <span style={{ color: "var(--text)" }}>
      <Countdown initialSec={seconds} />
    </span>
  );
}

const USER_PINS_KEY = "bt-dash:pinned-subnets";
const DISMISSED_KEY = "bt-dash:dismissed-autopins";

function loadIdSet(key: string): Set<number> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return new Set();
    const arr = JSON.parse(raw) as number[];
    return new Set(
      (Array.isArray(arr) ? arr : []).filter((n) => typeof n === "number"),
    );
  } catch {
    return new Set();
  }
}

function saveIdSet(key: string, ids: Set<number>): void {
  try {
    window.localStorage.setItem(key, JSON.stringify([...ids]));
  } catch {
    // ignore quota / privacy-mode errors
  }
}

function PinButton({
  pinned,
  onToggle,
}: {
  pinned: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onToggle();
      }}
      title={pinned ? "Unpin subnet" : "Pin to top of table"}
      aria-label={pinned ? "Unpin subnet" : "Pin subnet"}
      className="inline-flex h-5 w-5 items-center justify-center rounded transition-all"
      style={{
        color: pinned ? "var(--brand)" : "var(--text-faint)",
        opacity: pinned ? 1 : 0.35,
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLElement).style.opacity = "1";
        (e.currentTarget as HTMLElement).style.color = pinned
          ? "var(--brand-hover)"
          : "var(--text-dim)";
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLElement).style.opacity = pinned ? "1" : "0.35";
        (e.currentTarget as HTMLElement).style.color = pinned
          ? "var(--brand)"
          : "var(--text-faint)";
      }}
    >
      <Pin
        size={12}
        strokeWidth={2}
        fill={pinned ? "currentColor" : "none"}
      />
    </button>
  );
}

const SubnetRowView = memo(
  function SubnetRowView({
    row,
    showUsd,
    taoPriceUsd,
    onOpenChart,
    onOpenRegs,
    pinIndex,
    userPinned,
    onTogglePin,
  }: {
    row: SubnetRow;
    showUsd: boolean;
    taoPriceUsd: number;
    onOpenChart: (t: ChartTarget) => void;
    onOpenRegs: (netuid: number, name: string) => void;
    pinIndex?: number | null;
    userPinned: boolean;
    onTogglePin: (netuid: number) => void;
  }) {
    const sparkUp =
      row.sparkline.length > 1 &&
      row.sparkline[row.sparkline.length - 1] >= row.sparkline[0];

    const burnColor =
      row.incentive_burn >= 0.5
        ? "var(--brand)"
        : row.incentive_burn >= 0.2
          ? "var(--orange)"
          : "var(--text)";

    const flagStyle = flagToBorder(row.flag);
    const pinned = pinIndex !== null && pinIndex !== undefined;
    // Pinned rows render first in tbody with the surface-2 band and
    // brand-red accent bar. They scroll with the rest of the table —
    // past experiments with `position: sticky` on either <tr> or per-<td>
    // caused either bleed-through (rows visible behind the sticky row)
    // or a gap between thead and first pinned row in Chrome (sticky-tr
    // acting like position:relative under certain layouts). The visual
    // distinction (colored band + left brand bar) already signals the
    // pin status while avoiding those rendering pitfalls.
    const pinCell: React.CSSProperties = pinned
      ? { background: "var(--surface-2)" }
      : {};
    const rowCellStyle: React.CSSProperties = { ...tdBase, ...pinCell };
    return (
      <tr
        className="m-row"
        data-pinned={pinned ? "true" : "false"}
        style={{
          transition: "background 120ms",
          boxShadow: flagStyle
            ? `inset 3px 0 0 ${flagStyle}`
            : pinned
              ? "inset 3px 0 0 var(--brand)"
              : undefined,
        }}
      >
        <td
          className="tnum"
          style={{ ...rowCellStyle, color: "var(--text-dim)", fontWeight: 500 }}
        >
          <div className="flex items-center gap-1.5">
            <PinButton
              pinned={userPinned}
              onToggle={() => onTogglePin(row.netuid)}
            />
            <span>{row.netuid}</span>
          </div>
        </td>
        <td style={rowCellStyle}>
          <div className="flex items-center gap-2.5">
            <SubnetIcon
              netuid={row.netuid}
              name={row.name}
              symbol={row.symbol}
              logoUrl={row.logo_url ?? null}
            />
            <div
              className="flex shrink-0 flex-col overflow-hidden"
              style={{ width: 112 }}
            >
              <span
                className="truncate text-[12.5px] font-semibold"
                style={{ color: "var(--text)" }}
                title={row.name}
              >
                {row.name}
              </span>
              <span
                className="text-[10.5px]"
                style={{ color: "var(--text-dim)" }}
              >
                SN {row.netuid}
              </span>
            </div>
            {/* Fixed-width slots per badge type so Immune + 10m badges
                line up at identical X-coordinates across rows regardless
                of which badges a given row happens to have. A missing
                badge leaves its slot empty but still reserves the width. */}
            <div className="flex shrink-0 items-center gap-1.5">
              <div className="flex shrink-0" style={{ width: 62 }}>
                <TagCell tag={row.tag} />
              </div>
              <div className="flex shrink-0" style={{ width: 60 }}>
                <FlagBadge flag={row.flag ?? null} />
              </div>
            </div>
          </div>
        </td>
        <td
          className="tnum font-medium"
          style={{ ...rowCellStyle, color: "var(--text)" }}
        >
          {(row.emission * 100).toFixed(2)}%
        </td>
        <td className="tnum font-medium" style={{ ...rowCellStyle, color: burnColor }}>
          <button
            type="button"
            onClick={() =>
              onOpenChart({
                kind: "burn",
                netuid: row.netuid,
                name: row.name,
                symbol: row.symbol,
              })
            }
            className="rounded px-1 py-0.5 transition-colors"
            style={{ color: burnColor, background: "transparent" }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLElement).style.background =
                "var(--surface-hover)";
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLElement).style.background = "transparent";
            }}
            title="Click for burn history"
          >
            {(row.incentive_burn * 100).toFixed(1)}%
          </button>
        </td>
        <td className="tnum font-semibold" style={rowCellStyle}>
          {Number.isFinite(row.burn_change_24h) &&
          Math.abs(row.burn_change_24h) > 0.01 ? (
            <span
              style={{
                color:
                  row.burn_change_24h > 0 ? "var(--danger)" : "var(--success)",
              }}
              title="Incentive burn change over the last 24 hours (percentage points)"
            >
              {row.burn_change_24h > 0 ? "▲" : "▼"}{" "}
              {Math.abs(row.burn_change_24h).toFixed(2)}
            </span>
          ) : (
            <span style={{ color: "var(--text-faint)" }}>—</span>
          )}
        </td>
        <td
          className="tnum font-medium"
          style={{ ...rowCellStyle, color: "var(--text)" }}
        >
          <button
            type="button"
            onClick={() =>
              onOpenChart({
                kind: "reg_cost",
                netuid: row.netuid,
                name: row.name,
                symbol: row.symbol,
              })
            }
            className="rounded px-1 py-0.5 transition-colors"
            style={{ color: "var(--text)", background: "transparent" }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLElement).style.background =
                "var(--surface-hover)";
              (e.currentTarget as HTMLElement).style.color = "var(--brand)";
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLElement).style.background = "transparent";
              (e.currentTarget as HTMLElement).style.color = "var(--text)";
            }}
            title="Click for reg-cost history"
          >
            {showUsd
              ? fmtUsd(row.reg_cost_tao * taoPriceUsd)
              : row.reg_cost_tao > 0
                ? row.reg_cost_tao.toFixed(row.reg_cost_tao >= 1 ? 2 : 4) + " τ"
                : "—"}
          </button>
        </td>
        <td className="tnum" style={{ ...rowCellStyle }}>
          <button
            type="button"
            onClick={() => onOpenRegs(row.netuid, row.name)}
            className="-mx-1 -my-0.5 rounded px-1 py-0.5 transition-colors"
            style={{ background: "transparent" }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLElement).style.background =
                "var(--surface-hover)";
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLElement).style.background = "transparent";
            }}
            title="Show registered hotkeys & coldkeys"
          >
            <RegsAvailableCell
              available={row.regs_available}
              target={row.regs_target}
            />
          </button>
        </td>
        <td className="tnum" style={{ ...rowCellStyle }}>
          <NextRegCell
            seconds={row.next_reg_seconds}
            allowed={row.registration_allowed}
          />
        </td>
        <td className="tnum" style={{ ...rowCellStyle, color: "var(--text)" }}>
          {row.next_epoch_seconds !== null && row.next_epoch_seconds > 0 ? (
            <Countdown initialSec={row.next_epoch_seconds} />
          ) : (
            <span style={{ color: "var(--text-faint)" }}>—</span>
          )}
        </td>
        <td style={rowCellStyle}>
          <button
            type="button"
            onClick={() =>
              onOpenChart({
                kind: "subnet",
                netuid: row.netuid,
                name: row.name,
                symbol: row.symbol,
              })
            }
            className="tnum rounded px-1 py-0.5 font-semibold transition-colors"
            style={{
              color: "var(--text)",
              background: "transparent",
              textDecoration: "none",
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLElement).style.background =
                "var(--surface-hover)";
              (e.currentTarget as HTMLElement).style.color = "var(--brand)";
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLElement).style.background = "transparent";
              (e.currentTarget as HTMLElement).style.color = "var(--text)";
            }}
            title="Click for price chart"
          >
            {showUsd
              ? fmtUsd(row.price_tao * taoPriceUsd, 4)
              : fmtTao(row.price_tao, 6)}
          </button>
        </td>
        <td style={rowCellStyle}>
          <PctCell v={row.change_10m} />
        </td>
        <td style={rowCellStyle}>
          <PctCell v={row.change_1h} />
        </td>
        <td style={rowCellStyle}>
          <PctCell v={row.change_1d} />
        </td>
        <td style={rowCellStyle}>
          <PctCell v={row.change_1w} />
        </td>
        <td style={rowCellStyle}>
          <PctCell v={row.change_1m} />
        </td>
        <td
          className="tnum font-medium"
          style={{ ...rowCellStyle, color: "var(--text)" }}
        >
          {showUsd
            ? fmtUsd(row.market_cap_tao * taoPriceUsd)
            : fmtCompact(row.market_cap_tao) + " τ"}
        </td>
        <td className="tnum" style={{ ...rowCellStyle, color: "var(--text-dim)" }}>
          {showUsd
            ? fmtUsd(row.volume_24h_tao * taoPriceUsd)
            : fmtCompact(row.volume_24h_tao) + " τ"}
        </td>
        <td style={rowCellStyle}>
          <MemoSparkline data={row.sparkline} up={sparkUp} />
        </td>
        <td style={rowCellStyle}>
          <SubnetRowIcons
            netuid={row.netuid}
            name={row.name}
            githubUrl={row.github_url}
            websiteUrl={row.website_url}
          />
        </td>
      </tr>
    );
  },
  (prev, next) => {
    if (prev.showUsd !== next.showUsd) return false;
    if (prev.showUsd && prev.taoPriceUsd !== next.taoPriceUsd) return false;
    if (prev.onOpenChart !== next.onOpenChart) return false;
    if (prev.onOpenRegs !== next.onOpenRegs) return false;
    if (prev.pinIndex !== next.pinIndex) return false;
    if (prev.userPinned !== next.userPinned) return false;
    if (prev.onTogglePin !== next.onTogglePin) return false;
    const a = prev.row;
    const b = next.row;
    const scalarsEqual =
      a.netuid === b.netuid &&
      a.name === b.name &&
      a.tag === b.tag &&
      a.price_tao === b.price_tao &&
      a.emission === b.emission &&
      a.incentive_burn === b.incentive_burn &&
      a.reg_cost_tao === b.reg_cost_tao &&
      a.slots_active === b.slots_active &&
      a.slots_total === b.slots_total &&
      a.regs_available === b.regs_available &&
      a.regs_target === b.regs_target &&
      a.next_reg_seconds === b.next_reg_seconds &&
      a.next_epoch_seconds === b.next_epoch_seconds &&
      a.registration_allowed === b.registration_allowed &&
      a.burn_change_10m === b.burn_change_10m &&
      a.burn_change_24h === b.burn_change_24h &&
      a.flag === b.flag &&
      a.change_10m === b.change_10m &&
      a.change_1h === b.change_1h &&
      a.change_1d === b.change_1d &&
      a.change_1w === b.change_1w &&
      a.change_1m === b.change_1m &&
      a.market_cap_tao === b.market_cap_tao &&
      a.volume_24h_tao === b.volume_24h_tao;
    if (!scalarsEqual) return false;
    if (a.sparkline === b.sparkline) return true;
    if (a.sparkline.length !== b.sparkline.length) return false;
    if (a.sparkline.length === 0) return true;
    return (
      a.sparkline[0] === b.sparkline[0] &&
      a.sparkline[a.sparkline.length - 1] === b.sparkline[b.sparkline.length - 1]
    );
  },
);

type Props = {
  rows: SubnetRow[];
  taoPriceUsd: number;
  showUsd: boolean;
  onToggleUsd: () => void;
  onOpenChart: (t: ChartTarget) => void;
  onOpenRegs: (netuid: number, name: string) => void;
};

const safeNumericSort = (
  rowA: Row<SubnetRow>,
  rowB: Row<SubnetRow>,
  columnId: string,
) => {
  const a = rowA.getValue(columnId) as number | null;
  const b = rowB.getValue(columnId) as number | null;
  const aBad = a == null || !Number.isFinite(a);
  const bBad = b == null || !Number.isFinite(b);
  if (aBad && bBad) return 0;
  if (aBad) return 1;
  if (bBad) return -1;
  return (a as number) - (b as number);
};

// Ordering for the Subnet column: risk tiers first, then Immune, then untagged.
// Root (netuid 0) is pushed last so it doesn't crowd the risk rows.
function tagRank(tag: Tag, netuid: number): number {
  if (netuid === 0) return 99;
  if (tag === "At Risk 1") return 0;
  if (tag === "At Risk 2") return 1;
  if (tag === "At Risk 3") return 2;
  if (tag === "Immune") return 3;
  return 4;
}

const subnetTagSort = (rowA: Row<SubnetRow>, rowB: Row<SubnetRow>) => {
  const a = rowA.original;
  const b = rowB.original;
  const diff = tagRank(a.tag, a.netuid) - tagRank(b.tag, b.netuid);
  if (diff !== 0) return diff;
  return a.name.localeCompare(b.name);
};

const burnChangeSort = (rowA: Row<SubnetRow>, rowB: Row<SubnetRow>) => {
  const a = rowA.original.burn_change_24h;
  const b = rowB.original.burn_change_24h;
  const av = Number.isFinite(a) ? Math.abs(a) : -1;
  const bv = Number.isFinite(b) ? Math.abs(b) : -1;
  if (av !== bv) return av - bv;
  return rowA.original.incentive_burn - rowB.original.incentive_burn;
};

const STATIC_COLUMNS: ColumnDef<SubnetRow, unknown>[] = [
  col.accessor("netuid", { header: "#", size: 52 }),
  col.accessor("name", {
    header: "Subnet",
    sortingFn: subnetTagSort,
    size: 320,
  }),
  col.accessor("emission", { header: "Emission", size: 78 }),
  col.accessor("incentive_burn", {
    id: "incentive_burn_pct",
    header: "Burn",
    size: 68,
  }),
  col.accessor("burn_change_24h", {
    id: "burn_change_24h",
    header: "Δ Burn 24h",
    sortingFn: burnChangeSort,
    size: 88,
  }),
  col.accessor("reg_cost_tao", { header: "Reg Cost", size: 80 }),
  col.accessor("regs_available", { id: "regs", header: "Regs", size: 70 }),
  col.accessor("next_reg_seconds", { id: "next_reg", header: "Next Reg", size: 82 }),
  col.accessor("next_epoch_seconds", { id: "next_epoch", header: "Next Epoch", size: 90 }),
  col.accessor("price_tao", { id: "price_tao", header: "Price", size: 82 }),
  col.accessor("change_10m", { header: "10m", size: 68 }),
  col.accessor("change_1h", { header: "1h", size: 68 }),
  col.accessor("change_1d", { header: "24h", size: 68 }),
  col.accessor("change_1w", { header: "7d", size: 68 }),
  col.accessor("change_1m", { header: "30d", size: 68 }),
  col.accessor("market_cap_tao", { header: "Market Cap", size: 90 }),
  col.accessor("volume_24h_tao", { header: "Vol 24h", size: 78 }),
  col.accessor("sparkline", {
    header: "7d Chart",
    enableSorting: false,
    size: 120,
  }),
  col.display({
    id: "links",
    header: "Links",
    size: 170,
  }),
] as ColumnDef<SubnetRow, unknown>[];

export function SubnetTable({
  rows,
  taoPriceUsd,
  showUsd,
  onToggleUsd,
  onOpenChart,
  onOpenRegs,
}: Props) {
  const [sorting, setSorting] = useState<SortingState>([
    { id: "burn_change_24h", desc: true },
  ]);
  const [filter, setFilter] = useState("");
  const [tagFilter, setTagFilter] = useState<"all" | "immune" | "risk">("all");
  const [typeFilter, setTypeFilter] = useState<Set<string>>(() => new Set());

  // All unique tags across all subnets, sorted alphabetically, feed the
  // type dropdown. `all` is a sentinel meaning no type filter.
  const availableTypes = useMemo(() => {
    const s = new Set<string>();
    for (const r of rows) {
      for (const t of r.types ?? []) if (t) s.add(t);
    }
    return [...s].sort((a, b) => a.localeCompare(b));
  }, [rows]);

  const filtered = useMemo(() => {
    let out = rows;
    if (filter.trim()) {
      const f = filter.toLowerCase();
      out = out.filter(
        (r) =>
          r.name.toLowerCase().includes(f) ||
          String(r.netuid).includes(f) ||
          r.symbol.toLowerCase().includes(f),
      );
    }
    if (tagFilter === "immune") out = out.filter((r) => r.tag === "Immune");
    if (tagFilter === "risk")
      out = out.filter((r) => r.tag !== null && r.tag.startsWith("At Risk"));
    if (typeFilter.size > 0) {
      out = out.filter((r) =>
        (r.types ?? []).some((t) => typeFilter.has(t)),
      );
    }
    return out;
  }, [rows, filter, tagFilter, typeFilter]);

  const table = useReactTable({
    data: filtered,
    columns: STATIC_COLUMNS,
    state: { sorting },
    onSortingChange: setSorting,
    getRowId: (r) => String(r.netuid),
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    defaultColumn: { sortingFn: safeNumericSort },
  });

  // Pinned rows stay at the top of the table regardless of the active sort.
  // Two user-controlled sets:
  //   • userPins         — subnets the user explicitly pinned (persisted)
  //   • dismissedAutoPin — auto-pins the user unpinned (persisted). An auto-
  //     pinned subnet the user dismisses stays dismissed until the user
  //     clicks Reset or re-pins it.
  const [userPins, setUserPins] = useState<Set<number>>(() => new Set());
  const [dismissedAutoPin, setDismissedAutoPin] = useState<Set<number>>(
    () => new Set(),
  );
  useEffect(() => {
    setUserPins(loadIdSet(USER_PINS_KEY));
    setDismissedAutoPin(loadIdSet(DISMISSED_KEY));
  }, []);

  // Pass the current computed pinnedIds to togglePin (via ref) so the
  // toggle can distinguish user-pinned vs auto-pinned rows at click time
  // without being recreated on every render.
  const autoPinnedRef = useRef<Set<number>>(new Set());

  const togglePin = useCallback((netuid: number) => {
    const isUser = userPinsRef.current.has(netuid);
    const isAuto = autoPinnedRef.current.has(netuid);
    if (isUser) {
      setUserPins((prev) => {
        const next = new Set(prev);
        next.delete(netuid);
        saveIdSet(USER_PINS_KEY, next);
        return next;
      });
    } else if (isAuto) {
      setDismissedAutoPin((prev) => {
        const next = new Set(prev);
        next.add(netuid);
        saveIdSet(DISMISSED_KEY, next);
        return next;
      });
    } else {
      setUserPins((prev) => {
        const next = new Set(prev);
        next.add(netuid);
        saveIdSet(USER_PINS_KEY, next);
        return next;
      });
      setDismissedAutoPin((prev) => {
        if (!prev.has(netuid)) return prev;
        const next = new Set(prev);
        next.delete(netuid);
        saveIdSet(DISMISSED_KEY, next);
        return next;
      });
    }
  }, []);

  const userPinsRef = useRef(userPins);
  useEffect(() => {
    userPinsRef.current = userPins;
  }, [userPins]);

  const resetDismissed = useCallback(() => {
    setDismissedAutoPin(() => {
      const empty = new Set<number>();
      saveIdSet(DISMISSED_KEY, empty);
      return empty;
    });
  }, []);

  // Auto-pin accordion. Default expanded (show every qualifying mover).
  // Collapsing keeps only the top `AUTO_PIN_COLLAPSED_LIMIT` auto-pins
  // visible at the top of the band; the rest fall back into their normal
  // sorted position, and a toggle reappears in the header.
  const AUTO_PIN_COLLAPSED_LIMIT = 3;
  const [autoPinsCollapsed, setAutoPinsCollapsed] = useState(true);

  const pinComputation = useMemo(() => {
    const ids = new Map<number, number>();
    const auto = new Set<number>();
    let order = 0;
    // Pin every qualifying mover. No hard cap — the list is naturally
    // bounded by the flag / burn-delta thresholds below.
    const BURN_PIN_THRESHOLD = 0.5; // percentage points over 24h

    const rowSet = new Set(rows.map((r) => r.netuid));
    for (const netuid of userPins) {
      if (rowSet.has(netuid)) ids.set(netuid, order++);
    }

    const flagRank = (f: SubnetRow["flag"] | null): number | null => {
      if (f === "big-up" || f === "big-down") return 0;
      if (f === "new") return 1;
      if (f === "gained-links") return 2;
      if (f === "lost-links") return 3;
      return null;
    };

    const flagged = rows
      .filter(
        (r) =>
          !ids.has(r.netuid) &&
          !dismissedAutoPin.has(r.netuid) &&
          flagRank(r.flag ?? null) !== null,
      )
      .sort((a, b) => {
        const ar = flagRank(a.flag ?? null) ?? 99;
        const br = flagRank(b.flag ?? null) ?? 99;
        if (ar !== br) return ar - br;
        const am = Number.isFinite(a.change_10m) ? Math.abs(a.change_10m) : 0;
        const bm = Number.isFinite(b.change_10m) ? Math.abs(b.change_10m) : 0;
        return bm - am;
      });

    const flaggedSet = new Set(flagged.map((f) => f.netuid));
    const movers = rows
      .filter(
        (r) =>
          !flaggedSet.has(r.netuid) &&
          !ids.has(r.netuid) &&
          !dismissedAutoPin.has(r.netuid) &&
          Number.isFinite(r.burn_change_24h) &&
          Math.abs(r.burn_change_24h) >= BURN_PIN_THRESHOLD,
      )
      .sort(
        (a, b) => Math.abs(b.burn_change_24h) - Math.abs(a.burn_change_24h),
      );

    const allAutoCandidates = [...flagged, ...movers];
    const visibleAuto = autoPinsCollapsed
      ? allAutoCandidates.slice(0, AUTO_PIN_COLLAPSED_LIMIT)
      : allAutoCandidates;
    for (const r of visibleAuto) {
      ids.set(r.netuid, order++);
      auto.add(r.netuid);
    }

    autoPinnedRef.current = auto;
    return {
      ids,
      totalAutoCount: allAutoCandidates.length,
      visibleAutoCount: visibleAuto.length,
    };
  }, [rows, userPins, dismissedAutoPin, autoPinsCollapsed]);

  const pinnedIds = pinComputation.ids;

  const counts = useMemo(() => {
    let immune = 0;
    let risk = 0;
    for (const r of rows) {
      if (r.tag === "Immune") immune++;
      else if (r.tag && r.tag.startsWith("At Risk")) risk++;
    }
    return { immune, risk };
  }, [rows]);

  const cardHeaderRef = useStickyHeight<HTMLDivElement>("--sticky-card-header");
  // Measures the non-scrolling top block (column headers + pinned rows).
  // Height is subtracted from the scroll container's maxHeight so only the
  // non-pinned rows scroll while headers + pins stay fixed above.
  const stickyTopRef = useStickyHeight<HTMLDivElement>("--sticky-pin-block");

  return (
    <div className="px-4 pb-6">
      <div className="m-card">
        {/* Card header */}
        <div
          ref={cardHeaderRef}
          id="app-card-header"
          className="sticky z-20 flex flex-wrap items-center gap-3 border-b px-4 py-3"
          style={{
            top: "calc(var(--sticky-top-1, 172px) + var(--sticky-tab, 40px))",
            borderColor: "var(--divider)",
            background: "var(--surface)",
            borderTopLeftRadius: 8,
            borderTopRightRadius: 8,
          }}
        >
          <div className="flex flex-col">
            <span
              className="text-[14px] font-semibold"
              style={{ color: "var(--text)" }}
            >
              Subnet Overview
            </span>
            <span className="text-[11px]" style={{ color: "var(--text-dim)" }}>
              {filtered.length} of {rows.length} subnets · {counts.immune} immune · {counts.risk} at risk
              {pinComputation.totalAutoCount > 0 && (
                <>
                  {" · "}
                  <span style={{ color: "var(--text)" }}>
                    {autoPinsCollapsed
                      ? `${pinComputation.visibleAutoCount} of ${pinComputation.totalAutoCount}`
                      : pinComputation.totalAutoCount}{" "}
                    auto-pinned
                  </span>
                  {pinComputation.totalAutoCount >
                    AUTO_PIN_COLLAPSED_LIMIT && (
                    <>
                      {" · "}
                      <button
                        type="button"
                        onClick={() => setAutoPinsCollapsed((v) => !v)}
                        className="underline"
                        style={{ color: "var(--brand)" }}
                        title={
                          autoPinsCollapsed
                            ? "Show all auto-pinned movers"
                            : `Collapse to top ${AUTO_PIN_COLLAPSED_LIMIT}`
                        }
                      >
                        {autoPinsCollapsed
                          ? `show ${
                              pinComputation.totalAutoCount -
                              pinComputation.visibleAutoCount
                            } more`
                          : "collapse"}
                      </button>
                    </>
                  )}
                </>
              )}
              {dismissedAutoPin.size > 0 && (
                <>
                  {" · "}
                  <button
                    type="button"
                    onClick={resetDismissed}
                    className="underline"
                    style={{ color: "var(--brand)" }}
                    title="Re-enable auto-pin for previously dismissed subnets"
                  >
                    restore {dismissedAutoPin.size} dismissed
                  </button>
                </>
              )}
            </span>
          </div>

          <div className="ml-auto flex flex-wrap items-center gap-2">
            <div className="group relative">
              <span
                className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[12px]"
                style={{ color: "var(--text-faint)" }}
              >
                ⌕
              </span>
              <input
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                placeholder="Search subnet..."
                className="rounded-md border py-1.5 pl-7 pr-7 text-[12px] outline-none focus:border-[color:var(--brand)]"
                style={{
                  background: "var(--surface)",
                  borderColor: "var(--border)",
                  color: "var(--text)",
                  width: 200,
                }}
              />
              {filter && (
                <button
                  type="button"
                  aria-label="Clear search"
                  title="Clear"
                  onClick={() => setFilter("")}
                  className="absolute right-1 top-1/2 flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded-full opacity-0 transition-all focus:opacity-100 group-hover:opacity-100 focus-within:opacity-100"
                  style={{ color: "var(--text-faint)" }}
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLElement).style.background =
                      "var(--surface-hover)";
                    (e.currentTarget as HTMLElement).style.color =
                      "var(--text)";
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLElement).style.background =
                      "transparent";
                    (e.currentTarget as HTMLElement).style.color =
                      "var(--text-faint)";
                  }}
                >
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none">
                    <path
                      d="M6 6l12 12M18 6L6 18"
                      stroke="currentColor"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                    />
                  </svg>
                </button>
              )}
            </div>

            <SegGroup
              value={tagFilter}
              onChange={setTagFilter}
              options={[
                { value: "all", label: "All" },
                { value: "immune", label: "Immune" },
                { value: "risk", label: "At Risk" },
              ]}
            />

            <TypeMultiSelect
              selected={typeFilter}
              onChange={setTypeFilter}
              options={availableTypes}
            />

            <SegGroup
              value={showUsd ? "usd" : "tao"}
              onChange={(v) => {
                if ((v === "usd") !== showUsd) onToggleUsd();
              }}
              options={[
                { value: "tao", label: "τ" },
                { value: "usd", label: "$" },
              ]}
            />
          </div>
        </div>

        {(() => {
          const sorted = table.getRowModel().rows;
          // Defensive dedup by netuid. Upstream should already be
          // unique, but during data-refresh transitions TanStack can
          // briefly surface a stale + fresh row with the same row.id,
          // which would trip React's "two children with the same key"
          // invariant. Keep the first occurrence.
          const seen = new Set<number>();
          const unique = sorted.filter((r) => {
            if (seen.has(r.original.netuid)) return false;
            seen.add(r.original.netuid);
            return true;
          });
          const pinnedRows = [...pinnedIds.entries()]
            .sort((a, b) => a[1] - b[1])
            .map(([netuid]) => unique.find((r) => r.original.netuid === netuid))
            .filter((r): r is NonNullable<typeof r> => !!r);
          const normalRows = unique.filter(
            (r) => !pinnedIds.has(r.original.netuid),
          );
          const columns = table.getVisibleLeafColumns();
          const sharedColGroup = (
            <colgroup>
              {columns.map((c) => (
                <col
                  key={c.id}
                  style={{ width: c.getSize() !== 150 ? c.getSize() : undefined }}
                />
              ))}
            </colgroup>
          );
          const tableStyle: React.CSSProperties = {
            borderCollapse: "separate",
            borderSpacing: 0,
            minWidth: 1200,
            tableLayout: "fixed",
          };
          return (
            <>
              {/* Non-scrolling top block: column headers + pinned rows.
                  Lives outside the scroll container so both are permanently
                  visible — effectively sticky — without any of the table-
                  sticky compositing bugs that cause bleed-through or gaps.
                  Right padding matches the bottom scroll container's
                  scrollbar width (10 px per globals.css) so both tables
                  have the same effective content width and column widths
                  line up exactly. */}
              <div ref={stickyTopRef} style={{ paddingRight: 10 }}>
                <table className="w-full text-[12px]" style={tableStyle}>
                  {sharedColGroup}
                  <thead>
                    {table.getHeaderGroups().map((hg) => (
                      <tr key={hg.id}>
                        {hg.headers.map((h) => (
                          <th
                            key={h.id}
                            onClick={h.column.getToggleSortingHandler()}
                            className={cn(h.column.getCanSort() && "cursor-pointer")}
                            style={{
                              padding: "7px 10px",
                              background: "var(--surface-2)",
                              borderBottom: "1px solid var(--border)",
                              color: "var(--text-dim)",
                              fontSize: 10.5,
                              fontWeight: 600,
                              letterSpacing: "0.06em",
                              textTransform: "uppercase",
                              textAlign: "left",
                              userSelect: "none",
                            }}
                          >
                            <div className="flex items-center gap-1.5">
                              {flexRender(h.column.columnDef.header, h.getContext())}
                              {(() => {
                                const s = h.column.getIsSorted();
                                if (!s) return null;
                                return (
                                  <span style={{ color: "var(--brand)" }}>
                                    {s === "asc" ? "▲" : "▼"}
                                  </span>
                                );
                              })()}
                            </div>
                          </th>
                        ))}
                      </tr>
                    ))}
                  </thead>
                  {pinnedRows.length > 0 && (
                    <tbody>
                      {pinnedRows.map((row, i) => (
                        <SubnetRowView
                          key={`pin-${row.original.netuid}`}
                          row={row.original}
                          showUsd={showUsd}
                          taoPriceUsd={taoPriceUsd}
                          onOpenChart={onOpenChart}
                          onOpenRegs={onOpenRegs}
                          pinIndex={i}
                          userPinned={userPins.has(row.original.netuid)}
                          onTogglePin={togglePin}
                        />
                      ))}
                    </tbody>
                  )}
                </table>
              </div>

              {/* Scrollable body: non-pinned rows only. Height fills what
                  remains below all measured sticky sections plus the
                  non-scrolling pin block. */}
              <div
                className="w-full overflow-y-scroll"
                style={{
                  maxHeight:
                    "calc(100vh - var(--sticky-top-1, 172px) - var(--sticky-tab, 40px) - var(--sticky-card-header, 54px) - var(--sticky-pin-block, 40px) - 24px)",
                }}
              >
                <table className="w-full text-[12px]" style={tableStyle}>
                  {sharedColGroup}
                  <tbody>
                    {normalRows.map((row) => (
                      <SubnetRowView
                        key={`row-${row.original.netuid}`}
                        row={row.original}
                        showUsd={showUsd}
                        taoPriceUsd={taoPriceUsd}
                        userPinned={userPins.has(row.original.netuid)}
                        onTogglePin={togglePin}
                        onOpenChart={onOpenChart}
                        onOpenRegs={onOpenRegs}
                      />
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          );
        })()}
      </div>
    </div>
  );
}

function TypeMultiSelect({
  selected,
  onChange,
  options,
}: {
  selected: Set<string>;
  onChange: (next: Set<string>) => void;
  options: string[];
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const rootRef = useRef<HTMLDivElement | null>(null);

  // Close on outside click + Escape.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return options;
    return options.filter((o) => o.toLowerCase().includes(q));
  }, [search, options]);

  const toggle = (t: string) => {
    const next = new Set(selected);
    if (next.has(t)) next.delete(t);
    else next.add(t);
    onChange(next);
  };

  const clear = () => onChange(new Set());

  const count = selected.size;
  const summary =
    count === 0
      ? "All types"
      : count === 1
        ? [...selected][0]
        : `${count} types`;

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex h-8 items-center gap-2 rounded-md border px-2.5 text-[11.5px] font-semibold transition-colors"
        style={{
          borderColor: count > 0 ? "var(--brand)" : "var(--border)",
          background: open ? "var(--surface-hover)" : "var(--surface-2)",
          color: "var(--text)",
        }}
      >
        <span
          className="uppercase"
          style={{
            color: "var(--text-dim)",
            fontSize: 10,
            letterSpacing: "0.06em",
          }}
        >
          Type
        </span>
        <span className="max-w-[140px] truncate">{summary}</span>
        {count > 0 && (
          <span
            className="inline-flex items-center justify-center rounded px-1 text-[9.5px] font-semibold"
            style={{
              background: "var(--brand)",
              color: "#fff",
              height: 14,
              minWidth: 14,
            }}
          >
            {count}
          </span>
        )}
        <svg
          width="10"
          height="10"
          viewBox="0 0 12 12"
          style={{
            color: "var(--text-dim)",
            transform: open ? "rotate(180deg)" : "none",
            transition: "transform 140ms",
          }}
        >
          <path
            d="M2 4l4 4 4-4"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
          />
        </svg>
      </button>

      {open && (
        <div
          className="absolute right-0 top-[calc(100%+6px)] z-30 flex w-[280px] flex-col rounded-md border shadow-lg"
          style={{
            background: "var(--surface)",
            borderColor: "var(--border)",
            boxShadow: "0 10px 30px 0 rgba(0,0,0,0.25)",
          }}
        >
          <div
            className="flex items-center gap-2 border-b p-2"
            style={{ borderColor: "var(--divider)" }}
          >
            <svg
              width="13"
              height="13"
              viewBox="0 0 24 24"
              fill="none"
              style={{ color: "var(--text-dim)" }}
            >
              <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2" />
              <path
                d="M20 20l-3-3"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              />
            </svg>
            <input
              autoFocus
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Filter types…"
              className="flex-1 bg-transparent text-[11.5px] outline-none"
              style={{ color: "var(--text)" }}
            />
            {count > 0 && (
              <button
                onClick={clear}
                className="text-[10.5px] font-semibold uppercase transition-colors"
                style={{
                  color: "var(--text-dim)",
                  letterSpacing: "0.04em",
                }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLElement).style.color = "var(--brand)";
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLElement).style.color = "var(--text-dim)";
                }}
                title="Clear selection"
              >
                Clear
              </button>
            )}
          </div>
          <div className="max-h-[280px] overflow-y-auto p-1">
            {filtered.length === 0 && (
              <div
                className="px-2 py-4 text-center text-[11.5px]"
                style={{ color: "var(--text-dim)" }}
              >
                No matching types.
              </div>
            )}
            {filtered.map((t) => {
              const active = selected.has(t);
              return (
                <button
                  key={t}
                  type="button"
                  onClick={() => toggle(t)}
                  className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-[11.5px] transition-colors"
                  style={{
                    background: active ? "var(--brand-soft)" : "transparent",
                    color: active ? "var(--brand)" : "var(--text)",
                    fontWeight: active ? 600 : 500,
                  }}
                  onMouseEnter={(e) => {
                    if (!active)
                      (e.currentTarget as HTMLElement).style.background =
                        "var(--surface-hover)";
                  }}
                  onMouseLeave={(e) => {
                    if (!active)
                      (e.currentTarget as HTMLElement).style.background =
                        "transparent";
                  }}
                >
                  <span
                    className="flex h-3.5 w-3.5 items-center justify-center rounded-sm border"
                    style={{
                      borderColor: active ? "var(--brand)" : "var(--border-strong)",
                      background: active ? "var(--brand)" : "transparent",
                    }}
                    aria-hidden
                  >
                    {active && (
                      <svg width="9" height="9" viewBox="0 0 24 24" fill="none">
                        <path
                          d="M5 12.5l4.5 4.5L19 7.5"
                          stroke="#fff"
                          strokeWidth="3.5"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    )}
                  </span>
                  <span className="truncate">{t}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function SegGroup<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
}) {
  return (
    <div
      className="inline-flex items-center gap-1 rounded-md border p-[3px]"
      style={{
        borderColor: "var(--border)",
        background: "var(--surface-2)",
      }}
    >
      {options.map((o) => {
        const active = value === o.value;
        return (
          <button
            key={o.value}
            onClick={() => onChange(o.value)}
            className="rounded px-3 py-1 text-[11px] font-semibold"
            style={{
              background: active ? "var(--brand)" : "transparent",
              color: active ? "#fff" : "var(--text-dim)",
              boxShadow: active ? "0 1px 2px 0 rgba(237,41,57,0.25)" : "none",
              transition: "all 120ms",
            }}
            onMouseEnter={(e) => {
              if (!active) {
                (e.currentTarget as HTMLButtonElement).style.color = "var(--text)";
                (e.currentTarget as HTMLButtonElement).style.background =
                  "var(--surface)";
              }
            }}
            onMouseLeave={(e) => {
              if (!active) {
                (e.currentTarget as HTMLButtonElement).style.color =
                  "var(--text-dim)";
                (e.currentTarget as HTMLButtonElement).style.background =
                  "transparent";
              }
            }}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
