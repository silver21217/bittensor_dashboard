import { NextResponse } from "next/server";
import { taoFetch } from "@/lib/taostats";
import { cached } from "@/lib/cache";
import { num, raoToTao } from "@/lib/format";
import { SERIES, seriesStore } from "@/lib/series-store";
import tmcIconsJson from "@/lib/tmc-icons.json";
import type {
  DashboardPayload,
  RawPool,
  RawSubnetMeta,
  SubnetRow,
  Tag,
} from "@/lib/types";

const TMC_ICONS = tmcIconsJson as Record<string, string>;

// TaoStats' identity endpoint sometimes returns logo URLs that 404 at the
// `taostats.io/images/subnets/…` path. Treat those as missing and fall
// back through the TaoMarketCap CDN map. Empty strings are also treated
// as missing.
function resolveLogoUrl(netuid: number, raw: string | null | undefined): string | null {
  const trimmed = raw?.trim() ?? "";
  const isBroken =
    trimmed === "" ||
    trimmed.startsWith("https://taostats.io/images/subnets/") ||
    trimmed.startsWith("http://taostats.io/images/subnets/");
  if (!isBroken) return trimmed;
  const fromTmc = TMC_ICONS[String(netuid)];
  return fromTmc ?? null;
}

export const dynamic = "force-dynamic";
export const revalidate = 0;

type Paginated<T> = { data: T[] };
type TaoPriceResp = {
  data: Array<{
    price: string;
    percent_change_1h: string;
    percent_change_24h: string;
    percent_change_7d: string;
  }>;
};

type IdentityRow = {
  netuid: number;
  subnet_name: string | null;
  github_repo: string | null;
  subnet_url: string | null;
  logo_url: string | null;
  tags?: string[] | null;
};
type IdentityResp = { data: IdentityRow[] };

async function fetchPools(): Promise<RawPool[]> {
  // 2 s TTL — pool data drives the live price columns; chain blocks
  // are 12 s so sub-second refresh is wasted (you'd render the same
  // value 12+ times). 2 s halves TaoStats load (~30 cpm vs 60 cpm)
  // while still feeling effectively live.
  return cached("pools", 2_000, async () => {
    const r = await taoFetch<Paginated<RawPool>>(
      "/api/dtao/pool/latest/v1?page=1&limit=200",
    );
    return r.data;
  });
}

async function fetchMeta(): Promise<RawSubnetMeta[]> {
  // 6 s TTL — countdown accuracy is preserved by projecting
  // `blocks_until_next_adjustment` forward using the live currentBlock
  // delta, so the actual "next reg / next epoch" timer stays accurate
  // to the second even when the underlying meta snapshot is 6 s old.
  // 6 s halves TaoStats load (10 cpm vs 20 cpm) for the same UX.
  return cached("meta", 6_000, async () => {
    const r = await taoFetch<Paginated<RawSubnetMeta>>(
      "/api/subnet/latest/v1?page=1&limit=200",
    );
    return r.data;
  });
}

// Plain object instead of Map so the cached value JSON-roundtrips
// cleanly through disk persistence — Maps lose their prototype during
// serialization.
type IdentityIndex = Record<string, IdentityRow>;

async function fetchIdentity(): Promise<IdentityIndex> {
  return cached("identity", 3_600_000, async () => {
    const r = await taoFetch<IdentityResp>(
      "/api/subnet/identity/v1?page=1&limit=200",
    );
    const m: IdentityIndex = {};
    for (const row of r.data) m[String(row.netuid)] = row;
    return m;
  });
}

function lookupIdentity(
  identities: IdentityIndex,
  netuid: number,
): IdentityRow | undefined {
  return identities[String(netuid)];
}

type SubnetHistoryForBurnResp = {
  data: Array<{ timestamp: string; incentive_burn: string | null }>;
};

