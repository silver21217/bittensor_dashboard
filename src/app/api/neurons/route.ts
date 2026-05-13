import { NextResponse } from "next/server";
import { taoFetch } from "@/lib/taostats";
import { cached } from "@/lib/cache";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * Proxy for TaoStats' metagraph/latest endpoint — returns the current
 * neurons of a subnet. The subnet Regs modal consumes this to show UID,
 * hotkey, coldkey, registration block, immunity status, and rank so the
 * user can see who is registered + who is next to be deregistered.
 */
type Neuron = {
  uid: number;
  netuid: number;
  hotkey: { ss58: string; hex: string };
  coldkey: { ss58: string; hex: string };
  registered_at_block: number | null;
  is_immunity_period: boolean;
  rank: number | null;
  incentive: string | null;
  emission: string | null;
  daily_total_rewards_as_tao: string | null;
  active: boolean;
  validator_permit: boolean;
  block_number: number;
};

type MetagraphResp = {
  pagination: {
    current_page: number;
    per_page: number;
    total_items: number;
    total_pages: number;
    next_page: number | null;
    prev_page: number | null;
  };
  data: Neuron[];
};

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const netuid = Number(url.searchParams.get("netuid"));
    if (!Number.isFinite(netuid)) {
      return NextResponse.json({ error: "missing netuid" }, { status: 400 });
    }

    // Paginate through every neuron (up to 8 × 256 = 2048 — well above
    // any real Bittensor subnet). Partial-failure tolerant: if TaoStats
    // rate-limits us mid-pagination, return whatever pages we already
    // have rather than throwing a 500 that loses everything. The first
    // page is still required — with zero neurons the modal has nothing
    // to render and should bubble the error.
    const payload = await cached(
      `neurons:${netuid}:all`,
      60_000,
      async () => {
        const all: Neuron[] = [];
        let page = 1;
        const LIMIT = 256;
        let firstPageOk = false;
        for (let i = 0; i < 8; i++) {
          try {
            const r = await taoFetch<MetagraphResp>(
              `/api/metagraph/latest/v1?netuid=${netuid}&page=${page}&limit=${LIMIT}`,
            );
            all.push(...r.data);
            if (i === 0) firstPageOk = true;
            if (!r.pagination.next_page) break;
            page = r.pagination.next_page;
          } catch (e) {
            if (i === 0) throw e;
            // Partial data is better than none — stop here and return
            // whatever we've accumulated so far.
            break;
          }
        }
        if (!firstPageOk) throw new Error("no neuron pages loaded");
        return { neurons: all, total: all.length };
      },
    );

    return NextResponse.json(payload, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    // A TaoStats rate-limit bubbling up here deserves a retry hint. The
    // next modal open will pick up cached data once it exists, but for
    // the first-ever open of a subnet there's nothing to fall back on.
    const isRateLimit = /429|401|403|rate|rotat|TaoStats/i.test(msg);
    return NextResponse.json(
      {
        error: isRateLimit
          ? "upstream rate-limited, please retry in a few seconds"
          : msg,
        detail: msg,
      },
      { status: isRateLimit ? 503 : 500 },
    );
  }
}
