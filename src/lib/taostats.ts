const BASE = "https://api.taostats.io";

function getKeys(): string[] {
  const raw = process.env.TAOSTATS_KEYS ?? "";
  return raw.split(",").map((k) => k.trim()).filter(Boolean);
}

let cursor = 0;
function nextKey(keys: string[]): string {
  const k = keys[cursor % keys.length];
  cursor++;
  return k;
}

// Per-key backoff: when a key returns 429/401/403, skip it for this
// many ms. TaoStats applies an account-wide window so once one key trips,
// most others trip too — backing off all of them prevents us from
// hammering during the cooldown.
const KEY_COOLDOWN_MS = 60_000;
const keyCooldown = new Map<string, number>();

// Process-wide circuit breaker: when *every* key just failed in a row,
// pause all outbound calls for this window. This stops a stampede where
// Promise.all of dashboard fetches + history fetches + neuron fetches
// each loop through every key burning quota in microseconds.
const GLOBAL_BACKOFF_MS = 30_000;
let globalBackoffUntil = 0;

export async function taoFetch<T>(path: string): Promise<T> {
  const keys = getKeys();
  if (keys.length === 0) throw new Error("TAOSTATS_KEYS env is not set");

  const now = Date.now();
  if (now < globalBackoffUntil) {
    throw new Error(
      `TaoStats: in cooldown for ${Math.ceil((globalBackoffUntil - now) / 1000)}s`,
    );
  }

  let lastErr: unknown = null;
  let triedKeys = 0;
  for (let i = 0; i < keys.length; i++) {
    const key = nextKey(keys);
    const cooldownUntil = keyCooldown.get(key) ?? 0;
    if (Date.now() < cooldownUntil) continue;
    triedKeys++;
    try {
      const res = await fetch(`${BASE}${path}`, {
        headers: { Authorization: key, Accept: "application/json" },
        cache: "no-store",
      });
      if (res.status === 429 || res.status === 401 || res.status === 403) {
        keyCooldown.set(key, Date.now() + KEY_COOLDOWN_MS);
        lastErr = new Error(`TaoStats ${res.status} on key ${key.slice(0, 12)}`);
        continue;
      }
      if (!res.ok) throw new Error(`TaoStats ${res.status} ${await res.text().catch(() => "")}`);
      // Successful call — clear this key's cooldown if any.
      keyCooldown.delete(key);
      return (await res.json()) as T;
    } catch (e) {
      lastErr = e;
      continue;
    }
  }
  // Trip the global breaker only when literally every key in the
  // rotation is in individual cooldown — i.e. we have no capacity to
  // make ANY call. If even a single key is still healthy, do NOT
  // global-pause; the next request can use it. Otherwise we'd lock
  // ourselves out from a freshly-added key during the 30-s window.
  const t = Date.now();
  const allOnCooldown = keys.every((k) => (keyCooldown.get(k) ?? 0) > t);
  if (allOnCooldown) {
    globalBackoffUntil = t + GLOBAL_BACKOFF_MS;
  }
  throw lastErr ?? new Error("TaoStats request failed across all keys");
}
