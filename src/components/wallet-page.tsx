"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Pin, PinOff, Search, X } from "lucide-react";
import {
  Area,
  AreaChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type {
  WalletHistoryPoint,
  WalletPayload,
  WalletPosition,
} from "@/app/api/wallet/route";
import type { SubnetRow } from "@/lib/types";
import { SubnetIcon } from "./subnet-icon";
import { fmtTao, fmtUsd, fmtPct } from "@/lib/format";
import { cn } from "@/lib/cn";

type PinnedEntry = { address: string; label?: string };

const PIN_STORAGE_KEY = "bt-dash:pinned-wallets";

function readPins(): PinnedEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(PIN_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (p): p is PinnedEntry => typeof p?.address === "string",
    );
  } catch {
    return [];
  }
}

function writePins(pins: PinnedEntry[]): void {
  try {
    window.localStorage.setItem(PIN_STORAGE_KEY, JSON.stringify(pins));
  } catch {}
}

function shorten(ss58: string): string {
  if (!ss58 || ss58.length < 12) return ss58;
  return `${ss58.slice(0, 6)}…${ss58.slice(-4)}`;
}

function isFullSs58(s: string): boolean {
  const trimmed = s.trim();
  // Polkadot/Bittensor ss58 addresses are 47-48 chars and start with '5'.
  return (
    (trimmed.length === 47 || trimmed.length === 48) && /^5[1-9A-HJ-NP-Za-km-z]+$/.test(trimmed)
  );
}

type SearchMatch = {
  ss58: string;
  rank: number | null;
  balance_total_tao: number;
};

type Props = {
  taoPriceUsd: number;
  subnets: SubnetRow[];
};

