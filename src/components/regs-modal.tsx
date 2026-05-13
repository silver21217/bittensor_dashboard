"use client";

import { useEffect, useMemo, useState } from "react";
import { X, ExternalLink, ChevronLeft, ChevronRight } from "lucide-react";
import { BrandSpinner } from "./brand-spinner";

type Neuron = {
  uid: number;
  netuid: number;
  hotkey: { ss58: string };
  coldkey: { ss58: string };
  registered_at_block: number | null;
  is_immunity_period: boolean;
  rank: number | null;
  incentive: string | null;
  emission: string | null;
  active: boolean;
  validator_permit: boolean;
  block_number: number;
  // Present on some TaoStats responses; we synthesize it from
  // `registered_at_block` + current block timestamp when missing.
  timestamp?: string;
};

type Props = {
  netuid: number;
  name: string;
  onClose: () => void;
};

const BLOCK_TIME_MS = 12_000;
const PAGE_SIZE = 20;

function shortSs58(addr: string): string {
  if (!addr || addr.length < 16) return addr;
  return `${addr.slice(0, 8)}…${addr.slice(-6)}`;
}

function fmtDateTime(ms: number): string {
  const d = new Date(ms);
  if (!Number.isFinite(d.getTime())) return "—";
  const y = d.getUTCFullYear();
  const mo = String(d.getUTCMonth() + 1).padStart(2, "0");
  const da = String(d.getUTCDate()).padStart(2, "0");
  const hh = String(d.getUTCHours()).padStart(2, "0");
  const mm = String(d.getUTCMinutes()).padStart(2, "0");
  return `${y}-${mo}-${da} ${hh}:${mm} UTC`;
}

type TabKey = "registered" | "at_risk";

