"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { DashboardPayload, SubnetRow } from "@/lib/types";
import type { PublicUser } from "@/lib/auth/store";
import { PriceHeader } from "./price-header";
import { PriceChartModal, type ChartTarget } from "./price-chart-modal";
import { RegsModal } from "./regs-modal";
import { SubnetTable } from "./subnet-table";
import { LoadingScreen } from "./loading-screen";
import { WalletPage } from "./wallet-page";
import { UsersPage } from "./users-page";
import { ProfileModal } from "./profile-modal";
import { BrandSpinner } from "./brand-spinner";
import { useStickyHeight } from "@/lib/use-sticky-height";

// 1 s polling for snappy UX. Server-side pool TTL is 1 s so most of
// these polls hit the cache; only one fetch per second goes upstream
// regardless of how many clients are open. Rate-limit safety lives in
// lib/taostats (per-key + global circuit breaker).
const POLL_MS = 1000;
const TEN_MIN_MS = 10 * 60 * 1000;

function TabSwitchSpinner() {
  return (
    <BrandSpinner
      size={112}
      minHeight="calc(100vh - var(--sticky-top-1, 172px) - var(--sticky-tab, 40px) - 40px)"
    />
  );
}

function TabNav({
  tab,
  onChange,
  isAdmin,
}: {
  tab: Tab;
  onChange: (t: Tab) => void;
  isAdmin: boolean;
}) {
  const ref = useStickyHeight<HTMLDivElement>("--sticky-tab");
  const tabs = [
    { id: "subnets" as const, label: "Subnet Overview" },
    { id: "wallet" as const, label: "Wallet" },
    ...(isAdmin ? [{ id: "users" as const, label: "Users" }] : []),
  ];
  return (
    <div
      ref={ref}
      className="sticky z-20 flex items-center gap-1 px-4"
      style={{
        top: "var(--sticky-top-1, 172px)",
        background: "var(--page)",
      }}
    >
      {tabs.map((t) => {
        const active = tab === t.id;
        return (
          <button
            key={t.id}
            onClick={() => onChange(t.id)}
            className="my-1.5 rounded-md px-3 py-1.5 text-[12.5px] font-semibold transition-colors"
            style={{
              color: active ? "var(--brand)" : "var(--text-dim)",
              background: active ? "var(--brand-soft)" : "transparent",
            }}
            onMouseEnter={(e) => {
              if (!active) {
                (e.currentTarget as HTMLElement).style.color = "var(--text)";
                (e.currentTarget as HTMLElement).style.background =
                  "var(--surface-hover)";
              }
            }}
            onMouseLeave={(e) => {
              if (!active) {
                (e.currentTarget as HTMLElement).style.color =
                  "var(--text-dim)";
                (e.currentTarget as HTMLElement).style.background =
                  "transparent";
              }
            }}
          >
            {t.label}
          </button>
        );
      })}
    </div>
  );
}

type Snapshot = {
  t: number;
  priceByNet: Map<number, number>;
  burnByNet: Map<number, number>;
};

type IdentityState = {
  netuids: Set<number>;
  hasGithub: Set<number>;
  hasWebsite: Set<number>;
};

const BIG_PRICE_CHANGE_PCT = 3; // 10-minute threshold

type Tab = "subnets" | "wallet" | "users";

