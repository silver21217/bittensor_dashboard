import { NextResponse } from "next/server";
import { taoFetch } from "@/lib/taostats";
import { cached } from "@/lib/cache";
import { SERIES, seriesStore } from "@/lib/series-store";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type Point = { t: number; p: number };
type Range = "24h" | "7d" | "30d";

function clampRange(r: string | null): Range {
  return r === "24h" || r === "30d" ? r : "7d";
}

async function binanceHistory(
  symbol: string,
  range: Range,
): Promise<Point[]> {
  const cfg: Record<Range, { interval: string; limit: number }> = {
    // Use fine candles for recent ranges so the chart shows detail.
    "24h": { interval: "5m", limit: 288 },
    "7d": { interval: "30m", limit: 336 },
    "30d": { interval: "4h", limit: 180 },
  };
  const { interval, limit } = cfg[range];
  const url = `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`;
  const r = await fetch(url, { cache: "no-store" });
  if (!r.ok) throw new Error(`Binance ${r.status}`);
  const rows = (await r.json()) as unknown[][];
  return rows.map((k) => ({
    t: Number(k[0]),
    p: Number(k[4]),
  }));
}

/**
 * Merge a high-res in-memory tail with the upstream history: keep every
 * upstream point whose timestamp precedes the first tail sample, then
 * append the tail. Ensures the chart shows authoritative long-term data
 * joined with minute-resolution recent data collected by our own sampler.
 */
function mergeWithTail(upstream: Point[], tail: Point[]): Point[] {
  if (tail.length === 0) return upstream;
  const firstTailT = tail[0].t;
  const head = upstream.filter((p) => p.t < firstTailT);
  return [...head, ...tail];
}

type PoolHistoryResp = {
  data: Array<{ timestamp: string; price: string }>;
};

type PoolLatestResp = {
  data: Array<{
    netuid: number;
    seven_day_prices?: Array<{ timestamp: string; price: string }>;
    price?: string;
    timestamp?: string;
  }>;
};

type SubnetHistoryResp = {
  data: Array<{
    timestamp: string;
    neuron_registration_cost: string;
    incentive_burn: string | null;
  }>;
};

function windowCutoff(range: Range): number {
  const ms =
    range === "24h" ? 86_400_000 : range === "7d" ? 604_800_000 : 2_592_000_000;
  return Date.now() - ms;
}

function downsample(points: Point[], step: number): Point[] {
  if (step <= 1) return points;
  const out: Point[] = [];
  for (let i = 0; i < points.length; i += step) out.push(points[i]);
  if (points.length && out[out.length - 1] !== points[points.length - 1]) {
    out.push(points[points.length - 1]);
  }
  return out;
}

async function subnetPriceHistory(netuid: number, range: Range): Promise<Point[]> {
  // 24h and 7d: use the 4-hour-resolution `seven_day_prices` embedded in
  // /pool/latest (44 points/7d ≈ 6/day). 30d: fall back to pool/history/v1
  // which only provides daily granularity on the free tier but spans further.
  if (range === "24h" || range === "7d") {
    const r = await taoFetch<PoolLatestResp>(
      `/api/dtao/pool/latest/v1?netuid=${netuid}&limit=1`,
    );
    const row = r.data[0];
    const spraw = row?.seven_day_prices ?? [];
    const cutoff = windowCutoff(range);
    const pts: Point[] = spraw
      .map((p) => ({ t: Date.parse(p.timestamp), p: Number(p.price) }))
      .filter(
        (p) =>
          Number.isFinite(p.t) && Number.isFinite(p.p) && p.p > 0 && p.t >= cutoff,
      )
      .sort((a, b) => a.t - b.t);
    // Always pin the latest-known tick so the chart line ends at "now"
    if (row?.price && row?.timestamp) {
      const nowPt = { t: Date.parse(row.timestamp), p: Number(row.price) };
      if (
        Number.isFinite(nowPt.t) &&
        Number.isFinite(nowPt.p) &&
        nowPt.p > 0 &&
        (!pts.length || nowPt.t > pts[pts.length - 1].t)
      ) {
        pts.push(nowPt);
      }
    }
    return pts;
  }

  // 30 day window: paginate daily history; 60 entries covers two months.
  const r = await taoFetch<PoolHistoryResp>(
    `/api/dtao/pool/history/v1?netuid=${netuid}&page=1&limit=60`,
  );
  const cutoff = windowCutoff(range);
  return r.data
    .map((d) => ({ t: Date.parse(d.timestamp), p: Number(d.price) }))
    .filter(
      (p) => Number.isFinite(p.t) && Number.isFinite(p.p) && p.p > 0 && p.t >= cutoff,
    )
    .sort((a, b) => a.t - b.t);
}

