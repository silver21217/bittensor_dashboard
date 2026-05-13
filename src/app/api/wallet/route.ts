import { NextResponse } from "next/server";
import { taoFetch } from "@/lib/taostats";
import { cached } from "@/lib/cache";
import { num, raoToTao } from "@/lib/format";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type AlphaBalance = {
  balance: string;
  balance_as_tao: string;
  hotkey: string;
  coldkey: string;
  netuid: number | string;
};

type AccountLatestResp = {
  data: Array<{
    address: { ss58: string; hex: string };
    rank: number | string | null;
    balance_free: string;
    balance_staked: string;
    balance_staked_alpha_as_tao: string;
    balance_staked_root: string;
    balance_total: string;
    balance_free_24hr_ago: string | null;
    balance_staked_24hr_ago: string | null;
    balance_staked_alpha_as_tao_24hr_ago: string | null;
    balance_staked_root_24hr_ago: string | null;
    balance_total_24hr_ago: string | null;
    alpha_balances: AlphaBalance[] | null;
    alpha_balances_24hr_ago: AlphaBalance[] | null;
  }>;
};

export type WalletPosition = {
  netuid: number;
  hotkey: string;
  coldkey: string;
  // Current alpha stake expressed as TAO (alpha_amount × alpha_price).
  balance_tao: number;
  balance_tao_24h_ago: number;
  // Total TAO-value change in 24h. Mixes emission AND alpha price movement.
  delta_tao_24h: number;
  // Pure emission earned in the last 24h, in TAO at current alpha price.
  // = Δ(alpha_amount) × current_alpha_price
  // For root (netuid 0) this equals delta_tao_24h since α == τ there.
  emission_tao_24h: number;
  // Component of delta_tao_24h attributable to alpha price moving.
  // = delta_tao_24h − emission_tao_24h
  price_move_tao_24h: number;
  // Your proportional share of the hotkey's daily TAO emission rate.
  // = (hotkey.daily_total_rewards_as_tao) × (your_alpha_stake / hotkey.total_alpha_stake)
  // Null when we don't have metagraph data for that (subnet, hotkey).
  daily_tao_earning: number | null;
};

export type WalletHistoryPoint = {
  t: number;
  total: number;
  staked: number;
  free: number;
};

export type WalletPayload = {
  address: string;
  rank: number | null;
  balance_free_tao: number;
  balance_free_tao_24h_ago: number;
  balance_staked_root_tao: number;
  balance_staked_alpha_as_tao: number;
  balance_total_tao: number;
  balance_total_tao_24h_ago: number;
  delta_total_tao_24h: number;
  positions: WalletPosition[];
  history: WalletHistoryPoint[];
};

type AccountHistoryResp = {
  data: Array<{
    timestamp: string;
    balance_total: string | null;
    balance_staked: string | null;
    balance_free: string | null;
  }>;
};

type MetagraphRow = {
  hotkey: { ss58: string; hex: string } | string;
  total_alpha_stake: string | null;
  daily_total_rewards_as_tao: string | null;
};
type MetagraphResp = { data: MetagraphRow[] };

async function fetchMetagraph(
  netuid: number,
): Promise<Map<string, { total_alpha_rao: number; daily_rewards_rao: number }>> {
  return cached(`metagraph:${netuid}`, 60_000, async () => {
    const r = await taoFetch<MetagraphResp>(
      `/api/metagraph/latest/v1?netuid=${netuid}&limit=512`,
    );
    const map = new Map<
      string,
      { total_alpha_rao: number; daily_rewards_rao: number }
    >();
    for (const row of r.data) {
      const ss58 =
        typeof row.hotkey === "string" ? row.hotkey : row.hotkey?.ss58 ?? "";
      if (!ss58) continue;
      map.set(ss58, {
        total_alpha_rao: Number(row.total_alpha_stake ?? "0"),
        daily_rewards_rao: Number(row.daily_total_rewards_as_tao ?? "0"),
      });
    }
    return map;
  });
}

