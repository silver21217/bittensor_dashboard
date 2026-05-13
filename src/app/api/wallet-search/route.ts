import { NextResponse } from "next/server";
import { taoFetch } from "@/lib/taostats";
import { cached } from "@/lib/cache";
import { raoToTao } from "@/lib/format";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type AccountListRow = {
  address: { ss58: string; hex: string } | string;
  rank: number | string | null;
  balance_total: string | null;
};

type AccountListResp = {
  pagination?: { total_pages?: number; total_items?: number };
  data: AccountListRow[];
};

type IndexEntry = {
  ss58: string;
  rank: number | null;
  balance_total_tao: number;
};

// How many pages of 200 to walk. 20 pages = top 4 000 accounts — covers every
// validator, exchange, and active whale. Tuneable; bigger index = slower warm-up
// but better recall for arbitrary substring searches.
const INDEX_PAGES = 20;
const INDEX_PAGE_SIZE = 200;
const INDEX_TTL_MS = 15 * 60_000;
const PAGE_BATCH = 4;
const PAGE_BATCH_DELAY_MS = 250;

/**
 * TaoStats doesn't support server-side substring search on addresses. We
 * compensate by indexing the top N accounts by rank once and doing substring
 * filtering in-process. Paginated to exceed the per-request 200 cap.
 */
async function loadIndex(): Promise<IndexEntry[]> {
  return cached<IndexEntry[]>("wallet:index:v2", INDEX_TTL_MS, async () => {
    const entries: IndexEntry[] = [];
    for (let start = 1; start <= INDEX_PAGES; start += PAGE_BATCH) {
      const pages = [];
      for (
        let p = start;
        p < start + PAGE_BATCH && p <= INDEX_PAGES;
        p++
      ) {
        pages.push(p);
      }
      const results = await Promise.allSettled(
        pages.map(async (page) => {
          const r = await taoFetch<AccountListResp>(
            `/api/account/latest/v1?page=${page}&limit=${INDEX_PAGE_SIZE}`,
          );
          return r.data;
        }),
      );
      for (const res of results) {
        if (res.status !== "fulfilled") continue;
        for (const row of res.value) {
          const ss58 =
            typeof row.address === "string"
              ? row.address
              : row.address?.ss58 ?? "";
          if (!ss58) continue;
          const rank =
            row.rank === null || row.rank === undefined
              ? null
              : Number(row.rank);
          entries.push({
            ss58,
            rank: Number.isFinite(rank) ? rank : null,
            balance_total_tao: raoToTao(row.balance_total ?? "0"),
          });
        }
      }
      if (start + PAGE_BATCH <= INDEX_PAGES) {
        await new Promise((r) => setTimeout(r, PAGE_BATCH_DELAY_MS));
      }
    }
    return entries;
  });
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const q = (url.searchParams.get("q") ?? "").trim();
    if (!q || q.length < 2) {
      return NextResponse.json(
        { matches: [], index_size: 0 },
        { headers: { "Cache-Control": "no-store" } },
      );
    }

    const idx = await loadIndex();
    const needle = q.toLowerCase();
    const matches = idx
      .filter((e) => e.ss58.toLowerCase().includes(needle))
      .sort((a, b) => b.balance_total_tao - a.balance_total_tao)
      .slice(0, 25);

    return NextResponse.json(
      { matches, index_size: idx.length },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
