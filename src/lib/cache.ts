import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

type Entry<T> = { value: T; expires: number };

const store = new Map<string, Entry<unknown>>();
const inflight = new Map<string, Promise<unknown>>();

// Disk persistence so pm2 restarts don't blow away the last-known-good
// upstream snapshot. Critical when TaoStats is rate-limiting all keys —
// without a persisted fallback, a cold start has nothing to serve.
const PERSIST_PATH = process.env.CACHE_STORE_PATH ?? ".data/cache-store.json";
const FLUSH_INTERVAL_MS = 30 * 1000;
let dirty = false;
let bootLoaded = false;
let flushTimer: NodeJS.Timeout | null = null;

function loadFromDisk(): void {
  if (bootLoaded) return;
  bootLoaded = true;
  try {
    const raw = readFileSync(PERSIST_PATH, "utf8");
    const parsed = JSON.parse(raw) as Record<string, Entry<unknown>>;
    for (const [k, v] of Object.entries(parsed)) {
      // Treat persisted entries as already-expired so the loader runs
      // fresh on next access — but the value sits in the store as a
      // stale-on-error fallback for `cached()` to return when the
      // loader throws. This is the whole point.
      store.set(k, { value: v.value, expires: 0 });
    }
  } catch {
    // first run / corrupt — start clean
  }
}

function flush(): void {
  if (!dirty) return;
  try {
    mkdirSync(dirname(PERSIST_PATH), { recursive: true });
    const obj: Record<string, Entry<unknown>> = {};
    for (const [k, v] of store) obj[k] = v;
    writeFileSync(PERSIST_PATH, JSON.stringify(obj));
    dirty = false;
  } catch {
    // ignore — best effort
  }
}

function ensureBootstrapped(): void {
  loadFromDisk();
  if (flushTimer) return;
  if (typeof process === "undefined") return;
  flushTimer = setInterval(flush, FLUSH_INTERVAL_MS);
  const onExit = () => {
    try {
      flush();
    } catch {
      // ignore
    }
  };
  process.once("SIGTERM", onExit);
  process.once("SIGINT", onExit);
  process.once("beforeExit", onExit);
}

/**
 * Cache a loader result with fresh-then-stale-on-error semantics:
 *   1. If a non-expired value is cached, return it.
 *   2. Otherwise call the loader, cache its result, and return it.
 *   3. If the loader throws AND we have a stale (expired) value, return
 *      that stale value instead of re-throwing. This keeps transient
 *      TaoStats rate-limit failures from cascading into a 500 that
 *      breaks the whole dashboard — the client keeps seeing the last
 *      successful payload instead of going into ERROR state every time
 *      one of our keys momentarily trips a 429.
 *   4. If the loader throws and there's nothing cached, re-throw so the
 *      caller can decide how to handle a true cold-start failure.
 */
export async function cached<T>(
  key: string,
  ttlMs: number,
  loader: () => Promise<T>,
): Promise<T> {
  ensureBootstrapped();
  const now = Date.now();
  const hit = store.get(key) as Entry<T> | undefined;
  if (hit && hit.expires > now) return hit.value;

  const existing = inflight.get(key) as Promise<T> | undefined;
  if (existing) return existing;

  const p = (async () => {
    try {
      const v = await loader();
      store.set(key, { value: v, expires: Date.now() + ttlMs });
      dirty = true;
      return v;
    } catch (err) {
      if (hit) return hit.value;
      throw err;
    } finally {
      inflight.delete(key);
    }
  })();
  inflight.set(key, p);
  return p;
}