function ss58Of(x: unknown): string {
  if (typeof x === "string") return x;
  if (x && typeof x === "object" && "ss58" in x)
    return String((x as { ss58: string }).ss58);
  return "";
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const address = (url.searchParams.get("address") ?? "").trim();
    if (!address) {
      return NextResponse.json({ error: "missing address" }, { status: 400 });
    }

    const data = await cached(`wallet:${address}`, 15_000, async () => {
      const [latest, history] = await Promise.allSettled([
        taoFetch<AccountLatestResp>(
          `/api/account/latest/v1?address=${encodeURIComponent(address)}`,
        ),
        taoFetch<AccountHistoryResp>(
          `/api/account/history/v1?address=${encodeURIComponent(address)}&limit=60`,
        ),
      ]);
      // Distinguish "TaoStats call failed" from "address actually not
      // found". The former should bubble up so we can return 503 and the
      // client renders a retry message, not a misleading "not found".
      if (latest.status !== "fulfilled") {
        const msg =
          latest.reason instanceof Error
            ? latest.reason.message
            : String(latest.reason);
        throw new Error(`UPSTREAM_FAILED:${msg}`);
      }
      const r = latest.value;
      const row = r.data[0];
      if (!row) return null;

      const historyPoints: WalletHistoryPoint[] =
        history.status === "fulfilled"
          ? history.value.data
              .map((h) => ({
                t: Date.parse(h.timestamp),
                total: raoToTao(h.balance_total ?? "0"),
                staked: raoToTao(h.balance_staked ?? "0"),
                free: raoToTao(h.balance_free ?? "0"),
              }))
              .filter((p) => Number.isFinite(p.t))
              .sort((a, b) => a.t - b.t)
          : [];

      // Prev snapshots keyed by (netuid, hotkey, coldkey). Keep both raw
      // alpha balance AND tao-equivalent so we can separate emission from
      // alpha-price movement.
      const prevByKey = new Map<
        string,
        { balance_rao: number; balance_tao: number }
      >();
      for (const p of row.alpha_balances_24hr_ago ?? []) {
        prevByKey.set(
          `${p.netuid}|${ss58Of(p.hotkey)}|${ss58Of(p.coldkey)}`,
          {
            balance_rao: Number(p.balance),
            balance_tao: raoToTao(p.balance_as_tao),
          },
        );
      }

      // For every unique subnet in the positions, fetch its metagraph once
      // so we can look up per-hotkey daily emission. Each call returns 256
      // neurons; cached for 60 s.
      const uniqNets = [
        ...new Set((row.alpha_balances ?? []).map((p) => Number(p.netuid))),
      ];
      const metagraphs = new Map<
        number,
        Map<string, { total_alpha_rao: number; daily_rewards_rao: number }>
      >();
      await Promise.all(
        uniqNets.map(async (netuid) => {
          try {
            const mg = await fetchMetagraph(netuid);
            metagraphs.set(netuid, mg);
          } catch {
            // skip — position just won't have daily_tao_earning
          }
        }),
      );

      const positions: WalletPosition[] = (row.alpha_balances ?? []).map(
        (p) => {
          const netuid = Number(p.netuid);
          const hotkey = ss58Of(p.hotkey);
          const coldkey = ss58Of(p.coldkey);
          const balance_rao_now = Number(p.balance);
          const balance_tao = raoToTao(p.balance_as_tao);
          const prev =
            prevByKey.get(`${netuid}|${hotkey}|${coldkey}`) ?? {
              balance_rao: balance_rao_now,
              balance_tao,
            };

          // Current alpha price (tao per alpha) — use now's value to price
          // the α-delta. For root this is 1.0.
          const alpha_price =
            balance_rao_now > 0 ? balance_tao / (balance_rao_now / 1e9) : 1;
          const alpha_delta_rao = balance_rao_now - prev.balance_rao;
          const emission_tao_24h = (alpha_delta_rao / 1e9) * alpha_price;
          const delta_tao_24h = balance_tao - prev.balance_tao;
          const price_move_tao_24h = delta_tao_24h - emission_tao_24h;

          let daily_tao_earning: number | null = null;
          const mg = metagraphs.get(netuid);
          const hotkeyEntry = mg?.get(hotkey);
          if (
            hotkeyEntry &&
            hotkeyEntry.total_alpha_rao > 0 &&
            Number.isFinite(balance_rao_now) &&
            balance_rao_now > 0
          ) {
            const share = balance_rao_now / hotkeyEntry.total_alpha_rao;
            daily_tao_earning = (hotkeyEntry.daily_rewards_rao * share) / 1e9;
          }

          return {
            netuid,
            hotkey,
            coldkey,
            balance_tao,
            balance_tao_24h_ago: prev.balance_tao,
            delta_tao_24h,
            emission_tao_24h,
            price_move_tao_24h,
            daily_tao_earning,
          };
        },
      );

      positions.sort((a, b) => b.balance_tao - a.balance_tao);

      const total = raoToTao(row.balance_total);
      const total24 = row.balance_total_24hr_ago
        ? raoToTao(row.balance_total_24hr_ago)
        : total;

      const payload: WalletPayload = {
        address: ss58Of(row.address),
        rank:
          row.rank === null || row.rank === undefined ? null : Number(row.rank),
        balance_free_tao: raoToTao(row.balance_free),
        balance_free_tao_24h_ago: row.balance_free_24hr_ago
          ? raoToTao(row.balance_free_24hr_ago)
          : raoToTao(row.balance_free),
        balance_staked_root_tao: raoToTao(row.balance_staked_root),
        balance_staked_alpha_as_tao: raoToTao(
          row.balance_staked_alpha_as_tao,
        ),
        balance_total_tao: total,
        balance_total_tao_24h_ago: total24,
        delta_total_tao_24h: total - total24,
        positions,
        history: historyPoints,
      };
      return payload;
    });

    if (!data) {
      return NextResponse.json(
        { error: "address not found", address },
        { status: 404 },
      );
    }

    return NextResponse.json(data as WalletPayload, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.startsWith("UPSTREAM_FAILED:")) {
      return NextResponse.json(
        {
          error: "upstream rate-limited or unavailable, please retry",
          detail: msg.slice("UPSTREAM_FAILED:".length),
        },
        { status: 503 },
      );
    }
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// Silence unused warning for the num import if tree-shaken
void num;