async function fetchBurnChange24h(
  netuids: number[],
): Promise<Map<number, number>> {
  // Burn rate of change is a slow-moving metric (24h delta). 30 min TTL
  // is plenty fresh and drops sustained load from 13 cpm → 4 cpm across
  // 129 subnets. Still cached longer than any practical chart refresh.
  return cached("burn_change_24h", 30 * 60_000, async () => {
    const m = new Map<number, number>();
    const BATCH = 6;
    const BATCH_DELAY_MS = 250;
    for (let i = 0; i < netuids.length; i += BATCH) {
      const batch = netuids.slice(i, i + BATCH);
      const results = await Promise.allSettled(
        batch.map(async (netuid) => {
          const r = await taoFetch<SubnetHistoryForBurnResp>(
            `/api/subnet/history/v1?netuid=${netuid}&page=1&limit=2`,
          );
          const latest = r.data[0];
          const prev = r.data[1];
          if (!latest || !prev) return [netuid, 0] as const;
          const a = Number(latest.incentive_burn);
          const b = Number(prev.incentive_burn);
          if (!Number.isFinite(a) || !Number.isFinite(b)) {
            return [netuid, 0] as const;
          }
          return [netuid, (a - b) * 100] as const;
        }),
      );
      for (const res of results) {
        if (res.status === "fulfilled") m.set(res.value[0], res.value[1]);
      }
      if (i + BATCH < netuids.length) {
        await new Promise((r) => setTimeout(r, BATCH_DELAY_MS));
      }
    }
    return m;
  });
}

async function fetchTaoChangeMetrics() {
  return cached("tao_change", 60_000, async () => {
    const r = await taoFetch<TaoPriceResp>("/api/price/latest/v1?asset=tao");
    return r.data[0];
  });
}

type BinanceTicker24h = {
  lastPrice: string;
  priceChangePercent: string;
};

async function fetchBinanceTicker(symbol: string) {
  const url = `https://api.binance.com/api/v3/ticker/24hr?symbol=${symbol}`;
  try {
    const r = await fetch(url, { cache: "no-store" });
    if (!r.ok) return null;
    return (await r.json()) as BinanceTicker24h;
  } catch {
    return null;
  }
}

async function fetchLiveTaoUsd() {
  return cached("tao_live", 500, () => fetchBinanceTicker("TAOUSDT"));
}

async function fetchLiveBtcUsd() {
  return cached("btc_live", 500, () => fetchBinanceTicker("BTCUSDT"));
}

type BtcChanges = {
  change_1h: number;
  change_24h: number;
  change_7d: number;
};

async function fetchWindowTickerPct(
  symbol: string,
  windowSize: "1h" | "1d" | "7d",
): Promise<number> {
  const url = `https://api.binance.com/api/v3/ticker?symbol=${symbol}&windowSize=${windowSize}`;
  try {
    const r = await fetch(url, { cache: "no-store" });
    if (!r.ok) return 0;
    const j = (await r.json()) as { priceChangePercent?: string };
    const v = Number(j?.priceChangePercent);
    return Number.isFinite(v) ? v : 0;
  } catch {
    return 0;
  }
}

async function fetchBtcChanges(): Promise<BtcChanges> {
  // Rolling-window ticker is rate-limit friendly (6 weight each) and
  // returns 1h/24h/7d % change with a single field per request. 60s
  // TTL — these windows don't change meaningfully second-to-second.
  return cached("btc_changes", 60_000, async () => {
    const [h, d, w] = await Promise.all([
      fetchWindowTickerPct("BTCUSDT", "1h"),
      fetchWindowTickerPct("BTCUSDT", "1d"),
      fetchWindowTickerPct("BTCUSDT", "7d"),
    ]);
    return { change_1h: h, change_24h: d, change_7d: w };
  });
}

