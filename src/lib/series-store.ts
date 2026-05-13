import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

export type Point = { t: number; p: number };

// 30 days of retention for cost series. Old samples are permanently dropped
// (monthly window). 30 days × 8 640 samples/day (10s cadence) = 259 200 hard
// ceiling; MAX_POINTS leaves a small safety margin.
export const RETENTION_MS = 30 * 24 * 60 * 60 * 1000;
const MAX_POINTS = 300_000;

// Where the in-memory series buffer is persisted between restarts. Without
// this, every pm2 restart wipes accumulated history, which is especially
// painful for slow metrics (reg cost / burn) where each restart blanks days
// of locally-collected high-res data.
const PERSIST_PATH =
  process.env.SERIES_STORE_PATH ?? ".data/series-store.json";
const FLUSH_INTERVAL_MS = 60 * 1000;

// Fast series (alpha / TAO / BTC) are sampled at ~10 s cadence.
const MIN_GAP_MS = 9_000;

// Reg cost & burn change slowly (per adjustment interval ≈ 72 min for many
// subnets). Sample them less aggressively to keep the buffer useful.
const SLOW_MIN_GAP_MS = 5 * 60_000;

// Amortised prune cadence. Running a full sweep on every add would be O(n²)
// across all series; pruning at most once an hour keeps the work bounded.
const PRUNE_INTERVAL_MS = 60 * 60 * 1000;

class SeriesStore {
  private series = new Map<string, Point[]>();
  private lastPrune = 0;
  private dirty = false;
  private flushTimer: NodeJS.Timeout | null = null;

  constructor() {
    this.load();
    // Periodic flush so pm2 restarts don't lose recent samples.
    if (typeof process !== "undefined") {
      this.flushTimer = setInterval(() => {
        if (this.dirty) this.flush();
      }, FLUSH_INTERVAL_MS);
      // Best-effort flush on graceful exit. SIGTERM is what pm2 sends.
      const onExit = () => {
        try {
          this.flush();
        } catch {
          // ignore
        }
      };
      process.once("SIGTERM", onExit);
      process.once("SIGINT", onExit);
      process.once("beforeExit", onExit);
    }
  }

  private load(): void {
    try {
      const raw = readFileSync(PERSIST_PATH, "utf8");
      const parsed = JSON.parse(raw) as Record<string, Point[]>;
      for (const [k, arr] of Object.entries(parsed)) {
        if (Array.isArray(arr))
          this.series.set(
            k,
            arr.filter(
              (p) => Number.isFinite(p?.t) && Number.isFinite(p?.p),
            ),
          );
      }
    } catch {
      // first run / corrupt file — start clean
    }
  }

  private flush(): void {
    try {
      mkdirSync(dirname(PERSIST_PATH), { recursive: true });
      const obj: Record<string, Point[]> = {};
      for (const [k, arr] of this.series) obj[k] = arr;
      writeFileSync(PERSIST_PATH, JSON.stringify(obj));
      this.dirty = false;
    } catch {
      // ignore — best effort
    }
  }

  /** Append a sample. Dedups if the previous sample is too recent. */
  add(key: string, t: number, p: number, gapMs = MIN_GAP_MS): void {
    if (!Number.isFinite(p) || !Number.isFinite(t)) return;
    const arr = this.series.get(key);
    if (!arr) {
      this.series.set(key, [{ t, p }]);
      this.dirty = true;
      this.maybePrune(t);
      return;
    }
    const last = arr[arr.length - 1];
    if (last) {
      if (t - last.t < gapMs) return;
      // If the value is identical to the last sample, update the timestamp
      // in place rather than growing the buffer with duplicates.
      if (last.p === p) {
        last.t = t;
        this.dirty = true;
        this.maybePrune(t);
        return;
      }
    }
    arr.push({ t, p });
    if (arr.length > MAX_POINTS) arr.splice(0, arr.length - MAX_POINTS);
    this.dirty = true;
    this.maybePrune(t);
  }

  /** Return every point whose timestamp is >= since (ms). Returned copy. */
  since(key: string, since: number): Point[] {
    const arr = this.series.get(key);
    if (!arr || arr.length === 0) return [];
    const out: Point[] = [];
    for (const p of arr) if (p.t >= since) out.push(p);
    return out;
  }

  /** Approximate point count for diagnostics. */
  size(key: string): number {
    return this.series.get(key)?.length ?? 0;
  }

  /**
   * Permanently drop every point older than the 30-day retention window.
   * Called opportunistically on add() at most once per PRUNE_INTERVAL_MS so
   * the cost is amortised across many writes.
   */
  private maybePrune(now: number): void {
    if (now - this.lastPrune < PRUNE_INTERVAL_MS) return;
    this.lastPrune = now;
    const cutoff = now - RETENTION_MS;
    for (const [key, arr] of this.series) {
      let firstKeep = 0;
      while (firstKeep < arr.length && arr[firstKeep].t < cutoff) firstKeep++;
      if (firstKeep > 0) arr.splice(0, firstKeep);
      if (arr.length === 0) this.series.delete(key);
    }
  }
}

// Singleton. Survives across route handlers in the same Node process
// (Next.js dev & single-instance prod). Lost on restart.
const globalKey = "__bt_series_store__";
const g = globalThis as unknown as Record<string, SeriesStore | undefined>;
export const seriesStore: SeriesStore =
  g[globalKey] ?? (g[globalKey] = new SeriesStore());

export const SERIES = {
  TAO_USD: "tao_usd",
  BTC_USD: "btc_usd",
  alpha: (netuid: number) => `subnet_alpha:${netuid}`,
  regCost: (netuid: number) => `subnet_regcost:${netuid}`,
  burn: (netuid: number) => `subnet_burn:${netuid}`,
} as const;

export const SLOW_SERIES_GAP_MS = SLOW_MIN_GAP_MS;