export function WalletPage({ taoPriceUsd, subnets }: Props) {
  const [input, setInput] = useState("");
  const [address, setAddress] = useState<string | null>(null);
  const [data, setData] = useState<WalletPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pins, setPins] = useState<PinnedEntry[]>([]);
  const [showUsd, setShowUsd] = useState(false);
  const [netuidFilter, setNetuidFilter] = useState<"all" | number>("all");
  const [matches, setMatches] = useState<SearchMatch[]>([]);
  const [searching, setSearching] = useState(false);
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    setPins(readPins());
  }, []);

  // Debounced partial-address search against the server-side index.
  useEffect(() => {
    const q = input.trim();
    if (q.length < 2 || isFullSs58(q)) {
      setMatches([]);
      return;
    }
    let cancelled = false;
    const t = window.setTimeout(async () => {
      setSearching(true);
      try {
        const r = await fetch(
          `/api/wallet-search?q=${encodeURIComponent(q)}`,
          { cache: "no-store" },
        );
        const body = await r.json();
        if (!cancelled) setMatches(body?.matches ?? []);
      } catch {
        if (!cancelled) setMatches([]);
      } finally {
        if (!cancelled) setSearching(false);
      }
    }, 200);
    return () => {
      cancelled = true;
      window.clearTimeout(t);
    };
  }, [input]);

  useEffect(() => {
    if (!address) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch(`/api/wallet?address=${encodeURIComponent(address)}`, {
      cache: "no-store",
    })
      .then(async (r) => {
        const body = await r.json();
        if (!r.ok) throw new Error(body?.error ?? `HTTP ${r.status}`);
        return body as WalletPayload;
      })
      .then((j) => {
        if (!cancelled) setData(j);
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
  }, [address]);

  const subnetByNet = useMemo(() => {
    const m = new Map<number, SubnetRow>();
    for (const s of subnets) m.set(s.netuid, s);
    return m;
  }, [subnets]);

  const filteredPositions: WalletPosition[] = useMemo(() => {
    if (!data) return [];
    if (netuidFilter === "all") return data.positions;
    return data.positions.filter((p) => p.netuid === netuidFilter);
  }, [data, netuidFilter]);

  const filteredTotal = useMemo(() => {
    return filteredPositions.reduce((a, p) => a + p.balance_tao, 0);
  }, [filteredPositions]);

  const filteredDailyTao = useMemo(() => {
    return filteredPositions.reduce(
      (a, p) => a + (p.daily_tao_earning ?? 0),
      0,
    );
  }, [filteredPositions]);

  const subnetOptions = useMemo(() => {
    if (!data) return [];
    const nets = [...new Set(data.positions.map((p) => p.netuid))].sort(
      (a, b) => a - b,
    );
    return nets.map((n) => ({
      netuid: n,
      name: subnetByNet.get(n)?.name ?? `SN ${n}`,
    }));
  }, [data, subnetByNet]);

  const submit = useCallback(
    (v: string) => {
      const trimmed = v.trim();
      if (!trimmed) return;
      if (!isFullSs58(trimmed)) {
        // Not a full ss58 yet — if there's exactly one search match, use it;
        // otherwise bail and let the user pick from the suggestion list.
        if (matches.length === 1) {
          setAddress(matches[0].ss58);
          setInput(matches[0].ss58);
          setNetuidFilter("all");
        }
        return;
      }
      setAddress(trimmed);
      setNetuidFilter("all");
    },
    [matches],
  );

  const pickMatch = useCallback((ss58: string) => {
    setInput(ss58);
    setAddress(ss58);
    setNetuidFilter("all");
    setMatches([]);
    setFocused(false);
  }, []);

  const togglePin = useCallback(
    (addr: string, label?: string) => {
      const exists = pins.some((p) => p.address === addr);
      const next = exists
        ? pins.filter((p) => p.address !== addr)
        : [...pins, { address: addr, label }];
      setPins(next);
      writePins(next);
    },
    [pins],
  );

  const isPinned = address
    ? pins.some((p) => p.address === address)
    : false;

  const fmt = (tao: number) =>
    showUsd ? fmtUsd(tao * taoPriceUsd, tao < 1 ? 4 : 2) : fmtTao(tao, 4);

  return (
    <div
      className="px-4 pb-6"
      style={{
        height:
          "calc(100vh - var(--sticky-top-1, 172px) - var(--sticky-tab, 40px))",
        minHeight: 0,
      }}
    >
      <div
        className="m-card h-full overflow-y-scroll p-5"
        style={{ minHeight: 0 }}
      >
        {/* Search + pins */}
        <div className="flex flex-wrap items-start gap-3">
          <div className="flex-1 min-w-[320px]">
            <label
              className="m-label mb-1.5 block"
              style={{ color: "var(--text-dim)" }}
            >
              Coldkey or Hotkey (ss58)
            </label>
            <div className="relative flex gap-2">
              <div className="group relative flex-1">
                <Search
                  size={14}
                  className="absolute left-2.5 top-1/2 -translate-y-1/2"
                  style={{ color: "var(--text-faint)" }}
                />
                <input
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onFocus={() => setFocused(true)}
                  onBlur={() =>
                    window.setTimeout(() => setFocused(false), 120)
                  }
                  onKeyDown={(e) => {
                    if (e.key === "Enter") submit(input);
                    if (e.key === "Escape") setFocused(false);
                  }}
                  placeholder="5GrwvaEF… or paste a partial prefix"
                  className="w-full rounded-md border py-2 pl-7 pr-8 text-[12.5px] font-mono outline-none focus:border-[color:var(--brand)]"
                  style={{
                    background: "var(--surface)",
                    borderColor: "var(--border)",
                    color: "var(--text)",
                  }}
                  spellCheck={false}
                  autoCorrect="off"
                  autoComplete="off"
                />
                {input && (
                  <button
                    type="button"
                    aria-label="Clear address"
                    title="Clear"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => {
                      setInput("");
                      setMatches([]);
                    }}
                    className="absolute right-1.5 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-full opacity-0 transition-all group-hover:opacity-100 focus:opacity-100 focus-within:opacity-100"
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
                    <svg
                      width="12"
                      height="12"
                      viewBox="0 0 24 24"
                      fill="none"
                    >
                      <path
                        d="M6 6l12 12M18 6L6 18"
                        stroke="currentColor"
                        strokeWidth="2.5"
                        strokeLinecap="round"
                      />
                    </svg>
                  </button>
                )}
                {focused && input.trim().length >= 2 && !isFullSs58(input) && (
                  <SuggestionList
                    query={input.trim()}
                    matches={matches}
                    searching={searching}
                    taoPriceUsd={taoPriceUsd}
                    onPick={pickMatch}
                  />
                )}
              </div>
              <button
                onClick={() => submit(input)}
                className="rounded-md px-3 py-2 text-[12px] font-semibold"
                style={{ background: "var(--brand)", color: "#fff" }}
              >
                Lookup
              </button>
            </div>
          </div>
        </div>

        {/* Pinned */}
        {pins.length > 0 && (
          <div className="mt-3 flex flex-wrap items-center gap-1.5">
            <span
              className="m-label"
              style={{ color: "var(--text-dim)" }}
            >
              Pinned
            </span>
            {pins.map((p) => (
              <PinnedChip
                key={p.address}
                entry={p}
                active={address === p.address}
                onClick={() => {
                  setInput(p.address);
                  submit(p.address);
                }}
                onRemove={() => togglePin(p.address, p.label)}
              />
            ))}
          </div>
        )}

        {/* State */}
        {!address && (
          <div
            className="mt-6 flex min-h-[240px] flex-col items-center justify-center gap-2 rounded-md border border-dashed"
            style={{ borderColor: "var(--border)", color: "var(--text-dim)" }}
          >
            <Search size={20} strokeWidth={1.5} />
            <span className="text-[12.5px]">
              Enter a coldkey or hotkey ss58 address to see its stake positions.
            </span>
          </div>
        )}

        {address && loading && !data && (
          <div
            className="mt-6 text-center text-[12.5px]"
            style={{ color: "var(--text-dim)" }}
          >
            Loading {shorten(address)}…
          </div>
        )}

        {address && error && (
          <div
            className="mt-4 rounded-md border px-3 py-2 text-[12px]"
            style={{
              borderColor: "var(--danger)",
              background: "var(--danger-soft)",
              color: "var(--danger)",
            }}
          >
            {error}
          </div>
        )}

        {/* Result */}
        {data && (
          <>
            <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div
                  className="rounded-md px-2 py-1 text-[11px] font-mono"
                  style={{
                    background: "var(--surface-2)",
                    color: "var(--text)",
                  }}
                >
                  {shorten(data.address)}
                </div>
                {data.rank !== null && (
                  <span
                    className="m-badge"
                    style={{
                      background: "var(--primary-soft, var(--surface-2))",
                      color: "var(--text-dim)",
                    }}
                  >
                    #{data.rank.toLocaleString()}
                  </span>
                )}
                <button
                  onClick={() => togglePin(data.address)}
                  className="flex h-7 items-center gap-1 rounded-md border px-2 text-[11px] font-semibold"
                  style={{
                    background: isPinned ? "var(--brand)" : "var(--surface)",
                    borderColor: isPinned ? "var(--brand)" : "var(--border)",
                    color: isPinned ? "#fff" : "var(--text)",
                  }}
                  title={isPinned ? "Unpin" : "Pin"}
                >
                  {isPinned ? (
                    <PinOff size={12} strokeWidth={2} />
                  ) : (
                    <Pin size={12} strokeWidth={2} />
                  )}
                  {isPinned ? "Pinned" : "Pin"}
                </button>
              </div>
              <div className="flex items-center gap-2">
                <UnitPicker
                  value={showUsd ? "usd" : "tao"}
                  onChange={(v) => setShowUsd(v === "usd")}
                />
              </div>
            </div>

            {/* Summary tiles */}
            <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-5">
              <SummaryTile
                label="Total balance"
                primary={fmt(data.balance_total_tao)}
                secondary={
                  !showUsd
                    ? fmtUsd(data.balance_total_tao * taoPriceUsd)
                    : fmtTao(data.balance_total_tao, 4)
                }
              />
              <SummaryTile
                label="Earned 24h"
                primary={fmt(data.delta_total_tao_24h)}
                changePct={
                  data.balance_total_tao_24h_ago > 0
                    ? (data.delta_total_tao_24h /
                        data.balance_total_tao_24h_ago) *
                      100
                    : Number.NaN
                }
                tint={
                  data.delta_total_tao_24h > 0
                    ? "pos"
                    : data.delta_total_tao_24h < 0
                      ? "neg"
                      : undefined
                }
              />
              <SummaryTile
                label="Avg daily (7d)"
                primary={(() => {
                  const avg = computeAvgDaily(data.history, 7);
                  return avg === null ? "—" : fmt(avg);
                })()}
                secondary={(() => {
                  const avg = computeAvgDaily(data.history, 7);
                  if (avg === null) return "not enough history";
                  const pct =
                    data.balance_total_tao > 0
                      ? (avg / data.balance_total_tao) * 100
                      : 0;
                  return `${pct >= 0 ? "+" : ""}${pct.toFixed(3)}% / day`;
                })()}
                tint={(() => {
                  const avg = computeAvgDaily(data.history, 7);
                  if (avg === null) return undefined;
                  return avg > 0 ? "pos" : avg < 0 ? "neg" : undefined;
                })()}
              />
              <SummaryTile
                label="Liquid (free)"
                primary={fmt(data.balance_free_tao)}
              />
              <SummaryTile
                label="Staked"
                primary={fmt(
                  data.balance_staked_root_tao +
                    data.balance_staked_alpha_as_tao,
                )}
                secondary={`root ${fmtTao(data.balance_staked_root_tao, 2)} · α ${fmtTao(data.balance_staked_alpha_as_tao, 2)}`}
              />
            </div>

            {/* History chart */}
            {data.history.length >= 2 && (
              <div className="m-card mt-4 px-3 py-3">
                <div className="mb-1 flex items-center justify-between">
                  <div className="m-label">Balance history</div>
                  <div
                    className="text-[10.5px]"
                    style={{ color: "var(--text-dim)" }}
                  >
                    {data.history.length} days
                  </div>
                </div>
                <div className="h-[180px] w-full">
                  <HistoryChart points={data.history} showUsd={showUsd} taoPriceUsd={taoPriceUsd} />
                </div>
              </div>
            )}

            {/* Subnet filter */}
            {subnetOptions.length > 0 && (
              <div className="mt-4 flex flex-wrap items-center gap-1.5">
                <span
                  className="m-label"
                  style={{ color: "var(--text-dim)" }}
                >
                  Subnet
                </span>
                <FilterChip
                  label="All"
                  active={netuidFilter === "all"}
                  onClick={() => setNetuidFilter("all")}
                />
                {subnetOptions.map((o) => (
                  <FilterChip
                    key={o.netuid}
                    label={`${o.name} · SN${o.netuid}`}
                    active={netuidFilter === o.netuid}
                    onClick={() => setNetuidFilter(o.netuid)}
                  />
                ))}
              </div>
            )}

            {/* Positions table */}
            <div className="mt-4 overflow-hidden rounded-md border" style={{ borderColor: "var(--border)" }}>
              <table className="w-full text-[12px]" style={{ borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ background: "var(--surface-2)" }}>
                    <Th>Subnet</Th>
                    <Th>Hotkey</Th>
                    <Th right>Stake</Th>
                    <Th right>Value ({showUsd ? "USD" : "τ"})</Th>
                    <Th
                      right
                      title="24h balance change in τ value (emission + α price move). Hover a cell for the breakdown."
                    >
                      Δ 24h
                    </Th>
                    <Th
                      right
                      title="Your share of the hotkey's daily TAO emission, at current rates. Pure earnings, no price noise."
                    >
                      Daily ({showUsd ? "USD" : "τ"})
                    </Th>
                  </tr>
                </thead>
                <tbody>
                  {filteredPositions.length === 0 && (
                    <tr>
                      <td
                        colSpan={5}
                        className="px-3 py-6 text-center text-[12px]"
                        style={{ color: "var(--text-dim)" }}
                      >
                        No stake positions.
                      </td>
                    </tr>
                  )}
                  {netuidFilter === "all" && data.balance_free_tao > 0 && (
                    <tr style={{ background: "var(--surface-2)" }}>
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-2.5">
                          <span
                            aria-hidden
                            className="inline-flex h-7 w-7 items-center justify-center rounded-md font-semibold"
                            style={{
                              background: "var(--success-soft)",
                              color: "var(--success)",
                              fontSize: 14,
                            }}
                          >
                            τ
                          </span>
                          <div className="flex flex-col">
                            <span
                              className="text-[12.5px] font-semibold"
                              style={{ color: "var(--text)" }}
                            >
                              Free TAO
                            </span>
                            <span
                              className="text-[10.5px]"
                              style={{ color: "var(--text-dim)" }}
                            >
                              Liquid · unstaked
                            </span>
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-2">
                        <span
                          className="text-[11px]"
                          style={{ color: "var(--text-faint)" }}
                        >
                          —
                        </span>
                      </td>
                      <td className="tnum px-3 py-2 text-right font-semibold">
                        {fmtTao(data.balance_free_tao, 4)}
                      </td>
                      <td className="tnum px-3 py-2 text-right font-semibold">
                        {fmt(data.balance_free_tao)}
                      </td>
                      <td className="tnum px-3 py-2 text-right">
                        <DeltaCell
                          delta_tao={
                            data.balance_free_tao -
                            data.balance_free_tao_24h_ago
                          }
                          prev_tao={data.balance_free_tao_24h_ago}
                          taoPriceUsd={taoPriceUsd}
                          showUsd={showUsd}
                        />
                      </td>
                      <td className="tnum px-3 py-2 text-right">
                        <span style={{ color: "var(--text-faint)" }}>—</span>
                      </td>
                    </tr>
                  )}
                  {filteredPositions.map((pos, i) => {
                    const s = subnetByNet.get(pos.netuid);
                    return (
                      <tr
                        key={i}
                        className="m-row"
                        style={{
                          borderTop: "1px solid var(--divider)",
                        }}
                      >
                        <td className="px-3 py-2">
                          <div className="flex items-center gap-2">
                            <SubnetIcon
                              netuid={pos.netuid}
                              name={s?.name ?? `SN ${pos.netuid}`}
                              symbol={s?.symbol ?? ""}
                              size={22}
                            />
                            <div className="flex flex-col">
                              <span
                                className="text-[12px] font-semibold"
                                style={{ color: "var(--text)" }}
                              >
                                {s?.name ?? `Subnet ${pos.netuid}`}
                              </span>
                              <span
                                className="text-[10px]"
                                style={{ color: "var(--text-dim)" }}
                              >
                                SN {pos.netuid}
                              </span>
                            </div>
                          </div>
                        </td>
                        <td className="px-3 py-2">
                          <a
                            href={`https://taostats.io/hotkey/${pos.hotkey}`}
                            target="_blank"
                            rel="noreferrer"
                            className="mono text-[11px] underline decoration-dotted underline-offset-2 transition-colors"
                            style={{ color: "var(--text)" }}
                            title={`Open hotkey ${pos.hotkey} on TaoStats`}
                            onMouseEnter={(e) => {
                              (e.currentTarget as HTMLElement).style.color =
                                "var(--brand)";
                            }}
                            onMouseLeave={(e) => {
                              (e.currentTarget as HTMLElement).style.color =
                                "var(--text)";
                            }}
                          >
                            {shorten(pos.hotkey)}
                          </a>
                        </td>
                        <td
                          className="tnum px-3 py-2 text-right"
                          style={{ color: "var(--text)" }}
                        >
                          {fmtTao(pos.balance_tao, 4)}
                        </td>
                        <td
                          className="tnum px-3 py-2 text-right font-semibold"
                          style={{ color: "var(--text)" }}
                        >
                          {fmt(pos.balance_tao)}
                        </td>
                        <td className="tnum px-3 py-2 text-right">
                          <DeltaCell
                            delta_tao={pos.delta_tao_24h}
                            prev_tao={pos.balance_tao_24h_ago}
                            taoPriceUsd={taoPriceUsd}
                            showUsd={showUsd}
                            emission_tao={pos.emission_tao_24h}
                            price_move_tao={pos.price_move_tao_24h}
                          />
                        </td>
                        <td className="tnum px-3 py-2 text-right">
                          <DailyEarnCell
                            daily_tao_earning={pos.daily_tao_earning}
                            taoPriceUsd={taoPriceUsd}
                            showUsd={showUsd}
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr
                    style={{
                      background: "var(--surface-2)",
                      borderTop: "1px solid var(--border)",
                    }}
                  >
                    <td
                      colSpan={3}
                      className="px-3 py-2 text-[11px] font-semibold uppercase"
                      style={{
                        color: "var(--text-dim)",
                        letterSpacing: "0.06em",
                      }}
                    >
                      Total {netuidFilter === "all" ? "" : `(SN ${netuidFilter})`}
                    </td>
                    <td
                      className="tnum px-3 py-2 text-right font-bold"
                      style={{ color: "var(--text)" }}
                    >
                      {fmt(filteredTotal)}
                    </td>
                    <td className="px-3 py-2" />
                    <td
                      className="tnum px-3 py-2 text-right font-bold"
                      style={{
                        color:
                          filteredDailyTao > 0
                            ? "var(--success)"
                            : filteredDailyTao < 0
                              ? "var(--danger)"
                              : "var(--text)",
                      }}
                    >
                      {Math.abs(filteredDailyTao) < 0.0001
                        ? "—"
                        : showUsd
                          ? fmtUsd(filteredDailyTao * taoPriceUsd, 2)
                          : fmtTao(filteredDailyTao, filteredDailyTao >= 1 ? 2 : 4)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function Th({
  children,
  right,
  title,
}: {
  children: React.ReactNode;
  right?: boolean;
  title?: string;
}) {
  return (
    <th
      title={title}
      className="px-3 py-2 text-[10.5px] font-semibold uppercase"
      style={{
        color: "var(--text-dim)",
        textAlign: right ? "right" : "left",
        letterSpacing: "0.06em",
        cursor: title ? "help" : undefined,
      }}
    >
      {children}
      {title && (
        <span style={{ opacity: 0.6, marginLeft: 4 }} aria-hidden>
          ⓘ
        </span>
      )}
    </th>
  );
}

function SummaryTile({
  label,
  primary,
  secondary,
  changePct,
  tint,
}: {
  label: string;
  primary: string;
  secondary?: string;
  changePct?: number;
  tint?: "pos" | "neg";
}) {
  const primaryColor =
    tint === "pos"
      ? "var(--success)"
      : tint === "neg"
        ? "var(--danger)"
        : "var(--text)";
  return (
    <div className="m-card px-3 py-2.5">
      <div className="m-label">{label}</div>
      <div
        className="tnum mt-0.5 text-[17px] font-bold"
        style={{ color: primaryColor }}
      >
        {primary}
      </div>
      {changePct !== undefined && Number.isFinite(changePct) && (
        <div
          className="tnum mt-0.5 text-[11px] font-semibold"
          style={{
            color:
              changePct >= 0 ? "var(--success)" : "var(--danger)",
          }}
        >
          {fmtPct(changePct)}
        </div>
      )}
      {secondary && (
        <div
          className="mt-0.5 text-[10.5px]"
          style={{ color: "var(--text-dim)" }}
        >
          {secondary}
        </div>
      )}
    </div>
  );
}

/**
 * Average daily balance change over the last N days. Uses the earliest
 * history point within the window and the latest. Returns null if we don't
 * have enough data.
 */
function computeAvgDaily(
  history: WalletHistoryPoint[],
  days: number,
): number | null {
  if (!history || history.length < 2) return null;
  const last = history[history.length - 1];
  const cutoff = last.t - days * 86_400_000;
  // Find the oldest point that's still inside the window (or closest to cutoff).
  let base = history[0];
  for (const p of history) {
    if (p.t >= cutoff) {
      base = p;
      break;
    }
  }
  const spanDays = (last.t - base.t) / 86_400_000;
  if (spanDays < 1) return null;
  return (last.total - base.total) / spanDays;
}

function FilterChip({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="rounded-md border px-2 py-0.5 text-[11px] font-semibold"
      style={{
        background: active ? "var(--brand)" : "var(--surface)",
        borderColor: active ? "var(--brand)" : "var(--border)",
        color: active ? "#fff" : "var(--text)",
      }}
    >
      {label}
    </button>
  );
}

function PinnedChip({
  entry,
  active,
  onClick,
  onRemove,
}: {
  entry: PinnedEntry;
  active: boolean;
  onClick: () => void;
  onRemove: () => void;
}) {
  return (
    <span
      className="inline-flex items-center gap-1 overflow-hidden rounded-md border text-[11px]"
      style={{
        borderColor: active ? "var(--brand)" : "var(--border)",
        background: active ? "var(--brand-soft)" : "var(--surface)",
      }}
    >
      <button
        onClick={onClick}
        className="mono px-2 py-0.5"
        style={{ color: active ? "var(--brand)" : "var(--text)" }}
      >
        {entry.label ?? shorten(entry.address)}
      </button>
      <button
        onClick={(e) => {
          e.stopPropagation();
          onRemove();
        }}
        className="border-l px-1 py-0.5"
        style={{
          borderColor: active ? "var(--brand)" : "var(--border)",
          color: "var(--text-dim)",
        }}
        aria-label="Remove pin"
      >
        <X size={11} strokeWidth={2.4} />
      </button>
    </span>
  );
}

function HistoryChart({
  points,
  showUsd,
  taoPriceUsd,
}: {
  points: WalletHistoryPoint[];
  showUsd: boolean;
  taoPriceUsd: number;
}) {
  const data = points.map((p) => ({
    t: p.t,
    total: showUsd ? p.total * taoPriceUsd : p.total,
    staked: showUsd ? p.staked * taoPriceUsd : p.staked,
  }));
  const up = data[data.length - 1].total >= data[0].total;
  const color = up ? "#16a34a" : "#ed2939";
  const fmtVal = (v: number) =>
    showUsd
      ? fmtUsd(v, v >= 100 ? 0 : 2)
      : fmtTao(v, v >= 100 ? 0 : v >= 1 ? 2 : 4);
  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={data} margin={{ top: 6, right: 8, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="wallet-grad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.28} />
            <stop offset="100%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
        <XAxis
          dataKey="t"
          type="number"
          domain={["dataMin", "dataMax"]}
          tickFormatter={(v: number) => {
            const d = new Date(v);
            return `${d.getMonth() + 1}/${d.getDate()}`;
          }}
          axisLine={false}
          tickLine={false}
          tick={{ fill: "var(--text-dim)", fontSize: 10 }}
          minTickGap={40}
        />
        <YAxis
          dataKey="total"
          domain={["auto", "auto"]}
          axisLine={false}
          tickLine={false}
          tick={{ fill: "var(--text-dim)", fontSize: 10 }}
          tickFormatter={(v: number) => fmtVal(v)}
          width={showUsd ? 72 : 80}
        />
        <Tooltip
          contentStyle={{
            background: "var(--surface)",
            border: "1px solid var(--border)",
            borderRadius: 6,
            fontSize: 11,
          }}
          labelStyle={{ color: "var(--text-dim)" }}
          labelFormatter={((v: unknown) => {
            const d = new Date(Number(v));
            return d.toLocaleString(undefined, {
              month: "short",
              day: "numeric",
              year: "numeric",
            });
          }) as never}
          formatter={((v: unknown, name: unknown) => [
            fmtVal(Number(v)),
            name === "total" ? "Total" : "Staked",
          ]) as never}
        />
        <Area
          type="monotone"
          dataKey="staked"
          stroke="var(--text-faint)"
          strokeWidth={1}
          strokeDasharray="3 3"
          fill="none"
          isAnimationActive={false}
        />
        <Area
          type="monotone"
          dataKey="total"
          stroke={color}
          strokeWidth={1.75}
          fill="url(#wallet-grad)"
          isAnimationActive={false}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

function UnitPicker({
  value,
  onChange,
}: {
  value: "tao" | "usd";
  onChange: (v: "tao" | "usd") => void;
}) {
  return (
    <div
      className="inline-flex items-center gap-1 rounded-md border p-[3px]"
      style={{
        borderColor: "var(--border)",
        background: "var(--surface-2)",
      }}
    >
      {(
        [
          { value: "tao" as const, label: "τ" },
          { value: "usd" as const, label: "$" },
        ]
      ).map((o) => {
        const active = value === o.value;
        return (
          <button
            key={o.value}
            onClick={() => onChange(o.value)}
            className="rounded px-3 py-1 text-[11px] font-semibold"
            style={{
              background: active ? "var(--brand)" : "transparent",
              color: active ? "#fff" : "var(--text-dim)",
              boxShadow: active
                ? "0 1px 2px 0 rgba(237,41,57,0.25)"
                : "none",
              transition: "all 120ms",
            }}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

function SuggestionList({
  query,
  matches,
  searching,
  taoPriceUsd,
  onPick,
}: {
  query: string;
  matches: SearchMatch[];
  searching: boolean;
  taoPriceUsd: number;
  onPick: (ss58: string) => void;
}) {
  const q = query.toLowerCase();
  return (
    <div
      className="absolute left-0 right-0 top-full z-20 mt-1 overflow-hidden rounded-md border shadow-lg"
      style={{
        background: "var(--surface)",
        borderColor: "var(--border)",
        maxHeight: 320,
        overflowY: "auto",
      }}
    >
      {searching && matches.length === 0 && (
        <div
          className="px-3 py-2.5 text-[11.5px]"
          style={{ color: "var(--text-dim)" }}
        >
          Searching top accounts…
        </div>
      )}
      {!searching && matches.length === 0 && (
        <div
          className="px-3 py-2.5 text-[11.5px]"
          style={{ color: "var(--text-dim)" }}
        >
          No wallets in the top 4 000 match “{query}”. Paste the full ss58 to force a lookup of a smaller wallet.
        </div>
      )}
      {matches.map((m) => {
        const idx = m.ss58.toLowerCase().indexOf(q);
        const before = m.ss58.slice(0, idx);
        const hit = m.ss58.slice(idx, idx + q.length);
        const after = m.ss58.slice(idx + q.length);
        return (
          <button
            key={m.ss58}
            onMouseDown={(e) => {
              e.preventDefault();
              onPick(m.ss58);
            }}
            className="flex w-full items-center justify-between gap-3 border-b px-3 py-2 text-left transition-colors hover:bg-[var(--surface-hover)]"
            style={{ borderColor: "var(--divider)" }}
          >
            <span
              className="mono text-[11.5px]"
              style={{ color: "var(--text)" }}
            >
              {before}
              <span
                style={{
                  background: "var(--brand-soft)",
                  color: "var(--brand)",
                  padding: "0 2px",
                  borderRadius: 2,
                  fontWeight: 600,
                }}
              >
                {hit}
              </span>
              {after}
            </span>
            <span className="flex items-center gap-2">
              {m.rank !== null && (
                <span
                  className="m-badge"
                  style={{
                    background: "var(--surface-2)",
                    color: "var(--text-dim)",
                  }}
                >
                  #{m.rank}
                </span>
              )}
              <span
                className="tnum text-[11px] font-semibold"
                style={{ color: "var(--text)" }}
              >
                {fmtTao(m.balance_total_tao, 0)}
              </span>
              <span
                className="tnum text-[10px]"
                style={{ color: "var(--text-dim)" }}
              >
                {fmtUsd(m.balance_total_tao * taoPriceUsd)}
              </span>
            </span>
          </button>
        );
      })}
    </div>
  );
}

function DailyEarnCell({
  daily_tao_earning,
  taoPriceUsd,
  showUsd,
}: {
  daily_tao_earning: number | null;
  taoPriceUsd: number;
  showUsd: boolean;
}) {
  if (daily_tao_earning === null || !Number.isFinite(daily_tao_earning)) {
    return <span style={{ color: "var(--text-faint)" }}>—</span>;
  }
  const usd = daily_tao_earning * taoPriceUsd;
  if (Math.abs(usd) < 0.01 && Math.abs(daily_tao_earning) < 0.0001) {
    return <span style={{ color: "var(--text-faint)" }}>—</span>;
  }
  const text = showUsd
    ? fmtUsd(usd, 2)
    : fmtTao(daily_tao_earning, daily_tao_earning >= 1 ? 2 : 4);
  return (
    <span
      className="tnum font-semibold"
      style={{ color: "var(--success)" }}
      title={`${daily_tao_earning.toFixed(6)} τ/day · $${usd.toFixed(2)} at $${taoPriceUsd.toFixed(2)}/τ`}
    >
      {text}
    </span>
  );
}

function DeltaCell({
  delta_tao,
  prev_tao,
  taoPriceUsd,
  showUsd,
  emission_tao,
  price_move_tao,
}: {
  delta_tao: number;
  prev_tao: number;
  taoPriceUsd: number;
  showUsd: boolean;
  emission_tao?: number;
  price_move_tao?: number;
}) {
  if (!Number.isFinite(delta_tao) || Math.abs(delta_tao) < 1e-6) {
    return <span style={{ color: "var(--text-faint)" }}>—</span>;
  }
  const pos = delta_tao > 0;
  const pct = prev_tao > 0 ? (delta_tao / prev_tao) * 100 : Number.NaN;
  const val = showUsd
    ? fmtUsd(delta_tao * taoPriceUsd, 2)
    : fmtTao(delta_tao, 4);
  const parts: string[] = [];
  if (Number.isFinite(pct)) parts.push(`${fmtPct(pct)} vs 24h ago`);
  if (emission_tao !== undefined && Number.isFinite(emission_tao)) {
    parts.push(
      `emission: ${emission_tao >= 0 ? "+" : ""}${fmtTao(emission_tao, 4)}`,
    );
  }
  if (price_move_tao !== undefined && Number.isFinite(price_move_tao)) {
    parts.push(
      `α price: ${price_move_tao >= 0 ? "+" : ""}${fmtTao(price_move_tao, 4)}`,
    );
  }
  return (
    <span
      className={cn("tnum font-semibold")}
      style={{ color: pos ? "var(--success)" : "var(--danger)" }}
      title={parts.join(" · ")}
    >
      {pos ? "▲" : "▼"} {val.replace("-", "")}
    </span>
  );
}