async function subnetMetaHistory(
  netuid: number,
  range: Range,
  field: "reg_cost" | "burn",
): Promise<Point[]> {
  const cfg: Record<Range, { limit: number; step: number }> = {
    "24h": { limit: 150, step: 1 },
    "7d": { limit: 400, step: 2 },
    "30d": { limit: 600, step: 4 },
  };
  const { limit, step } = cfg[range];
  const r = await taoFetch<SubnetHistoryResp>(
    `/api/subnet/history/v1?netuid=${netuid}&page=1&limit=${limit}`,
  );
  const cutoff = windowCutoff(range);
  const RAO = 1_000_000_000;
  const pts = r.data
    .map((d) => {
      const t = Date.parse(d.timestamp);
      const p =
        field === "reg_cost"
          ? Number(d.neuron_registration_cost) / RAO
          : Number(d.incentive_burn) * 100;
      return { t, p };
    })
    .filter((p) => Number.isFinite(p.t) && Number.isFinite(p.p) && p.t >= cutoff)
    .sort((a, b) => a.t - b.t);
  return downsample(pts, step);
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const asset = url.searchParams.get("asset");
    const range = clampRange(url.searchParams.get("range"));

    const cutoff = windowCutoff(range);

    async function safe<T>(load: () => Promise<T[]>): Promise<T[]> {
      try {
        return await load();
      } catch {
        return [];
      }
    }

    let points: Point[];
    if (asset === "tao") {
      const upstream = await cached(`hist:tao:${range}`, 60_000, () =>
        safe(() => binanceHistory("TAOUSDT", range)),
      );
      const tail = seriesStore.since(SERIES.TAO_USD, cutoff);
      points = mergeWithTail(upstream, tail);
    } else if (asset === "btc") {
      const upstream = await cached(`hist:btc:${range}`, 60_000, () =>
        safe(() => binanceHistory("BTCUSDT", range)),
      );
      const tail = seriesStore.since(SERIES.BTC_USD, cutoff);
      points = mergeWithTail(upstream, tail);
    } else if (asset === "subnet") {
      const netuid = Number(url.searchParams.get("netuid"));
      if (!Number.isFinite(netuid)) {
        return NextResponse.json(
          { error: "missing netuid" },
          { status: 400 },
        );
      }
      const upstream = await cached(`hist:sub:${netuid}:${range}`, 30_000, () =>
        safe(() => subnetPriceHistory(netuid, range)),
      );
      const tail = seriesStore.since(SERIES.alpha(netuid), cutoff);
      points = mergeWithTail(upstream, tail);
    } else if (asset === "reg_cost" || asset === "burn") {
      const netuid = Number(url.searchParams.get("netuid"));
      if (!Number.isFinite(netuid)) {
        return NextResponse.json(
          { error: "missing netuid" },
          { status: 400 },
        );
      }
      const field = asset === "reg_cost" ? "reg_cost" : "burn";
      const upstream = await cached(
        `hist:${asset}:${netuid}:${range}`,
        60_000,
        () => safe(() => subnetMetaHistory(netuid, range, field)),
      );
      const storeKey =
        asset === "reg_cost" ? SERIES.regCost(netuid) : SERIES.burn(netuid);
      const tail = seriesStore.since(storeKey, cutoff);
      points = mergeWithTail(upstream, tail);
    } else {
      return NextResponse.json({ error: "bad asset" }, { status: 400 });
    }

    // Anchor the series to the requested window: prepend a synthetic
    // point at `cutoff` if the earliest real sample is later, and append
    // one at `now` if the latest is earlier. This guarantees the chart
    // always has ≥ 2 points when ANY data exists — a flat line is more
    // useful than an empty "not enough history" panel for static metrics
    // like reg-cost between burn-up events. Both anchors carry the
    // nearest-real value to preserve the apparent constancy of the
    // metric over the gap.
    if (points.length >= 1) {
      const now = Date.now();
      const first = points[0];
      const last = points[points.length - 1];
      if (first.t > cutoff) {
        points = [{ t: cutoff, p: first.p }, ...points];
      }
      if (last.t < now) {
        points = [...points, { t: now, p: last.p }];
      }
    }

    return NextResponse.json(
      { points, range },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