export function Dashboard({ me: meProp }: { me: PublicUser | null }) {
  const [me, setMe] = useState<PublicUser | null>(meProp);
  const [data, setData] = useState<DashboardPayload | null>(null);
  const [status, setStatus] = useState<"idle" | "ok" | "error">("idle");
  const [showUsd, setShowUsd] = useState(false);
  const [chartTarget, setChartTarget] = useState<ChartTarget | null>(null);
  const [regsTarget, setRegsTarget] = useState<{ netuid: number; name: string } | null>(null);
  const [tab, setTab] = useState<Tab>("subnets");
  const [tabSwitching, setTabSwitching] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const snapshotsRef = useRef<Snapshot[]>([]);

  const switchTab = (next: Tab) => {
    if (next === tab) return;
    setTabSwitching(true);
    setTab(next);
    window.setTimeout(() => setTabSwitching(false), 450);
  };
  const prevIdentityRef = useRef<IdentityState | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const r = await fetch("/api/dashboard", { cache: "no-store" });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const j = (await r.json()) as DashboardPayload;
        if (cancelled) return;

        const now = Date.now();
        const priceByNet = new Map<number, number>();
        const burnByNet = new Map<number, number>();
        for (const s of j.subnets) {
          priceByNet.set(s.netuid, s.price_tao);
          burnByNet.set(s.netuid, s.incentive_burn);
        }
        const snaps = snapshotsRef.current;
        snaps.push({ t: now, priceByNet, burnByNet });
        const cutoff = now - TEN_MIN_MS - 5000;
        while (snaps.length > 0 && snaps[0].t < cutoff) snaps.shift();

        setData(j);
        setStatus("ok");
      } catch {
        if (!cancelled) setStatus("error");
      }
    };
    load();
    const id = setInterval(load, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  const enriched: SubnetRow[] = useMemo(() => {
    if (!data) return [];
    const now = Date.now();
    const snaps = snapshotsRef.current;
    const target = now - TEN_MIN_MS;
    let past: Snapshot | null = null;
    for (const s of snaps) {
      if (s.t <= target) past = s;
      else break;
    }
    if (!past && snaps.length > 0) past = snaps[0];

    const prevId = prevIdentityRef.current;
    const rows = data.subnets.map((s) => {
      let change10m = Number.NaN;
      let burnChange10m = Number.NaN;
      if (past) {
        const prevPrice = past.priceByNet.get(s.netuid);
        if (prevPrice && prevPrice > 0) {
          change10m = ((s.price_tao - prevPrice) / prevPrice) * 100;
        }
        const prevBurn = past.burnByNet.get(s.netuid);
        if (typeof prevBurn === "number" && Number.isFinite(prevBurn)) {
          burnChange10m = (s.incentive_burn - prevBurn) * 100;
        }
      }

      let flag: SubnetRow["flag"] = null;
      if (prevId) {
        if (!prevId.netuids.has(s.netuid)) {
          flag = "new";
        } else {
          const hadGh = prevId.hasGithub.has(s.netuid);
          const hasGh = !!s.github_url;
          const hadWeb = prevId.hasWebsite.has(s.netuid);
          const hasWeb = !!s.website_url;
          const gainedLinks = (!hadGh && hasGh) || (!hadWeb && hasWeb);
          const lostLinks = (hadGh && !hasGh) || (hadWeb && !hasWeb);
          if (gainedLinks) flag = "gained-links";
          else if (lostLinks) flag = "lost-links";
        }
      }
      if (!flag && Number.isFinite(change10m)) {
        if (change10m >= BIG_PRICE_CHANGE_PCT) flag = "big-up";
        else if (change10m <= -BIG_PRICE_CHANGE_PCT) flag = "big-down";
      }

      return {
        ...s,
        change_10m: change10m,
        burn_change_10m: burnChange10m,
        flag,
      };
    });

    // Update identity snapshot for next poll
    const nextId: IdentityState = {
      netuids: new Set(),
      hasGithub: new Set(),
      hasWebsite: new Set(),
    };
    for (const s of data.subnets) {
      nextId.netuids.add(s.netuid);
      if (s.github_url) nextId.hasGithub.add(s.netuid);
      if (s.website_url) nextId.hasWebsite.add(s.netuid);
    }
    prevIdentityRef.current = nextId;

    return rows;
  }, [data]);

  if (!data) return <LoadingScreen />;

  return (
    <div className="min-h-screen">
      <PriceHeader
        taoPriceUsd={data.tao_price_usd}
        taoChange1h={data.tao_change_1h}
        taoChange24h={data.tao_change_24h}
        taoChange7d={data.tao_change_7d}
        btcPriceUsd={data.btc_price_usd}
        btcChange1h={data.btc_change_1h}
        btcChange24h={data.btc_change_24h}
        btcChange7d={data.btc_change_7d}
        blockNumber={data.block_number}
        lastUpdated={data.server_time}
        status={status}
        totalSubnets={data.subnets.length}
        onOpenChart={setChartTarget}
        me={me}
        onOpenProfile={() => setShowProfile(true)}
      />
      <TabNav tab={tab} onChange={switchTab} isAdmin={me?.role === "admin"} />
      {tabSwitching ? (
        <TabSwitchSpinner />
      ) : tab === "subnets" ? (
        <SubnetTable
          rows={enriched}
          taoPriceUsd={data.tao_price_usd}
          showUsd={showUsd}
          onToggleUsd={() => setShowUsd((v) => !v)}
          onOpenChart={setChartTarget}
          onOpenRegs={(netuid, name) => setRegsTarget({ netuid, name })}
        />
      ) : tab === "wallet" ? (
        <WalletPage taoPriceUsd={data.tao_price_usd} subnets={enriched} />
      ) : (
        <UsersPage me={me} />
      )}
      {chartTarget && (
        <PriceChartModal
          target={chartTarget}
          taoPriceUsd={data.tao_price_usd}
          onClose={() => setChartTarget(null)}
        />
      )}
      {regsTarget && (
        <RegsModal
          netuid={regsTarget.netuid}
          name={regsTarget.name}
          onClose={() => setRegsTarget(null)}
        />
      )}
      {showProfile && me && (
        <ProfileModal
          user={me}
          onClose={() => setShowProfile(false)}
          onSaved={(u) => setMe(u)}
        />
      )}
    </div>
  );
}