// TaoStats labels a subnet "Immune" when most of its pool liquidity is
// still protocol-seeded (high root_prop), not user-provided. The At Risk
// ranking uses the pool's `rank` field — the 3 highest-ranked numbers
// (last in the leaderboard) are the deregistration candidates. Using
// rank instead of emission is required because ~half of subnets report
// emission=0 at any instant, which would make an emission-based sort
// essentially arbitrary within the zero bucket.
const IMMUNE_ROOT_PROP_THRESHOLD = 0.4;

function computeTags(rows: Omit<SubnetRow, "tag">[]): SubnetRow[] {
  const withTags: SubnetRow[] = rows.map((r) => ({ ...r, tag: null as Tag }));

  // Highest `rank` number = worst-performing = most at risk. The pool's
  // rank is 1-based (1 = safest). Fall back to +Infinity if missing so
  // unranked rows don't falsely top the list.
  const atRisk = withTags
    .filter((r) => r.netuid !== 0)
    .sort(
      (a, b) =>
        (Number.isFinite(b.rank) ? b.rank : -1) -
        (Number.isFinite(a.rank) ? a.rank : -1),
    )
    .slice(0, 3);

  atRisk.forEach((r, i) => {
    r.tag = (`At Risk ${i + 1}`) as Tag;
  });

  for (const r of withTags) {
    if (r.netuid === 0) continue;
    if (r.tag !== null) continue;
    if (r.root_prop >= IMMUNE_ROOT_PROP_THRESHOLD) r.tag = "Immune";
  }

  return withTags;
}

function buildRows(
  pools: RawPool[],
  metas: RawSubnetMeta[],
  identities: IdentityIndex,
  burnChanges: Map<number, number>,
  currentBlock: number,
): SubnetRow[] {
  const metaByNet = new Map<number, RawSubnetMeta>();
  for (const m of metas) metaByNet.set(m.netuid, m);

  let totalEmission = 0;
  for (const m of metas) totalEmission += num(m.emission);

  const preTag: Omit<SubnetRow, "tag">[] = pools.map((p) => {
    const m = metaByNet.get(p.netuid);
    const rawEmission = m ? num(m.emission) : 0;
    const emissionShare = totalEmission > 0 ? rawEmission / totalEmission : 0;
    const spark = (p.seven_day_prices ?? [])
      .map((pp) => num(pp.price))
      .filter((x) => x > 0);

    let blocksSince: number | null = null;
    let immunityLeft: number | null = null;
    if (m && m.registration_block_number !== null) {
      blocksSince = currentBlock - m.registration_block_number;
      immunityLeft = Math.max(0, m.immunity_period - blocksSince);
    }

    return {
      netuid: p.netuid,
      name: p.name,
      symbol: p.symbol,
      rank: p.rank,
      price_tao: num(p.price),
      market_cap_tao: raoToTao(p.market_cap),
      emission: emissionShare,
      incentive_burn: m ? num(m.incentive_burn) : 0,
      reg_cost_tao: m ? raoToTao(m.neuron_registration_cost) : 0,
      slots_active: m ? m.active_keys ?? 0 : 0,
      slots_total: m ? m.max_neurons ?? 0 : 0,
      // "Regs" column shows registrations USED vs the 3-interval budget.
      // Budget = target_regs_per_interval × 3. Used = neuron_registrations_this_interval.
      // Project block-level counters forward by however many chain
      // blocks have been minted since this meta snapshot was captured
      // server-side. Without this, a cached meta row (TTL ~3s) plus the
      // client's own countdown drift pin rows at "0s firing…" for the
      // full cache window. `elapsedBlocks` is computed from the current
      // block (pulled live off pools) minus the meta snapshot's block.
      regs_available: m
        ? (() => {
            const metaBlock = Number(m.block_number) || 0;
            const elapsed = Math.max(0, currentBlock - metaBlock);
            const untilAdj =
              Number(m.blocks_until_next_adjustment) - elapsed;
            // When the adjustment interval has fired, the per-interval
            // registration counter resets to 0 on-chain even though our
            // cached snapshot may still show it at the pre-reset value.
            return untilAdj > 0
              ? m.neuron_registrations_this_interval ?? 0
              : 0;
          })()
        : 0,
      regs_target: m ? (m.target_regs_per_interval ?? 0) * 3 : 0,
      next_reg_seconds: (() => {
        if (!m) return null;
        const metaBlock = Number(m.block_number) || 0;
        const elapsed = Math.max(0, currentBlock - metaBlock);
        const untilAdj = Number(m.blocks_until_next_adjustment) - elapsed;
        return untilAdj > 0 ? Math.round(untilAdj * 12) : null;
      })(),
      next_epoch_seconds: (() => {
        if (!m) return null;
        const tempo = Number(m.tempo);
        const since = Number(m.blocks_since_last_step);
        if (!Number.isFinite(tempo) || tempo <= 0) return null;
        if (!Number.isFinite(since)) return null;
        const metaBlock = Number(m.block_number) || 0;
        const elapsed = Math.max(0, currentBlock - metaBlock);
        const sinceAdj = since + elapsed;
        const rem = ((tempo - (sinceAdj % tempo)) % tempo) || tempo;
        return Math.max(0, rem) * 12;
      })(),
      registration_allowed: m ? (m.registration_allowed ?? false) : false,
      burn_change_10m: Number.NaN,
      burn_change_24h: burnChanges.get(p.netuid) ?? 0,
      change_10m: Number.NaN,
      change_1h: num(p.price_change_1_hour),
      change_1d: num(p.price_change_1_day),
      change_1w: num(p.price_change_1_week),
      change_1m: num(p.price_change_1_month),
      volume_24h_tao: raoToTao(p.tao_volume_24_hr),
      buys_24h: p.buys_24_hr,
      sells_24h: p.sells_24_hr,
      sparkline: spark,
      blocks_since_registration: blocksSince,
      immunity_period: m?.immunity_period ?? 0,
      immunity_blocks_left: immunityLeft,
      startup_mode: p.startup_mode ?? false,
      root_prop: num(p.root_prop),
      github_url: lookupIdentity(identities, p.netuid)?.github_repo ?? null,
      website_url: lookupIdentity(identities, p.netuid)?.subnet_url ?? null,
      logo_url: resolveLogoUrl(
        p.netuid,
        lookupIdentity(identities, p.netuid)?.logo_url,
      ),
      types: (lookupIdentity(identities, p.netuid)?.tags ?? []).filter(
        (t): t is string => typeof t === "string" && t.trim() !== "",
      ),
    };
  });

  return computeTags(preTag);
}