export function RegsModal({ netuid, name, onClose }: Props) {
  const [neurons, setNeurons] = useState<Neuron[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [total, setTotal] = useState(0);
  const [filter, setFilter] = useState("");
  const [tab, setTab] = useState<TabKey>("registered");
  const [page, setPage] = useState(1);

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
    let retryTimer: number | null = null;
    setLoading(true);
    setError(null);

    const attempt = async (retriesLeft: number): Promise<void> => {
      try {
        const r = await fetch(`/api/neurons?netuid=${netuid}`, {
          cache: "no-store",
        });
        const body = await r.json();
        if (!r.ok) {
          // 503 = upstream rate limit. Retry once after a short delay
          // so the user doesn't have to close + reopen the modal.
          if (r.status === 503 && retriesLeft > 0) {
            retryTimer = window.setTimeout(() => {
              if (!cancelled) attempt(retriesLeft - 1);
            }, 2000);
            return;
          }
          throw new Error(body?.error ?? `HTTP ${r.status}`);
        }
        if (cancelled) return;
        setNeurons(body.neurons);
        setTotal(body.total);
        setLoading(false);
      } catch (e) {
        if (cancelled) return;
        setError(String(e instanceof Error ? e.message : e));
        setLoading(false);
      }
    };

    attempt(1);
    return () => {
      cancelled = true;
      if (retryTimer !== null) window.clearTimeout(retryTimer);
    };
  }, [netuid]);

  // Reset page when tab, filter, or data change.
  useEffect(() => {
    setPage(1);
  }, [tab, filter, neurons]);

  // Current block timestamp: take the max block_number from the set
  // paired with a `timestamp` if any row carries one, else Date.now().
  const currentBlockInfo = useMemo(() => {
    if (!neurons || neurons.length === 0) return { block: 0, ts: Date.now() };
    let maxBlock = 0;
    let ts = Date.now();
    for (const n of neurons) {
      if (n.block_number > maxBlock) {
        maxBlock = n.block_number;
        const parsed = n.timestamp ? Date.parse(n.timestamp) : NaN;
        if (Number.isFinite(parsed)) ts = parsed;
      }
    }
    return { block: maxBlock, ts };
  }, [neurons]);

  const registeredAtMs = (n: Neuron): number => {
    if (n.registered_at_block === null) return 0;
    const { block, ts } = currentBlockInfo;
    const blocksBack = block - n.registered_at_block;
    return ts - blocksBack * BLOCK_TIME_MS;
  };

  // At-risk = the N lowest-emission neurons that are NOT in the
  // registration-immunity window. Bittensor's pruning mechanism
  // deregisters by emission (pruning score), NOT by the metagraph's
  // `rank` field — which for most subnets is 0 for any neuron without
  // an active validator/consensus weight. Using `rank` would falsely
  // flag validators (higher rank = actively participating) as at-risk.
  const atRiskUids = useMemo(() => {
    if (!neurons) return new Set<number>();
    const pool = neurons
      .filter((n) => !n.is_immunity_period)
      .map((n) => ({
        uid: n.uid,
        emission: Number(n.emission ?? 0) || 0,
        incentive: Number(n.incentive ?? 0) || 0,
      }))
      .sort((a, b) => {
        // Primary: lowest emission first. Tie-break on lowest incentive
        // so neurons already zeroed-out on emission are still ordered.
        if (a.emission !== b.emission) return a.emission - b.emission;
        return a.incentive - b.incentive;
      });
    return new Set(pool.slice(0, 3).map((n) => n.uid));
  }, [neurons]);

  const tabList = useMemo(() => {
    if (!neurons) return [] as Neuron[];
    const base =
      tab === "at_risk"
        ? neurons.filter((n) => atRiskUids.has(n.uid))
        : neurons.slice();
    // Sort newest-first by registered_at_block (higher block = newer).
    base.sort(
      (a, b) =>
        (b.registered_at_block ?? -1) - (a.registered_at_block ?? -1),
    );
    const f = filter.trim().toLowerCase();
    if (!f) return base;
    return base.filter(
      (n) =>
        n.hotkey.ss58.toLowerCase().includes(f) ||
        n.coldkey.ss58.toLowerCase().includes(f) ||
        String(n.uid).includes(f),
    );
  }, [neurons, tab, filter, atRiskUids]);

  const pageCount = Math.max(1, Math.ceil(tabList.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount);
  const pagedRows = tabList.slice(
    (safePage - 1) * PAGE_SIZE,
    safePage * PAGE_SIZE,
  );

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: "rgba(0, 0, 0, 0.55)" }}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="relative flex max-h-[90vh] w-[min(1080px,95vw)] flex-col overflow-hidden rounded-lg border"
        style={{
          background: "var(--surface)",
          borderColor: "var(--border)",
          boxShadow: "0 20px 60px 0 rgba(0,0,0,0.35)",
        }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between gap-3 border-b px-5 py-4"
          style={{ borderColor: "var(--divider)" }}
        >
          <div className="flex flex-col">
            <span
              className="text-[15px] font-semibold"
              style={{ color: "var(--text)" }}
            >
              Registrations · {name}
            </span>
            <span
              className="text-[11px]"
              style={{ color: "var(--text-dim)" }}
            >
              SN {netuid} · {total || neurons?.length || "—"} neurons · newest first
            </span>
          </div>
          <div className="flex items-center gap-2">
            <input
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Filter by UID, hotkey, or coldkey"
              className="h-8 w-64 rounded-md border px-2.5 text-[11.5px] outline-none"
              style={{
                background: "var(--surface-2)",
                borderColor: "var(--border)",
                color: "var(--text)",
              }}
            />
            <button
              onClick={onClose}
              className="flex h-8 w-8 items-center justify-center rounded-md border transition-colors"
              style={{
                background: "var(--surface)",
                borderColor: "var(--border)",
                color: "var(--text-dim)",
              }}
              aria-label="Close"
            >
              <X size={16} strokeWidth={2} />
            </button>
          </div>
        </div>

        {/* Tab bar */}
        <div
          className="flex items-center gap-1 border-b px-4 py-2"
          style={{ borderColor: "var(--divider)" }}
        >
          <TabButton
            active={tab === "registered"}
            onClick={() => setTab("registered")}
            count={neurons?.length}
            label="Registered"
          />
          <TabButton
            active={tab === "at_risk"}
            onClick={() => setTab("at_risk")}
            count={atRiskUids.size}
            label="Next to deregister"
            accent="var(--brand)"
          />
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto">
          {loading && !neurons && <BrandSpinner size={96} minHeight={360} />}
          {error && (
            <div className="p-6 text-[12.5px]" style={{ color: "var(--danger)" }}>
              Failed to load neurons: {error}
            </div>
          )}
          {pagedRows.length > 0 && (
            <table className="w-full text-[12px]">
              <thead
                className="sticky top-0 z-10"
                style={{
                  background: "var(--surface-2)",
                  borderBottom: "1px solid var(--border)",
                }}
              >
                <tr>
                  <Th>No</Th>
                  <Th>UID</Th>
                  <Th>Hotkey</Th>
                  <Th>Coldkey</Th>
                  <Th>Registered (UTC)</Th>
                  <Th>Rank</Th>
                  <Th>Status</Th>
                </tr>
              </thead>
              <tbody>
                {pagedRows.map((n, i) => {
                  const isAtRisk = atRiskUids.has(n.uid);
                  const regMs =
                    n.registered_at_block !== null ? registeredAtMs(n) : null;
                  // Running index across the whole filtered list — keeps
                  // numbering continuous through pagination so row 21 on
                  // page 2 reads as "21" not "1".
                  const rowNo = (safePage - 1) * PAGE_SIZE + i + 1;
                  return (
                    <tr
                      key={`${n.uid}-${n.hotkey.ss58}`}
                      className="transition-colors"
                      style={{
                        borderBottom: "1px solid var(--divider)",
                      }}
                      onMouseEnter={(e) => {
                        (e.currentTarget as HTMLElement).style.background =
                          "var(--surface-hover)";
                      }}
                      onMouseLeave={(e) => {
                        (e.currentTarget as HTMLElement).style.background = "";
                      }}
                    >
                      <td
                        className="tnum px-3 py-2"
                        style={{ color: "var(--text-dim)" }}
                      >
                        {rowNo}
                      </td>
                      <td
                        className="tnum px-3 py-2 font-semibold"
                        style={{ color: "var(--text)" }}
                      >
                        {n.uid}
                      </td>
                      <SsCell addr={n.hotkey.ss58} />
                      <SsCell addr={n.coldkey.ss58} />
                      <td
                        className="tnum px-3 py-2"
                        style={{ color: "var(--text)" }}
                      >
                        {regMs !== null ? fmtDateTime(regMs) : "—"}
                        {n.registered_at_block !== null && (
                          <div
                            className="text-[10px]"
                            style={{ color: "var(--text-faint)" }}
                          >
                            block {n.registered_at_block.toLocaleString()}
                          </div>
                        )}
                      </td>
                      <td
                        className="tnum px-3 py-2"
                        style={{ color: "var(--text)" }}
                      >
                        {n.rank ?? "—"}
                      </td>
                      <td className="px-3 py-2">
                        <StatusBadge
                          immunity={n.is_immunity_period}
                          atRisk={isAtRisk}
                          validator={n.validator_permit}
                          active={n.active}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
          {pagedRows.length === 0 && !loading && !error && (
            <div
              className="p-6 text-center text-[12px]"
              style={{ color: "var(--text-dim)" }}
            >
              {tab === "at_risk"
                ? "No neurons flagged at risk."
                : "No neurons match the filter."}
            </div>
          )}
        </div>

        {/* Pagination footer */}
        {tabList.length > PAGE_SIZE && (
          <div
            className="flex items-center justify-between border-t px-5 py-3 text-[11.5px]"
            style={{ borderColor: "var(--divider)", color: "var(--text-dim)" }}
          >
            <span>
              {(safePage - 1) * PAGE_SIZE + 1}–
              {Math.min(safePage * PAGE_SIZE, tabList.length)} of{" "}
              {tabList.length}
            </span>
            <div className="flex items-center gap-1">
              <PageButton
                disabled={safePage <= 1}
                onClick={() => setPage(safePage - 1)}
                aria="Previous page"
              >
                <ChevronLeft size={14} strokeWidth={2} />
              </PageButton>
              <span
                className="tnum px-2 font-semibold"
                style={{ color: "var(--text)" }}
              >
                {safePage} / {pageCount}
              </span>
              <PageButton
                disabled={safePage >= pageCount}
                onClick={() => setPage(safePage + 1)}
                aria="Next page"
              >
                <ChevronRight size={14} strokeWidth={2} />
              </PageButton>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function TabButton({
  active,
  onClick,
  count,
  label,
  accent,
}: {
  active: boolean;
  onClick: () => void;
  count?: number;
  label: string;
  accent?: string;
}) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[11.5px] font-semibold transition-colors"
      style={{
        background: active
          ? accent
            ? "var(--brand-soft)"
            : "var(--surface-hover)"
          : "transparent",
        color: active ? accent ?? "var(--text)" : "var(--text-dim)",
      }}
    >
      {label}
      {typeof count === "number" && (
        <span
          className="tnum rounded px-1.5 py-0.5 text-[10px] font-semibold"
          style={{
            background: active
              ? accent
                ? "color-mix(in srgb, var(--brand) 22%, transparent)"
                : "var(--surface-2)"
              : "var(--surface-2)",
            color: active ? accent ?? "var(--text)" : "var(--text-dim)",
          }}
        >
          {count}
        </span>
      )}
    </button>
  );
}

function PageButton({
  children,
  onClick,
  disabled,
  aria,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  aria: string;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      aria-label={aria}
      className="flex h-7 w-7 items-center justify-center rounded-md border transition-colors"
      style={{
        background: "var(--surface)",
        borderColor: "var(--border)",
        color: disabled ? "var(--text-faint)" : "var(--text)",
        opacity: disabled ? 0.5 : 1,
      }}
    >
      {children}
    </button>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th
      className="px-3 py-2.5 text-left text-[10px] font-semibold uppercase"
      style={{
        color: "var(--text-dim)",
        letterSpacing: "0.06em",
      }}
    >
      {children}
    </th>
  );
}

function SsCell({ addr }: { addr: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async (e: React.MouseEvent) => {
    e.preventDefault();
    try {
      await navigator.clipboard.writeText(addr);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1200);
    } catch {
      // ignore
    }
  };
  return (
    <td className="px-3 py-2">
      <div className="flex items-center gap-1.5">
        <a
          href={`https://taostats.io/account/${addr}`}
          target="_blank"
          rel="noreferrer"
          className="font-mono text-[11.5px] transition-colors"
          style={{ color: "var(--text)" }}
          title={addr}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLElement).style.color = "var(--brand)";
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLElement).style.color = "var(--text)";
          }}
        >
          {shortSs58(addr)}
        </a>
        <button
          onClick={copy}
          className="text-[9.5px] font-semibold uppercase transition-colors"
          style={{
            color: copied ? "var(--success)" : "var(--text-faint)",
            letterSpacing: "0.04em",
          }}
          title="Copy full address"
        >
          {copied ? "✓" : "copy"}
        </button>
        <a
          href={`https://taostats.io/account/${addr}`}
          target="_blank"
          rel="noreferrer"
          title="Open in TaoStats"
          style={{ color: "var(--text-faint)" }}
        >
          <ExternalLink size={11} strokeWidth={2} />
        </a>
      </div>
    </td>
  );
}

function StatusBadge({
  immunity,
  atRisk,
  validator,
  active,
}: {
  immunity: boolean;
  atRisk: boolean;
  validator: boolean;
  active: boolean;
}) {
  const pills: { label: string; bg: string; fg: string }[] = [];
  if (immunity) {
    pills.push({
      label: "Immunity",
      bg: "var(--amber-soft)",
      fg: "var(--amber)",
    });
  }
  if (atRisk) {
    pills.push({
      label: "At risk",
      bg: "var(--brand-soft)",
      fg: "var(--brand)",
    });
  }
  if (validator) {
    pills.push({
      label: "Validator",
      bg: "color-mix(in srgb, #0ea5e9 14%, transparent)",
      fg: "#0ea5e9",
    });
  }
  if (!immunity && !atRisk && !validator && active) {
    pills.push({
      label: "Active",
      bg: "var(--success-soft)",
      fg: "var(--success)",
    });
  }
  if (!active) {
    pills.push({
      label: "Inactive",
      bg: "var(--surface-2)",
      fg: "var(--text-faint)",
    });
  }
  return (
    <div className="flex flex-wrap items-center gap-1">
      {pills.map((p) => (
        <span
          key={p.label}
          className="inline-flex items-center rounded px-1.5 py-0.5 text-[9.5px] font-semibold uppercase"
          style={{
            background: p.bg,
            color: p.fg,
            letterSpacing: "0.04em",
          }}
        >
          {p.label}
        </span>
      ))}
    </div>
  );
}