// Server-side warmup: kick off pools + meta + identity in the background
// the moment this module is imported (which happens at process start
// in dev/turbopack and on the first /api/dashboard hit in production).
// First client request then finds the data already cached and returns
// instantly instead of paying the cold-start latency on the first poll.
// Errors during warmup are intentionally swallowed — the breaker / safe
// defaults handle them; we just want to populate the cache opportunistically.
let warmupStarted = false;
function warmupOnce(): void {
  if (warmupStarted) return;
  warmupStarted = true;
  void Promise.allSettled([
    fetchPools(),
    fetchMeta(),
    fetchIdentity(),
    fetchLiveTaoUsd(),
    fetchLiveBtcUsd(),
  ]);
}

export async function GET() {
  warmupOnce();
  try {
    // Each fetch tolerates individual failure. If TaoStats briefly rate-
    // limits one key rotation, we return whatever the other endpoints
    // gave us — plus the last-known-good data from the `cached()` stale
    // fallback — instead of 500ing the whole dashboard and flipping the
    // client into an ERROR banner on every transient blip.
    const safeDefault = async <T>(
      loader: () => Promise<T>,
      fallback: T,
    ): Promise<T> => {
      try {
        return await loader();
      } catch {
        return fallback;
      }
    };
    const [pools, metas, identities, taoChange, taoLive, btcLive, btcChanges] =
      await Promise.all([
        // Pools is the most critical fetch (table rows can't render
        // without it), but we still must tolerate cold-start rate
        // limits — once a single call succeeds, the stale-on-error
        // cache covers transient blips going forward. Empty array on
        // hard failure produces a 200 with subnets:[] rather than a
        // 500 that breaks the whole client polling loop and prevents
        // any series-store sampling from ever happening.
        safeDefault(fetchPools, [] as RawPool[]),
        safeDefault(fetchMeta, [] as RawSubnetMeta[]),
        safeDefault(
          fetchIdentity,
          {} as IdentityIndex,
        ),
        safeDefault<TaoPriceResp["data"][number] | undefined>(
          fetchTaoChangeMetrics,
          undefined,
        ),
        safeDefault(fetchLiveTaoUsd, null as BinanceTicker24h | null),
        safeDefault(fetchLiveBtcUsd, null as BinanceTicker24h | null),
        safeDefault<BtcChanges>(fetchBtcChanges, {
          change_1h: 0,
          change_24h: 0,
          change_7d: 0,
        }),
      ]);

    const netuids = pools.map((p) => p.netuid);
    // Don't block the dashboard if burn-change aggregation fails — fall back
    // to an empty map so every row just gets burn_change_24h = 0.
    const burnChanges = await fetchBurnChange24h(netuids).catch(
      () => new Map<number, number>(),
    );

    const currentBlock = pools[0]?.block_number ?? 0;
    const subnets = buildRows(pools, metas, identities, burnChanges, currentBlock);

    const taoLivePrice = num(taoLive?.lastPrice);
    const btcLivePrice = num(btcLive?.lastPrice);

    const rootRow = subnets.find((s) => s.netuid === 0);

    // Record samples into the time-series buffer. The dashboard polls every
    // 1s but the store dedups to ≈1/min (fast) or ≈1/5min (slow). Over days
    // of continuous use this backfills detailed history that chart modals
    // read for sub-daily resolution — beyond what TaoStats free tier gives.
    const now = Date.now();
    if (taoLivePrice > 0) seriesStore.add(SERIES.TAO_USD, now, taoLivePrice);
    if (btcLivePrice > 0) seriesStore.add(SERIES.BTC_USD, now, btcLivePrice);
    for (const s of subnets) {
      if (s.price_tao > 0)
        seriesStore.add(SERIES.alpha(s.netuid), now, s.price_tao);
      // Reg cost and burn can change on every registration event (minutes
      // or seconds apart during rushes). Sampling at 30 s — the "medium"
      // cadence — lets the chart modal show the live reg-cost curve
      // without balling up 129 subnets × 8640 points/day in memory.
      if (s.reg_cost_tao > 0)
        seriesStore.add(
          SERIES.regCost(s.netuid),
          now,
          s.reg_cost_tao,
          30_000,
        );
      if (Number.isFinite(s.incentive_burn))
        seriesStore.add(
          SERIES.burn(s.netuid),
          now,
          s.incentive_burn * 100,
          30_000,
        );
    }

    const payload: DashboardPayload = {
      subnets,
      tao_price_usd: taoLivePrice > 0 ? taoLivePrice : num(taoChange?.price),
      tao_change_1h: num(taoChange?.percent_change_1h),
      tao_change_24h:
        taoLive?.priceChangePercent != null
          ? num(taoLive.priceChangePercent)
          : num(taoChange?.percent_change_24h),
      tao_change_7d: num(taoChange?.percent_change_7d),
      btc_price_usd: btcLivePrice,
      btc_change_1h: btcChanges.change_1h,
      btc_change_24h:
        btcLive?.priceChangePercent != null
          ? num(btcLive.priceChangePercent)
          : btcChanges.change_24h,
      btc_change_7d: btcChanges.change_7d,
      block_number: currentBlock,
      server_time: Date.now(),
      root_next_epoch_seconds: rootRow?.next_epoch_seconds ?? null,
    };

    return NextResponse.json(payload, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
